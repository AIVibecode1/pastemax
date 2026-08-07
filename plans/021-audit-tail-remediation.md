# Plan 021: Remediate the remaining npm audit tail (without --force)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- package.json package-lock.json` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED (non-breaking fixes only; the explicit prohibition on `--force` is the guardrail)
- **Depends on**: 020 (its bump removes the app-builder-lib chain from this list)
- **Category**: deps
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

At audit time (2026-08-07) `npm audit` reported 30 vulnerabilities: 1 low, 1 moderate, 26 high, 2 critical. After plans 019 (Electron) and 020 (builder) land, the remaining set is dev/build-time only — none reach the shipped runtime (verified by lockfile chain tracing in the audit): `@xmldom/xmldom` 0.8.11 (high, 5 advisories incl. GHSA-wh4c-j3r5-mjhp) via `plist` → macOS packaging; `@babel/core` (low, GHSA-4x5r-pxfx-6jf8, "users that only compile trusted code are not impacted") via `@vitejs/plugin-react`; `shell-quote` (critical, GHSA-w7jw-789q-3m8p) via `concurrently` (dev:all script); `tar` (critical, 9 advisories) via electron-builder/asar tooling; `ajv` ReDoS (moderate) via eslint chains; plus `minimatch`/`brace-expansion`/`picomatch` ReDoS, `vite`/`postcss`/`rollup`, `js-yaml`, `tmp`, `flatted`, `form-data`, `ip-address` — all in dev/build toolchains. They still matter: developer machines run `dev:all` (shell-quote exposure) and the release pipeline extracts tarballs (tar). This plan clears what is safely clearable and documents the rest.

## Current state

- `package.json` devDependencies (lines 115-136): eslint ^8.57.1, concurrently ^9.1.2, vite ^6.3.4, electron-builder ^26.7.0 (now bumped by 020), @vitejs/plugin-react ^4.4.1, typescript ^5.8.3, etc.
- `npm audit fix --force` would force a breaking `@typescript-eslint` major — explicitly NOT wanted (the eslint 8 → 9 migration is a separate decision).
- `gpt-3-encoder`/`lodash` residual items are handled by plan 022.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Baseline | `npm audit` | current list captured |
| Safe fix | `npm audit fix` | applies non-breaking upgrades |
| Targeted | `npm install -D vite@^6.4.3` etc. | per-step |
| Verify | `npm run build && npm run lint && npm test` | all pass |

## Scope

**In scope**:
- `package.json` + `package-lock.json` (devDependencies only)

**Out of scope** (do NOT touch):
- `npm audit fix --force` — FORBIDDEN in this plan
- Runtime dependencies (022 handles the dead/runtime set)
- Electron (019) and electron-builder (020) — already bumped

## Git workflow

- Branch: `advisor/021-audit-tail`.
- Commits: one per logical bump with the advisory reference (`deps: bump vite (GHSA-...)`).
- Do NOT push.

## Steps

### Step 1: Capture the baseline

`npm audit` → save the full list. Identify which advisories remain after 019/020 (electron, app-builder-lib chains should be gone; xmldom, babel, shell-quote, tar, ajv, vite, postcss, rollup, minimatch, etc. remain).

**Verify**: baseline list recorded in the completion report.

### Step 2: Apply the safe subset

Run `npm audit fix` (NO `--force`). Inspect what it changed (`git diff package.json`). Accept upgrades that keep majors (e.g. `ignore` 7.0.3→7.0.6, `semver`, `p-queue`, `vite` within 6.x, `@vitejs/plugin-react` within 4.x, `postcss`, `rollup` if within its major). Reject/undo anything that crosses a major for the core toolchain (eslint 8→9, vite 6→7, typescript 5→6, @typescript-eslint major) — revert those with `npm install -D <pkg>@<previous-major-range>` and record them as intentional.

**Verify**: `npm run build`, `npm run lint`, `npm test` all pass after the changes.

### Step 3: Targeted bumps for what `npm audit fix` cannot reach

For each remaining fixable item, bump the direct devDependency (not the transitive): e.g. `npm install -D vite@^6.4.3` (the audit's advisory is fixed in the 6.4.x line — verify the exact fixed version with `npm view vite versions` + the advisory page before choosing), `npm install -D concurrently@^9.x-latest` (if it pulls a fixed shell-quote; if the fix requires concurrently's own new release and none exists, record shell-quote as no-fix-available). For `@xmldom/xmldom`: it is transitive via `plist` (electron-builder's macOS packaging); if a `plist`/builder update pulls xmldom 0.8.12+, it resolves; otherwise record as no-fix-available with the chain noted.

**Verify**: `npm audit` after each bump shows the item cleared or recorded as no-fix.

### Step 4: Document the residual

Final `npm audit` → the residual set must be ONLY:
- items with no patched version (lodash 4.17.21 — final release; removed entirely by plan 022)
- items where the fix requires a breaking major (eslint/@typescript-eslint — deliberately deferred)
- xmldom if no builder release resolves it (record the chain)

Write the residual list + reasoning into `plans/README.md` (under the plan's status row or the rejected-findings section) so future audits know these are triaged.

**Verify**: residual list documented; `npm audit` count materially reduced from baseline.

## Test plan

- Verification is the build/lint/test triad after each bump.
- `npm test` (002 suite) → all pass.

## Done criteria

All must hold:

- [ ] `npm audit` count reduced; every remaining advisory has a recorded reason (no-fix / breaking-major-deferred / handled-by-022)
- [ ] `npm run build`, `npm run lint`, `npm test` all exit 0
- [ ] No `--force` was used (state it in the report)
- [ ] `git diff` touches only `package.json` + `package-lock.json`
- [ ] Residual list recorded in `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm audit fix` attempts a breaking major on a core toolchain — it shouldn't without `--force`, but if the diff shows one, revert that package immediately and record it.
- A targeted bump breaks `npm run build` or `npm run lint` — revert that single bump and record it as deferred; do not loosen lint rules to accommodate it.
- `npm test` fails after a bump (002 suite) — revert the bump; the suite is the safety net.

## Maintenance notes

- The eslint 8 → 9 migration is a real future task (needed to clear the eslint-chain advisories); schedule it deliberately with `npm test` as the guard — not via `audit fix --force`.
- `concurrently`/`shell-quote` exposure is dev-only (`dev:all`); the mitigation is the bump or running dev servers via `npm run dev` + `npm run dev:electron` in separate terminals (documented in README already).
- Re-run `npm audit` before every release tag; keep the residual list in `plans/README.md` current.
