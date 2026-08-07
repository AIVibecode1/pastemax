# Plan 019: Bump Electron to a supported major version

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- package.json package-lock.json` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (Electron major upgrades can change webPreferences/behavior defaults; the verification steps exist to catch that)
- **Depends on**: none (must land before 020/021 — same lockfile/pipeline)
- **Category**: deps
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The app ships Electron 40.2.1, which hit end-of-life 2026-06-30 (verified 2026-08-07 via endoflife.date/electron: v40 EOL 30 Jun 2026; v41 EOL 25 Aug 2026). Electron's support policy covers only the latest three stable majors (verified via electronjs.org/docs/latest/tutorial/electron-timelines; current stable 43.x per electronjs.org, Aug 2026). `npm audit` flags electron 40.x with 30 advisories (severity high), including contextBridge context-isolation bypasses (GHSA-jfqg-hf23-qpw2, GHSA-h7rp-cf8h-j98x), renderer command-line switch injection (GHSA-9wfr-w7mm-pc7f), Windows registry key path injection (GHSA-mwmh-mq4g-g6gr), and HTTP response header injection (GHSA-4p4r-m79c-wq3v) — several aimed directly at the mechanisms this app depends on (`contextIsolation`, preload, the CSP header). Every release built from this tree ships known-unpatched Chromium/Node. The app uses stable APIs (`BrowserWindow`, `ipcMain`, `session`, `shell`, `dialog`, `webRequest`), so the bump is expected to be routine — but packaging must be re-verified.

## Current state

- `package.json:125` — `"electron": "^40.2.1"`; lockfile resolves 40.2.1.
- App code uses: `BrowserWindow` with `webPreferences` (contextIsolation: true, nodeIntegration: false, preload), `session.defaultSession.webRequest.onHeadersReceived` (CSP — plan 017), `shell.openExternal`, `dialog.showOpenDialog`, `ipcMain.handle/on`, `app.getPath`, `loadFile`/`loadURL`, `process.env.NODE_ENV` dev detection.
- Verification tooling: `npm run verify-build` (config checks), `scripts/test-local-build.js` (full local package + launch test; supports `win`/`mac`/`linux` args), `npm run package:<os>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Latest version | `npm view electron version` | prints current stable (expect 43.x) |
| Install | `npm install electron@<latest-stable>` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Verify config | `npm run verify-build` | exit 0 |
| Package test | `npm run test-build` (or `test-build:win` on Windows) | packaged app builds + launches |
| Audit | `npm audit --omit=dev` | electron advisories gone from runtime view |

## Scope

**In scope**:
- `package.json` + `package-lock.json` (electron version only)

**Out of scope** (do NOT touch):
- electron-builder (plan 020), other dependencies (021/022)
- Any source code — if the bump REVEALS a needed code change (breaking behavior), STOP and report rather than patching code in this plan
- The `devTools` webPreferences object at main.js:537-540 (unusual but harmless; leave it)

## Git workflow

- Branch: `advisor/019-electron-bump`.
- Commit: `deps: bump electron to <version> (EOL 40 -> supported major)`.
- Do NOT push.

## Steps

### Step 1: Determine the target version

Run `npm view electron version` (expect 43.x — the current stable per electronjs.org as of 2026-08-07). Also run `npm view electron@42 version` to know the oldest supported line, in case 43.x has a known regression (Electron supports the latest three majors: 41, 42, 43 — so the minimum acceptable target is 42.x; prefer latest stable 43.x).

**Verify**: you can state the exact target version and that it is within the supported window.

### Step 2: Install and typecheck

`npm install electron@<target>` (this updates package.json + lockfile). Then `npm run typecheck` (the renderer doesn't import electron types, so this is mostly a sanity check) and `npm run lint`.

**Verify**: both exit 0.

### Step 3: Config + build verification

`npm run verify-build` → exit 0. Then `npm run build` → exit 0. Then run the local package test for your platform: `npm run test-build:win` on Windows / `test-build:mac` on macOS / `test-build:linux` on Linux (read `scripts/test-local-build.js` first to know what it asserts — it builds and launches the packaged app).

**Verify**: the packaged app builds and launches; the test script exits 0.

### Step 4: Runtime smoke test of the packaged app

Launch the packaged app and exercise the core flows (folder load, token counts, copy, model dropdown, update check). Note any console errors — especially anything mentioning `webPreferences`, `contextIsolation`, or `webRequest`.

**Verify**: core flows work; no new console errors.

### Step 5: Audit confirmation

`npm audit --omit=dev` — the electron 40.x advisories must no longer appear in the runtime view (some may persist via other chains — record what remains; plan 021 handles the tail).

**Verify**: no electron advisories in `npm audit --omit=dev` output.

## Test plan

- No unit tests; the build + package + smoke sequence is the gate (this is the repo's own verification convention — `scripts/test-local-build.js` exists precisely for this).
- `npm test` (002 suite) → all pass.

## Done criteria

All must hold:

- [ ] `package.json` electron is the target stable version; lockfile matches
- [ ] `npm run typecheck`, `npm run lint`, `npm run verify-build`, `npm run build` all exit 0
- [ ] `npm run test-build:<platform>` exits 0 (packaged app launches)
- [ ] Packaged-app smoke test: core flows work, no new console errors
- [ ] `npm audit --omit=dev` shows no electron advisories
- [ ] `git diff` touches only `package.json` + `package-lock.json`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The packaged app fails to launch or a core flow breaks, and the cause is an Electron behavior change — STOP and report the exact symptom; do not patch source code to work around it in this plan (a follow-up plan will handle the migration).
- `npm view electron` returns a version inconsistent with the supported-window claim (e.g. 44.x already out and 43 EOL'd) — re-derive the target from the support policy and proceed; only STOP if no supported major installs cleanly.
- `test-local-build.js` fails for an unrelated pre-existing reason (read its output first) — report and continue only if the failure predates this change (verify by checking whether it fails on the baseline too).

## Maintenance notes

- Plan 020 (electron-builder) and 021 (audit tail) must run after this — same lockfile, same rebuild pipeline.
- The `devTools: { isDevToolsExtension: false, htmlFullscreen: false }` webPreferences object at main.js:537-540 is non-standard (devTools expects a boolean) — it predates this plan and is harmless; flag it to the maintainer as cleanup material.
- Electron's release cadence is 8 weeks; schedule a similar bump check every ~6 months (the `npm outdated` output flags it).
- After the bump, re-run `npm audit` before the next tag — the advisory set changes with the Electron major.
