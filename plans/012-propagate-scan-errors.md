# Plan 012: Propagate top-level scan failures instead of reporting "Found 0 files"

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/file-processor.js electron/main.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

When the ROOT folder cannot be read (deleted while the app runs, permission denied, EMFILE, network share dropped), `readFilesRecursively` swallows the error and returns `{ results: [] }`; `main.js` then sends `status: 'complete'` with "Found 0 files". The user sees a successful empty project — no error, no hint why. The queue cleanup is also skipped on that path (`PQueue` left with pending state). Per-directory errors inside a scan SHOULD stay tolerated (a single unreadable subdirectory should not fail the scan) — only the top-level failure must surface.

## Current state

- `electron/file-processor.js:549-563` (end of `readFilesRecursively`):
  ```js
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      console.log(`Skipping inaccessible directory: ${dir}`);
      return { results: [], progress };
    }
  }

  // Cleanup queue if it was initialized in this call
  if (shouldCleanupQueue) {
    await queueToUse.onIdle();
    queueToUse.clear();
  }

  return { results, progress };
  ```
  Note: for NON-EPERM/EACCES errors the catch falls through to cleanup and returns `{ results, progress }` — the error is fully swallowed. For EPERM/EACCES it returns early, SKIPPING cleanup.
- `electron/main.js:393-396`:
  ```js
  event.sender.send('file-processing-status', {
    status: 'complete',
    message: `Found ${files.length} files`,
  });
  ```
- `electron/main.js:447-460` — the outer catch in the IPC handler already sends `status: 'error'` with `Error: ${err.message}` — so propagating an exception from `readFilesRecursively` produces a real error status with zero new plumbing.
- `readFilesRecursively(dir, rootDir, ...)` is called recursively (via `processDirectory`, file-processor.js:250) — the top-level call is the one where `dir === rootDir` (main.js:369-380 passes `payload.folderPath` as both).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/file-processor.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `electron/file-processor.js` — the catch block in `readFilesRecursively`
- `electron/main.js` — only if the error status message needs the root path context (optional; the generic handler suffices)

**Out of scope** (do NOT touch):
- Per-directory error tolerance inside recursion (keep it)
- The `fileProcessingErrors` summary (line 544-548, currently console-only — leave)
- Renderer error display

## Git workflow

- Branch: `advisor/012-propagate-scan-errors`.
- Commit: `fix: surface top-level scan failures instead of empty success`.
- Do NOT push.

## Steps

### Step 1: Rethrow top-level failures, tolerate nested ones

In the catch block, distinguish the top-level call from recursion:

```js
} catch (err) {
  console.error(`Error reading directory ${dir}:`, err);
  const isTopLevel = dir === rootDir;
  if (isTopLevel) {
    // A failure to read the root is a user-facing failure, not a partial scan.
    throw err;
  }
  // Nested directory: tolerate, skip it, keep scanning.
  console.log(`Skipping inaccessible directory: ${dir}`);
  return { results: [], progress };
}
```

Notes:
- The EPERM/EACCES special-casing becomes unnecessary — nested EPERM/EACCES still returns `{ results: [], progress }`, and top-level errors of any code throw.
- Verify `dir === rootDir` is reliable: both come through `safePathJoin`/`normalizePath` on the way in (main.js:369-380 passes `payload.folderPath` twice; `processDirectory` passes `fullPath` as both `dir` and... check the recursive call at file-processor.js:250-259 — it passes `fullPath` as `dir` and the original `rootDir` unchanged). If normalization makes the top-level comparison unsafe in some path shape, compare with `normalizePath(dir) === normalizePath(rootDir)` instead — pick the form that matches how the existing code compares paths in this file (it uses `safeRelativePath` elsewhere; here equality is fine since both args flow through the same construction).

**Verify**: `node --check electron/file-processor.js` → exit 0.

### Step 2: Move queue cleanup into a `finally` block

Restructure the tail of `readFilesRecursively` so the `shouldCleanupQueue` cleanup runs even when the catch rethrows:

```js
} catch (err) {
  ... // Step 1 logic
} finally {
  if (shouldCleanupQueue) {
    await queueToUse.onIdle();
    queueToUse.clear();
  }
}
```

(Remove the cleanup block from its current position after the catch.) Keep the `return { results, progress }` after the try/catch/finally.

**Verify**: `node --check electron/file-processor.js` → exit 0.

### Step 3: Verify the error path end-to-end

Trace: top-level throw → `main.js:447-460` catch → `stopFileProcessing()` + `isLoadingDirectory = false` + `file-processing-status` with `status: 'error'` and the message. Confirm `main.js` does not re-enter the busy state (it sets `isLoadingDirectory = false` in the catch — line 450).

Manual test (if feasible): point the app at a folder, delete/rename it mid-scan (or use a permissions-dropped folder on a second account), refresh → the UI must show an error status, not "Found 0 files". If you cannot reproduce, verify by code trace and say so.

**Verify**: manual result or code-trace note in the completion report.

## Test plan

- If the 002 suite exists: a unit test for the catch logic is awkward (it needs a real fs failure inside recursion) — skip unless you can inject a failing `fs.promises.readdir` via `vi.mock`; if you attempt it and it proves brittle, note it and move on.
- `npm test` must still pass (no behavior change on the success path).

## Done criteria

All must hold:

- [ ] `node --check electron/file-processor.js` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] The catch block rethrows when `dir === rootDir`; cleanup is in `finally`
- [ ] Manual test or code-trace note recorded
- [ ] `git diff` touches only `electron/file-processor.js` (and `electron/main.js` only if the message needed context)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `dir === rootDir` cannot be made reliable (normalization discrepancies found) — STOP and report rather than guessing.
- The renderer has no handling for `status: 'error'` (check `handleProcessingStatusIPC` in App.tsx around line 380-450) — if the error status is ignored by the UI, the fix needs a renderer follow-up; report it (do not rewrite the renderer in this plan).

## Maintenance notes

- Plan 005 touches the cancellation path in the same file's callers — the rethrow only fires when cancellation is NOT active; if a cancelled scan somehow throws, the `isLoadingDirectory` guard in main.js:382 already returns early.
- If a future plan adds a "retry scan" button, the error status is the trigger point.
- `fileProcessingErrors` (line 544) is the natural place to also surface nested-failure counts to the UI later — noted, not in scope.
