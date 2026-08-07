# Plan 011: Stop shipping error stacks and raw API response bodies to the renderer

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/main.js electron/update-checker.js electron/update-manager.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sequence after 010 if both in flight — same files)
- **Category**: security
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

Internal error details cross the IPC boundary into renderer-visible state: `error.stack` (file paths, module structure) and — worse — the FULL raw GitHub API response body (including release body text, which is attacker-influenced content from the repo's release notes) are embedded in `debugLogs` and returned to the renderer. The renderer stores this in React state (`App.tsx:1248-1251` spreads the whole result into `updateStatus`). This is a data-minimization gap: a future XSS or a debug UI could surface internal structure or unbounded payloads. The main process should keep the detail; the renderer gets status codes and stable messages.

## Current state

- `electron/main.js:127-133` (check-for-updates catch):
  ```js
  return {
    isUpdateAvailable: false,
    currentVersion: app.getVersion(),
    error: error.message || 'An IPC error occurred while processing the update check.',
    debugLogs: error.stack || null,
  };
  ```
- `electron/update-checker.js:65-68`:
  ```js
  debugLogs.push('GitHub API Raw Response: ' + rawData);
  ...
  debugLogs.push('GitHub API Parsed Response: ' + JSON.stringify(response));
  ```
  (rawData can be the entire release payload; `debugLogs` is returned at line 123.)
- `electron/update-manager.js:48-49`:
  ```js
  error: error.message || 'Unknown error during update check execution',
  debugLogs: error.stack || '',
  ```
- Renderer consumption: `src/App.tsx:1246-1252` spreads the result; `UpdateModal.tsx` displays error/status fields. Check `UpdateModal.tsx` for which fields it renders before removing any — do not break the UI.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/main.js` etc. | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `electron/update-checker.js` — remove the two raw-body `debugLogs.push` lines; keep status-code and rate-limit pushes
- `electron/update-manager.js` — drop `error.stack` from `debugLogs`; keep a generic message
- `electron/main.js:127-133` — drop `error.stack`; keep the generic message
- `src/components/UpdateModal.tsx` — ONLY if it renders `debugLogs`; check and adjust display to the sanitized fields

**Out of scope** (do NOT touch):
- Console logging in the main process (keep full detail there — replace `debugLogs` content with `console.error` detail where useful)
- `electron/main.js:457-459` (`Error: ${err.message}` in the scan status message — that is plan 012's territory; leave it)
- The `get-token-count` error payload (generic already)

## Git workflow

- Branch: `advisor/011-strip-error-details`.
- Commit: `security: stop shipping error stacks and raw API bodies to the renderer`.
- Do NOT push.

## Steps

### Step 1: Sanitize `update-checker.js` debugLogs

Delete lines 65-68 (the `Raw Response` and `Parsed Response` pushes). Keep the status-code and rate-limit pushes (lines 37-50). If the parsed response contains anything the UI legitimately needs, add a FIELD-SELECTIVE push (e.g. `debugLogs.push('Latest tag: ' + response.tag_name)`) instead of the full JSON.

**Verify**: `node --check electron/update-checker.js` → exit 0; `grep -n "Raw Response\|Parsed Response" electron/update-checker.js` → no matches.

### Step 2: Sanitize `update-manager.js`

Replace `debugLogs: error.stack || ''` with `debugLogs: ''` (or a stable short string like `'update-check-failed'`). Keep the `error` message but prefer the checker's own message over `error.message` if they duplicate — keep it simple: `error: error.message || 'Update check failed'` as today, minus the stack.

**Verify**: `node --check electron/update-manager.js` → exit 0; `grep -n "\.stack" electron/update-manager.js electron/main.js` → no matches in renderer-bound payloads (main-process `console.error(error)` calls are fine).

### Step 3: Sanitize `main.js` check-for-updates catch

Change `debugLogs: error.stack || null` to `debugLogs: null` and log the stack in the main process instead (`console.error('Main Process: IPC Error in check-for-updates:', error)` already exists at line 126 — keep it).

**Verify**: `node --check electron/main.js` → exit 0.

### Step 4: Check the UpdateModal

Read `src/components/UpdateModal.tsx` — if it renders `updateStatus.debugLogs` anywhere, remove that rendering (or show it only in a collapsed "details" section gated by an explicit dev flag). If it does not render debugLogs, no change.

**Verify**: `grep -n "debugLogs" src/` → no matches (after Step 4), or only the sanitized definition sites in electron/.

## Test plan

- Unit tests are not practical for these payload shapes; verification is grep + typecheck + a manual update-check in the app (error path: offline → modal shows a short message; success path: modal shows version info).
- Run `npm test` to confirm no regressions (the 002 suite does not cover these payloads, so nothing should change).

## Done criteria

All must hold:

- [ ] `node --check` passes on the changed electron files
- [ ] `npm run typecheck` exits 0
- [ ] `grep -rn "debugLogs" src/ electron/` shows only sanitized content sites (no `.stack`, no raw body pushes)
- [ ] `npm test` exits 0
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `UpdateModal.tsx` or another renderer component depends on `debugLogs` for a user-facing feature (e.g. showing why an update check failed) — then keep a short sanitized string in `debugLogs` rather than removing it; STOP only if removing it breaks the UI contract.
- The GitHub API's rate-limit headers are used by the renderer for messaging — they are not today; if you find otherwise, STOP.

## Maintenance notes

- The `debugLogs` field name is now a misnomer for a sanitized value; renaming it is optional follow-up (touches UpdateTypes.ts + UpdateModal + preload typings — out of scope here).
- Plan 010 adds timeout errors to these same paths — keep its messages short and stable so they survive the sanitization.
- Any future IPC payload that includes upstream API content should follow the same rule: select fields, never dump bodies.
