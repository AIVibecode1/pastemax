# Plan 018: Add a folder-consent boundary for renderer-chosen scan paths

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/main.js electron/utils.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (over-restriction can break the WSL/UNC flows and the launch-restore flow — the plan has explicit handling for both)
- **Depends on**: none (016 and 015 reduce exploitability; this plan is the last line)
- **Category**: security
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The `request-file-list` and `get-ignore-patterns` IPC handlers (main.js:313-469, :205-257) trust the renderer-supplied `folderPath` completely: it is used as the root for recursive `fs` reads and full file contents are returned to the renderer, with only `ensureAbsolutePath` (a plain `path.resolve`) applied. The only user-consent control in the app is the folder dialog in `open-folder` — which `request-file-list` bypasses entirely. If a script ever runs in the renderer (the exact scenario plans 015-017 shrink but cannot eliminate), it can silently read and exfiltrate any file the OS user can read — `.ssh`, browser profiles, tokens — with no dialog and no trace. The fix: the main process tracks the folder the user actually confirmed, and rejects scans of anything else.

## Current state

- `electron/main.js:151-200` — `open-folder` handler: shows the dialog, and on selection sends `folder-selected` to the renderer. This is the ONLY consent point.
- `electron/main.js:313-469` — `request-file-list`: uses `payload.folderPath` directly.
- `electron/main.js:205-257` — `get-ignore-patterns`: resolves + reads ignore files at `folderPath`.
- Renderer flow that must keep working: on launch, the renderer restores the last folder from localStorage and calls `request-file-list` WITHOUT going through the dialog (App.tsx — the restore path). Workspaces also store folder paths (App.tsx:1291-1514) and re-scan them on workspace switch — also without a dialog.
- WSL paths (`//wsl.localhost/...`, `//wsl$/...`) are intentional targets (README, CHANGELOG 1.0.10).

## Design (follow this unless a step's verification fails)

1. **Main-process record**: `let confirmedFolderRoot = null` (module-level in main.js). Set it ONLY in the `open-folder` dialog success path, to the normalized selected path.
2. **Persist across restarts**: store the confirmed root in a small JSON file under `app.getPath('userData')` (`confirmed-folder.json`), written on dialog confirm and read at startup. This preserves the launch-restore flow: a folder confirmed in a previous session is still "confirmed".
3. **Validation in `request-file-list` and `get-ignore-patterns`**: `folderPath` must be (a) an absolute path (`path.isAbsolute` after `ensureAbsolutePath`), (b) an existing directory (`fs.promises.stat`), and (c) equal to `confirmedFolderRoot` or a descendant of it (path comparison via the existing `safeRelativePath` — require the relative path to not start with `..` and not be absolute). If any check fails: send `file-processing-status` with `status: 'error'` and a message telling the user to re-select the folder ("Folder not confirmed. Please re-select it."), and do NOT scan.
4. **Workspace flow**: workspaces store folders previously confirmed via the dialog — since those paths are descendants-or-equal of a previously confirmed root... no: a workspace folder can be ANY folder (each was chosen via dialog at creation — the CHANGELOG says workspace creation prompts the folder picker). So on workspace switch, the renderer re-requests a folder that WAS dialog-confirmed at creation time but may differ from the LAST confirmed root. Handling: update `confirmedFolderRoot` whenever the renderer's `request-file-list` path passes validation against... hmm. Cleaner rule: **the confirm record is a SET of previously confirmed roots**, persisted in the JSON file (array). A path is allowed if it equals or is under ANY previously confirmed root. This covers workspaces and launch-restore, while a never-confirmed path (the attack) is rejected. Cap the set (e.g. last 20 entries) to bound growth.
5. **Fallback UX**: if validation rejects, the renderer shows the error status; the user re-picks the folder via the normal flow. No silent behavior change for legitimate users (their folders were all dialog-confirmed at some point).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/main.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Manual | full folder flows (Step 4) | all pass |

## Scope

**In scope**:
- `electron/main.js` — confirmed-root tracking (in-memory + persisted), validation in the two handlers
- `electron/confirmed-folders.js` (create) — small module: load/save/add/check the confirmed-root set (keeps main.js readable)

**Out of scope** (do NOT touch):
- The renderer (App.tsx) — it needs NO changes for the primary flow; if the error status needs a better message the renderer already renders `status.error` (verify in Step 4; if the error message is not displayed, note it as a follow-up, do not rewrite the renderer here)
- The `open-folder` dialog logic itself (only add the record write)
- Plan 016/017 territory

## Git workflow

- Branch: `advisor/018-folder-consent`.
- Commits: `security: track user-confirmed folders`, then `security: reject scans of unconfirmed paths`.
- Do NOT push.

## Steps

### Step 1: Create `electron/confirmed-folders.js`

```js
// Tracks the set of folder roots the user has confirmed via the folder dialog.
// The renderer may only request scans of paths equal to or under a confirmed root.
const fs = require('fs');
const path = require('path');
const { normalizePath, safeRelativePath } = require('./utils.js');

const MAX_CONFIRMED = 20;
let confirmedRoots = [];
let storePath = null; // set via init()

function init(userDataPath) {
  storePath = path.join(userDataPath, 'confirmed-folders.json');
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) confirmedRoots = parsed.map(normalizePath).filter(Boolean);
  } catch { confirmedRoots = []; }
}

function addConfirmedRoot(root) {
  const normalized = normalizePath(root);
  confirmedRoots = [normalized, ...confirmedRoots.filter((r) => r !== normalized)].slice(0, MAX_CONFIRMED);
  try { fs.writeFileSync(storePath, JSON.stringify(confirmedRoots, null, 2)); } catch (err) { console.warn('Failed to persist confirmed folders:', err); }
}

/** True when `candidate` equals or is under any confirmed root. */
function isConfirmed(candidate) {
  const normalized = normalizePath(candidate);
  return confirmedRoots.some((root) => {
    if (root === normalized) return true;
    const rel = safeRelativePath(root, normalized);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

module.exports = { init, addConfirmedRoot, isConfirmed, getConfirmedRoots: () => [...confirmedRoots] };
```

**Verify**: `node --check electron/confirmed-folders.js` → exit 0.

### Step 2: Wire it into `main.js`

- At startup (`app.whenReady`, before `createWindow`): `confirmedFolders.init(app.getPath('userData'))`.
- In the `open-folder` success path (after the dialog returns a path, main.js:189-199): `confirmedFolders.addConfirmedRoot(normalizedPath)`.
- In `request-file-list` (main.js:313+, before `isLoadingDirectory` handling or right after): validate:
  ```js
  const folderPath = payload?.folderPath;
  if (typeof folderPath !== 'string' || !folderPath.trim()) { /* error status */ return; }
  let stat;
  try { stat = await fs.promises.stat(folderPath); } catch { /* error status: folder no longer exists */ return; }
  if (!stat.isDirectory() || !confirmedFolders.isConfirmed(folderPath)) {
    event.sender.send('file-processing-status', { status: 'error', message: 'Folder not confirmed. Please re-select it using the folder picker.' });
    return;
  }
  ```
  Keep the existing `isLoadingDirectory` busy check BEFORE the new validation (busy message takes precedence), and keep all existing behavior after validation passes.
- In `get-ignore-patterns` (main.js:205-257): same existence + `isConfirmed` check at the top of the `try`; on failure return `{ error: 'Folder not confirmed' }` (the renderer's `useIgnorePatterns` already handles an `error` field — verify in the hook before finalizing).

**Verify**: `node --check electron/main.js` → exit 0; `npm run typecheck` → exit 0.

### Step 3: Confirm the renderer's error handling

Read `src/App.tsx`'s `handleProcessingStatusIPC` (around lines 380-450) and `useIgnorePatterns.ts`'s error path. The scan error status must be visible to the user (the existing `status: 'error'` display path — the same one plan 012 relies on). If the message renders, done; if the error status is not displayed anywhere, note it as a REQUIRED follow-up in your report (do not fix the renderer in this plan unless it is a one-line display addition — judge and say what you did).

**Verify**: you can state whether the error message displays.

### Step 4: Manual verification (full flow)

1. Fresh launch → open folder via picker → scan works, tree loads.
2. Relaunch → folder restores and re-scans without a picker (launch-restore flow) → works.
3. Create a workspace pointing at a second folder (via the picker) → switch between workspaces → both scan fine.
4. WSL path (if available) → still works.
5. Negative test (devtools): `window.electron.send('request-file-list', { folderPath: 'C:/Users' , ignoreMode: 'automatic'})` (a path never confirmed) → error status, no scan. If the path was confirmed earlier, use a sibling folder instead.

**Verify**: scenarios 1-5 behave as specified.

## Test plan

- If the 002 suite exists: unit-test `electron/confirmed-folders.js` logic (isConfirmed: equal root → true; descendant → true; sibling → false; parent → false; empty set → false) with a temp dir. The module is pure-ish (fs only in init/add) — test `isConfirmed` without touching fs by exporting the core predicate; if that proves awkward, skip with a note.
- Manual scenarios are the main gate.

## Done criteria

All must hold:

- [ ] `node --check` passes on changed files; `npm run typecheck` exits 0; `npm test` exits 0 (or skip note)
- [ ] `confirmedFolders.init` runs at startup; `addConfirmedRoot` fires on dialog confirm
- [ ] Both handlers reject unconfirmed/nonexistent paths before any fs scan
- [ ] Manual scenarios 1-5 verified
- [ ] Renderer error display status reported
- [ ] `git diff` touches only `electron/main.js` and `electron/confirmed-folders.js` (+ tests)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A legitimate flow (workspace switch, launch restore, WSL) breaks despite the confirmed-set design — STOP and report the exact flow; do not loosen the check to "any absolute path".
- `app.getPath('userData')` is unavailable at the chosen init point (it is available after `app.whenReady`; if your wiring runs earlier, move it) — STOP if you cannot wire it correctly.
- `safeRelativePath` behaves unexpectedly for WSL roots (case handling) — the confirmed set stores normalized paths and compares with the same function the scanner uses, so consistency is expected; if not, STOP.

## Maintenance notes

- The confirmed-set JSON in `userData` is user-local state; clearing app data wipes it (acceptable — the user re-picks folders).
- The error message "Folder not confirmed. Please re-select it." should reach the user; if the renderer's error display is missing, that follow-up is higher priority than it looks (silent rejection = confusing UX).
- If a future feature adds "recent folders" that never passed the dialog, it must add them to the confirmed set via an explicit user action — never implicitly.
- This plan completes the defense-in-depth chain (015 → 016 → 017 → 018); after it lands, a renderer compromise can still read files under confirmed roots, which is the app's core function — the boundary is "only folders the user picked".
