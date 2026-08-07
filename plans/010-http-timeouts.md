# Plan 010: Add HTTP timeouts to update check and model fetch; stop caching update-check errors

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/update-checker.js electron/update-manager.js electron/main.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

Two failure modes leave the user stuck or silently without updates:

1. **No timeouts on outbound HTTP**: `electron/update-checker.js:35-89` uses `https.request` with no `setTimeout` — a stalled connection (captive portal, dead VPN, half-open socket) leaves the `check-for-updates` IPC promise pending forever and the renderer spinner hangs indefinitely. `electron/main.js:472-508` (`fetch-models`) uses `node-fetch` with no timeout either — same hang for the model list.
2. **Errors are cached for the whole session**: `electron/update-manager.js:52` stores even error results in `cachedUpdateResult`, so one transient GitHub failure (rate limit, blip) disables update checks until the app restarts. The module's own doc comment (lines 20-22) claims "up to the session limit" with a retry counter that does not exist.

## Current state

- `electron/update-checker.js:35-89` — `https.request(options, cb)`; no `req.setTimeout`; `req.on('error')` exists (line 84) but a stall produces no error event.
- `electron/main.js:472-508` — `const response = await fetch('https://openrouter.ai/api/v1/models')` (node-fetch v2); no AbortController/timeout.
- `electron/update-manager.js:31-55` — `getUpdateStatus`: returns cached result if present (line 33); on error builds `errorResult` and stores it (`cachedUpdateResult = { ...errorResult }`, line 52).
- Renderer behavior on timeout: `App.tsx:1246-1252` awaits `check-for-updates` with no timeout of its own.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/update-checker.js` etc. | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `electron/update-checker.js` — request timeout (10s), destroy the socket on timeout, reject with a clear error
- `electron/main.js` — AbortController timeout (10s) around the models fetch; remove the node-fetch `require` only if it becomes unused (it will — see plan 022 which drops the dependency; you may leave the require if the swap is not clean)
- `electron/update-manager.js` — cache only successful results; error results returned but NOT stored; remove/fix the stale doc comment

**Out of scope** (do NOT touch):
- Renderer-side spinners/timeouts (App.tsx)
- The GitHub API URL, headers, or rate-limit logging
- Plan 011's error-detail stripping (that plan removes `error.stack` from these payloads — do not duplicate it here)

## Git workflow

- Branch: `advisor/010-http-timeouts`.
- Commits: `fix: timeout update-check and model-fetch requests`, then `fix: do not cache update-check errors`.
- Do NOT push.

## Steps

### Step 1: Timeout in `update-checker.js`

Inside the promise executor, after creating `req`:

```js
req.setTimeout(10000, () => {
  req.destroy(new Error('Update check timed out after 10 seconds'));
});
```

`req.on('error', ...)` (existing, line 84) will then reject with that error. Keep the existing `debugLogs` behavior.

**Verify**: `node --check electron/update-checker.js` → exit 0.

### Step 2: Timeout in the models fetch (`main.js`)

Replace the `node-fetch` call with a timeout using an AbortController (Node 18+/Electron 40 has global `AbortController`; node-fetch v2 supports the `signal` option):

```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);
try {
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
  // ...existing handling...
} finally {
  clearTimeout(timeoutId);
}
```

Match the existing error handling: the outer try/catch (main.js:505-508) already returns `null` on error — an aborted fetch throws `AbortError`, caught there. If the `require('node-fetch')` at main.js:474 becomes unused, remove it (grep for other uses first).

**Verify**: `node --check electron/main.js` → exit 0; `npm run typecheck` → exit 0 (renderer untouched, still run).

### Step 3: Stop caching errors in `update-manager.js`

Change `getUpdateStatus` so only a successful check populates `cachedUpdateResult`:

```js
try {
  const result = await actualCheckForUpdates();
  if (result.error) {
    return { ...result, isLoading: false }; // not cached — a later check can retry
  }
  cachedUpdateResult = { ...result };
  return { ...result, isLoading: false };
} catch (error) {
  // build errorResult as today, but do NOT assign cachedUpdateResult
  ...
}
```

Update the module doc comment (lines 1-8, 19-30): remove the claims about a session limit/counter that does not exist; state that successful results are cached for the session and errors are not.

**Verify**: `node --check electron/update-manager.js` → exit 0; `grep -n "cachedUpdateResult" electron/update-manager.js` shows the assignment only in the success path.

### Step 4: Tests (if 002 suite exists)

Add to a new `electron/__tests__/update-manager.test.ts` (or extend existing): with a stubbed `update-checker` (vi.mock or dependency injection — note `update-manager.js` requires `./update-checker` at module load; use `vi.mock`), assert:
- success result is cached (second call does not re-invoke the checker)
- error result is NOT cached (second call invokes the checker again)
- `resetUpdateSessionState` clears the cache

If mocking CommonJS proves brittle in this environment, mark the tests as skipped with a note — do not fight the tooling for more than a reasonable attempt.

**Verify**: `npm test` → all pass (or the skip note is recorded).

## Test plan

- Step 4 tests for the caching semantics; the timeout behavior is verified by code review + manual test (below) since it needs real network.
- Manual: disconnect network, launch app, click update check → modal shows an error within ~10-11s instead of hanging forever.

## Done criteria

All must hold:

- [ ] `node --check` passes on all three changed files
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0 (with Step 4 tests or a recorded skip note)
- [ ] `grep -n "setTimeout" electron/update-checker.js electron/main.js` shows the new timeouts
- [ ] `cachedUpdateResult` assignment exists only on the success path
- [ ] `git diff` touches only the three in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- node-fetch v2 in this project turns out not to support `signal` (it does, but if the installed version errors, STOP and report rather than adding a dependency).
- `getUpdateStatus` callers depend on errors being cached (grep `getUpdateStatus` in main.js — the launch path and the IPC handler both just want a status; if you find a retry-suppression dependency, STOP).

## Maintenance notes

- Plan 022 removes node-fetch entirely (Electron 40 has built-in fetch) — after that, the `require('node-fetch')` removal here is already done; coordinate if both are in flight.
- Plan 011 strips `error.stack`/raw bodies from these same payloads — the timeout error messages added here should be short and stable (they will reach the renderer).
- The 10s timeout is a judgement call; if users on slow networks report false timeouts, raise it in one place (`update-checker.js` and `main.js` have separate constants — consider a shared constant if a third site appears).
