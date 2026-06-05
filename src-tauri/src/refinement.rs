//! In-process, on-device LLM refinement engine.
//!
//! This is the "fully local, no daemon" refinement path: a small instruction-tuned
//! GGUF model loaded and run entirely in-process on the CPU via the vendored
//! llama.cpp (the `llama-cpp-2` crate). It is the counterpart to the HTTP-based
//! cloud / Ollama providers in `llm_client.rs` — same job (turn a messy transcript
//! into a clean one), but no network and no external process.
//!
//! Design notes:
//! - The model is **lazy-loaded** on first use (never at app boot) behind a
//!   `OnceLock` marker, mirroring the `initialize_enigo` pattern. Loading a
//!   ~1.6 GB model at startup would block launch and risk OOM.
//! - Inference is CPU-bound, so callers run [`OnDeviceModel::refine`] inside
//!   `tokio::task::spawn_blocking` to keep it off the async runtime.
//! - It **degrades gracefully**: if the weights are not present on disk,
//!   [`OnDeviceEngine::refine`] returns `Ok(None)` and the caller falls back to
//!   the verbatim transcript. It never panics and never blocks the paste path.

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use log::{debug, info, warn};
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use once_cell::sync::OnceCell;
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// Filename of the default on-device model on disk (lives in the app-data
/// `models/` directory, downloaded on demand — never bundled, never committed).
/// The provider id used by settings to select this engine lives in
/// `crate::settings::ON_DEVICE_PROVIDER_ID`.
pub const DEFAULT_MODEL_FILENAME: &str = "gemma-2-2b-it-Q4_K_M.gguf";

/// Download URL for the default model (Gemma 2 2B Instruct, Q4_K_M GGUF, ~1.6 GB).
/// Chosen to match the architecture doc's "local Gemma" default. The engine
/// itself is model-agnostic — any instruction-tuned GGUF in the models dir with
/// this filename will be loaded.
pub const DEFAULT_MODEL_URL: &str =
    "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf";

/// Hard cap on generated tokens. Refinement is a bounded rewrite of a short
/// transcript, so we never need a long generation; this also bounds latency.
const MAX_NEW_TOKENS: i32 = 512;

/// Context window. Transcripts are short; 4096 is comfortably enough for the
/// system prompt + a long dictation + the rewrite, and keeps memory modest.
const CONTEXT_TOKENS: u32 = 4096;

/// A loaded on-device model plus its backend.
///
/// The `LlamaModel` borrows from the `LlamaBackend`, so we keep the backend
/// alive for the lifetime of the model. We create a fresh context per request
/// (cheap relative to model load) so a single model can serve sequential
/// refinements without holding KV-cache state between calls.
pub struct OnDeviceModel {
    // Field order matters for drop order: `model` must drop before `backend`.
    model: LlamaModel,
    backend: Arc<LlamaBackend>,
    n_threads: i32,
}

impl OnDeviceModel {
    /// Load a GGUF model from `path` on the CPU. This is the expensive call
    /// (reads ~1.6 GB from disk and maps it); run it off the async runtime.
    pub fn load(backend: Arc<LlamaBackend>, path: &Path) -> Result<Self, String> {
        let load_start = Instant::now();

        // CPU-only: zero GPU layers. (No feature for cuda/vulkan/metal is
        // compiled in, but be explicit so intent is obvious.)
        let model_params = LlamaModelParams::default().with_n_gpu_layers(0);

        let model = LlamaModel::load_from_file(&backend, path, &model_params)
            .map_err(|e| format!("Failed to load on-device model from {:?}: {}", path, e))?;

        // Use up to half the logical cores, capped, leaving headroom for the
        // rest of the app (audio, UI). Minimum of 1.
        let n_threads = std::cmp::max(
            1,
            std::cmp::min(
                8,
                std::thread::available_parallelism()
                    .map(|n| (n.get() / 2) as i32)
                    .unwrap_or(2),
            ),
        );

        info!(
            "On-device model loaded in {:?} ({} threads)",
            load_start.elapsed(),
            n_threads
        );

        Ok(Self {
            model,
            backend,
            n_threads,
        })
    }

    /// Run a single bounded refinement.
    ///
    /// `system_prompt` is the cleanup instruction (the same prompt text used for
    /// the cloud/Ollama providers, with the `${output}` placeholder stripped).
    /// `user_text` is the raw transcript. Returns the cleaned text.
    ///
    /// CPU-bound — call inside `spawn_blocking`.
    pub fn refine(&self, system_prompt: &str, user_text: &str) -> Result<String, String> {
        let gen_start = Instant::now();

        let prompt = self.build_prompt(system_prompt, user_text)?;
        debug!("On-device refine prompt built ({} bytes)", prompt.len());

        // Fresh context per request so prior refinements don't bleed into this
        // one. n_batch defaults track n_ctx; the prompt is short so this is fine.
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(Some(NonZeroU32::new(CONTEXT_TOKENS).unwrap()))
            .with_n_threads(self.n_threads)
            .with_n_threads_batch(self.n_threads);

        let mut ctx = self
            .model
            .new_context(&self.backend, ctx_params)
            .map_err(|e| format!("Failed to create llama context: {}", e))?;

        // Tokenize the fully-formatted prompt. The chat template already inserts
        // BOS where the model expects it, so do not add another.
        let tokens = self
            .model
            .str_to_token(&prompt, AddBos::Never)
            .map_err(|e| format!("Failed to tokenize prompt: {}", e))?;

        let n_ctx = ctx.n_ctx() as i32;
        if tokens.len() as i32 >= n_ctx {
            return Err(format!(
                "Prompt too long for context window ({} tokens >= {} ctx)",
                tokens.len(),
                n_ctx
            ));
        }

        // Feed the prompt. Only the final token needs logits (that is where the
        // first generated token is sampled from).
        let mut batch = LlamaBatch::new(tokens.len().max(1), 1);
        let last_idx = tokens.len() as i32 - 1;
        for (i, token) in tokens.iter().enumerate() {
            let is_last = i as i32 == last_idx;
            batch
                .add(*token, i as i32, &[0], is_last)
                .map_err(|e| format!("Failed to add prompt token to batch: {}", e))?;
        }
        ctx.decode(&mut batch)
            .map_err(|e| format!("Prompt decode failed: {}", e))?;

        // Greedy sampling with a light top-k/temperature tail. For a deterministic
        // cleanup task we keep temperature low so the model sticks close to the
        // input instead of paraphrasing. A fixed seed keeps results reproducible.
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::top_k(40),
            LlamaSampler::temp(0.2),
            LlamaSampler::dist(1234),
        ]);

        let mut output = String::new();
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut n_cur = tokens.len() as i32;
        let mut n_generated = 0;

        while n_generated < MAX_NEW_TOKENS && n_cur < n_ctx {
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);

            if self.model.is_eog_token(token) {
                break;
            }

            // Decode this token's piece into text. `false` => skip special tokens.
            match self
                .model
                .token_to_piece(token, &mut decoder, false, None)
            {
                Ok(piece) => output.push_str(&piece),
                Err(e) => {
                    warn!("token_to_piece failed mid-generation: {}", e);
                    break;
                }
            }

            batch.clear();
            batch
                .add(token, n_cur, &[0], true)
                .map_err(|e| format!("Failed to add generated token to batch: {}", e))?;
            n_cur += 1;
            n_generated += 1;

            ctx.decode(&mut batch)
                .map_err(|e| format!("Generation decode failed: {}", e))?;
        }

        let cleaned = output.trim().to_string();
        info!(
            "On-device refine generated {} tokens in {:?} ({} chars out)",
            n_generated,
            gen_start.elapsed(),
            cleaned.len()
        );

        Ok(cleaned)
    }

    /// Build the final prompt string fed to the tokenizer.
    ///
    /// Prefer the model's embedded chat template (so any instruct GGUF — Gemma,
    /// Qwen, Llama — is formatted exactly the way it was trained). Gemma has no
    /// dedicated system role, so we fold the instruction into the user turn.
    /// If the model ships no template, fall back to a generic ChatML-ish format.
    fn build_prompt(&self, system_prompt: &str, user_text: &str) -> Result<String, String> {
        let combined_user = if system_prompt.trim().is_empty() {
            user_text.to_string()
        } else {
            format!("{}\n\nTranscript:\n{}", system_prompt.trim(), user_text)
        };

        match self.model.chat_template(None) {
            Ok(template) => {
                let messages = vec![LlamaChatMessage::new("user".to_string(), combined_user)
                    .map_err(|e| format!("Failed to build chat message: {}", e))?];
                self.model
                    .apply_chat_template(&template, &messages, true)
                    .map_err(|e| format!("Failed to apply chat template: {}", e))
            }
            Err(e) => {
                // No embedded template — fall back to a generic instruct format.
                debug!("Model has no embedded chat template ({}); using fallback", e);
                Ok(format!(
                    "<start_of_turn>user\n{}<end_of_turn>\n<start_of_turn>model\n",
                    combined_user
                ))
            }
        }
    }
}

/// The on-device refinement engine: a lazily-initialized, in-process LLM.
///
/// Managed as Tauri state. The model is loaded on first [`refine`](Self::refine)
/// call and cached for the process lifetime.
pub struct OnDeviceEngine {
    /// Directory holding GGUF weights (app-data `models/`).
    models_dir: PathBuf,
    /// Shared llama backend (initialized exactly once, lazily). `OnceCell` so the
    /// fallible `LlamaBackend::init()` runs under real synchronization — a plain
    /// get-then-set would let a second concurrent caller hit
    /// `init()`'s global "already initialized" error and spuriously fail.
    backend: OnceCell<Arc<LlamaBackend>>,
    /// The loaded model. The mutex serializes the one-time cold load so two
    /// concurrent first-refines can't both map the ~1.6 GB GGUF; inference itself
    /// runs lock-free on a cloned `Arc`, so dictations still refine concurrently.
    model: Mutex<Option<Arc<OnDeviceModel>>>,
}

impl OnDeviceEngine {
    /// Create the engine bound to a models directory. Does NOT load any weights.
    pub fn new(models_dir: PathBuf) -> Self {
        Self {
            models_dir,
            backend: OnceCell::new(),
            model: Mutex::new(None),
        }
    }

    /// Path to the default on-device model file.
    pub fn default_model_path(&self) -> PathBuf {
        self.models_dir.join(DEFAULT_MODEL_FILENAME)
    }

    /// Whether the default model weights are present on disk.
    pub fn is_model_available(&self) -> bool {
        self.default_model_path().is_file()
    }

    /// Lazily get-or-init the shared llama backend. `get_or_try_init` runs the
    /// fallible `init()` under the cell's lock, so exactly one thread initializes
    /// the backend and the rest wait for and share its result — no thread ever
    /// sees `init()`'s "already initialized" error.
    fn backend(&self) -> Result<Arc<LlamaBackend>, String> {
        self.backend
            .get_or_try_init(|| {
                LlamaBackend::init()
                    .map(Arc::new)
                    .map_err(|e| format!("Failed to initialize llama backend: {}", e))
            })
            .cloned()
    }

    /// Get the loaded model, loading it on first use. Returns `Ok(None)` if the
    /// weights are not on disk yet (caller falls back to verbatim).
    fn get_or_load_model(&self) -> Result<Option<Arc<OnDeviceModel>>, String> {
        // Hold the lock across the cold load so only one thread ever loads the
        // model; concurrent first-refines wait here and then share the result.
        // Inference runs later on a cloned `Arc`, off the lock, so it stays
        // concurrent.
        let mut guard = self.model.lock().unwrap();
        if let Some(m) = guard.as_ref() {
            return Ok(Some(m.clone()));
        }

        let path = self.default_model_path();
        if !path.is_file() {
            debug!(
                "On-device model not present at {:?}; refinement will fall back to verbatim",
                path
            );
            return Ok(None);
        }

        let backend = self.backend()?;
        info!("Lazily loading on-device refinement model from {:?}", path);
        let model = Arc::new(OnDeviceModel::load(backend, &path)?);
        *guard = Some(model.clone());
        Ok(Some(model))
    }

    /// Refine `user_text` using `system_prompt`. Returns:
    /// - `Ok(Some(text))` on a successful in-process rewrite,
    /// - `Ok(None)` when the model is not downloaded (graceful degrade),
    /// - `Err(_)` on an actual inference failure (caller still falls back).
    ///
    /// CPU-bound — call inside `tokio::task::spawn_blocking`.
    pub fn refine(&self, system_prompt: &str, user_text: &str) -> Result<Option<String>, String> {
        let Some(model) = self.get_or_load_model()? else {
            return Ok(None);
        };
        let cleaned = model.refine(system_prompt, user_text)?;
        if cleaned.is_empty() {
            warn!("On-device refinement produced empty output");
            return Ok(None);
        }
        Ok(Some(cleaned))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end CPU smoke test for the in-process refinement engine.
    ///
    /// Ignored by default because it loads (and, if missing, downloads ~1.6 GB
    /// of) real weights. Run it explicitly to prove on-device generation:
    ///
    /// ```text
    /// cargo test --lib refinement::tests::on_device_cleanup_smoke -- --ignored --nocapture
    /// ```
    ///
    /// It loads the GGUF from `local/models/` (git-ignored), downloading it
    /// there first if absent, then cleans the canonical messy transcript and
    /// prints the actual output.
    #[test]
    #[ignore]
    fn on_device_cleanup_smoke() {
        // local/models lives two levels up from src-tauri/ (the crate root).
        let models_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("crate parent")
            .join("local")
            .join("models");
        std::fs::create_dir_all(&models_dir).expect("create models dir");

        let model_path = models_dir.join(DEFAULT_MODEL_FILENAME);
        if !model_path.is_file() {
            eprintln!("Model missing; downloading {} ...", DEFAULT_MODEL_URL);
            download_blocking(DEFAULT_MODEL_URL, &model_path).expect("download model");
        }
        assert!(model_path.is_file(), "model must be present after download");

        let engine = OnDeviceEngine::new(models_dir);
        assert!(engine.is_model_available(), "engine should see the model");

        let instruction = "Clean this transcript:\n1. Fix spelling, capitalization, and punctuation.\n2. Remove filler words (um, uh).\n\nPreserve exact meaning and word order. Do not paraphrase. Return only the cleaned transcript.";
        let messy = "um so the the websocket reconnect it doesn't back off it just uh hammers the endpoint";

        let start = std::time::Instant::now();
        let out = engine
            .refine(instruction, messy)
            .expect("refine should not error")
            .expect("model is present so output should be Some");
        let elapsed = start.elapsed();

        eprintln!("\n===== ON-DEVICE SMOKE =====");
        eprintln!("INPUT : {}", messy);
        eprintln!("OUTPUT: {}", out);
        eprintln!("LATENCY (incl. load): {:?}", elapsed);
        eprintln!("===========================\n");

        assert!(!out.trim().is_empty(), "output must be non-empty");
    }

    /// On-device proof that the list-aware clean prompt turns a dictated
    /// enumeration into a formatted list. Ignored by default (loads ~1.6 GB of
    /// real weights). Run explicitly:
    ///
    /// ```text
    /// cargo test --lib refinement::tests::on_device_list_formatting_smoke -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore]
    fn on_device_list_formatting_smoke() {
        let models_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("crate parent")
            .join("local")
            .join("models");
        std::fs::create_dir_all(&models_dir).expect("create models dir");

        let model_path = models_dir.join(DEFAULT_MODEL_FILENAME);
        if !model_path.is_file() {
            eprintln!("Model missing; downloading {} ...", DEFAULT_MODEL_URL);
            download_blocking(DEFAULT_MODEL_URL, &model_path).expect("download model");
        }

        let engine = OnDeviceEngine::new(models_dir);

        // The real shipped clean prompt, with the `${output}` placeholder stripped
        // exactly as `actions::build_system_prompt` does for the on-device path.
        let system_prompt = crate::settings::CLEAN_PROMPT_TEXT
            .replace("${output}", "")
            .trim()
            .to_string();
        // A messy, run-on dictation of three ordered points (no list markers in).
        let messy = "okay so first we need to fix the login bug um second uh we should add the csv export feature and then third we have to write some tests for the payment flow";

        let out = engine
            .refine(&system_prompt, messy)
            .expect("refine should not error")
            .expect("model present so output is Some");

        eprintln!("\n===== ON-DEVICE LIST SMOKE =====");
        eprintln!("INPUT : {}", messy);
        eprintln!("OUTPUT:\n{}", out);
        eprintln!("================================\n");

        let list_lines = out
            .lines()
            .filter(|l| {
                let t = l.trim_start();
                t.starts_with("- ")
                    || t.starts_with("* ")
                    || (t.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
                        && (t.contains(". ") || t.contains(") ")))
            })
            .count();
        assert!(
            list_lines >= 2,
            "expected the enumerated dictation to become a list (>=2 list lines), got:\n{}",
            out
        );
    }

    /// Minimal blocking downloader for the test (no tokio runtime needed here).
    fn download_blocking(url: &str, target: &std::path::Path) -> Result<(), String> {
        use std::io::Read;
        let mut resp = reqwest::blocking::get(url).map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }
        let partial = target.with_extension("gguf.partial");
        let mut file = std::fs::File::create(&partial).map_err(|e| e.to_string())?;
        let mut buf = [0u8; 1 << 20];
        loop {
            let n = resp.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            std::io::Write::write_all(&mut file, &buf[..n]).map_err(|e| e.to_string())?;
        }
        std::io::Write::flush(&mut file).map_err(|e| e.to_string())?;
        drop(file);
        std::fs::rename(&partial, target).map_err(|e| e.to_string())
    }
}
