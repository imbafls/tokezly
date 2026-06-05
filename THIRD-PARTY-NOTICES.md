# Third-Party Notices

Tokezly is distributed under the MIT License (see `LICENSE`). It bundles, links
against, and at runtime downloads a number of third-party components, each under
its own license. This file lists those components, describes how Tokezly uses
each one, and reproduces the required attributions.

Tokezly was originally seeded from the Handy project and extended from there, so
substantial portions of the application derive from Handy. That heritage is
acknowledged below and is reflected in the project's own `LICENSE`, which carries
both the Tokezly and the Handy copyright lines.

Most of the components listed here are under permissive licenses (MIT,
Apache-2.0, BSD, ISC, the SIL Open Font License, or a public-domain dedication).
**Two components are not open-source licenses** and deserve attention:

- **Microsoft DirectML** (`DirectML.dll`) ships inside the Windows installer
  under Microsoft's proprietary DirectX Machine Learning license terms (see the
  "Statically linked / native components" section).
- **Google Gemma 2** — the default on-device rewrite model — is distributed under
  the Google Gemma Terms of Use rather than an open-source license. Gemma is
  **not** shipped inside the installer; it is downloaded at the user's request
  (see "AI rewrite and ASR models (downloaded at runtime)").

License identifiers below use SPDX where one exists. The complete,
machine-readable list of every transitive dependency and its license is the
`Cargo.lock` (Rust) and `package.json` / lockfile (JavaScript) in this
repository. The full SIL Open Font License texts for the bundled fonts are
included in this repository under `licenses/`.

---

## Upstream project

### Handy

- **What it is / how Tokezly uses it:** Tokezly was created by seeding from
  Handy, a local-first dictation utility, then rebranding and extending it. The
  manager/bridge architecture and a meaningful share of the shipped source derive
  from Handy.
- **License:** MIT
- **Copyright:** Copyright (c) 2025 CJ Pais
- **Source:** https://github.com/cjpais/Handy

The Handy copyright notice is retained in Tokezly's own `LICENSE`, alongside the
Tokezly copyright.

---

## Statically linked / native components (shipped in the installer)

### whisper.cpp

- **What it is / how Tokezly uses it:** The whisper.cpp inference engine, used for
  Whisper-family speech-to-text. It is reached through the `transcribe-rs`
  abstraction (via `whisper-rs-sys`) and statically linked into the release
  binary.
- **License:** MIT
- **Copyright:** Copyright (c) 2023-2024 The ggml authors
- **Source:** https://github.com/ggml-org/whisper.cpp

### llama.cpp

- **What it is / how Tokezly uses it:** The llama.cpp inference engine, used by the
  on-device AI-rewrite engine to run the Gemma model. It is linked through the
  `llama-cpp-2` / `llama-cpp-sys-2` bindings and statically linked into the
  release binary (CPU-only build, `sampler` feature).
- **License:** MIT
- **Copyright:** Copyright (c) 2023-2026 The ggml authors
- **Source:** https://github.com/ggml-org/llama.cpp

The MIT text reproduced here is taken from the upstream ggml-org/llama.cpp
repository; the published `llama-cpp-sys-2` crate vendors the sources without a
top-level `LICENSE` file. The `llama-cpp-2` / `llama-cpp-sys-2` Rust bindings are
themselves licensed MIT OR Apache-2.0.

### ONNX Runtime

- **What it is / how Tokezly uses it:** Microsoft's ONNX Runtime, used as an ASR
  inference backend (the DirectML execution provider on Windows) and to run the
  Silero voice-activity-detection model. ONNX Runtime is statically linked into
  the application binary; the Rust `ort` wrapper crate is MIT OR Apache-2.0.
- **License:** MIT
- **Copyright:** Copyright (c) Microsoft Corporation
- **Source:** https://github.com/microsoft/onnxruntime

ONNX Runtime itself incorporates further third-party code (for example abseil and
protobuf) under its own `ThirdPartyNotices.txt`, which applies to those
components.

### Microsoft DirectML

- **What it is / how Tokezly uses it:** `DirectML.dll`, the DirectX Machine
  Learning runtime that provides ONNX Runtime's DirectML execution provider
  (hardware-accelerated ASR inference on Windows). Unlike ONNX Runtime, DirectML
  ships as a **separate loose redistributable DLL** placed next to the
  application executable and packaged into the Windows installer.
- **License:** Proprietary — Microsoft Software License Terms for Microsoft
  DirectX Machine Learning (DirectML). This is **not** an open-source license.
- **Copyright:** Copyright (c) Microsoft Corporation
- **Source:** Distributed via the `Microsoft.AI.DirectML` NuGet package —
  https://www.nuget.org/packages/Microsoft.AI.DirectML

The Microsoft DirectML license terms permit redistribution of `DirectML.dll`
subject to those terms; the license text that accompanies the
`Microsoft.AI.DirectML` package applies to the copy bundled in the installer.

### SQLite

- **What it is / how Tokezly uses it:** The SQLite amalgamation, used to store
  dictation history. It is vendored by `libsqlite3-sys` (through the `rusqlite`
  `bundled` feature) and statically linked into the release binary.
- **License:** Public domain (SPDX: blessing)
- **Copyright:** Dedicated to the public domain by the authors (D. Richard Hipp et al.)
- **Source:** https://www.sqlite.org/copyright.html

SQLite is in the public domain and requires no attribution. The `rusqlite` /
`libsqlite3-sys` crates that wrap it are MIT-licensed and are covered by the Rust
dependency section below.

### transcribe-rs

- **What it is / how Tokezly uses it:** The speech-to-text abstraction crate that
  selects and drives the ASR engine (whisper.cpp and ONNX-based backends; the
  DirectML provider on Windows). It pulls in whisper.cpp and ONNX Runtime, which
  carry the heavier notices above.
- **License:** MIT
- **Copyright:** Copyright (c) CJ Pais
- **Source:** https://github.com/cjpais/transcribe-rs

---

## Bundled resources (shipped in the installer)

### Silero VAD model

- **What it is / how Tokezly uses it:** The Silero voice-activity-detection ONNX
  model (`silero_vad_v4.onnx`), used to detect speech boundaries during capture.
  Shipped as a resource file at `src-tauri/resources/models/silero_vad_v4.onnx`.
- **License:** MIT
- **Copyright:** Copyright (c) 2020-present Silero Team
- **Source:** https://github.com/snakers4/silero-vad

### GigaAM vocabulary

- **What it is / how Tokezly uses it:** The Cyrillic token vocabulary
  (`gigaam_vocab.txt`) for the GigaAM Russian ASR model. Shipped as a resource
  file at `src-tauri/resources/models/gigaam_vocab.txt`. It is a derivative of the
  GigaAM project.
- **License:** MIT
- **Copyright:** Copyright (c) 2024 GigaChat Team
- **Source:** https://github.com/salute-developers/GigaAM

### Notification sounds

- **What it is / how Tokezly uses it:** Four short audio feedback files
  (`marimba_start.wav`, `marimba_stop.wav`, `pop_start.wav`, `pop_stop.wav`) that
  play on recording start/stop. Inherited from Handy and shipped in the installer
  under `src-tauri/resources/`.
- **License:** MIT
- **Copyright:** Copyright (c) 2025 CJ Pais
- **Source:** https://github.com/cjpais/Handy

These sounds are covered by Handy's MIT license as part of the inherited assets.

### Fonts

Two fonts are compiled into the frontend bundle. Both are licensed under the SIL
Open Font License, Version 1.1 (SPDX: OFL-1.1), which requires that the full
license text be distributed with the font. The complete OFL texts are included in
this repository under `licenses/`.

#### Space Grotesk

- **What it is / how Tokezly uses it:** UI typeface, embedded as a webfont in the
  frontend bundle.
- **License:** OFL-1.1
- **Copyright:** Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)
- **Full license text:** `licenses/SpaceGrotesk-OFL.txt`
- **Source:** https://github.com/floriankarsten/space-grotesk

#### JetBrains Mono

- **What it is / how Tokezly uses it:** Monospace typeface, embedded as a webfont
  in the frontend bundle.
- **License:** OFL-1.1
- **Copyright:** Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
- **Full license text:** `licenses/JetBrainsMono-OFL.txt`
- **Source:** https://github.com/JetBrains/JetBrainsMono

---

## Application framework

### Tauri

- **What it is / how Tokezly uses it:** The Tauri application framework (core,
  build tooling, and the runtime / WebView / utility crates), which provides the
  windowing, IPC, and packaging layer. The `tauri-runtime`, `tauri-runtime-wry`,
  and `tauri-utils` crates are patched from a Tauri fork but remain under the
  upstream license.
- **License:** MIT OR Apache-2.0
- **Copyright:** Copyright (c) 2019-2024 Tauri Programme within The Commons Conservancy
- **Source:** https://github.com/tauri-apps/tauri

### Tauri plugins

- **What it is / how Tokezly uses it:** The official Tauri plugins used by the app,
  including `opener`, `store`, `os`, `clipboard-manager`, `process`, `fs`,
  `dialog`, `log`, `autostart`, `global-shortcut`, `single-instance`, `updater`,
  and `sql`, with their matching JavaScript packages. (`macos-permissions` is a
  third-party plugin, also MIT, relevant only on the experimental macOS target.)
- **License:** MIT OR Apache-2.0
- **Copyright:** Copyright (c) 2019-2024 Tauri Programme within The Commons Conservancy
- **Source:** https://github.com/tauri-apps/plugins-workspace

---

## Other notable libraries linked into the build

### ferrous-opencc

- **What it is / how Tokezly uses it:** A pure-Rust implementation of OpenCC for
  Chinese text conversion, statically linked into the binary.
- **License:** Apache-2.0
- **Copyright:** The ferrous-opencc authors (apoint123)
- **Source:** https://github.com/apoint123/ferrous-opencc

The Apache-2.0 license and any accompanying `NOTICE` file are retained with the
distribution.

### handy-keys

- **What it is / how Tokezly uses it:** A keyboard / global-shortcut helper crate
  used by the shortcut backend.
- **License:** MIT
- **Copyright:** The handy-keys authors
- **Source:** https://crates.io/crates/handy-keys

### rdev (rustdesk-org fork)

- **What it is / how Tokezly uses it:** Global input and event simulation, pinned
  to the rustdesk-org fork. Used by the shortcut backend and paste injection.
- **License:** MIT
- **Copyright:** Copyright (c) 2019 Nicolas Patry and contributors
- **Source:** https://github.com/rustdesk-org/rdev

### natural

- **What it is / how Tokezly uses it:** An NLP utility crate (phonetics / string
  distance), linked into the binary.
- **License:** MIT
- **Copyright:** The natural crate authors
- **Source:** https://crates.io/crates/natural

### lucide-react

- **What it is / how Tokezly uses it:** The Lucide icon set, with SVGs compiled
  into the frontend bundle. Lucide is derived from Feather.
- **License:** ISC
- **Copyright:** Copyright (c) Lucide Contributors; portions Copyright (c) 2013-2022 Cole Bemis (Feather)
- **Source:** https://github.com/lucide-icons/lucide

---

## Rust and JavaScript dependency long tail

Beyond the components called out above, Tokezly links against a large number of
additional Rust crates and bundles a set of JavaScript packages into the frontend.
These are overwhelmingly permissive.

- **Rust crates** are dominated by **MIT OR Apache-2.0**, with some **MIT-only**
  (for example `rusqlite` and `enigo`), **Apache-2.0** (`hound`), and BSD variants
  in the long tail. Representative crates include `tokio`, `futures-util`,
  `serde` / `serde_json`, `reqwest`, `cpal`, `rodio`, `rubato`, `hound`,
  `rustfft`, `enigo`, `regex`, `chrono`, `anyhow`, `once_cell`, `log`,
  `env_filter`, `tar`, `flate2`, `sha2`, `encoding_rs`, `strsim`, `clap`,
  `specta` / `tauri-specta`, `windows`, `winreg`, `rusqlite`,
  `rusqlite_migration`, `signal-hook`, and `vad-rs`.
- **JavaScript packages** compiled into the production bundle are almost entirely
  **MIT**, including `react` and `react-dom` (Meta), `scheduler`, `i18next` and
  `react-i18next`, `zustand`, `immer`, `react-select`, `sonner`, `tailwindcss`,
  `zod`, `@tauri-apps/api`, `@floating-ui/dom`, and supporting libraries.
  Build-only development tooling (such as TypeScript, Vite, ESLint, Prettier, and
  type definitions) is not distributed and is not listed here.

Each of these requires only that its copyright and permission notice be retained.
The authoritative, exhaustive list of every package and its verbatim license is
generated from `Cargo.lock` and the JavaScript dependency tree at release time;
those generated notices supersede the paraphrased copyright lines above where the
two differ.

---

## AI rewrite and ASR models (downloaded at runtime)

The following models are **not** included in the installer. Tokezly downloads them
on demand when the user selects them. They are listed here for transparency and to
carry the attributions their licenses require. The ASR models are fetched from the
Handy-operated model host (`blob.handy.computer`); the default on-device rewrite
model is fetched from Hugging Face.

### Speech-to-text models

| Model | License (SPDX) | Copyright / author | Source |
| --- | --- | --- | --- |
| Parakeet TDT 0.6B (v2 English, v3 multilingual) | CC-BY-4.0 | NVIDIA Corporation | https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 |
| Canary 180M Flash | CC-BY-4.0 | NVIDIA Corporation | https://huggingface.co/nvidia/canary-180m-flash |
| Moonshine (base, tiny/small/medium) | MIT | Copyright (c) 2024 Useful Sensors | https://github.com/usefulsensors/moonshine |
| Breeze ASR 25 | Apache-2.0 | MediaTek Research | https://huggingface.co/MediaTek-Research/Breeze-ASR-25 |
| GigaAM v3 | MIT | Copyright (c) 2024 GigaChat Team | https://github.com/salute-developers/GigaAM |
| SenseVoice | Apache-2.0 | Alibaba Group / FunASR | https://github.com/FunAudioLLM/SenseVoice |

The NVIDIA Parakeet and Canary models are licensed CC-BY-4.0 and require
attribution to NVIDIA wherever the models are used or redistributed.

### On-device AI-rewrite model

#### Gemma 2 2B Instruct (Q4_K_M GGUF)

- **What it is / how Tokezly uses it:** The default on-device AI-rewrite model.
  Downloaded at the user's request from Hugging Face
  (`bartowski/gemma-2-2b-it-GGUF`; base model `google/gemma-2-2b-it`). The GGUF
  quantization is by "bartowski".
- **License:** Google Gemma Terms of Use (not an open-source license)
- **Copyright:** Google LLC
- **Terms:** https://ai.google.dev/gemma/terms

Gemma is provided under and subject to the Gemma Terms of Use found at
https://ai.google.dev/gemma/terms, together with the Gemma Prohibited Use Policy.
Tokezly does not redistribute the Gemma weights; it triggers a user-initiated
download. Use of the model is subject to those terms.

### Model host

The runtime-downloaded speech-to-text models are served from
`blob.handy.computer`, infrastructure operated by the Handy project. It is not a
licensed component of Tokezly; the relevant licenses are those of the individual
models listed above.
