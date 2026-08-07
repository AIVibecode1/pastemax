# Plan 029: Decompose App.tsx — extract copy pipeline, workspaces, and file-selection logic into hooks

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/App.tsx src/utils/contentFormatUtils.ts src/utils/fileTreeUtils.ts src/types/FileTypes.ts src/main.tsx` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (the copy pipeline is the app's core; the characterization suite from 002 is the safety net, and 004 has already settled the formatter)
- **Depends on**: 002 (characterization tests), 004 (formatter settled)
- **Category**: tech-debt
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

`src/App.tsx` is 1,984 lines / 74KB holding state, effects, IPC wiring, workspace CRUD, the copy pipeline, and the entire render tree. Every behavior change to core flows requires navigating a 2K-line file, and the file already proved it breeds drifted duplicates (the dead `formatContentForCopying` twin — removed by plan 004). The dead-code cluster inside it is masked by disabled compiler flags (`noUnusedLocals: false`, `no-explicit-any: off`). This plan extracts cohesive units into hooks and deletes the dead code, making the file navigable and the extracted logic unit-testable.

## Current state (verified at audit)

- `src/App.tsx` = 1,984 lines. Major clusters:
  - Copy pipeline: `getSelectedFilesContent` (953-959), the base-content cache effect (1137-1175), the token-count effect (1177-1207), copy handler (~1520-1560).
  - Workspaces: state init (95-132), CRUD handlers (1291-1514 per the audit).
  - Ignore-mode wiring: `useIgnorePatterns` usage (135-145), `handleIgnoreViewerClose` (665-688) — plan 030 restructures this; coordinate.
  - File selection: `selectAllFiles` (962-979), binary-toggling effect (335-360), `handleFileListDataIPC` (~380-460).
  - IPC listener registration (641-655), update-modal wiring (1210-1252).
- Dead code inside the file (grep-verified at audit):
  - `dirname` import at App.tsx:36 (unused — verify still unused).
  - `handleBackendModeUpdateIPC` (637-639) + its registration at :644 and cleanup at :653 — dead handler for a channel (`ignore-mode-updated`) nothing needs (the mode is re-applied via reload/request; verify before deleting — if `ignore-mode-updated` is needed after plan 030 removes the reload, KEEP this handler and say so).
  - `hasLoadedInitialData` key touched at :228/:375 but never written to localStorage (dead state).
  - Duplicated sort comparator (729-742 vs `contentFormatUtils.ts:46-59`).
  - `isFileInFolder` (856-882) re-implementing `isSubPath` (`pathUtils.ts:138-155`).
- `src/utils/fileTreeUtils.ts:1-11` — `isFileExported`/`isFileExcluded` exported but never imported; `TreeItem.tsx:10-16` re-implements the identical function locally (keep TreeItem's local copy; delete the util file's exports).
- `src/types/FileTypes.ts:59-90` — unused type exports `FileCardProps`, `CopyButtonProps`, `SearchBarProps`, `SortOption` (verify unused via grep before deleting).
- Conventions to follow: hooks live in `src/hooks/` (existing: `useModels.ts`, `useIgnorePatterns.ts`); utils in `src/utils/`; components in `src/components/`. Naming: `use<Feature>` hooks with object returns (match `useModels`' shape).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (create):
- `src/hooks/useCopyPipeline.ts` — cached base content, token counting, `getSelectedFilesContent`/`assembleCopyContent` composition, copy handler state
- `src/hooks/useWorkspaces.ts` — workspace state + CRUD + persistence
- Optionally `src/hooks/useFileSelection.ts` — selection state + `selectAllFiles` + binary toggle (only if it extracts cleanly; otherwise leave selection in App.tsx)

**In scope** (modify):
- `src/App.tsx` — consume the hooks; delete dead code
- `src/utils/fileTreeUtils.ts` — delete the unused exports (or the whole file if empty after)
- `src/types/FileTypes.ts` — delete the unused prop/type exports
- `src/utils/__tests__/` — add tests for any pure logic extracted (e.g. the sort comparator if it moves to utils)

**Out of scope** (do NOT touch):
- `src/components/*` (except as required by hook signature changes — minimize)
- Plan 030's ignore-hook restructuring (coordinate: if 030 lands first, `handleIgnoreViewerClose` moves/changes; if this lands first, 030 adapts)
- The IPC whitelist migration (015) — App.tsx call sites change there too; coordinate sequencing (this plan should NOT re-route IPC calls; it moves code, not channels)
- CSS

## Git workflow

- Branch: `advisor/029-app-decomposition`.
- Commits, in order: `refactor: extract useWorkspaces`, `refactor: extract useCopyPipeline`, `refactor: extract useFileSelection (if done)`, `chore: delete dead code in App.tsx and utils`, each independently green (`npm run typecheck && npm run lint && npm test`).
- Do NOT push.

## Steps

### Step 1: Extract `useWorkspaces`

Move workspace state (init at 95-132), the CRUD handlers (1291-1514), and their persistence into `src/hooks/useWorkspaces.ts`. The hook returns `{ workspaces, currentWorkspaceId, setCurrentWorkspaceId, createWorkspace, updateWorkspace, deleteWorkspace, switchWorkspace, clearAllWorkspaces, ... }` — name the functions to match the current handlers' names so App.tsx call sites change minimally. Behavior must be IDENTICAL (including the localStorage write timing — if any write happens inside a setState updater, preserve that or fix it per plan 007's rules and say so).

**Verify**: `npm run typecheck` && `npm run lint` && `npm test` → all pass; App.tsx renders and behaves identically (manual: create/switch/delete workspaces).

### Step 2: Extract `useCopyPipeline`

Move: `cachedBaseContentString`/`cachedBaseContentTokens`/`totalFormattedContentTokens` state, the base-content effect (1137-1175), the token-count effect (1177-1207), `getSelectedFilesContent` (953-959), and the copy handler's state/status logic (1520-1560) into `src/hooks/useCopyPipeline.ts`. Inputs it needs: `allFiles`, `selectedFiles`, `sortOrder`, `includeFileTree`, `includeBinaryPaths`, `selectedFolder`, `userInstructions`, `isElectron`. If plan 025 landed, the worker lifecycle moves into this hook (its maintenance note says so). Keep the copy handler's clipboard + history split from plan 014 intact.

**Verify**: same triad; manual: select files, sort, toggle options, copy — token counts and output identical to before (compare a small copy's text).

### Step 3: Delete the dead code

- `dirname` import (App.tsx:36) — delete if unused.
- `handleBackendModeUpdateIPC` + its registration/cleanup — delete ONLY if `ignore-mode-updated` handling is genuinely dead (check plan 030's outcome: if the reload hack is removed and the mode flows through request-file-list, this handler stays dead — delete; if anything needs the channel, keep and document).
- `hasLoadedInitialData` state + touches.
- `isFileInFolder` — replace its call sites with `isSubPath` (from pathUtils) and delete.
- Duplicated sort comparator (729-742) — if identical to `contentFormatUtils.ts:46-59`'s, either import the util version or leave (judge by call-site shape; prefer importing).
- `fileTreeUtils.ts` unused exports — delete; delete the file if empty.
- `FileTypes.ts` unused type exports — delete (verify each with grep first).
- Re-run `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` (flags off in tsconfig — pass them explicitly) and report what REMAINS unused; do not fix everything it reports (it may flag intentional exports) — just record the list in the report for a future pass.

**Verify**: triad passes; `npm run build` passes; report the residual unused list.

### Step 4: Add tests for extracted pure logic

If any pure function moved (e.g. the sort comparator, workspace JSON shaping), add unit tests in `src/utils/__tests__/` or `src/hooks/__tests__/` following plan 002's patterns. Hook-level tests need React test utilities — skip hook tests (no jsdom in this project yet); test only pure functions.

**Verify**: `npm test` → all pass with the new tests.

### Step 5: Final manual pass

Full feature pass: folder load, selection, sort, group-by-folder, include-file-tree/binary, instructions, copy, copy history, workspaces (create/switch/clear), task types, ignore modal (if 030 not yet landed — its reload behavior should be unchanged by THIS plan).

**Verify**: all features behave as before; devtools console has no new errors.

## Test plan

- 002 suite: `npm test` — all pass throughout (each commit is green).
- Step 4 unit tests for extracted pure logic.
- Step 5 manual pass.

## Done criteria

All must hold:

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all exit 0
- [ ] `src/App.tsx` is materially smaller (report before/after line counts; target: under ~1,200 lines)
- [ ] `grep -rn "handleBackendModeUpdateIPC\|hasLoadedInitialData\|isFileInFolder" src/` → no matches
- [ ] `grep -rn "isFileExported\|isFileExcluded" src/` → no matches
- [ ] Unused type exports deleted; residual `--noUnusedLocals` findings recorded in the report
- [ ] `git diff --stat` matches the scope
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any extraction changes behavior (a test fails, or the manual pass differs) — revert that single extraction and report; do not "fix" behavior differences by changing the extracted code to something subtly different.
- Plan 025's worker or plan 014's history split isn't in the file as described (they may not have landed yet) — adapt the extraction to the ACTUAL current structure; only STOP if the copy handler's shape is unrecognizable.
- The hooks create circular imports with `App.tsx` (e.g. a hook needs a callback defined in App) — restructure the hook's inputs to receive the callback as a parameter; only STOP if the coupling makes extraction impossible without changing behavior.

## Maintenance notes

- After this plan, `App.tsx` should contain mostly render + wiring; new features should land in hooks/components.
- The residual `--noUnusedLocals` list from Step 3 is the input for a future "enable noUnusedLocals" plan (with 003's typecheck gate, it becomes enforceable).
- Plan 030 (single ignore hook) interacts with `handleIgnoreViewerClose` — coordinate the handoff; whoever lands second adapts.
- The 002 suite's characterization tests are the guardrail for any future copy-pipeline change — keep them in sync with the hook structure (test the pure functions, not the hooks).
