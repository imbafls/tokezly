# Releasing Tokezly

How a release is cut, how the in-app updater works, and the one-time setup
needed to ship signed auto-updates.

## TL;DR

- Releases are built by **`.github/workflows/release.yml`** — a manual
  (`workflow_dispatch`) job. It reads the version from `src-tauri/tauri.conf.json`,
  creates a **draft** GitHub Release, builds the bundles, attaches them, and waits
  for you to publish the draft.
- Today's releases are **unsigned**. The in-app updater is fully built but
  **dormant**: "Check for updates" defaults off and no `latest.json` is published,
  so a check would only 404.
- Turning auto-update on is a **one-time setup** (a signing keypair + two repo
  secrets + a one-line public-key swap). After that it's automatic on every
  release. See [Enabling signed auto-updates](#enabling-signed-auto-updates).

## Cutting a release

1. Bump the version in **all three** places and keep them in sync:
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`
   (then `cargo check` to refresh `Cargo.lock`).
2. Merge the bump to `main`.
3. Go to **Actions → Release → Run workflow** (on `main`). It will:
   - create/refresh a **draft** release tagged `v<version>`,
   - build **Linux `.deb`** (ubuntu-22.04) and **Windows `.exe` + `.msi`**
     (windows-latest) in parallel,
   - upload the bundles to the draft.
4. Check the draft's assets look right, edit the notes, then **publish** it.
   Publishing is what makes the release "latest" — which the updater endpoint
   resolves to.

The workflow only ever creates draft releases and never pushes to a branch, so
the protected `main` ruleset is untouched.

> macOS is intentionally out of scope until the build is brought up on a Mac.
> AppImage and RPM don't build on the hosted Linux runners (linuxdeploy fails —
> tauri-apps/tauri#15106), so Linux ships `.deb` only for now.

## How the in-app updater works

- Backed by `tauri-plugin-updater` (registered in `lib.rs`, permitted via
  `updater:default` in `capabilities/default.json`).
- The UI is `src/components/update-checker/UpdateChecker.tsx` (the footer
  "Check for updates" affordance) plus the toggle in **Advanced** settings
  (`UpdateChecksToggle.tsx`, setting key `update_checks_enabled`).
- The toggle **defaults off** (`default_update_checks_enabled()` in `settings.rs`)
  while the updater is dormant. Once signed releases are live you may want to flip
  the default on — that's a deliberate product call (it makes the app check
  GitHub on launch), so it's left off until you decide.
- The plugin checks this endpoint and compares the manifest's `version` to the
  running app (semver):

  ```
  https://github.com/imbafls/tokezly/releases/latest/download/latest.json
  ```

  `latest.json` is the standard Tauri updater manifest. It is generated and
  uploaded automatically by `tauri-action` **when the build is signed** — you do
  not hand-write it.

### Platform support

| Platform | Auto-update | Notes |
| --- | --- | --- |
| Windows | ✅ NSIS `.exe` | The updater downloads + runs the new installer silently. |
| Linux | ❌ manual | Tauri's updater can't install a `.deb`. The "portable / manual update" path sends users to the releases page. |
| macOS | — | Not built yet; needs its own updater target + notarization. |

## Enabling signed auto-updates

Everything except the signing key is already wired. The CI plumbing is in place
but **inert** until the key exists: `createUpdaterArtifacts` stays `false` in
`tauri.conf.json`, and the release workflow only turns it on (for the Windows
build) when the `TAURI_SIGNING_PRIVATE_KEY` secret is set. That means a release
dispatched before setup still succeeds — just unsigned, with no updater artifacts.

Do this once:

### 1. Generate the signing keypair

```bash
bun run tauri signer generate -- -w "$HOME/.tauri/tokezly.key"
```

You'll be prompted for a password (use one — it protects the key). The command
writes the **private** key to `~/.tauri/tokezly.key` and prints the **public**
key (a base64 string) to the terminal. Keep the private key and password somewhere
safe; if you lose them you can't sign updates that existing installs will trust,
and you'd have to ship a new public key.

### 2. Add two repository secrets

In **GitHub → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | the contents of `~/.tauri/tokezly.key` (the private key) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose in step 1 |

These never leave GitHub. They're the only thing that can sign updates your users
will trust — never commit them.

### 3. Put the public key in the config

Replace the `plugins.updater.pubkey` value in `src-tauri/tauri.conf.json` with the
**public** key printed in step 1. (The value currently there is an inherited
placeholder, not ours.) The public key is safe to commit — it's what installed
apps use to verify a downloaded update was signed by you.

### 4. Ship it

Bump to `0.2.0` and cut a release as above. With the secrets set, the Windows
build is signed and `tauri-action` attaches `latest.json`. Publish the draft, and
installs with "Check for updates" enabled will be offered the update.

### Verifying

Install an older build (e.g. `0.1.x`), enable **Check for updates** in Advanced
settings, and confirm it detects and installs the published `0.2.0`. A signed
manifest that fails to verify means the `pubkey` in the config doesn't match the
private key used to sign — regenerate or re-sync the pair.
