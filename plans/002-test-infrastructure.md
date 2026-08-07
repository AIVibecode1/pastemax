# Plan 002: Add vitest test infrastructure and characterization tests for the core pipeline

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- package.json src/utils/contentFormatUtils.ts src/utils/pathUtils.ts src/App.tsx src/hooks/useIgnorePatterns.ts` — if any of these changed since the baseline commit, compare the excerpts below against live code before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001 (baseline commit for drift check)
- **Category**: tests
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The repo has zero automated tests: no test script in `package.json`, no framework, no `*.test.*` files. The only artifact is `scripts/test-file-watcher.js`, a manual smoke script with no assertions (it tells a human to watch the console). The most dangerous untested logic is the copy-formatting pipeline — and it has already drifted once: `formatContentForCopying` in `src/utils/contentFormatUtils.ts:110-200` is a dead twin of the live `formatBaseFileContent`, with different behavior (instructions first vs. none). Every subsequent plan in this series (004, 006, 009, 023-030) changes behavior or refactors; without characterization tests, executors cannot prove their change is the only one.

## Current state

- `package.json` scripts (lines 5-33): dev/build/package/lint/format only. No `test` script.
- `package.json` devDependencies (lines 115-136): no vitest/jest/playwright/testing-library.
- Key untested modules:
  - `src/utils/contentFormatUtils.ts` — `formatBaseFileContent` (lines 35-103, live, no user-instructions section), `formatUserInstructionsBlock` (105-108), `formatContentForCopying` (110-200, dead twin, instructions-first).
  - `src/utils/pathUtils.ts` — `normalizePath`, `arePathsEqual`, `isSubPath`, `generateAsciiFileTree` (WSL/UNC handling lives here).
  - `src/App.tsx:953-959` — `getSelectedFilesContent` composes `cachedBaseContentString + '\n\n' + formatUserInstructionsBlock(userInstructions)` (instructions LAST).
  - `src/hooks/useIgnorePatterns.ts` — ignore-mode/customIgnores state + localStorage sync.
  - `electron/utils.js` — `normalizePath`, `isWSLPath`, `safeRelativePath` (CommonJS; testable with vitest `environment: 'node'`).
- `src/main.tsx` imports ~27 CSS files; App uses `window.electron` guarded by `isElectron` (App.tsx:90) — component tests would need that guarded or stubbed; keep this plan to pure-function tests (utils + electron modules), which need no DOM.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` | exit 0 (node_modules absent at planning time) |
| Add vitest | `npm install -D vitest` | exit 0 |
| Test | `npm test` | all tests pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**:
- `package.json` (add `test` script + vitest devDependency)
- `vitest.config.ts` (create, at repo root)
- `src/utils/__tests__/contentFormatUtils.test.ts` (create)
- `src/utils/__tests__/pathUtils.test.ts` (create)
- `electron/__tests__/utils.test.ts` (create — tests `electron/utils.js`)
- `src/hooks/__tests__/useIgnorePatterns.test.ts` (create; optional if hook testing proves awkward — see STOP conditions)

**Out of scope** (do NOT touch):
- Any behavior change to the functions under test — these are characterization tests; they pin CURRENT behavior exactly.
- `src/App.tsx`, components, `electron/main.js`, `electron/file-processor.js`.
- Adding test frameworks beyond vitest (no jsdom/testing-library in this plan — no component tests yet).

## Git workflow

- Branch: `advisor/002-test-infra` (or the repo's convention if one appears after 001).
- Commit per logical unit (config, then test files); messages follow the baseline style (`test: ...`, `chore: ...`).
- Do NOT push.

## Steps

### Step 1: Install vitest and add the test script

`npm install -D vitest` (latest 3.x). Add to `package.json` scripts: `"test": "vitest run"`.

**Verify**: `npm test` → exits 0 with "No test files found" (that is the expected first run).

### Step 2: Create `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'electron/__tests__/**/*.test.ts'],
  },
});
```

`electron/__tests__/*.test.ts` files may use `require` via `createRequire` or plain `.js` imports — vitest handles CommonJS with `environment: 'node'`.

**Verify**: `npm test` → exits 0 (still no files).

### Step 3: Characterization tests for `src/utils/pathUtils.ts`

Read `src/utils/pathUtils.ts` first. Test (model after the module's exports):
- `normalizePath`: Windows backslashes → forward slashes; WSL UNC `\\wsl.localhost\Ubuntu\foo` → `//wsl.localhost/Ubuntu/foo`; already-normalized paths unchanged.
- `arePathsEqual` (or equivalent): case-insensitivity behavior exactly as implemented; WSL vs non-WSL paths.
- `isSubPath`: parent/child/self/sibling cases; trailing-slash handling as implemented.
- `generateAsciiFileTree`: empty selection; nested directories; the exact tree string for a small fixture (pin current output — if it changes later, that is a behavior change someone must justify).

**Verify**: `npm test` → all pass; each test asserts real values (no `expect(true)`).

### Step 4: Characterization tests for `src/utils/contentFormatUtils.ts`

Test `formatBaseFileContent` and `formatUserInstructionsBlock` with a small `FileData` fixture (use the shape from `src/types/FileTypes.ts`):
- No selection → `''`.
- Single text file → contains `File: <path>`, the language fence from `getLanguageFromFilename`, the content, and the `<file_contents>` open/close tags.
- `includeFileTree: true` → `<file_map>` section present with the tree.
- `includeBinaryPaths: true` with a binary file → `<binary_files>` section.
- Sort orders: `name-asc`, `tokens-desc`, `size-asc` — pin the current ordering behavior.
- `formatUserInstructionsBlock('' )` → `''`; with text → `<user_instructions>` block.

Do NOT test `formatContentForCopying` (the dead twin — plan 004 deletes it).

**Verify**: `npm test` → all pass.

### Step 5: Characterization tests for `electron/utils.js`

Test via a `.test.ts` in `electron/__tests__/` that requires `../utils.js` (CommonJS):
- `normalizePath` (win32-style input even on non-win32 — the function's `process.platform === 'win32'` branch needs a platform note: on a non-Windows runner the UNC branch is skipped; if you cannot run on Windows, assert only the non-platform-dependent behavior and note the gap in a comment).
- `isWSLPath` with `//wsl.localhost/...` and `//wsl$/...` inputs — pin CURRENT behavior (this includes the known bug that plan 009 fixes; the test must assert current behavior so 009 can flip it).
- `safeRelativePath`, `safePathJoin`, `ensureAbsolutePath` — basic cases.

**Verify**: `npm test` → all pass.

### Step 6 (optional): `useIgnorePatterns` hook tests

If the hook's `window.electron` dependency (see `src/hooks/useIgnorePatterns.ts`) makes testing awkward without jsdom, SKIP this step and note it in the plan status — do not add jsdom in this plan.

## Test plan

- New files: the three/four test files above; pattern to follow: vitest's plain `describe/it/expect` — no existing test to model after (this plan establishes the pattern).
- Tests are characterization-only: they must pass against the CURRENT code with no code changes.

## Done criteria

All must hold:

- [ ] `npm test` exits 0 with the new test files running (vitest prints the file list)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `git status` shows only: `package.json`, `package-lock.json`, `vitest.config.ts`, and files under `src/utils/__tests__/`, `electron/__tests__/` (and `src/hooks/__tests__/` if step 6 done)
- [ ] No file outside the in-scope list was modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any test requires changing a function's behavior to pass — characterization tests pin current behavior; if current behavior is obviously broken (e.g. a function throws on valid input), write the test to document that (assert the throw) and note it.
- `npm install` fails on this machine (Windows + npm; try `npm install --no-audit --no-fund` once).
- The baseline SHA drift check shows in-scope files already modified — reconcile with the reviewer.

## Maintenance notes

- Future plans extend these suites; when 004 changes the copy composition, the `getSelectedFilesContent` behavior moves into a testable function — 004's executor will add tests there.
- Plan 009 flips `isWSLPath` behavior: the characterization test written here for its current (broken) behavior must be updated in 009.
- When component tests are ever added, a jsdom environment + `window.electron` stub will be needed — deliberately out of scope here.
