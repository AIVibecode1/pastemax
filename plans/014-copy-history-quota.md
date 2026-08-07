# Plan 014: Copy history must not fail the copy or lie about it (quota handling)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/App.tsx src/utils` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none (007's `safeSetItem` helps; if 007 landed, use it — otherwise inline try/catch)
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

Every copy stores the ENTIRE formatted prompt (potentially megabytes) into `pastemax-copy-history` (capped at 20 items) inside the same try/catch as the clipboard write. When localStorage quota is exceeded (5MB default), `setItem` throws `QuotaExceededError` — and the catch at `App.tsx:1545-1548` reports "Failed to copy to clipboard" even though the clipboard write ALREADY SUCCEEDED. The user sees a lie, the 2-second status reset is skipped, and every subsequent copy keeps failing the same way (the oversized entry never gets stored, but the throw happens every time). The history feature is meant to be a convenience; it must never break the primary action.

## Current state

- `src/App.tsx:1527-1548` (approximately — read the exact region):
  ```ts
  try {
    await navigator.clipboard.writeText(content);
    // ... history persistence in the same try:
    //   setCopyHistory(prev => { ...; localStorage.setItem(STORAGE_KEYS.COPY_HISTORY, JSON.stringify(...)); return ...; })
    setCopyStatus(...success...);
  } catch (error) {
    setCopyStatus('Failed to copy to clipboard');   // ← fires on quota errors too
  }
  ```
- The history write runs inside a `setState` updater (per the audit: `App.tsx:1531-1539`), which also means a throw inside the updater can break the state update itself.
- The parse side is already guarded (`App.tsx:192-202` — try/catch around `JSON.parse` of history).
- Plan 007 introduces `safeSetItem`/`safeParseJSON` — use them if present.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `src/App.tsx` — the copy handler (find the exact function; it is the one containing `navigator.clipboard.writeText`)

**Out of scope** (do NOT touch):
- The history MODAL (`CopyHistoryModal.tsx`) rendering
- The history cap of 20 items (keep)
- Workspaces/other persistence (007 covers them)

## Git workflow

- Branch: `advisor/014-copy-history-quota`.
- Commit: `fix: copy succeeds even when history persistence fails`.
- Do NOT push.

## Steps

### Step 1: Split the clipboard write from history persistence

Restructure the copy handler so the two concerns have separate error handling:

```ts
// 1. Clipboard first — the primary action.
try {
  await navigator.clipboard.writeText(content);
} catch (error) {
  setCopyStatus({ type: 'error', message: 'Failed to copy to clipboard' });
  return;
}

// 2. History persistence — best effort, never blocks or lies about the copy.
try {
  const updated = [...copyHistory, newEntry].slice(-20);   // read current state via the functional form carefully
  setCopyHistory(updated);
  localStorage.setItem(STORAGE_KEYS.COPY_HISTORY, JSON.stringify(updated));
} catch (error) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    // Drop oldest entries and retry once; if still over quota, store nothing and warn.
    // (Retry logic: keep dropping the oldest until the write fits or history is empty.)
  } else {
    console.warn('Failed to persist copy history:', error);
  }
  setCopyStatus({ type: 'success', message: 'Copied to clipboard' }); // copy DID succeed
}
```

Important details:
- Move the `setItem` OUT of the `setState` updater (compute the new array before `setState`, then set both) so updaters stay pure and the write is not double-invoked under StrictMode.
- The success status must be set regardless of history outcome (the status text may note history failure separately if you want, but the copy is success).
- Implement the quota retry: on `QuotaExceededError`, drop the oldest entries (slice from the front) until the JSON fits or the list is empty; if the single new entry alone still exceeds quota (huge content), store a TRUNCATED entry (e.g. first 50KB of content with a marker) — or skip storage with a warn; pick one and document it in the code comment.

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 2: Verify the exact current code first

Read the real copy-handler region (search for `clipboard.writeText` in `src/App.tsx`) and adapt Step 1 to the actual variable names and structure (the excerpt above is from the audit, line numbers 1527-1548 — confirm before editing). The `setCopyStatus` shape may differ (string vs object) — match the existing pattern.

**Verify**: you can name the actual function and its current structure in your completion report.

### Step 3: Test

If plan 002's suite exists, add `src/utils/__tests__/` coverage only if you extracted a pure helper (e.g. `trimHistoryToQuota(entries, maxBytes)` — if you implement the truncation, extract it as a pure function in `src/utils/` and unit-test it: over-quota list → oldest dropped; single huge entry → truncated; empty → empty). Otherwise, manual verification below.

**Verify**: `npm test` → all pass.

### Step 4: Manual verification

Dev-mode: select a large folder, select files totaling >4MB (or temporarily lower the quota by filling storage), copy → clipboard must contain the content AND the status must say success; the history modal may show fewer/truncated entries but must not error. Normal small copy → history works as before.

**Verify**: copy succeeds with the message 'Copied' (or equivalent) in both scenarios.

## Test plan

- Pure-helper unit tests if extracted (Step 3).
- Manual quota scenario (Step 4).
- Regression: normal copy flow unchanged.

## Done criteria

All must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] No `localStorage.setItem` for history remains inside a `setState` updater
- [ ] Clipboard failure and history failure have separate handling; quota error cannot produce "Failed to copy"
- [ ] Manual verification recorded
- [ ] `git diff` touches only `src/App.tsx` (+ `src/utils/` + tests if extracted)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The copy handler's status flow is coupled to history in a way the excerpt misrepresents (read it first) — adapt to reality; STOP only if the coupling makes the split impossible without changing UI behavior.
- `navigator.clipboard` is not the actual API used (maybe the app copies via a different path) — STOP and report what you find.

## Maintenance notes

- The 20-item cap plus truncation means history entries may be partial for huge copies — the modal should eventually show a "truncated" marker (follow-up, not in scope).
- If history ever moves to a file via IPC (better for large content), this plan's split is the seam.
- Plan 007's helpers: after both land, the inline try/catch here can be swapped for `safeSetItem` + explicit quota handling — note that `safeSetItem` returns false but does not tell you WHY (quota vs other); keep the DOMException check if you need the drop-oldest retry.
