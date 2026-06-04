# Strum

A local-first, desktop-native dictation utility for engineers. Speak anywhere, get clean text
everywhere — pasted straight at your cursor.

Transcription is the base and it works standalone: hold a global hotkey, talk, and the verbatim
text lands in whatever app has focus. The **AI rewrite** is an optional layer on top — turn it on
and Strum polishes what you said (fillers and repeats gone, self-corrections applied, grammar
fixed), or runs an explicit `/` instruction. The rewrite runs **fully on-device by default**;
a cloud provider is available, strictly opt-in.

At runtime Strum is almost nothing on screen: a tiny translucent capsule while you talk, a small
popup as text streams, a paste toast, then gone. The only full window is Settings.

## Stack

| Layer        | Choice                                                        |
|--------------|---------------------------------------------------------------|
| Shell        | Tauri 2.x (Rust core + system WebView)                        |
| Core         | Rust — audio capture, VAD, ASR orchestration, refinement      |
| Frontend     | TypeScript + React (thin UI: capsule, popups, settings)       |
| ASR          | `transcribe-rs` — Parakeet (default) · Whisper · others       |
| VAD          | Silero                                                        |
| AI rewrite   | Local LLM on-device by default · cloud provider opt-in        |
| Persistence  | key-value store · SQLite history · OS keychain for secrets    |

Model weights are downloaded on first use into the app data directory — never committed.

## Running locally

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

> **Port note:** Strum's dev server binds to **1430** (`--strictPort`). It fails loudly rather than
> silently falling back, so a port collision is obvious instead of mysterious.

## Repository layout

```
strum/
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
│   │   ├── llm_client.rs     #   cloud refinement client
│   │   └── shortcut/         #   global hotkeys
│   └── resources/            #   bundled assets + Silero VAD model
├── local/                    # machine-only scratch — git-ignored in full
└── docs/                     # design + architecture references
```

## License

MIT. Strum's engine layer builds on [Handy](https://github.com/cjpais/Handy) (MIT, © CJ Pais);
that copyright notice is retained in `LICENSE` as the license requires.
