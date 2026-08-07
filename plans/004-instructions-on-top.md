# Plan 004: Put user instructions on top of copied content and delete the drifted twin formatter

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/App.tsx src/utils/contentFormatUtils.ts src/utils/__tests__/contentFormatUtils.test.ts` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 002 (characterization tests for `contentFormatUtils` must exist first)
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

This is the app's core output: the text users paste into an LLM. The CHANGELOG entry for v1.1.1 (line 18-19) says: "Moved user_instructions to be on top of copied content: Moved to top of text for better LLM attention, based on research papers on long context prompts." But the shipped code still appends instructions at the END. The instructions-first change was made only to `formatContentForCopying` — a function nobody imports. So the release note describes behavior that never shipped, and every user copy puts the instructions (the part that most shapes the LLM's response) at the end of a possibly megabytes-long prompt, where long-context research says it gets the least attention. This plan ships the intended behavior and removes the drifted twin that caused the confusion.

## Current state

- `src/App.tsx:953-959` — `getSelectedFilesContent()`:
  ```ts
  const getSelectedFilesContent = () => {
    return (
      cachedBaseContentString +
      (cachedBaseContentString && userInstructions.trim() ? '\n\n' : '') +
      formatUserInstructionsBlock(userInstructions)
    );
  };
  ```
  (instructions LAST). The stale comment above it (lines 943-947) says "This text will be appended at the end of all copied content".
- `src/utils/contentFormatUtils.ts`:
  - `formatBaseFileContent` (lines 35-103) — live; builds `<file_map>` + `<file_contents>`; no instructions section.
  - `formatUserInstructionsBlock` (lines 105-108) — live; wraps text in `<user_instructions>` tags; returns `''` for empty input.
  - `formatContentForCopying` (lines 110-200) — DEAD (grep across `src/` shows zero imports; the only import line is `src/App.tsx:43` which imports only `formatBaseFileContent, formatUserInstructionsBlock`). It is a drifted twin that puts instructions FIRST (line 147-150).
- Token counting (`src/App.tsx:1177-1207`) computes base tokens + instruction tokens separately and sums them — reordering does not affect counts.
- Characterization tests from plan 002 cover `formatBaseFileContent` and `formatUserInstructionsBlock` (current behavior).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `npm test` | all pass (before + after) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**:
- `src/utils/contentFormatUtils.ts` — add `assembleCopyContent`; delete `formatContentForCopying`
- `src/App.tsx` — use `assembleCopyContent` in `getSelectedFilesContent`; update the stale comment (lines 943-947)
- `src/utils/__tests__/contentFormatUtils.test.ts` — add tests for `assembleCopyContent`

**Out of scope** (do NOT touch):
- `formatBaseFileContent` / `formatUserInstructionsBlock` behavior (they stay exactly as they are)
- The token-count effects in App.tsx
- The dead-code deletions listed in plan 029 (only the formatter twin is deleted here)

## Git workflow

- Branch: `advisor/004-instructions-on-top`.
- Commits: `refactor: extract assembleCopyContent`, then `fix: put user instructions at the top of copied content`, then `chore: remove dead formatContentForCopying` (or one combined commit; keep the diff reviewable).
- Do NOT push.

## Steps

### Step 1: Add `assembleCopyContent` to `contentFormatUtils.ts`

Add below `formatUserInstructionsBlock`:

```ts
/**
 * Assembles the final content for copying.
 * User instructions come FIRST (top of prompt) for better LLM attention,
 * then the base content (file map + file contents).
 * @returns {string} instructions block + base content, separated by a blank line
 */
export const assembleCopyContent = (
  baseContent: string,
  userInstructions: string
): string => {
  const instructionsBlock = formatUserInstructionsBlock(userInstructions);
  if (!instructionsBlock) return baseContent;
  return baseContent ? `${instructionsBlock}\n\n${baseContent}` : instructionsBlock;
};
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Delete the dead twin `formatContentForCopying`

Delete lines 110-200 of `contentFormatUtils.ts` (the whole `formatContentForCopying` export). Confirm first with `grep -rn "formatContentForCopying" src/` that the only matches are `contentFormatUtils.ts` itself.

**Verify**: `grep -rn "formatContentForCopying" src/` → no matches; `npm run typecheck` → exit 0.

### Step 3: Use it in `App.tsx`

Replace the body of `getSelectedFilesContent` (App.tsx:953-959) with:

```ts
const getSelectedFilesContent = () => {
  return assembleCopyContent(cachedBaseContentString, userInstructions);
};
```

Update the import at `App.tsx:43` to include `assembleCopyContent`. Replace the stale comment block (App.tsx:943-947) with one stating instructions are placed FIRST, per the v1.1.1 changelog intent.

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 4: Tests

In `src/utils/__tests__/contentFormatUtils.test.ts` add cases for `assembleCopyContent`:
- empty base + empty instructions → `''`
- empty instructions + base → base unchanged
- instructions + base → `<user_instructions>` block first, blank line, then base
- instructions only → just the block
- whitespace-only instructions → treated as empty

**Verify**: `npm test` → all pass, including the new cases.

### Step 5: Manual smoke (optional but recommended)

If an Electron dev environment is available: select files, add instructions, click copy, paste into a text editor — instructions block must appear before `<file_map>`/`<file_contents>`.

## Test plan

- New tests for `assembleCopyContent` (Step 4); existing characterization tests must still pass unchanged (they test functions whose behavior did not change).
- Regression check: the copied-output shape (tags, spacing) other than the instructions position is unchanged — the characterization tests pin this.

## Done criteria

All must hold:

- [ ] `npm test` exits 0 with the new `assembleCopyContent` cases
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -rn "formatContentForCopying" src/` returns no matches
- [ ] `git diff` touches only: `src/App.tsx`, `src/utils/contentFormatUtils.ts`, `src/utils/__tests__/contentFormatUtils.test.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `formatContentForCopying` turns out to be imported somewhere (grep disagrees with this plan) — STOP; the migration surface is larger than planned.
- The token-count effect (`App.tsx:1177-1207`) appears to depend on content ordering — it does not today; if you find otherwise, STOP.
- Plan 002's characterization test for the live pipeline asserts instructions-last composition — it should not (002 tests the two functions, not the composition); if it does, update it in this plan and say so.

## Maintenance notes

- Plan 029 extracts the copy pipeline into a hook; `assembleCopyContent` is the seam it will use — keep it exported from `contentFormatUtils.ts`.
- Any future change to prompt structure (tag names, ordering) should be made in `contentFormatUtils.ts` with tests, never inline in App.tsx.
- The CHANGELOG entry for v1.1.1 becomes true after this lands — no changelog edit needed, but a future release note can reference it.
