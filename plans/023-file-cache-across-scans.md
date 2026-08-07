# Plan 023: Keep the file cache across scans (key by mtime+size) instead of wiping it every time

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/main.js electron/file-processor.js electron/__tests__` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (stale-content risk is the core hazard — the mtime+size keying and stat validation exist to eliminate it)
- **Depends on**: 002 (suite exists; add perf/behavior tests)
- **Category**: perf
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

`request-file-list` calls `clearFileCaches()` at the START of every scan (main.js:317). The file cache in `file-processor.js` holds each file's full content AND its tiktoken token count (lines 566-570 clear it; 413-418 read it). Within a single scan, each file is processed once, so the cache never hits during the scan that populated it — it only serves watcher events. Net effect of the wipe: every folder re-open (the common workflow: open folder, tweak, re-open) re-reads every file from disk and re-runs o200k_base tokenization on every file — O(repo size) redundant I/O and CPU per scan — while the cache simultaneously retains full file contents in memory until the next clear. The fix: keep the cache across scans, keyed by `(path, mtime, size)`, and validate with a `stat` before reuse so stale content can never be served.

## Current state

- `electron/main.js:316-317`:
  ```js
  // Always clear file caches before scanning
  clearFileCaches();
  ```
  (in the `request-file-list` handler, before the busy check).
- `electron/file-processor.js:566-570` — `clearFileCaches()` clears `fileCache` + `fileTypeCache`.
- `electron/file-processor.js:413-418` — cache read: `if (fileCache.has(fullPathNormalized)) { results.push(fileCache.get(fullPathNormalized)); ... }` — keyed by path only, no staleness check.
- Cache population: read the file-processing section (~lines 440-500) to see where entries are created (content + tokenCount + size). The watcher's `updateFileCacheEntry` (file-processor.js:573+) writes single-file updates.
- `clearFileCaches` is ALSO called from `set-ignore-mode` (main.js:285-286) and `clear-main-cache` (main.js:136-141) — those calls stay (ignore-mode changes invalidate exclusions, and the user-visible clear must clear).
- `electron/main.js:427` serializes `file.content` to the renderer; files are `FileData` objects (path, relativePath, name, size, isDirectory, extension, excluded, content, tokenCount, isBinary, isSkipped, error).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test` | all pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Syntax | `node --check electron/file-processor.js` | exit 0 |
| Manual | two consecutive scans + a file edit | second scan fast; edit reflected (Step 4) |

## Scope

**In scope**:
- `electron/file-processor.js` — cache entry shape (add mtime), cache read validation, `clearFileCaches` unchanged
- `electron/main.js:316-317` — remove the pre-scan `clearFileCaches()` call

**Out of scope** (do NOT touch):
- The `set-ignore-mode` / `clear-main-cache` clear calls (keep)
- `fileTypeCache` semantics
- Watcher behavior

## Git workflow

- Branch: `advisor/023-cache-across-scans`.
- Commits: `perf: key file cache by mtime+size`, `perf: keep file cache across scans`.
- Do NOT push.

## Steps

### Step 1: Add mtime to the cache entry and the staleness check

Read the cache-population code (file-processor.js ~440-500). Cache entries are full `FileData` objects. Add a non-serialized internal field, e.g. `_mtimeMs` (or a parallel `Map<path, mtime>` — pick whichever is less invasive; a parallel map avoids touching the serialized shape at main.js:406-425, which maps fields explicitly, so an extra property is harmless either way — but a parallel map is cleaner since `fileCache.get()` returns the object pushed directly to results at :415).

Implement validation at the cache-read site (:413-418):

```js
if (fileCache.has(fullPathNormalized)) {
  const cached = fileCache.get(fullPathNormalized);
  // Validate the file hasn't changed since it was cached.
  const stats = await fs.promises.stat(fullPath);
  if (stats.mtimeMs === cached._mtimeMs && stats.size === cached.size) {
    results.push(cached);
    progress.files++;
    return;
  }
  fileCache.delete(fullPathNormalized); // stale — fall through to re-read
}
```

Notes:
- `fs.promises.stat` is already imported and used in this file (see the binary-size branch at :435).
- `size` is already on FileData; `_mtimeMs` is new. When creating the entry, store `stats.mtimeMs` (the same stat call that provides `size` — check whether the content-read path already stats the file; if it reads content via `readFile` without stat, add one stat call).
- The watcher's `updateFileCacheEntry` (:573+) must also record `_mtimeMs` — read it and align.
- If `stat` throws (file deleted between scan listing and processing), the existing per-file try/catch at :390-395 handles it — keep that structure; the cache branch must not throw out of the queue task.

**Verify**: `node --check electron/file-processor.js` → exit 0.

### Step 2: Remove the pre-scan cache wipe

Delete `clearFileCaches();` (and its comment) at main.js:316-317. The scan then starts with whatever the cache holds; stale entries are weeded per-file by Step 1's validation.

**Verify**: `node --check electron/main.js` → exit 0; `grep -n "clearFileCaches" electron/main.js` shows only the `set-ignore-mode` (line ~286) and `clear-main-cache` (line ~138) call sites.

### Step 3: Tests

In the 002 suite, add tests for the cache logic IF it is extractable. If the cache lives inline in `readFilesRecursively`, extract the check into a small helper (`getCachedFileIfFresh(cache, fullPath)` — async, returns entry or null) so it is testable without a full scan. Then test with a temp dir:
- fresh cache entry (same mtime+size) → returned without re-read
- file touched (mtime changes) → null, entry evicted
- file resized (size changes) → null
- missing file → null (stat throws → treated as miss; verify the caller's try/catch tolerates it)

If extraction is too invasive for this plan, write the tests against the helper only and note the inline call sites in the completion report.

**Verify**: `npm test` → all pass.

### Step 4: Manual verification

1. Open a large folder → note scan time (console or stopwatch).
2. Re-open the same folder (or refresh) → scan must be visibly faster (cache hits; add a temporary `console.log` counter of cache hits if you want proof — remove it after).
3. Edit a file in the folder → refresh → the file's content and token count MUST reflect the edit (staleness check works).
4. Toggle ignore mode → scan again → file exclusions applied (the mode-change clear still fires).

**Verify**: all four scenarios behave as specified.

## Test plan

- Step 3 unit tests (helper-level).
- Step 4 manual scenarios — the staleness scenario (3) is the critical regression gate.

## Done criteria

All must hold:

- [ ] `npm test` exits 0 (with helper tests or a recorded extraction note)
- [ ] `npm run typecheck` exits 0; `node --check` passes on changed files
- [ ] `clearFileCaches()` removed from the `request-file-list` path
- [ ] Cache entries carry mtime; reads validate mtime+size; stale entries evicted
- [ ] Manual scenarios 1-4 verified (2 shows a measurable improvement)
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The content-read path cannot produce an mtime without an extra stat per file that would negate the win (it can — the binary branch already stats; the text branch adds one stat, which is cheap vs. readFile+tiktoken) — only STOP if you find the text path reads content WITHOUT any stat and adding one is structurally impossible.
- The watcher's `updateFileCacheEntry` shape makes mtime recording unreliable (read it first) — STOP and report rather than shipping a cache that can serve stale watcher content.
- Manual scenario 3 fails (stale content served) — STOP; the cache must not land in that state.

## Maintenance notes

- The cache now grows with the largest folder scanned and holds full file contents in memory — that was ALREADY true (the wipe never freed memory mid-session because the cache was repopulated by the next scan); if memory becomes a concern, an LRU cap is the follow-up (note for the maintainer).
- `clear-main-cache` (user-facing "Clear data") still wipes everything — correct.
- If tokenization changes (different encoder), the cache must be versioned (add an `encoderVersion` to the entry) — note this for the maintainer; out of scope now.
