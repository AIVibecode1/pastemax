# Plan 005: Cancel the directory scan when the window closes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/main.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

Closing the window mid-scan leaves the app stuck in "busy" state. The `closed` handler only shuts down the watcher; it never cancels the in-flight directory scan, so `isLoadingDirectory` stays `true` and the recursive scan keeps burning CPU/disk on a closed window until the 5-minute timeout fires (`MAX_DIRECTORY_LOAD_TIME`). On macOS the app stays alive after the window closes, so the next folder load is rejected with "Already processing another directory. Please wait." — the user is locked out for up to 5 minutes.

## Current state

- `electron/main.js:568-571`:
  ```js
  mainWindow.on('closed', async () => {
    await watcher.shutdownWatcher();
    mainWindow = null; // Now allowed since mainWindow is let
  });
  ```
- `electron/main.js:82-114` — `cancelDirectoryLoading(window, reason)` exists and already: shuts down the watcher, calls `stopFileProcessing()` (which flips the module-local `isLoadingDirectory` flag in `electron/file-processor.js:39,592-597` that the scan loop checks at every step), clears the loading timeout, resets progress, and sends a status message only if the webContents is not destroyed (`main.js:101`). It is simply never called from the close path.
- `electron/main.js:319-329` — the busy-reject path in `request-file-list`.
- Also note: `app.on('before-quit')` (main.js:573-575) and `window-all-closed` (main.js:581-586) are `async` listeners — Electron does not await async event listeners, so their `await watcher.shutdownWatcher()` is fire-and-forget. Make them plain (non-async) wrappers.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax check | `node --check electron/main.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 (renderer unchanged) |
| Manual run | `npm start` (after `npm run build`) | app launches |

## Scope

**In scope**:
- `electron/main.js` — the `closed`, `before-quit`, and `window-all-closed` handlers

**Out of scope** (do NOT touch):
- `electron/file-processor.js` (cancellation machinery already works)
- `electron/watcher.js`
- The renderer

## Git workflow

- Branch: `advisor/005-cancel-scan-on-close`.
- Commit: `fix: cancel directory scan when window closes`.
- Do NOT push.

## Steps

### Step 1: Cancel the scan in the `closed` handler

Change `main.js:568-571` to:

```js
mainWindow.on('closed', async () => {
  await cancelDirectoryLoading(mainWindow);
  await watcher.shutdownWatcher();
  mainWindow = null;
});
```

`cancelDirectoryLoading` is already defined in this file (line 82) and its status send is guarded by `isDestroyed`, so calling it with the closing window is safe. Note it also calls `watcher.shutdownWatcher()` itself (line 83) — the explicit call after it is redundant but harmless; if you prefer, drop the second call and keep only `cancelDirectoryLoading` (it covers both). Pick one form and be consistent.

**Verify**: `node --check electron/main.js` → exit 0.

### Step 2: Make the quit handlers non-async

`app.on('before-quit')` (main.js:573-575) and `app.on('window-all-closed')` (main.js:581-586): remove the `async` keyword and the `await` — call `watcher.shutdownWatcher()` without awaiting (or fire it and call `app.quit()` immediately; the watcher shutdown is idempotent). Keep behavior: quit on non-darwin; stay alive on darwin.

**Verify**: `node --check electron/main.js` → exit 0; `grep -n "app.on('before-quit'" electron/main.js` shows the handler; no `async` remains on either listener.

### Step 3: Manual verification

Build and launch the app (`npm run build` then `npm start`), open a large folder (or a folder on a slow/network drive), immediately close the window, then reopen the app and load the same folder — it must load immediately (no "Already processing another directory").

**Verify**: the folder loads without the busy rejection; the main-process console shows `Cancelling directory loading process (Reason: user)`.

## Test plan

- No unit tests (Electron lifecycle); the manual scenario above is the verification.
- If plan 002's suite exists, run `npm test` anyway to confirm nothing regressed (it should not — no shared modules change).

## Done criteria

All must hold:

- [ ] `node --check electron/main.js` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `closed` handler calls `cancelDirectoryLoading`
- [ ] `before-quit`/`window-all-closed` handlers are not `async`
- [ ] Manual scenario: close mid-scan → next launch loads the folder immediately
- [ ] `git diff` touches only `electron/main.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `cancelDirectoryLoading`'s `await watcher.shutdownWatcher()` inside `closed` throws (it awaits the same shutdown the handler used to await — if the watcher module changed, STOP and report).
- The manual scenario cannot be reproduced (no large folder available) — report the code-level verification only and mark the manual check as not performed.

## Maintenance notes

- The duplicate no-op `closed` handler at `main.js:611-613` is deleted by plan 028; if you land first, leave it alone.
- If a future plan adds cancellation tokens to `readFilesRecursively`, this handler is the call site that benefits.
- `window-all-closed` racing `app.quit()` was the pre-existing concern; the non-async change removes the race.
