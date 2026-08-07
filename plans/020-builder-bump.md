# Plan 020: Bump electron-builder (fixes the AppImage code-execution advisory)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- package.json package-lock.json` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED (rebuild + re-test of the packaging pipeline)
- **Depends on**: 019 (same lockfile; run sequentially)
- **Category**: deps
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

`electron-builder` ^26.7.0 resolves `app-builder-lib 26.7.0`, which produces Linux AppImage artifacts with a known code-execution flaw: the AppImage `AppRun` sets an empty `LD_LIBRARY_PATH` component, adding the current working directory to the dynamic linker search path — a malicious shared library in the launch directory executes arbitrary code when the app starts from an attacker-writable location (downloads, shared dirs). GitHub advisory GHSA-7g7r-gx96-252g (CVE-2026-54672, verified 2026-08-07) states it is **fully resolved in app-builder-lib 26.15.0**. This is not build-time-only noise: every shipped Linux AppImage built with the current toolchain is vulnerable at runtime. The fix is a devDependency bump and a rebuild.

## Current state

- `package.json:126` — `"electron-builder": "^26.7.0"`; lockfile resolves `app-builder-lib 26.7.0` (verified in lockfile, line ~3613 per the audit).
- Linux target `AppImage` at `package.json:92-96` (also deb, rpm).
- `npm audit` output: `app-builder-lib <=26.14.0` flagged with the electron-updater advisory chain (GHSA-7g7r-gx96-252g); `builder-util-runtime`/`electron-publish` chains are build-time only (`electron-updater` is NOT a dependency of this app — verified by the audit, so the related redirect advisory GHSA-p2f4-r6v6-j797 is not runtime-reachable).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Latest | `npm view electron-builder version` | prints current (expect >= 26.15.0) |
| Install | `npm install -D electron-builder@<target>` | exit 0 |
| Verify | `npm run verify-build` | exit 0 |
| Package | `npm run test-build` (or platform variant) | packaged app builds |
| Audit | `npm audit` | app-builder-lib advisory gone |

## Scope

**In scope**:
- `package.json` + `package-lock.json` (electron-builder version only)

**Out of scope** (do NOT touch):
- electron (019), other deps (021/022)
- `package.json` `build` config (targets, asar, publish — unchanged)
- `scripts/notarize.js` (afterSign hook — untouched by the bump; if the bump changes the notarize API, STOP and report)

## Git workflow

- Branch: `advisor/020-builder-bump`.
- Commit: `deps: bump electron-builder (fixes AppImage GHSA-7g7r-gx96-252g)`.
- Do NOT push.

## Steps

### Step 1: Determine and install the target

`npm view electron-builder version` → expect 26.x latest (the audit's verification says the advisory is fixed in app-builder-lib 26.15.0, so any electron-builder release pulling app-builder-lib >= 26.15.0 works; prefer the latest stable). Install: `npm install -D electron-builder@<target>`.

**Verify**: `npm ls app-builder-lib` → version >= 26.15.0.

### Step 2: Verify config and build

`npm run verify-build` → exit 0. Then the local package test for your platform (`npm run test-build:win` / `:mac` / `:linux` — read `scripts/test-local-build.js` first). If the Linux AppImage build is only possible on Linux, note which platform you verified and flag AppImage verification as pending if you cannot run Linux packaging.

**Verify**: the package test exits 0 on your platform(s).

### Step 3: Audit confirmation

`npm audit` → the `app-builder-lib`/`electron-updater` advisory (GHSA-7g7r-gx96-252g) must no longer appear. Record any residual advisories (plan 021 handles the tail).

**Verify**: advisory gone from `npm audit` output.

## Test plan

- No unit tests; the packaging pipeline test is the gate.
- `npm test` (002 suite) → all pass.

## Done criteria

All must hold:

- [ ] `npm ls app-builder-lib` shows >= 26.15.0
- [ ] `npm run verify-build` exits 0
- [ ] Platform package test exits 0 (or Linux AppImage explicitly flagged as pending with the exact reason)
- [ ] `npm audit` no longer lists GHSA-7g7r-gx96-252g
- [ ] `git diff` touches only `package.json` + `package-lock.json`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The latest electron-builder pulls app-builder-lib < 26.15.0 (version skew) — STOP and pin the specific version that resolves >= 26.15.0.
- The bump changes `scripts/notarize.js` compatibility (electron-builder's afterSign contract) — STOP and report; notarization changes are out of scope.
- `npm run test-build` fails in a way traceable to the builder bump (read the output; config errors vs. toolchain errors) — STOP and report.

## Maintenance notes

- After this plan, CI's `actions/cache` keys for electron-builder cache (`.github/workflows/build.yml:35-43`) still work — the hash is over package-lock.json which changed, so the cache will rebuild; no workflow edit needed.
- The advisory class (LD_LIBRARY_PATH in AppImage AppRun) is fixed upstream; when the next builder major lands, re-run `npm audit` before tagging.
- Plan 021 (audit tail) depends on this bump having landed — the app-builder-lib chain must not be re-reported there.
