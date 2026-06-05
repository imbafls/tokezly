#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
use crate::apple_intelligence;
use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::audio_toolkit::{is_microphone_access_denied, is_no_input_device_error};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use crate::refinement::OnDeviceEngine;
use crate::settings::{
    get_settings, AppSettings, APPLE_INTELLIGENCE_PROVIDER_ID, CLAUDE_CODE_PROVIDER_ID,
    CLEAN_PROMPT_ID, ON_DEVICE_PROVIDER_ID,
};
use crate::shortcut;
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils::{
    self, show_processing_overlay, show_recording_overlay, show_transcribing_overlay,
};
use crate::TranscriptionCoordinator;
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use log::{debug, error, warn};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::Manager;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
struct RecordingErrorEvent {
    error_type: String,
    detail: Option<String>,
}

/// Drop guard that notifies the [`TranscriptionCoordinator`] when the
/// transcription pipeline finishes — whether it completes normally or panics.
struct FinishGuard(AppHandle);
impl Drop for FinishGuard {
    fn drop(&mut self) {
        if let Some(c) = self.0.try_state::<TranscriptionCoordinator>() {
            c.notify_processing_finished();
        }
    }
}

// Shortcut Action Trait
pub trait ShortcutAction: Send + Sync {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

// Transcribe Action
//
// `post_process` reflects which binding fired: the plain "transcribe" binding
// (false) or "transcribe_with_post_process" (true). The actual rewrite behavior
// is resolved at stop()-time against the master AI toggle — see `RewriteMode`.
struct TranscribeAction {
    post_process: bool,
}

/// How the transcript should be rewritten before pasting.
///
/// - `Off`: paste the verbatim transcript (master AI toggle off, plain binding).
/// - `Clean`: always-on auto-polish using the built-in clean prompt. This is the
///   default behavior of the plain "transcribe" binding when the master AI toggle
///   (`post_process_enabled`) is on.
/// - `Prompt`: explicit rewrite using the user-selected prompt
///   (`post_process_selected_prompt_id`), driven by the dedicated binding.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RewriteMode {
    Off,
    Clean,
    Prompt,
}

impl RewriteMode {
    /// Resolve the rewrite mode from which binding fired plus the master toggle.
    ///
    /// - The Prompt-mode binding always rewrites with the selected prompt.
    /// - The plain binding auto-polishes (Clean) when the master toggle is on,
    ///   and otherwise pastes verbatim (Off).
    fn resolve(post_process_binding: bool, post_process_enabled: bool) -> Self {
        if post_process_binding {
            RewriteMode::Prompt
        } else if post_process_enabled {
            RewriteMode::Clean
        } else {
            RewriteMode::Off
        }
    }

    /// Whether this mode runs the LLM rewrite at all.
    fn rewrites(self) -> bool {
        matches!(self, RewriteMode::Clean | RewriteMode::Prompt)
    }

    /// Short tag describing the rewrite for the paste toast sub-line.
    pub(crate) fn toast_tag(self) -> &'static str {
        match self {
            RewriteMode::Off => "verbatim",
            RewriteMode::Clean => "cleaned",
            RewriteMode::Prompt => "prompt",
        }
    }
}

/// Resolve a rewrite mode for a re-processed history entry.
///
/// History stores a single bool ("post-process requested"): true means the
/// explicit Prompt-mode binding fired, false means the plain binding. We
/// re-resolve against the current master toggle so re-running a plain entry
/// honors the always-on Clean default when AI is now enabled.
pub(crate) fn rewrite_mode_for_history(app: &AppHandle, post_process_requested: bool) -> RewriteMode {
    let post_process_enabled = get_settings(app).post_process_enabled;
    RewriteMode::resolve(post_process_requested, post_process_enabled)
}

/// Field name for structured output JSON schema
const TRANSCRIPTION_FIELD: &str = "transcription";

/// Strip invisible Unicode characters that some LLMs may insert
fn strip_invisible_chars(s: &str) -> String {
    s.replace(['\u{200B}', '\u{200C}', '\u{200D}', '\u{FEFF}'], "")
}

/// Build a system prompt from the user's prompt template.
/// Removes `${output}` placeholder since the transcription is sent as the user message.
fn build_system_prompt(prompt_template: &str) -> String {
    prompt_template.replace("${output}", "").trim().to_string()
}

/// Resolve the prompt text to use for the given rewrite mode.
///
/// - `Clean` always uses the built-in clean prompt (`CLEAN_PROMPT_ID`), the
///   always-on auto-polish, regardless of which prompt the user selected.
/// - `Prompt` uses the user-selected prompt (`post_process_selected_prompt_id`).
/// - `Off` never rewrites and therefore has no prompt.
fn resolve_rewrite_prompt(settings: &AppSettings, mode: RewriteMode) -> Option<String> {
    let prompt_id = match mode {
        RewriteMode::Off => return None,
        RewriteMode::Clean => CLEAN_PROMPT_ID.to_string(),
        RewriteMode::Prompt => match &settings.post_process_selected_prompt_id {
            // CLEAN_PROMPT_ID is the always-on Baseline prompt, not a library
            // selection. Older stores may still have it armed (it was the only
            // built-in prompt before the library redesign); treat that as
            // "nothing armed" so Prompt mode falls back to verbatim, matching the UI.
            Some(id) if id != CLEAN_PROMPT_ID => id.clone(),
            _ => {
                debug!("Prompt-mode rewrite skipped because no library prompt is armed");
                return None;
            }
        },
    };

    match settings
        .post_process_prompts
        .iter()
        .find(|prompt| prompt.id == prompt_id)
    {
        Some(prompt) if !prompt.prompt.trim().is_empty() => Some(prompt.prompt.clone()),
        Some(_) => {
            debug!("Rewrite skipped because prompt '{}' is empty", prompt_id);
            None
        }
        None => {
            debug!("Rewrite skipped because prompt '{}' was not found", prompt_id);
            None
        }
    }
}

async fn post_process_transcription(
    app: &AppHandle,
    settings: &AppSettings,
    transcription: &str,
    mode: RewriteMode,
) -> Option<String> {
    // Off never rewrites; resolve the prompt for the active mode first so we can
    // bail out cleanly (and fall back to verbatim) before touching the provider.
    let prompt = resolve_rewrite_prompt(settings, mode)?;

    let provider = match settings.active_post_process_provider().cloned() {
        Some(provider) => provider,
        None => {
            debug!("Post-processing enabled but no provider is selected");
            return None;
        }
    };

    // In-process, on-device path: no HTTP, no daemon. When the on-device
    // provider is selected we run the embedded llama.cpp engine directly. It
    // degrades gracefully — if the model is not downloaded, this returns None
    // and the caller keeps the verbatim transcript.
    if provider.id == ON_DEVICE_PROVIDER_ID {
        return refine_on_device(app, &prompt, transcription).await;
    }

    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    // Claude Code (local) path: spawn the user's signed-in `claude` CLI, which
    // runs on their Claude subscription (no API key). Degrades to verbatim on any
    // failure. Checked before the empty-model guard so it can use Claude's own
    // default model when none is configured.
    if provider.id == CLAUDE_CODE_PROVIDER_ID {
        return refine_via_claude_code(&prompt, transcription, &model).await;
    }

    if model.trim().is_empty() {
        debug!(
            "Post-processing skipped because provider '{}' has no model configured",
            provider.id
        );
        return None;
    }

    debug!(
        "Starting LLM post-processing with provider '{}' (model: {})",
        provider.id, model
    );

    let api_key = settings
        .post_process_api_keys
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    // Disable reasoning for providers where post-processing rarely benefits from it.
    // - custom: top-level reasoning_effort (works for local OpenAI-compat servers)
    // - openrouter: nested reasoning object; exclude:true also keeps reasoning text
    //   out of the response so it can't pollute structured-output JSON parsing
    let (reasoning_effort, reasoning) = match provider.id.as_str() {
        "custom" => (Some("none".to_string()), None),
        "openrouter" => (
            None,
            Some(crate::llm_client::ReasoningConfig {
                effort: Some("none".to_string()),
                exclude: Some(true),
            }),
        ),
        _ => (None, None),
    };

    if provider.supports_structured_output {
        debug!("Using structured outputs for provider '{}'", provider.id);

        let system_prompt = build_system_prompt(&prompt);
        let user_content = transcription.to_string();

        // Handle Apple Intelligence separately since it uses native Swift APIs
        if provider.id == APPLE_INTELLIGENCE_PROVIDER_ID {
            #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
            {
                if !apple_intelligence::check_apple_intelligence_availability() {
                    debug!(
                        "Apple Intelligence selected but not currently available on this device"
                    );
                    return None;
                }

                let token_limit = model.trim().parse::<i32>().unwrap_or(0);
                return match apple_intelligence::process_text_with_system_prompt(
                    &system_prompt,
                    &user_content,
                    token_limit,
                ) {
                    Ok(result) => {
                        if result.trim().is_empty() {
                            debug!("Apple Intelligence returned an empty response");
                            None
                        } else {
                            let result = strip_invisible_chars(&result);
                            debug!(
                                "Apple Intelligence post-processing succeeded. Output length: {} chars",
                                result.len()
                            );
                            Some(result)
                        }
                    }
                    Err(err) => {
                        error!("Apple Intelligence post-processing failed: {}", err);
                        None
                    }
                };
            }

            #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
            {
                debug!("Apple Intelligence provider selected on unsupported platform");
                return None;
            }
        }

        // Define JSON schema for transcription output
        let json_schema = serde_json::json!({
            "type": "object",
            "properties": {
                (TRANSCRIPTION_FIELD): {
                    "type": "string",
                    "description": "The cleaned and processed transcription text"
                }
            },
            "required": [TRANSCRIPTION_FIELD],
            "additionalProperties": false
        });

        match crate::llm_client::send_chat_completion_with_schema(
            &provider,
            api_key.clone(),
            &model,
            user_content,
            Some(system_prompt),
            Some(json_schema),
            reasoning_effort.clone(),
            reasoning.clone(),
        )
        .await
        {
            Ok(Some(content)) => {
                // Parse the JSON response to extract the transcription field
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(json) => {
                        if let Some(transcription_value) =
                            json.get(TRANSCRIPTION_FIELD).and_then(|t| t.as_str())
                        {
                            let result = strip_invisible_chars(transcription_value);
                            debug!(
                                "Structured output post-processing succeeded for provider '{}'. Output length: {} chars",
                                provider.id,
                                result.len()
                            );
                            return Some(result);
                        } else {
                            error!("Structured output response missing 'transcription' field");
                            return Some(strip_invisible_chars(&content));
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to parse structured output JSON: {}. Returning raw content.",
                            e
                        );
                        return Some(strip_invisible_chars(&content));
                    }
                }
            }
            Ok(None) => {
                error!("LLM API response has no content");
                return None;
            }
            Err(e) => {
                warn!(
                    "Structured output failed for provider '{}': {}. Falling back to legacy mode.",
                    provider.id, e
                );
                // Fall through to legacy mode below
            }
        }
    }

    // Legacy mode: Replace ${output} variable in the prompt with the actual text
    let processed_prompt = prompt.replace("${output}", transcription);
    debug!("Processed prompt length: {} chars", processed_prompt.len());

    match crate::llm_client::send_chat_completion(
        &provider,
        api_key,
        &model,
        processed_prompt,
        reasoning_effort,
        reasoning,
    )
    .await
    {
        Ok(Some(content)) => {
            let content = strip_invisible_chars(&content);
            debug!(
                "LLM post-processing succeeded for provider '{}'. Output length: {} chars",
                provider.id,
                content.len()
            );
            Some(content)
        }
        Ok(None) => {
            error!("LLM API response has no content");
            None
        }
        Err(e) => {
            error!(
                "LLM post-processing failed for provider '{}': {}. Falling back to original transcription.",
                provider.id,
                e
            );
            None
        }
    }
}

/// Run the rewrite fully in-process via the on-device llama.cpp engine.
///
/// Returns the cleaned text, or `None` (graceful fallback to verbatim) when the
/// model is not downloaded, the engine is unavailable, or inference fails.
/// Inference is CPU-bound so it runs on a blocking thread, keeping the tokio
/// runtime and the transcription pipeline responsive.
async fn refine_on_device(
    app: &AppHandle,
    prompt: &str,
    transcription: &str,
) -> Option<String> {
    let engine = match app.try_state::<Arc<OnDeviceEngine>>() {
        Some(engine) => engine.inner().clone(),
        None => {
            warn!("On-device provider selected but engine state is missing");
            return None;
        }
    };

    if !engine.is_model_available() {
        debug!(
            "On-device model not downloaded yet; falling back to verbatim transcript"
        );
        return None;
    }

    // The prompt template carries a `${output}` placeholder for the legacy
    // HTTP path; the in-process engine sends the transcript as a separate user
    // turn, so strip the placeholder out of the instruction.
    let system_prompt = build_system_prompt(prompt);
    let user_text = transcription.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        engine.refine(&system_prompt, &user_text)
    })
    .await;

    match result {
        Ok(Ok(Some(cleaned))) => {
            let cleaned = strip_invisible_chars(&cleaned);
            debug!(
                "On-device refinement succeeded. Output length: {} chars",
                cleaned.len()
            );
            Some(cleaned)
        }
        Ok(Ok(None)) => {
            debug!("On-device refinement returned no output; keeping verbatim transcript");
            None
        }
        Ok(Err(e)) => {
            error!(
                "On-device refinement failed: {}. Falling back to verbatim transcript.",
                e
            );
            None
        }
        Err(e) => {
            error!("On-device refinement task panicked: {}. Falling back to verbatim.", e);
            None
        }
    }
}

/// Home directory of the current user, used to locate the per-user Claude Code
/// install and credentials.
fn home_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE").map(std::path::PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(std::path::PathBuf::from)
    }
}

/// Locate the Claude Code CLI binary. Checks the official per-user install dir
/// (`~/.local/bin`) first, then scans PATH. Returns a concrete, existing path or
/// `None` if Claude Code is not installed.
pub(crate) fn find_claude_binary() -> Option<std::path::PathBuf> {
    let names: &[&str] = if cfg!(target_os = "windows") {
        &["claude.exe", "claude.cmd", "claude"]
    } else {
        &["claude"]
    };

    if let Some(home) = home_dir() {
        let bin = home.join(".local").join("bin");
        for name in names {
            let candidate = bin.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in names {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

/// Whether the Claude Code provider is usable: the `claude` binary is present and
/// there is a stored login (`~/.claude/.credentials.json`). Surfaced in the AI
/// Rewrite UI so the user knows whether the option will work.
#[tauri::command]
#[specta::specta]
pub fn is_claude_code_available() -> bool {
    if find_claude_binary().is_none() {
        return false;
    }
    // On macOS the login is kept in the system Keychain rather than a file, so a
    // file check would wrongly report "not signed in"; trust the CLI to degrade
    // gracefully there (the rewrite falls back to verbatim if it isn't logged in).
    #[cfg(target_os = "macos")]
    {
        true
    }
    #[cfg(not(target_os = "macos"))]
    {
        home_dir()
            .map(|h| h.join(".claude").join(".credentials.json").is_file())
            .unwrap_or(false)
    }
}

/// Refine via the locally-installed Claude Code CLI (`claude -p`), which runs on
/// the user's Claude subscription auth — no API key. The transcript is sent as
/// the prompt and the clean instruction as the system prompt; the JSON `result`
/// is parsed out. Degrades to verbatim (`None`) on any failure: binary missing,
/// not signed in, non-zero exit, an error result, or a parse error.
async fn refine_via_claude_code(
    prompt: &str,
    transcription: &str,
    model: &str,
) -> Option<String> {
    let Some(binary) = find_claude_binary() else {
        debug!("Claude Code provider selected but the `claude` binary was not found; keeping verbatim");
        return None;
    };

    let system_prompt = build_system_prompt(prompt);
    let user_text = transcription.to_string();
    let model = model.trim().to_string();

    let result =
        tauri::async_runtime::spawn_blocking(move || run_claude_cli(&binary, &system_prompt, &user_text, &model))
            .await;

    match result {
        Ok(Some(text)) => {
            let cleaned = strip_invisible_chars(&text);
            if cleaned.trim().is_empty() {
                debug!("Claude Code returned empty output; keeping verbatim transcript");
                return None;
            }
            debug!(
                "Claude Code refinement succeeded. Output length: {} chars",
                cleaned.len()
            );
            Some(cleaned)
        }
        Ok(None) => {
            debug!("Claude Code refinement produced no usable result; keeping verbatim transcript");
            None
        }
        Err(e) => {
            error!("Claude Code refinement task panicked: {}. Falling back to verbatim.", e);
            None
        }
    }
}

/// Blocking helper: run `claude -p` and return the rewritten text, or `None` on
/// any failure. Runs in a neutral working directory and strips
/// `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from the child env so it always
/// uses the subscription login rather than pay-as-you-go API billing.
fn run_claude_cli(
    binary: &std::path::Path,
    system_prompt: &str,
    transcript: &str,
    model: &str,
) -> Option<String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    // Hard ceiling so a hung CLI (network stall, unexpected prompt) can never
    // stall the dictation pipeline in "Processing" forever.
    const TIMEOUT: Duration = Duration::from_secs(60);

    // On Windows an npm-installed `claude.cmd` is a batch shim that CreateProcess
    // can't exec directly — route those through cmd.exe. A native `claude.exe`
    // (the installer's default, and what's on this machine) is spawned directly.
    #[cfg(target_os = "windows")]
    // Anything that is not a native `.exe` (a `.cmd`/`.bat` shim, or an
    // extensionless shim) can't be exec'd directly by CreateProcess — route it
    // through `cmd /C`.
    let is_cmd_shim = !binary
        .extension()
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false);
    #[cfg(target_os = "windows")]
    let mut cmd = if is_cmd_shim {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(binary);
        c
    } else {
        Command::new(binary)
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new(binary);

    cmd.arg("-p")
        .arg("--output-format")
        .arg("json")
        .arg("--system-prompt")
        .arg(system_prompt)
        // Keep it a fast, deterministic one-shot rewrite: skip the user's MCP
        // servers, don't persist a session, and deny every file/exec/network
        // tool — the rewrite only needs the model's text completion.
        .arg("--strict-mcp-config")
        .arg("--no-session-persistence")
        .arg("--disallowedTools")
        .arg("Bash")
        .arg("Edit")
        .arg("Write")
        .arg("Read")
        .arg("WebFetch")
        .arg("WebSearch");
    if !model.is_empty() {
        cmd.arg("--model").arg(model);
    }
    // The transcript is raw ASR output and fully user-influenceable, so pass it
    // last, after an end-of-options `--` terminator. A dictation that begins with
    // a hyphen (e.g. "--version") is then treated as prompt text, never a flag.
    cmd.arg("--").arg(transcript);

    cmd.current_dir(std::env::temp_dir())
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_AUTH_TOKEN")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    // Don't flash a console window on Windows.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            warn!("Failed to spawn `claude`: {}", e);
            return None;
        }
    };

    // Poll for completion with a deadline; kill the child if it overruns. The CLI
    // emits a single small JSON object, so the stdout pipe never fills while we
    // wait, and reading it after exit can't deadlock.
    let deadline = Instant::now() + TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    warn!("`claude` timed out after {:?}; falling back to verbatim", TIMEOUT);
                    return None;
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => {
                warn!("Error waiting on `claude`: {}", e);
                return None;
            }
        }
    }

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(e) => {
            warn!("Failed to read `claude` output: {}", e);
            return None;
        }
    };

    if !output.status.success() {
        warn!("`claude` exited unsuccessfully: {}", output.status);
        return None;
    }

    let parsed: serde_json::Value = match serde_json::from_slice(&output.stdout) {
        Ok(value) => value,
        Err(e) => {
            warn!("Failed to parse `claude` JSON output: {}", e);
            return None;
        }
    };

    if parsed
        .get("is_error")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        warn!("`claude` returned an error result; falling back to verbatim");
        return None;
    }

    parsed
        .get("result")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

async fn maybe_convert_chinese_variant(
    settings: &AppSettings,
    transcription: &str,
) -> Option<String> {
    // Check if language is set to Simplified or Traditional Chinese
    let is_simplified = settings.selected_language == "zh-Hans";
    let is_traditional = settings.selected_language == "zh-Hant";

    if !is_simplified && !is_traditional {
        debug!("selected_language is not Simplified or Traditional Chinese; skipping translation");
        return None;
    }

    debug!(
        "Starting Chinese translation using OpenCC for language: {}",
        settings.selected_language
    );

    // Use OpenCC to convert based on selected language
    let config = if is_simplified {
        // Convert Traditional Chinese to Simplified Chinese
        BuiltinConfig::Tw2sp
    } else {
        // Convert Simplified Chinese to Traditional Chinese
        BuiltinConfig::S2tw
    };

    match OpenCC::from_config(config) {
        Ok(converter) => {
            let converted = converter.convert(transcription);
            debug!(
                "OpenCC translation completed. Input length: {}, Output length: {}",
                transcription.len(),
                converted.len()
            );
            Some(converted)
        }
        Err(e) => {
            error!("Failed to initialize OpenCC converter: {}. Falling back to original transcription.", e);
            None
        }
    }
}

pub(crate) struct ProcessedTranscription {
    pub final_text: String,
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
}

/// The raw transcription + mode of the most recent completed dictation, kept so
/// the result card's "Retry" can re-run the rewrite and paste a fresh result
/// without re-recording. Managed as Tauri state; see `retry_last_dictation`.
#[derive(Default)]
pub struct LastDictation(pub Mutex<Option<LastDictationData>>);

pub struct LastDictationData {
    pub transcription: String,
    pub mode: RewriteMode,
}

/// Friendly label for the engine that produced the rewrite, shown on the result
/// card (e.g. "On-device", "OpenAI"). Empty for verbatim, where no rewrite ran.
pub(crate) fn rewrite_engine_label(app: &AppHandle, mode: RewriteMode) -> String {
    if !mode.rewrites() {
        return String::new();
    }
    let settings = get_settings(app);
    match settings.active_post_process_provider() {
        Some(provider) if provider.id == ON_DEVICE_PROVIDER_ID => "On-device".to_string(),
        Some(provider) => provider.label.clone(),
        None => String::new(),
    }
}

/// Friendly label for the active speech-to-text model, shown in the transcribing
/// popup (e.g. "Parakeet V3"). Falls back to the raw model id, then to an empty
/// string if no model manager / model is resolvable.
fn asr_engine_label(app: &AppHandle) -> String {
    let settings = get_settings(app);
    app.try_state::<std::sync::Arc<crate::managers::model::ModelManager>>()
        .and_then(|mm| mm.get_model_info(&settings.selected_model))
        .map(|info| info.name)
        .unwrap_or(settings.selected_model)
}

/// Hide the result card / overlay. Backs the card's ✕ button and its idle
/// auto-dismiss timer.
#[tauri::command]
#[specta::specta]
pub fn dismiss_overlay(app: AppHandle) {
    utils::hide_recording_overlay(&app);
}

/// Re-run the most recent dictation's rewrite and paste the fresh result at the
/// cursor, refreshing the result card. For a verbatim dictation (no rewrite)
/// this simply pastes the same text again. Returns an error if there is no
/// recent dictation to retry.
#[tauri::command]
#[specta::specta]
pub async fn retry_last_dictation(app: AppHandle) -> Result<(), String> {
    let last = app.try_state::<LastDictation>().and_then(|state| {
        state
            .0
            .lock()
            .unwrap()
            .as_ref()
            .map(|d| (d.transcription.clone(), d.mode))
    });
    let Some((transcription, mode)) = last else {
        return Err("No recent dictation to retry".to_string());
    };

    if mode.rewrites() {
        show_processing_overlay(&app, &rewrite_engine_label(&app, mode));
    }

    let processed = process_transcription_output(&app, &transcription, mode).await;
    let final_text = processed.final_text;
    if final_text.is_empty() {
        utils::hide_recording_overlay(&app);
        change_tray_icon(&app, TrayIconState::Idle);
        return Ok(());
    }

    let engine = rewrite_engine_label(&app, mode);
    let toast_tag = mode.toast_tag();
    let app_clone = app.clone();
    let text_for_card = final_text.clone();
    app.run_on_main_thread(move || {
        match utils::paste(final_text, app_clone.clone()) {
            Ok(()) => {
                change_tray_icon(&app_clone, TrayIconState::Idle);
                utils::show_paste_card(&app_clone, toast_tag, &text_for_card, &engine);
            }
            Err(e) => {
                error!("Retry paste failed: {}", e);
                utils::hide_recording_overlay(&app_clone);
            }
        }
    })
    .map_err(|e| format!("Failed to run retry paste on main thread: {:?}", e))?;

    Ok(())
}

pub(crate) async fn process_transcription_output(
    app: &AppHandle,
    transcription: &str,
    mode: RewriteMode,
) -> ProcessedTranscription {
    let settings = get_settings(app);
    let mut final_text = transcription.to_string();
    let mut post_processed_text: Option<String> = None;
    let mut post_process_prompt: Option<String> = None;

    if let Some(converted_text) = maybe_convert_chinese_variant(&settings, transcription).await {
        final_text = converted_text;
    }

    if mode.rewrites() {
        if let Some(processed_text) =
            post_process_transcription(app, &settings, &final_text, mode).await
        {
            post_processed_text = Some(processed_text.clone());
            final_text = processed_text;

            // Record the prompt that was actually applied so history reflects
            // the real transform (clean prompt for Clean, selected for Prompt).
            post_process_prompt = resolve_rewrite_prompt(&settings, mode);
        }
        // On any LLM error post_process_transcription returns None and we keep
        // the verbatim text — graceful fallback to verbatim is preserved.
    } else if final_text != transcription {
        // Verbatim path still records non-LLM transforms (e.g. Chinese variant).
        post_processed_text = Some(final_text.clone());
    }

    ProcessedTranscription {
        final_text,
        post_processed_text,
        post_process_prompt,
    }
}

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);

        // Load model in the background
        let tm = app.state::<Arc<TranscriptionManager>>();
        let rm = app.state::<Arc<AudioRecordingManager>>();

        // Load ASR model and VAD model in parallel
        tm.initiate_model_load();
        let rm_clone = Arc::clone(&rm);
        std::thread::spawn(move || {
            if let Err(e) = rm_clone.preload_vad() {
                debug!("VAD pre-load failed: {}", e);
            }
        });

        let binding_id = binding_id.to_string();
        change_tray_icon(app, TrayIconState::Recording);
        show_recording_overlay(app);

        // Get the microphone mode to determine audio feedback timing
        let settings = get_settings(app);
        let is_always_on = settings.always_on_microphone;
        debug!("Microphone mode - always_on: {}", is_always_on);

        let mut recording_error: Option<String> = None;
        if is_always_on {
            // Always-on mode: Play audio feedback immediately, then apply mute after sound finishes
            debug!("Always-on mode: Playing audio feedback immediately");
            let rm_clone = Arc::clone(&rm);
            let app_clone = app.clone();
            // The blocking helper exits immediately if audio feedback is disabled,
            // so we can always reuse this thread to ensure mute happens right after playback.
            std::thread::spawn(move || {
                play_feedback_sound_blocking(&app_clone, SoundType::Start);
                rm_clone.apply_mute();
            });

            if let Err(e) = rm.try_start_recording(&binding_id) {
                debug!("Recording failed: {}", e);
                recording_error = Some(e);
            }
        } else {
            // On-demand mode: Start recording first, then play audio feedback, then apply mute
            // This allows the microphone to be activated before playing the sound
            debug!("On-demand mode: Starting recording first, then audio feedback");
            let recording_start_time = Instant::now();
            match rm.try_start_recording(&binding_id) {
                Ok(()) => {
                    debug!("Recording started in {:?}", recording_start_time.elapsed());
                    // Small delay to ensure microphone stream is active
                    let app_clone = app.clone();
                    let rm_clone = Arc::clone(&rm);
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        debug!("Handling delayed audio feedback/mute sequence");
                        // Helper handles disabled audio feedback by returning early, so we reuse it
                        // to keep mute sequencing consistent in every mode.
                        play_feedback_sound_blocking(&app_clone, SoundType::Start);
                        rm_clone.apply_mute();
                    });
                }
                Err(e) => {
                    debug!("Failed to start recording: {}", e);
                    recording_error = Some(e);
                }
            }
        }

        if recording_error.is_none() {
            // Dynamically register the cancel shortcut in a separate task to avoid deadlock
            shortcut::register_cancel_shortcut(app);
        } else {
            // Starting failed (for example due to blocked microphone permissions).
            // Revert UI state so we don't stay stuck in the recording overlay.
            utils::hide_recording_overlay(app);
            change_tray_icon(app, TrayIconState::Idle);
            if let Some(err) = recording_error {
                let error_type = if is_microphone_access_denied(&err) {
                    "microphone_permission_denied"
                } else if is_no_input_device_error(&err) {
                    "no_input_device"
                } else {
                    "unknown"
                };
                let _ = app.emit(
                    "recording-error",
                    RecordingErrorEvent {
                        error_type: error_type.to_string(),
                        detail: Some(err),
                    },
                );
            }
        }

        debug!(
            "TranscribeAction::start completed in {:?}",
            start_time.elapsed()
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        // Unregister the cancel shortcut when transcription stops
        shortcut::unregister_cancel_shortcut(app);

        let stop_time = Instant::now();
        debug!("TranscribeAction::stop called for binding: {}", binding_id);

        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
        let hm = Arc::clone(&app.state::<Arc<HistoryManager>>());

        change_tray_icon(app, TrayIconState::Transcribing);
        show_transcribing_overlay(app, &asr_engine_label(app));

        // Unmute before playing audio feedback so the stop sound is audible
        rm.remove_mute();

        // Play audio feedback for recording stop
        play_feedback_sound(app, SoundType::Stop);

        let binding_id = binding_id.to_string(); // Clone binding_id for the async task

        // Resolve the rewrite mode from which binding fired plus the master AI
        // toggle: plain binding auto-polishes (Clean) when the toggle is on and
        // is verbatim (Off) otherwise; the dedicated binding is always Prompt.
        let post_process_enabled = get_settings(app).post_process_enabled;
        let mode = RewriteMode::resolve(self.post_process, post_process_enabled);
        // `post_process` (bool) is still what history records as "post-process
        // requested" — true whenever an LLM rewrite actually runs for this mode.
        let post_process = mode.rewrites();

        tauri::async_runtime::spawn(async move {
            let _guard = FinishGuard(ah.clone());
            debug!(
                "Starting async transcription task for binding: {}",
                binding_id
            );

            let stop_recording_time = Instant::now();
            if let Some(samples) = rm.stop_recording(&binding_id) {
                debug!(
                    "Recording stopped and samples retrieved in {:?}, sample count: {}",
                    stop_recording_time.elapsed(),
                    samples.len()
                );

                if samples.is_empty() {
                    debug!("Recording produced no audio samples; skipping persistence");
                    utils::hide_recording_overlay(&ah);
                    change_tray_icon(&ah, TrayIconState::Idle);
                } else {
                    // Save WAV concurrently with transcription
                    let sample_count = samples.len();
                    let file_name = format!("tokezly-{}.wav", chrono::Utc::now().timestamp());
                    let wav_path = hm.recordings_dir().join(&file_name);
                    let wav_path_for_verify = wav_path.clone();
                    let samples_for_wav = samples.clone();
                    let wav_handle = tauri::async_runtime::spawn_blocking(move || {
                        crate::audio_toolkit::save_wav_file(&wav_path, &samples_for_wav)
                    });

                    // Transcribe concurrently with WAV save
                    let transcription_time = Instant::now();
                    let transcription_result = tm.transcribe(samples);

                    // Await WAV save and verify
                    let wav_saved = match wav_handle.await {
                        Ok(Ok(())) => {
                            match crate::audio_toolkit::verify_wav_file(
                                &wav_path_for_verify,
                                sample_count,
                            ) {
                                Ok(()) => true,
                                Err(e) => {
                                    error!("WAV verification failed: {}", e);
                                    false
                                }
                            }
                        }
                        Ok(Err(e)) => {
                            error!("Failed to save WAV file: {}", e);
                            false
                        }
                        Err(e) => {
                            error!("WAV save task panicked: {}", e);
                            false
                        }
                    };

                    match transcription_result {
                        Ok(transcription) => {
                            debug!(
                                "Transcription completed in {:?} ({} chars)",
                                transcription_time.elapsed(),
                                transcription.len()
                            );

                            // Remember this dictation so the result card's
                            // Retry can re-run its rewrite without re-recording.
                            if let Some(state) = ah.try_state::<LastDictation>() {
                                *state.0.lock().unwrap() = Some(LastDictationData {
                                    transcription: transcription.clone(),
                                    mode,
                                });
                            }

                            if post_process {
                                show_processing_overlay(&ah, &rewrite_engine_label(&ah, mode));
                            }
                            let processed =
                                process_transcription_output(&ah, &transcription, mode).await;

                            // Save to history if WAV was saved
                            if wav_saved {
                                if let Err(err) = hm.save_entry(
                                    file_name,
                                    transcription,
                                    post_process,
                                    processed.post_processed_text.clone(),
                                    processed.post_process_prompt.clone(),
                                ) {
                                    error!("Failed to save history entry: {}", err);
                                }
                            }

                            if processed.final_text.is_empty() {
                                utils::hide_recording_overlay(&ah);
                                change_tray_icon(&ah, TrayIconState::Idle);
                            } else {
                                let ah_clone = ah.clone();
                                let paste_time = Instant::now();
                                let final_text = processed.final_text;
                                let toast_tag = mode.toast_tag();
                                let engine = rewrite_engine_label(&ah, mode);
                                let text_for_card = final_text.clone();
                                ah.run_on_main_thread(move || {
                                    match utils::paste(final_text, ah_clone.clone()) {
                                        Ok(()) => {
                                            debug!(
                                                "Text pasted successfully in {:?}",
                                                paste_time.elapsed()
                                            );
                                            // Show the result card (transcript +
                                            // Copy/Retry/Dismiss). It stays until the
                                            // user dismisses it or the frontend's idle
                                            // timer fires; a new recording replaces it.
                                            change_tray_icon(&ah_clone, TrayIconState::Idle);
                                            utils::show_paste_card(
                                                &ah_clone,
                                                toast_tag,
                                                &text_for_card,
                                                &engine,
                                            );
                                        }
                                        Err(e) => {
                                            error!("Failed to paste transcription: {}", e);
                                            let _ = ah_clone.emit("paste-error", ());
                                            utils::hide_recording_overlay(&ah_clone);
                                            change_tray_icon(&ah_clone, TrayIconState::Idle);
                                        }
                                    }
                                })
                                .unwrap_or_else(|e| {
                                    error!("Failed to run paste on main thread: {:?}", e);
                                    utils::hide_recording_overlay(&ah);
                                    change_tray_icon(&ah, TrayIconState::Idle);
                                });
                            }
                        }
                        Err(err) => {
                            debug!("Global Shortcut Transcription error: {}", err);
                            // Save entry with empty text so user can retry
                            if wav_saved {
                                if let Err(save_err) = hm.save_entry(
                                    file_name,
                                    String::new(),
                                    post_process,
                                    None,
                                    None,
                                ) {
                                    error!("Failed to save failed history entry: {}", save_err);
                                }
                            }
                            utils::hide_recording_overlay(&ah);
                            change_tray_icon(&ah, TrayIconState::Idle);
                        }
                    }
                }
            } else {
                debug!("No samples retrieved from recording stop");
                utils::hide_recording_overlay(&ah);
                change_tray_icon(&ah, TrayIconState::Idle);
            }
        });

        debug!(
            "TranscribeAction::stop completed in {:?}",
            stop_time.elapsed()
        );
    }
}

// Cancel Action
struct CancelAction;

impl ShortcutAction for CancelAction {
    fn start(&self, app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        utils::cancel_current_operation(app);
    }

    fn stop(&self, _app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        // Nothing to do on stop for cancel
    }
}

// Test Action
struct TestAction;

impl ShortcutAction for TestAction {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Started - {} (App: {})", // Changed "Pressed" to "Started" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Stopped - {} (App: {})", // Changed "Released" to "Stopped" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }
}

// Static Action Map
pub static ACTION_MAP: Lazy<HashMap<String, Arc<dyn ShortcutAction>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "transcribe".to_string(),
        Arc::new(TranscribeAction {
            post_process: false,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "transcribe_with_post_process".to_string(),
        Arc::new(TranscribeAction { post_process: true }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "cancel".to_string(),
        Arc::new(CancelAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "test".to_string(),
        Arc::new(TestAction) as Arc<dyn ShortcutAction>,
    );
    map
});
