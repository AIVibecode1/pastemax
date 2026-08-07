# Plan 026: Precompile the GlobalModeExclusion ignore filter

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/ignore-manager.js electron/__tests__` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (behavior-identical — the same patterns, compiled once instead of per call)
- **Depends on**: 002 (suite exists; add a behavior-equivalence test)
- **Category**: perf
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

In global ignore mode, `isPathExcludedByDefaults` constructs a fresh `ignore()` instance with the ~100-pattern `GlobalModeExclusion` list on EVERY call (ignore-manager.js:93). It is called per file from `processSingleFile` (file-processor.js:150, 194) AND again per file during result serialization (main.js:414-418). A 10k-file repo scan in global mode performs 20k+ pattern-set compilations that could happen exactly once. The module already has the right pattern for this — `systemDefaultFilter` (ignore-manager.js:25) is the precompiled DEFAULT_PATTERNS instance. This plan adds the global-mode twin.

## Current state

- `electron/ignore-manager.js:90-99`:
  ```js
  // If in 'global' mode, also check against GlobalModeExclusion
  if (ignoreMode === 'global') {
    // It's important that GlobalModeExclusion are not empty, otherwise ignore() might behave unexpectedly.
    if (GlobalModeExclusion && GlobalModeExclusion.length > 0) {
      const globalExcludedFilesFilter = ignore().add(GlobalModeExclusion);
      if (globalExcludedFilesFilter.ignores(relativePath)) {
        return true;
      }
    }
  }
  ```
- `electron/ignore-manager.js:25` — the existing precompiled `systemDefaultFilter` (module-level `ignore()` instance) — the model to follow.
- `GlobalModeExclusion` is imported from `./excluded-files.js` (check the import line at the top of ignore-manager.js).
- The comment at :91-92 warns about empty `GlobalModeExclusion` — preserve the emptiness guard.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/ignore-manager.js` | exit 0 |
| Tests | `npm test` | all pass |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**:
- `electron/ignore-manager.js` — module-level precompiled filter + use in `isPathExcludedByDefaults`
- `electron/__tests__/` — behavior-equivalence test

**Out of scope** (do NOT touch):
- `DEFAULT_PATTERNS` / `systemDefaultFilter` handling
- `createGlobalIgnoreFilter` (the scan-path filter — already compiled once per scan; leave it)
- `file-processor.js` / `main.js` call sites (they don't change)

## Git workflow

- Branch: `advisor/026-precompile-global-filter`.
- Commit: `perf: precompile GlobalModeExclusion ignore filter`.
- Do NOT push.

## Steps

### Step 1: Add the module-level precompiled filter

Near `systemDefaultFilter` (ignore-manager.js:25), add:

```js
// Precompiled ignore() instance for GlobalModeExclusion (global mode).
// Built once at module load instead of per-file during scans.
const globalModeExclusionFilter =
  GlobalModeExclusion && GlobalModeExclusion.length > 0
    ? ignore().add(GlobalModeExclusion)
    : null;
```

(Verify `ignore` is already required in this file — it is, since `systemDefaultFilter` uses it. Check where `GlobalModeExclusion` is imported and ensure the module-level initialization order is safe: if `excluded-files.js` is required at the top of the file, this is fine.)

**Verify**: `node --check electron/ignore-manager.js` → exit 0.

### Step 2: Use it in `isPathExcludedByDefaults`

Replace the per-call construction (lines 90-99) with:

```js
if (ignoreMode === 'global' && globalModeExclusionFilter) {
  if (globalModeExclusionFilter.ignores(relativePath)) {
    return true;
  }
}
```

(Keep the emptiness guard implicitly via the `null` check; keep the original comment about emptiness on the new constant if it aids clarity.)

**Verify**: `node --check electron/ignore-manager.js` → exit 0; `grep -n "ignore().add" electron/ignore-manager.js` shows only the module-level constructions (systemDefaultFilter + globalModeExclusionFilter).

### Step 3: Behavior-equivalence test

In `electron/__tests__/` (extend an existing ignore-manager test file if plan 002 created one, else create `ignore-manager.test.ts`):
- Build the expected behavior WITHOUT the helper: construct `ignore().add(GlobalModeExclusion)` locally in the test and compare its `ignores()` verdicts against `isPathExcludedByDefaults` (exported? check the module exports — it is exported per the audit) for a representative set of paths: a GlobalModeExclusion pattern match (e.g. `build/` if present in the list — READ the list in `excluded-files.js` first and pick real patterns), a non-match, and a path that only DEFAULT_PATTERNS would match (verify the mode-specific behavior: global mode uses defaults + global exclusions).
- Assert the two verdicts agree on all fixtures.

**Verify**: `npm test` → all pass.

### Step 4: Sanity check

`npm run typecheck` → exit 0. If a large folder is handy, run a global-mode scan before/after with a `console.time` around the scan (temporary) to confirm the improvement — optional but nice for the report.

**Verify**: typecheck passes; measurement recorded if taken.

## Test plan

- Step 3 equivalence test is the regression gate.
- `npm test` (all of the 002 suite) → pass.

## Done criteria

All must hold:

- [ ] `npm test` exits 0 with the equivalence test
- [ ] `npm run typecheck` exits 0; `node --check` passes
- [ ] No `ignore().add(...)` remains inside `isPathExcludedByDefaults`
- [ ] `git diff` touches only `electron/ignore-manager.js` and the test file
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `GlobalModeExclusion` is mutated at runtime after module load (it should be a static array — check `excluded-files.js`; if anything pushes into it dynamically, the precompile is unsafe — STOP).
- The equivalence test finds a discrepancy (it should not — same patterns, same library) — STOP and report rather than adjusting the test to pass.

## Maintenance notes

- If `GlobalModeExclusion` ever becomes user-configurable, the precompiled instance must be rebuilt on change — the constant is the single place to revisit.
- `createGlobalIgnoreFilter` (scan path) still compiles its own instance per scan — that is correct (it includes customIgnores); do not merge it with this one.
- This is one of the three per-scan cost fixes (with 023 and 027); the three are independent and can land in any order.
