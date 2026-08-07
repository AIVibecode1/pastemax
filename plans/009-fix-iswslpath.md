# Plan 009: Fix `isWSLPath` so the WSL folder-picker shortcut and case-insensitive comparisons work

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/utils.js electron/__tests__/utils.test.ts` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 002 (test infra — plan 002's characterization test pins current behavior; this plan flips it)
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

PasteMax explicitly supports WSL paths (README: "Cross-Platform: Available for Windows, Mac, Linux and WSL"; CHANGELOG 1.0.10 documents the WSL work), but the WSL detection can never fire on Windows: `isWSLPath` tests for the `\\wsl.localhost/` form AFTER `normalizePath` has already converted every leading-`\\` UNC path to `//wsl.localhost/...`. Consequences: (1) the folder picker never defaults to `\\wsl$\` for users whose last folder was a WSL path (`main.js:171-178`), and (2) `safeRelativePath`'s WSL case-insensitivity branch (utils.js:37-41) is dead, so WSL path comparisons silently fall back to case-sensitive behavior on Linux-style WSL filesystems where case matters less but the code intended to be safe.

## Current state

- `electron/utils.js:8-12`:
  ```js
  function isWSLPath(filePath) {
    if (!filePath) return false;
    const normalized = normalizePath(filePath);
    return normalized.startsWith('\\\\wsl.localhost/') || normalized.startsWith('\\\\wsl$/');
  }
  ```
  (In source, the literals are `\\wsl.localhost/` and `\\wsl$/` — two backslashes each.)
- `electron/utils.js:14-24` — `normalizePath` converts `\\wsl.localhost\foo` → `//wsl.localhost/foo` on win32 (and replaces remaining `\` with `/` on all platforms):
  ```js
  if (process.platform === 'win32' && filePath.startsWith('\\\\')) {
    return '//' + filePath.slice(2).replace(/\\/g, '/');
  }
  return filePath.replace(/\\/g, '/');
  ```
- So after normalization the prefix is `//wsl.localhost/` or `//wsl$/` — the function tests the wrong form. It is also called on raw inputs in `main.js` (`isWSLPath(lastSelectedFolder)` at main.js:174) — raw `\\wsl.localhost\...` input would match the current test, but `lastSelectedFolder` is stored normalized (it comes from the renderer, which normalizes paths), so in practice it never matches there either.
- `electron/main.js:177` — `defaultPath = '\\\\wsl$\\'` (the raw `\\wsl$\` form the dialog needs).
- `electron/__tests__/utils.test.ts` (from plan 002) pins the CURRENT behavior — update those assertions in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test` | all pass |
| Syntax | `node --check electron/utils.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 (renderer untouched; still run) |

## Scope

**In scope**:
- `electron/utils.js` — `isWSLPath` only
- `electron/__tests__/utils.test.ts` — update the `isWSLPath` characterization tests
- `electron/main.js` — ONLY if the fix reveals the `defaultPath` assignment needs the raw form documented; do not change behavior there

**Out of scope** (do NOT touch):
- `normalizePath`, `safeRelativePath`, `safePathJoin`, `ensureAbsolutePath`
- The renderer's `src/utils/pathUtils.ts` (it may have its own WSL helpers — check it only to note whether the same bug exists there; report if it does, do not fix it in this plan)

## Git workflow

- Branch: `advisor/009-fix-iswslpath`.
- Commit: `fix: isWSLPath matches normalized //wsl paths`.
- Do NOT push.

## Steps

### Step 1: Fix the prefix test

Replace the body of `isWSLPath` so it tests BOTH the normalized and raw forms (robust to either call convention):

```js
function isWSLPath(filePath) {
  if (!filePath) return false;
  const normalized = normalizePath(filePath);
  return (
    normalized.startsWith('//wsl.localhost/') ||
    normalized.startsWith('//wsl$/')
  );
}
```

`normalizePath` maps both `\\wsl.localhost\...` and `\\wsl$\...` (and `//wsl.localhost/...`, `//wsl$/...`) to the `//` form on every platform, so checking the normalized prefixes covers all four input shapes. Note: `//wsl.localhost` without a trailing slash (the bare root) — decide: treat bare `//wsl.localhost` and `//wsl$` as WSL too by checking `normalized === '//wsl.localhost' || normalized === '//wsl$'` OR `startsWith` variants; the dialog's `\\wsl$\` root is a real case (`defaultPath`), so the bare-root check matters — include it.

**Verify**: `node --check electron/utils.js` → exit 0.

### Step 2: Update the characterization tests

In `electron/__tests__/utils.test.ts`, replace the plan-002 assertions that pinned the broken behavior with the intended behavior:
- `isWSLPath('\\\\wsl.localhost\\Ubuntu\\home\\x')` → true (raw win32 form)
- `isWSLPath('//wsl.localhost/Ubuntu/home/x')` → true (normalized form)
- `isWSLPath('\\\\wsl$\\Ubuntu')` → true; `isWSLPath('//wsl$/Ubuntu')` → true
- `isWSLPath('//wsl.localhost')` and `isWSLPath('//wsl$')` → true (bare root)
- `isWSLPath('C:/Users/x')`, `isWSLPath('/home/x')`, `isWSLPath('')`, `isWSLPath(null)` → false

**Verify**: `npm test` → all pass.

### Step 3: Check the renderer twin

Read `src/utils/pathUtils.ts` — if it has an equivalent WSL-detection function with the same prefix bug, report it in your completion notes (do NOT fix it here; it becomes a follow-up).

**Verify**: completion report states whether the renderer has the same bug (yes/no + location).

### Step 4: Manual verification (Windows only — if you are on Windows)

With a WSL distro installed: in the app, open a folder under `\\wsl$\<distro>\...` (or `\\wsl.localhost\<distro>\...`), close, reopen the folder picker — it should default to the WSL root. If no WSL distro is available, mark the manual check as not performed.

**Verify**: folder picker opens at `\\wsl$\` (or the last WSL location).

## Test plan

- Updated `isWSLPath` cases in `electron/__tests__/utils.test.ts` (Step 2) — these are the regression tests; the old assertions were written by plan 002 to document the bug and MUST be flipped here.
- All other plan-002 tests unchanged and passing.

## Done criteria

All must hold:

- [ ] `npm test` exits 0 with the flipped `isWSLPath` assertions
- [ ] `node --check electron/utils.js` exits 0
- [ ] `grep -n "wsl.localhost" electron/utils.js` shows the corrected prefixes
- [ ] `git diff` touches only `electron/utils.js` and `electron/__tests__/utils.test.ts`
- [ ] Renderer-twin check reported (Step 3)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `normalizePath`'s win32 branch does not fire for `\\wsl$\...` (verify with a quick node one-liner on Windows: `node -e "const {normalizePath}=require('./electron/utils.js'); console.log(normalizePath('\\\\\\\\wsl$\\\\Ubuntu'))"` — if it does not produce `//wsl$/Ubuntu`, STOP; the fix must be adapted).
- Tests fail in a way that suggests `safeRelativePath` depends on `isWSLPath` returning false (it uses it to enable case-insensitivity — flipping to true is the intended change; only STOP if a test in another file breaks).

## Maintenance notes

- The `defaultPath` literal at main.js:177 (`\\wsl$\`) is the raw form the Windows dialog requires — do not normalize it.
- When WSL support is revisited (e.g. running the app inside WSL), the `process.platform === 'win32'` branches in `normalizePath`/`safeRelativePath` deserve a review — noted here, not in scope.
- Plan 002's characterization test for `isWSLPath` was written to document the bug; this plan is the documented flip. Keep the test names aligned with the intended behavior after this lands.
