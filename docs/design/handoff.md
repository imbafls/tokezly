# Strum — Engineering Handoff

A local-first, desktop dictation utility. Speech in, clean text out, pasted wherever your
cursor is. Transcription is the base; the AI rewrite is an optional layer on top, and it runs
fully on-device by default.

This document is the source of truth for **repository layout**, **first-time setup**, and the
**conventions** every contributor follows. Read it before your first commit.

---

## 1. Stack

| Layer        | Choice                                              |
|--------------|-----------------------------------------------------|
| Shell        | Tauri 2.x (Rust core + system WebView)              |
| Core         | Rust — audio, VAD, ASR orchestration, inference     |
| Frontend     | TypeScript + React, thin UI (capsule, popups, settings) |
| ASR          | Parakeet (CPU, default) · Whisper (GPU)             |
| Rewrite (AI) | Gemma 3 4B local via llama.cpp (default) · cloud opt-in |
| VAD          | Silero                                              |
| Persistence  | key-value store · OS keychain for secrets           |

The shell stays tiny on purpose: no bundled browser, no Electron weight. The only large items
on disk are the models, which are downloaded on first run — never committed.

---

## 2. Repository layout

Create the tree below. Each crate owns one concern; the UI is a single thin frontend.

```
strum/
├── README.md
├── handoff.md
├── .gitignore
├── .env.example
├── Cargo.toml                  # Rust workspace root
├── package.json               # frontend + app scripts (bun)
│
├── crates/
│   ├── core/                  # session orchestrator, manager pattern, event bus
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── audio/                 # capture (cpal)
│   ├── vad/                   # Silero voice-activity detection
│   ├── asr/                   # AsrEngine trait + Parakeet / Whisper backends
│   └── llm/                   # RefinementProvider trait + local / cloud backends
│
├── src-tauri/                 # app shell: commands, events, tray, global hotkeys
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/main.rs
│
├── ui/                        # thin web frontend
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── runtime/           # capsule · popups · toast · command palette
│       ├── settings/          # nav · engines · ai-rewrite pages
│       ├── state/             # reactive store
│       └── styles/
│
├── resources/                 # bundled assets (icons, small static files)
├── scripts/                   # dev / build / release helpers
├── docs/                      # design + architecture references
└── local/                     # ⛔ git-ignored — see §4
```

---

## 3. First-time setup

**Prerequisites**

- Rust (latest stable) + `cargo`
- Bun
- Platform build tools:
  - macOS — Xcode Command Line Tools
  - Windows — Microsoft C++ Build Tools
  - Linux — build essentials + ALSA development libraries

**Bootstrap**

```bash
git clone <repo-url> strum
cd strum

# create the local-only workspace (never committed)
mkdir -p local/models local/scratch

# copy and fill in your environment
cp .env.example .env

# install frontend deps
bun install

# run in development
bun run dev          # alias for `tauri dev`
```

**Build a release bundle**

```bash
bun run build        # alias for `tauri build`
```

Models are fetched into `local/models/` on first launch; they are intentionally excluded from
the repository and the installer.

---

## 4. The `local/` directory

`local/` is your machine-only scratch space. **The entire folder is git-ignored — nothing
inside it is ever committed.** Use it for:

- downloaded model weights (`*.gguf`, `*.onnx`, `*.bin`)
- personal `.env` overrides, tokens, and keys
- scratch notes, experiment output, profiling dumps, sample recordings
- anything you do not want to share with the team

Treat it as disposable. If a file needs to be shared, it does not belong in `local/`.

---

## 5. `.gitignore`

The repository ships with the `.gitignore` below. `local/` is ignored in full.

```gitignore
# Local-only workspace — never committed
/local/

# Rust
/target/
**/target/
**/*.rs.bk

# Frontend / Node (bun)
node_modules/
**/node_modules/
dist/
**/dist/
.vite/
*.tsbuildinfo

# Tauri build output
src-tauri/target/
src-tauri/gen/

# Model weights & large local assets (downloaded at runtime)
*.gguf
*.onnx
*.bin
resources/models/

# Environment & secrets
.env
.env.*
!.env.example
*.local

# Editor / OS noise
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json
*.swp

# Logs
*.log
logs/
```

`Cargo.lock` **is** committed (this is a shipped application, not a library).

---

## 6. Branching & commits

- Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `refactor/…`.
- Conventional Commits: `type(scope): summary`, imperative mood, lower-case summary.
  - `feat(asr): stream partial transcripts to the capsule`
  - `fix(llm): cap rewrite output to keep latency under budget`
  - `chore(ui): tighten capsule spacing`
- Keep commits small and self-contained; the body explains the **why** when it isn't obvious.
- Squash-merge PRs; the PR title becomes the commit and should read like a changelog line.

---

## 7. Authorship & history hygiene

This is a human-authored codebase and the history must read that way. Treat the following as a
hard requirement, enforced in review:

- **No tool attribution anywhere.** Do not add `Co-authored-by:` trailers, `Generated with …`,
  `Assisted by …`, or any equivalent to commits, PR descriptions, code comments, file headers,
  changelogs, or docs.
- **No references to code-generation assistants** in commit messages, branch names, comments,
  `TODO`s, or commit/PR metadata.
- **Strip generated boilerplate** (signatures, banners, attribution footers) from any snippet
  before it lands.
- **Comments explain intent and tradeoffs, not provenance.** Write them as the author of the
  code, in plain engineering English.

Anything that reads as machine-attributed gets sent back in review.

---

## 8. Code style

- **Rust:** `cargo fmt` + `cargo clippy -- -D warnings` clean before pushing. Engines live behind
  traits (`AsrEngine`, `RefinementProvider`); add a backend by implementing the trait and
  registering it — no changes to call sites.
- **TypeScript:** project formatter + linter clean. UI components are small and presentational;
  state lives in the store, talks to the core over the command/event bridge.
- Comments earn their place: explain the non-obvious, document invariants and latency budgets,
  delete the rest.

---

## 9. Definition of done

- [ ] `cargo fmt`, `cargo clippy`, and the frontend lint/format pass clean.
- [ ] Runs end-to-end in `tauri dev` (dictate → clean → paste; AI on and off).
- [ ] No model weights, secrets, or `local/` contents staged.
- [ ] Commit message and PR follow §6 and §7.
- [ ] Touched UI states stay consistent with the spec in `docs/`.
