# Plan 028: Delete dead files and dead handlers

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/main.js electron/renderer.js electron/backup src/main.tsx src/styles/backup .github/workflows` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (every deletion is verified unimported first — with git history from 001, nothing is lost)
- **Depends on**: 001 (git baseline must exist so deletions are recoverable)
- **Category**: tech-debt
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The tree carries ~1,600 lines of dead legacy code that looks alive: `electron/renderer.js` (298 lines, a plain-DOM renderer for a UI that no longer exists — the React app in `src/` replaced it) and `electron/backup/OldMain.js` (1,316 lines of the old main process, drifted so far it would throw `TypeError` on load — it destructures exports that no longer exist). Anyone grepping for the old function names gets a second, broken implementation. Also dead: a duplicate no-op `closed` handler in main.js, the `beforeunload` "flush" superstition in main.tsx (reading localStorage does not flush writes), a 4,179-line CSS backup, and two dead workflow files. Deleting them shrinks the surface area every future plan must search.

## Current state

- `electron/renderer.js` — 298 lines; repo-wide grep shows ZERO `require('./renderer.js')` / imports.
- `electron/backup/OldMain.js` — 1,316 lines; zero imports; `excludedFiles` destructure (line 10) doesn't match `excluded-files.js`'s current exports (would throw on spread).
- `electron/main.js:611-613` — duplicate no-op handler:
  ```js
  mainWindow.on('closed', () => {
    // Watcher cleanup is now handled by the watcher module itself
  });
  ```
  (the real closed handler is at :568-571 — plan 005 may have modified it; the no-op at :611 must still go).
- `src/main.tsx:45-66` — the `beforeunload` listener that reads 9 localStorage keys to "flush" writes (a no-op — `setItem` is synchronous; reading changes nothing).
- `src/styles/backup/index.css.bak` — 4,179 lines, duplicated split CSS.
- `.github/workflows/release.yml.disabled` and `.github/workflows/debug-build.yml` — dead workflows (`debug-build.yml` is referenced by scripts/README.md's "Debugging GitHub Actions" section — check whether that README needs a matching note removal).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Verify unused | `grep -rn "renderer.js\|OldMain" electron/ src/ scripts/` | only the files themselves |
| Syntax | `node --check electron/main.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (delete):
- `electron/renderer.js`
- `electron/backup/` (entire directory)
- `src/styles/backup/` (entire directory)
- `electron/main.js:611-613` (no-op closed handler)
- `src/main.tsx:45-66` (beforeunload block)
- `.github/workflows/release.yml.disabled`, `.github/workflows/debug-build.yml`
- `scripts/README.md` — ONLY the "Debugging GitHub Actions" section if it references the deleted workflow (lines ~33-46)

**Out of scope** (do NOT touch):
- `.agents/skills/` (gitignored by plan 001, kept for the owner's tooling)
- `.gitignore` entries added by 001 for the backups (leave them — harmless; optionally note for later cleanup)
- Any source logic (plan 029 deletes the in-source dead code like `formatContentForCopying` leftovers and unused exports)

## Git workflow

- Branch: `advisor/028-delete-dead-files`.
- Commit: `chore: remove dead renderer, backups, and disabled workflows`.
- Do NOT push.

## Steps

### Step 1: Verify nothing imports the deletion targets

Run the greps from "Commands": `grep -rn "renderer\.js" electron/ src/ scripts/` (excluding the file itself), `grep -rn "OldMain" .` (excluding `electron/backup/` and `.git/`), `grep -rn "index\.css\.bak\|styles/backup" src/ electron/ scripts/`, `grep -rn "debug-build\|release\.yml" .github/ scripts/`. Any hit outside the deletion targets = STOP and report.

**Verify**: no external references.

### Step 2: Delete the files and the main.js no-op

`rm electron/renderer.js` + `rm -r electron/backup src/styles/backup` + remove the two workflow files + delete the no-op handler (main.js:611-613). Keep the .gitignore entries from 001 (they now match nothing — that is fine).

**Verify**: `node --check electron/main.js` → exit 0.

### Step 3: Remove the beforeunload block from main.tsx

Delete `src/main.tsx:45-66` (the comment block + listener). The file's remaining content is the CSS imports and the ReactDOM render — verify the file still makes sense (read it after the deletion).

**Verify**: `npm run typecheck` → exit 0; `npm run build` → exit 0.

### Step 4: Fix the scripts README if needed

Read `scripts/README.md` — if the "Debugging GitHub Actions" section (lines 33-46) references `debug-build.yml` and the `debug-gh-release` script, decide: the npm script `debug-gh-release` (package.json:19) still exists and still works with the debug workflow DELETED? No — it pushes a tag that triggers whatever tag workflows exist (build.yml). The debug workflow is gone, so the section is stale: remove the section and the `debug-gh-release` script? The script is part of package.json — removing it is a package.json change; keep the script (harmless) but remove the stale README section, OR keep both and note it. Choose: remove the README section; leave `debug-gh-release` in package.json (out of scope to remove — note it in the report).

**Verify**: `scripts/README.md` no longer references deleted files.

### Step 5: Final verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build` → all exit 0. `git status` shows only the intended deletions + the README edit.

**Verify**: all green; `git diff --stat` matches the scope list.

## Test plan

- No runtime tests; the build/typecheck/test triad + grep verification is the gate.
- Manual sanity: app launches and scans a folder (dev or built).

## Done criteria

All must hold:

- [ ] `grep -rn "renderer.js\|OldMain\|styles/backup\|debug-build" electron/ src/ scripts/ .github/` (excluding `.git/`) returns no matches
- [ ] `node --check electron/main.js` exits 0
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all exit 0
- [ ] `src/main.tsx` has no `beforeunload` listener
- [ ] `git diff --stat` shows exactly the in-scope deletions
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any grep finds a live reference to a deletion target (e.g. `electron/renderer.js` required somewhere the audit missed) — STOP; the file stays until the reference is understood.
- `npm run build` fails after the main.tsx edit (e.g. an import in the removed block was load-bearing — it should not be) — STOP and report.

## Maintenance notes

- `debug-gh-release` (package.json:19) is now an orphan script (it tags, and the tag triggers build.yml — which is the release path, so it is not entirely dead; keep it, but the README section is gone). Flag to the maintainer for a future decision.
- The `.gitignore` entries from plan 001 for `electron/backup/` and `src/styles/backup/` are now matching nothing — safe to remove in a future hygiene pass; leaving them costs nothing.
- With `OldMain.js` gone, the git history (baseline commit from 001) is the only place old main-process code lives — that is the intent.
- Plan 029 deletes the remaining IN-SOURCE dead code (unused exports, dead handlers) — this plan handled the file-level dead weight.
