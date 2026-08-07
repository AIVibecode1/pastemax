# Plan 027: Throttle per-directory status IPC messages during scans

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/file-processor.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (reuses the existing, proven throttle pattern in the same file)
- **Depends on**: none
- **Category**: perf
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

During a scan, `processDirectory` sends a `file-processing-status` IPC message for EVERY directory visited (file-processor.js:246-249) with no throttle. A repo with tens of thousands of directories fires tens of thousands of IPC messages in a burst — each one wakes the renderer and triggers React state updates. Meanwhile the file-progress path in the same file is throttled to 200ms (file-processor.js:522-531). The directory path should use the same throttle: the user needs to see progress, not a message storm.

## Current state

- `electron/file-processor.js:244-249` (in `processDirectory`):
  ```js
  if (!isPathIgnoredByActiveFilter(fullPath, rootDir, filterToUse)) {
    progress.directories++;
    window.webContents.send('file-processing-status', {
      status: 'processing',
      message: `Scanning directories (${progress.directories} processed)... (Press ESC to cancel)`,
    });
    return readFilesRecursively(...);
  }
  ```
- `electron/file-processor.js:522-531` — the file-progress throttle (read it and mirror it exactly):
  ```js
  // (approximately) inside the queue-task completion path:
  const now = Date.now();
  if (now - lastStatusUpdateTime >= STATUS_UPDATE_INTERVAL) {
    lastStatusUpdateTime = now;
    ... send ...
  }
  ```
  Find the actual variable names (`lastStatusUpdateTime`, `STATUS_UPDATE_INTERVAL` — likely module-level constants) and reuse them.
- Note: `processDirectory` is a synchronous recursion step (no await between dirs), so the throttle must be checked-and-updated inline — same as the file path.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/file-processor.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `electron/file-processor.js` — the directory-status send site only

**Out of scope** (do NOT touch):
- The file-progress throttle (it is the model, not a target)
- The cancellation path (`cancelDirectoryLoading` sends its own final status — keep it unthrottled)
- The `status: 'complete'` / `'error'` terminal messages (never throttle terminal states)

## Git workflow

- Branch: `advisor/027-throttle-directory-ipc`.
- Commit: `perf: throttle per-directory status IPC during scans`.
- Do NOT push.

## Steps

### Step 1: Read the existing throttle and mirror it

Read file-processor.js:515-540 to get the exact throttle variables (`lastStatusUpdateTime`, `STATUS_UPDATE_INTERVAL`, and where they are declared — module scope or function scope). If they are function-local to the queue-task path, PROMOTE them to module scope (or add a sibling pair) so the directory path can share them — sharing the same 200ms budget between file and directory updates is fine and simpler (one message per 200ms overall).

### Step 2: Throttle the directory send

Replace the unconditional send at :246-249 with:

```js
if (!isPathIgnoredByActiveFilter(fullPath, rootDir, filterToUse)) {
  progress.directories++;
  const now = Date.now();
  if (now - lastStatusUpdateTime >= STATUS_UPDATE_INTERVAL) {
    lastStatusUpdateTime = now;
    window.webContents.send('file-processing-status', {
      status: 'processing',
      message: `Scanning directories (${progress.directories} processed)... (Press ESC to cancel)`,
    });
  }
  return readFilesRecursively(...);
}
```

Match the existing variable names exactly (adjust to what Step 1 found).

**Verify**: `node --check electron/file-processor.js` → exit 0.

### Step 3: Verify the terminal messages are unaffected

The final `status: 'complete'` (main.js:393-396) and `'error'` (main.js:457-459) sends are in main.js, not throttled — confirm nothing in file-processor.js's throttle scope touches them.

**Verify**: grep the send sites in file-processor.js — only the per-directory and per-file progress sends are throttled.

### Step 4: Manual check

Scan a large folder in dev; watch the main-process console / devtools: status messages arrive at most every 200ms (add a temporary counter log if useful; remove after). The "Scanning directories (N processed)" message still appears and updates.

**Verify**: no message burst; progress still visible; `npm test` → all pass.

## Test plan

- No unit tests (IPC timing); manual observation is the gate.
- `npm test` (002 suite) → all pass.

## Done criteria

All must hold:

- [ ] `node --check electron/file-processor.js` exits 0
- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] The directory send is behind the same throttle as the file send (same interval/budget)
- [ ] Terminal statuses unaffected
- [ ] `git diff` touches only `electron/file-processor.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The throttle variables are scoped in a way that promoting them to module scope would collide with another usage (read the file; if `lastStatusUpdateTime` is already module-level and shared, just use it — only STOP if there are TWO conflicting timestamps).
- Progress becomes unresponsive (no updates for long stretches on slow scans) — the 200ms interval should not cause this; if it does, STOP and report rather than raising the interval arbitrarily.

## Maintenance notes

- The renderer's processing-status handler (App.tsx, `handleProcessingStatusIPC`) treats every message as a state update — the throttle reduces that load; if a future plan batches further, this is the seam.
- Keep the terminal-status sends unthrottled — a user cancelling or an error must never be delayed by the progress throttle.
- Coordinate with 023 if both are in flight (same file, different regions — trivial conflict, but sequence them to be safe).
