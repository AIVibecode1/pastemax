# Plan 024: Stop rebuilding the whole file tree on every expand/collapse

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/components/Sidebar.tsx src/components/TreeItem.tsx src/App.tsx` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (tree rendering is intricate; the characterization suite + manual checks are the safety net)
- **Depends on**: 002 (suite exists — add a perf-regression test if feasible)
- **Category**: perf
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

On a 10k-file repo, a single arrow-click on a folder triggers: (1) a FULL tree rebuild — the `buildTree` effect in `Sidebar.tsx` depends on `expandedNodes` (line 236), and every toggle creates a fresh object (App.tsx:1011-1023), so the entire nested tree is rebuilt from the flat file list; (2) the `applyExpandedState` effect (Sidebar.tsx:239-259) then walks the whole tree AGAIN; (3) `hasBinaryFiles` recursion per directory node during the build (Sidebar.tsx:166-173) rescans full subtrees — O(n·depth); and (4) every selection change re-runs per-node subtree recursion in `TreeItem.tsx:51-122` (`areAllFilesInDirectorySelected`/`isAnyFileInDirectorySelected` walk all descendants for each directory node). The sidebar visibly stutters on large repos. The tree structure depends only on `allFiles` + `selectedFolder`; expanded state is presentation and should be applied separately (the code even has a comment saying exactly that at Sidebar.tsx:238).

## Current state

- `src/components/Sidebar.tsx:92-236` — `buildTree` effect:
  ```ts
  useEffect(() => {
    ...
    const buildTreeTimeoutId = setTimeout(buildTree, 0);
    return () => clearTimeout(buildTreeTimeoutId);
  }, [allFiles, selectedFolder, expandedNodes]);   // ← line 236: expandedNodes causes full rebuilds
  ```
- `src/components/Sidebar.tsx:238-259` — separate `applyExpandedState` effect that walks the built tree and sets `isExpanded` from `expandedNodes` — this is the correct home for expand/collapse changes.
- `src/components/Sidebar.tsx:166-173` — `hasBinaryFiles` (or similar) recursion per directory node inside the build.
- `src/components/TreeItem.tsx:51-84, 90-122` — selection-state recursion per node.
- `src/App.tsx:1011-1023` — expand/collapse handlers create a new `expandedNodes` object each toggle.
- Repo convention: `console.time`/`console.log` used at App.tsx:963 (`selectAllFiles`) for ad-hoc perf checks — match that style for the before/after measurement.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |
| Manual | dev launch + large folder | see Step 4 |

## Scope

**In scope**:
- `src/components/Sidebar.tsx` — effect deps, `hasBinaryFiles` precomputation
- `src/components/TreeItem.tsx` — selection queries via a prepared Set/path map (ONLY if the Sidebar changes are insufficient and the TreeItem change is mechanical — see Step 3)

**Out of scope** (do NOT touch):
- The tree node data shape used by the render tree (TreeNode) — unless a mechanical addition is required
- `App.tsx` expand/collapse handlers (keep the fresh-object pattern; it is fine once the rebuild dependency is gone)
- Virtualization of the tree (a bigger architectural change; note as follow-up)

## Git workflow

- Branch: `advisor/024-sidebar-tree-perf`.
- Commits: `perf: decouple tree rebuild from expandedNodes`, then `perf: precompute subtree aggregates in tree build`.
- Do NOT push.

## Steps

### Step 1: Decouple the rebuild from `expandedNodes`

Change the `buildTree` effect deps from `[allFiles, selectedFolder, expandedNodes]` to `[allFiles, selectedFolder]` (Sidebar.tsx:236). The `applyExpandedState` effect (238-259) already reacts to `expandedNodes` changes against the existing tree — verify it re-runs when `expandedNodes` changes (it must have `expandedNodes` in ITS deps; check and fix if missing).

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0. Manual: expand/collapse a folder — tree does NOT rebuild (add a temporary `console.log('building tree')` inside `buildTree` and confirm it does not fire on toggle; remove the log after).

### Step 2: Precompute `hasBinaryFiles` during the build

Inspect the build (`Sidebar.tsx:99-231`): the per-node `hasBinaryFiles` recursion (166-173) recomputes subtree membership for each directory. During the tree construction (single pass over `allFiles`), record binary-ness per node into a `Map<nodeId, boolean>` (or compute bottom-up after construction in one pass). Attach the precomputed value to each directory node (`node.hasBinary = ...`) instead of recursing per node on demand.

**Verify**: `npm run typecheck` → exit 0. Manual: on a large folder, tree build happens once and is visibly faster; binary folders still render identically.

### Step 3: Selection queries in `TreeItem` (mechanical pass only)

`TreeItem.tsx:51-122` walks all descendants per directory node on every selection change. If Step 2's pattern (precomputed aggregates) can be extended cheaply: compute per-directory `selectedCount`/`totalCount` (or a `Set<selectedPaths>` passed down and checked per node) — implement ONLY if it is mechanical; otherwise stop at Steps 1-2 and note the TreeItem recursion as a follow-up (the expand/collapse rebuild was the dominant cost).

**Verify**: if done — `npm run typecheck` + manual selection on a large folder feels snappier; if skipped — note it.

### Step 4: Measure before/after

With a large test folder (or the app's own repo ~200 files, better: generate a 5-10k file temp tree), in dev:
- Before (if you can still reproduce): time expand/collapse on a deep folder (performance.now in the toggle handler or devtools performance panel).
- After: same action — rebuild should not occur; toggle applies expanded state via the apply-effect only.
- Selection: select a large folder's checkbox — measure the handler time.

**Verify**: recorded numbers show the rebuild gone (toggle time dominated by React re-render only); selection improved if Step 3 landed.

## Test plan

- Unit tests for tree-build logic are impractical without extracting the build (out of scope); rely on the characterization suite (`npm test` — no regressions) + Step 4 measurements.
- If the 002 suite includes any Sidebar-adjacent tests, keep them green.

## Done criteria

All must hold:

- [ ] `npm run typecheck` and `npm run lint` exit 0
- [ ] `npm test` exits 0
- [ ] `buildTree` effect deps are `[allFiles, selectedFolder]`; the apply-expanded effect covers `expandedNodes`
- [ ] Temporary build-log removed; measured toggle no longer triggers a rebuild
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Removing `expandedNodes` from the build deps causes a visible bug (e.g. new directories added by the watcher appear collapsed despite default-expanded logic, or the apply effect doesn't run on first build) — STOP and report; do not re-add the dep as a workaround without understanding the ordering.
- The `applyExpandedState` effect's deps are incomplete in a way that makes Step 1 unsafe — STOP.
- Step 3 turns out non-mechanical (TreeItem recursion is deeply entangled) — skip it and say so; do not refactor TreeItem broadly in this plan.

## Maintenance notes

- The `expandedNodes` default-expanded logic (`expandedNodes[node.id] !== undefined ? ... : true` at :246) means folders are expanded by default — the apply-effect ordering matters whenever the tree is rebuilt; a reviewer should verify first-build expansion still works after this change.
- Tree virtualization (windowing) is the next step if 50k+ file repos matter — note for the maintainer.
- Plan 029 (App.tsx decomposition) will move the expand/collapse handlers; keep the dep contract documented at that time.
