# Tokezly

A local-first, desktop-native dictation utility for engineers. Speak anywhere, get clean text
everywhere — pasted straight at your cursor.

Transcription is the base and it works standalone: hold a global hotkey, talk, and the verbatim
text lands in whatever app has focus. The **AI rewrite** is an optional layer on top — turn it on
and Tokezly polishes what you said (fillers and repeats gone, self-corrections applied, grammar
fixed), or runs an explicit `/` instruction. The rewrite runs **fully on-device by default**;
cloud providers are available, strictly opt-in.

At runtime Tokezly is almost nothing on screen: a tiny translucent capsule while you talk, a small
popup as text streams, a paste toast, then gone. The only full window is Settings.

Website: [tokezly.com](https://tokezly.com).

## Download

Prebuilt installers are published on the
[GitHub Releases page](https://github.com/imbafls/tokezly/releases).

**Platform support:** Tokezly is built and tested for **Windows x64**, shipped as an NSIS `.exe`
installer and a WiX `.msi`. macOS and Linux targets exist in the build configuration but are
**experimental** — they are not currently shipped as prebuilt binaries. To run on those platforms,
[build from source](#build-from-source).

**The installers are unsigned** (there is no code-signing certificate), so the OS will warn the
first time you run them:

- **Windows:** SmartScreen may show a "Windows protected your PC" dialog. Click **More info**, then
  **Run anyway**.
- **macOS:** Gatekeeper will block a direct double-click. **Right-click** (or Control-click) the app
  and choose **Open**, then confirm.

## Stack

| Layer        | Choice                                                        |
|--------------|---------------------------------------------------------------|
| Shell        | Tauri 2.x (Rust core + system WebView)                        |
| Core         | Rust — audio capture, VAD, ASR orchestration, refinement      |
| Frontend     | TypeScript + React (thin UI: capsule, popups, settings)       |
| ASR          | `transcribe-rs` — Parakeet (default) · Whisper · others       |
| VAD          | Silero                                                        |
| AI rewrite   | On-device LLM (Gemma GGUF via `llama-cpp-2`) by default · cloud providers opt-in (OpenAI-compatible HTTP, Gemini, Claude via local CLI) |
| Persistence  | key-value settings store (settings + API keys) · SQLite history |

Model weights are downloaded on first use into the app data directory — never committed.

## Build from source

**Prerequisites:** Rust (stable), [Bun](https://bun.sh), the platform C/C++ build tools
(Windows: Microsoft C++ Build Tools), and `libclang` + `cmake` on the build host (used to compile
the Whisper engine; on Windows these can be installed user-scope with `pip install libclang cmake`).

```bash
bun install
bun run tauri dev      # dev server is pinned to port 1430 (strictPort)
```

Build a release bundle:

```bash
bun run tauri build
```

> **libclang on Windows:** the Whisper engine needs `libclang` at build time. If a build can't find
> it, point `LIBCLANG_PATH` at the directory that holds `libclang.dll` before invoking the build,
> e.g.:
>
> ```powershell
> $env:LIBCLANG_PATH = "<path-to>/site-packages/clang/native"
> ```

> **Port note:** Tokezly's dev server binds to **1430** (`--strictPort`). It fails loudly rather than
> silently falling back, so a port collision is obvious instead of mysterious.

## Repository layout

```
tokezly/
├── src/                      # React + TypeScript frontend
│   ├── components/           #   settings panes, shared UI
│   ├── stores/               #   zustand state (settings, models)
│   ├── overlay/              #   the runtime capsule / popup / toast window
│   └── bindings.ts           #   auto-generated Tauri command/event bindings
├── src-tauri/                # Rust core
│   ├── src/
│   │   ├── managers/         #   audio · model · transcription · history
│   │   ├── audio_toolkit/    #   capture, resampling, VAD, visualiser
│   │   ├── actions.rs        #   the record → transcribe → refine → paste pipeline
│   │   ├── refinement.rs     #   on-device LLM engine
│   │   ├── llm_client.rs     #   cloud refinement client
│   │   └── shortcut/         #   global hotkeys
│   └── resources/            #   bundled assets + Silero VAD model
├── licenses/                 # third-party license texts (bundled fonts, etc.)
├── THIRD-PARTY-NOTICES.md    # attributions for bundled third-party components
└── local/                    # machine-only scratch — git-ignored in full
```

## License

MIT — see [`LICENSE`](LICENSE). Tokezly's engine layer builds on
[Handy](https://github.com/cjpais/Handy) (MIT, © CJ Pais); that copyright notice is retained in
`LICENSE` as the license requires.

Bundled third-party components and fonts, with their respective licenses, are listed in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
