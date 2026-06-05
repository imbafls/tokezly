//! Tauri commands for the in-process on-device refinement engine.
//!
//! These let the frontend report whether the local refinement model is present
//! and trigger its (one-time) download. The engine itself lives in
//! `crate::refinement`; loading is lazy and happens on first refine.

use crate::refinement::{
    catalog_url_for, on_device_model_catalog, OnDeviceEngine, OnDeviceModelInfo,
};
use futures_util::StreamExt;
use log::{info, warn};
use std::io::Write;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Whether the named on-device refinement model is downloaded and ready.
#[tauri::command]
#[specta::specta]
pub fn is_on_device_model_available(app: AppHandle, filename: String) -> bool {
    match app.try_state::<Arc<OnDeviceEngine>>() {
        Some(engine) => engine.is_model_available(&filename),
        None => false,
    }
}

/// The curated catalog of on-device rewrite models for the picker.
#[tauri::command]
#[specta::specta]
pub fn get_on_device_model_catalog() -> Vec<OnDeviceModelInfo> {
    on_device_model_catalog()
}

/// Download the named on-device refinement model into the app-data models dir.
///
/// Streams progress via the `on-device-model-download-progress` event (a float
/// percentage). Idempotent: if the model is already present this returns
/// immediately. The partial download is written to a `.partial` file and only
/// renamed into place once complete, so an interrupted download never leaves a
/// half-written model that the engine would try to load.
#[tauri::command]
#[specta::specta]
pub async fn download_on_device_model(app: AppHandle, filename: String) -> Result<(), String> {
    let engine = app
        .try_state::<Arc<OnDeviceEngine>>()
        .ok_or_else(|| "On-device engine state missing".to_string())?
        .inner()
        .clone();

    let url = catalog_url_for(&filename)
        .ok_or_else(|| format!("Unknown on-device model: {}", filename))?;
    let target = engine.model_path(&filename);
    if target.is_file() {
        info!("On-device model already present at {:?}", target);
        return Ok(());
    }

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create models dir: {}", e))?;
    }

    let partial = target.with_extension("gguf.partial");
    info!(
        "Downloading on-device refinement model to {:?} from {}",
        target, url
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file =
        std::fs::File::create(&partial).map_err(|e| format!("Failed to create file: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_emit = Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(200) {
            let pct = if total > 0 {
                (downloaded as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let _ = app.emit("on-device-model-download-progress", pct);
            last_emit = Instant::now();
        }
    }

    file.flush().map_err(|e| format!("Flush failed: {}", e))?;
    drop(file);

    if total > 0 {
        let actual = std::fs::metadata(&partial).map(|m| m.len()).unwrap_or(0);
        if actual != total {
            let _ = std::fs::remove_file(&partial);
            return Err(format!(
                "Download incomplete: expected {} bytes, got {}",
                total, actual
            ));
        }
    }

    std::fs::rename(&partial, &target).map_err(|e| {
        let _ = std::fs::remove_file(&partial);
        format!("Failed to finalize model file: {}", e)
    })?;

    let _ = app.emit("on-device-model-download-progress", 100.0_f64);
    info!("On-device model download complete: {:?}", target);
    Ok(())
}

/// Run a refinement through the on-device engine and return the cleaned text.
///
/// Primarily a smoke/diagnostic entry point: lets the frontend (or a manual
/// invocation) prove in-process inference works without going through the full
/// dictation pipeline. Returns an error if the model is not downloaded.
#[tauri::command]
#[specta::specta]
pub async fn refine_text_on_device(
    app: AppHandle,
    filename: String,
    instruction: String,
    text: String,
) -> Result<String, String> {
    let engine = app
        .try_state::<Arc<OnDeviceEngine>>()
        .ok_or_else(|| "On-device engine state missing".to_string())?
        .inner()
        .clone();

    if !engine.is_model_available(&filename) {
        return Err("On-device model is not downloaded".to_string());
    }

    let result =
        tauri::async_runtime::spawn_blocking(move || engine.refine(&filename, &instruction, &text))
            .await;

    match result {
        Ok(Ok(Some(cleaned))) => Ok(cleaned),
        Ok(Ok(None)) => {
            warn!("On-device refine produced no output");
            Err("On-device refinement produced no output".to_string())
        }
        Ok(Err(e)) => Err(e),
        Err(e) => Err(format!("On-device refine task panicked: {}", e)),
    }
}
