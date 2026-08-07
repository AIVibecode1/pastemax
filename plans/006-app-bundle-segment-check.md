# Plan 006: Make the macOS `.app` bundle skip segment-aware

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/file-processor.js electron/__tests__` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 002 (test infra; this plan adds tests)
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The scanner silently drops any path whose string contains `.app` anywhere — `fullPath.includes('.app')` — not just macOS application bundles. A project with `src/web.app/`, `foo.app.js`, or `notes.app.config.yaml` will have those files missing from the file tree, token counts, and copied LLM context, with no warning. The second half of the condition, `fullPath === app.getAppPath()`, only ever matches the exact root, so it contributes nothing. The intent (skip the running app's bundle and macOS `.app` bundles) should be expressed as a segment check.

## Current state

- `electron/file-processor.js:226-234` (directory branch of `processDirectory`):
  ```js
  if (
    fullPath.includes('.app') ||
    fullPath === app.getAppPath() ||
    !isValidPath(relativePath) ||
    relativePath.startsWith('..')
  ) {
    console.log('Skipping directory:', fullPath);
    return { results: [], progress };
  }
  ```
- `electron/file-processor.js:397-400` (file branch):
  ```js
  if (fullPath.includes('.app') || fullPath === app.getAppPath()) {
    console.log('System path, skipping:', fullPath);
    return;
  }
  ```
- Paths are normalized to forward slashes (`normalizePath`, `electron/utils.js:14-24`), so segments split cleanly on `/`.
- `electron/__tests__/utils.test.ts` exists after plan 002 — add the new helper's tests there or in a new `file-processor` test file (the helper below is pure).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test` | all pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Syntax | `node --check electron/file-processor.js` | exit 0 |

## Scope

**In scope**:
- `electron/utils.js` — add `isMacAppBundlePath(path)` helper + export
- `electron/file-processor.js` — use the helper at both skip sites; drop the dead `fullPath === app.getAppPath()` equality (the app bundle path ends with a `.app` segment, so the segment check covers it — verify this assumption in Step 2 and STOP if wrong)
- `electron/__tests__/utils.test.ts` — tests for the helper

**Out of scope** (do NOT touch):
- The `isValidPath` / `relativePath.startsWith('..')` checks (keep them)
- `electron/main.js`
- Any change to DEFAULT_PATTERNS / ignore logic

## Git workflow

- Branch: `advisor/006-app-bundle-segment-check`.
- Commits: `feat: add isMacAppBundlePath helper` then `fix: skip only real .app bundles in scanner`.
- Do NOT push.

## Steps

### Step 1: Add the helper to `electron/utils.js`

```js
/**
 * True when any path segment ends with '.app' (a macOS application bundle),
 * or the path IS a .app bundle. Segment-aware: 'foo.app.js' and 'src/web.app/'
 * are NOT bundles and return false.
 * @param {string} filePath - normalized or raw path
 * @returns {boolean}
 */
function isMacAppBundlePath(filePath) {
  if (!filePath) return false;
  const segments = normalizePath(filePath).split('/');
  return segments.some((seg) => seg.length > 4 && seg.endsWith('.app'));
}
```

Export it from `module.exports`.

**Verify**: `node --check electron/utils.js` → exit 0.

### Step 2: Verify the `app.getAppPath()` assumption

Confirm that the packaged app path (e.g. `.../PasteMax.app/Contents/Resources/app.asar`) always contains a `.app` segment — check `electron/build.js` and `package.json` (`productName: "PasteMax"`, `files: ["dist/**/*", ...]`) — the bundle name derives from `productName`, so the path ends with `PasteMax.app`. If the code or config shows the app can run from a non-`.app` path, STOP and report instead of dropping the equality.

**Verify**: you can point to the `productName` line as evidence.

### Step 3: Replace both skip sites in `file-processor.js`

At `:226-234` and `:397-400`, replace `fullPath.includes('.app') || fullPath === app.getAppPath()` with `isMacAppBundlePath(fullPath)`. Add `isMacAppBundlePath` to the destructured require from `./utils.js` at the top of the file (it already imports `normalizePath`, `safePathJoin`, etc. — check the existing require line). Remove the now-unused `app` import only if it becomes unused (grep for `app.` in the file first).

**Verify**: `node --check electron/file-processor.js` → exit 0; `grep -n "\.app" electron/file-processor.js` shows only the new helper call sites.

### Step 4: Tests

In `electron/__tests__/utils.test.ts` add cases for `isMacAppBundlePath`:
- `'/Applications/PasteMax.app'` → true
- `'/Applications/PasteMax.app/Contents/Resources/app.asar'` → true
- `'C:/Users/x/My App.app/config.json'` → true (bundle segment, not necessarily the running app — acceptable per intent)
- `'/repo/src/web.app/index.html'` → false (segment is `web.app` — wait, `web.app` ENDS with `.app` → this returns true! Choose a fixture that does NOT end in `.app`: `'src/webapp/'` → false; `'foo.app.js'` → false; `'notes.app.config.yaml'` → false; `'Dockerfile.appimage'` → false)
- `''` / `null` → false

Use fixtures that distinguish substring vs segment: `'foo.app.js'`, `'src/apple/'`, `'package.json.applesauce'` → all false.

**Verify**: `npm test` → all pass.

## Test plan

- New tests in `electron/__tests__/utils.test.ts` per Step 4.
- Regression: existing tests from 002 still pass.

## Done criteria

All must hold:

- [ ] `npm test` exits 0 with the new helper cases
- [ ] `npm run typecheck` exits 0
- [ ] `node --check` passes on both changed files
- [ ] `grep -rn "includes('.app')" electron/` returns no matches
- [ ] `git diff` touches only `electron/utils.js`, `electron/file-processor.js`, `electron/__tests__/utils.test.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `app.getAppPath()` drop cannot be justified (Step 2 fails).
- `app` is still used elsewhere in `file-processor.js` after the change and removing the import would break — then keep the import; just remove the dead equality.

## Maintenance notes

- The `.app` skip exists to keep the running app bundle and macOS bundles out of scans; if a user ever legitimately wants a `.app` folder scanned, this helper is the single place to revisit (e.g. config flag).
- Plan 023 (cache across scans) touches the same file — coordinate if both are in flight; this plan is small and should land first.
