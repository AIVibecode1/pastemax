# Plan 007: Safe localStorage reads and writes (no white-screen on corrupt data)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/App.tsx src/utils src/__tests__` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (002 useful but not required)
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

One corrupt localStorage value makes the whole app unstartable. `App.tsx:148-150` runs `JSON.parse(savedFiles)` unguarded in the `selectedFiles` state initializer: if `pastemax-selected-files` is truncated or invalid (e.g. from a crash mid-write), `JSON.parse` throws during the first render, and since there is no error boundary anywhere in `src/`, the app white-screens with no recovery path — the user must know to clear storage manually. Meanwhile the workspaces initializer (`App.tsx:106-132`) already does this correctly (try/catch + Array.isArray + reset). This plan generalizes the good pattern and also guards the ~15 unguarded `localStorage.setItem` persist effects (quota errors currently propagate into React effect exceptions).

## Current state

- `src/App.tsx:148-150`:
  ```ts
  const [selectedFiles, setSelectedFiles] = useState(
    (savedFiles ? JSON.parse(savedFiles).map(normalizePath) : []) as string[]
  );
  ```
- `src/App.tsx:79-84` — raw `localStorage.getItem` reads for 4 keys at component top.
- `src/App.tsx:297-333` — persist effects: `localStorage.setItem(...)` without try/catch for selected-folder, selected-files, sort-order, search-term, ignore-mode, include-binary-paths, task-type. (~8 more sites later in the file, e.g. `:1019,1077,1093,1118,1132,1307,1368,1447,1492,1595-1609`; several run inside `setState` updater functions, e.g. `:1365-1371`, which must stay pure — moving them out of updaters is part of this plan.)
- The good pattern to copy: `App.tsx:106-132` (workspaces init).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `src/utils/storage.ts` (create) — `safeParseJSON<T>`, `safeGetItem`, `safeSetItem`, `safeRemoveItem`
- `src/App.tsx` — use the helpers for the state initializers and persist effects; move `setItem` calls out of `setState` updaters
- `src/utils/__tests__/storage.test.ts` (create) — unit tests

**Out of scope** (do NOT touch):
- The copy-history quota behavior (plan 014 handles it — do not change the history logic here; just wrap its `setItem` in the safe helper so a quota error cannot crash, and leave the messaging to 014)
- `useIgnorePatterns.ts` localStorage handling (plan 030 touches that file; wrap only if trivial — otherwise leave)
- Workspaces/copy-history parse logic (already guarded — leave as is)

## Git workflow

- Branch: `advisor/007-safe-storage`.
- Commits: `feat: add safe storage helpers`, then `fix: guard localStorage reads/writes in App`.
- Do NOT push.

## Steps

### Step 1: Create `src/utils/storage.ts`

```ts
/** Parse JSON safely; returns fallback on invalid input or non-matching shape. */
export function safeParseJSON<T>(raw: string | null, fallback: T, validate?: (v: unknown) => v is T): T {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === 'string');

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[storage] Failed to persist '${key}':`, err);
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[storage] Failed to remove '${key}':`, err);
  }
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Guard the `selectedFiles` initializer

Replace `App.tsx:148-150` with:

```ts
const [selectedFiles, setSelectedFiles] = useState<string[]>(() => {
  const saved = safeGetItem(STORAGE_KEYS.SELECTED_FILES);
  const parsed = safeParseJSON<string[]>(saved, [], isStringArray);
  return parsed.map(normalizePath);
});
```

Also convert the raw reads at `App.tsx:79-84` to `safeGetItem` (they feed other initializers — keep their semantics identical).

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 3: Guard the persist effects

Wrap every `localStorage.setItem` in the persist effects (App.tsx:297-333 and the ~10 later sites) with `safeSetItem`, and `removeItem` with `safeRemoveItem`. For `setItem` calls currently INSIDE `setState` updater functions (e.g. `:1365-1371`): move the `safeSetItem` call out of the updater into the enclosing effect body or after the `setState` call, so updaters stay pure. (Read each site before moving; if a site's updater is the only place the new value is known, compute the value before `setState` and use it in both places.)

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0; `grep -n "localStorage.setItem" src/App.tsx` shows only calls inside the new helpers or `src/utils/storage.ts` — i.e. no raw `localStorage.setItem` remains in App.tsx.

### Step 4: Tests

`src/utils/__tests__/storage.test.ts`:
- `safeParseJSON`: valid JSON of right shape; invalid JSON → fallback; wrong shape (object for string[] with validator) → fallback; null → fallback.
- `safeGetItem`/`safeSetItem`/`safeRemoveItem`: happy path with a stubbed localStorage (jsdom-free: use vitest `vi.stubGlobal('localStorage', fakeStorage)` with a minimal in-memory map implementing getItem/setItem/removeItem); `safeSetItem` returns false and warns when `setItem` throws (stub that throws).

**Verify**: `npm test` → all pass.

## Test plan

- New file `src/utils/__tests__/storage.test.ts` per Step 4.
- Manual sanity (optional): corrupt `pastemax-selected-files` in devtools (`localStorage.setItem('pastemax-selected-files', '{broken')`), reload — app must start with empty selection instead of white-screening.

## Done criteria

All must hold:

- [ ] `npm test` exits 0 with the new storage tests
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "localStorage\." src/App.tsx` shows only `safeGetItem`/`safeSetItem`/`safeRemoveItem` calls (no raw `localStorage.` API use)
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any persist-effect rewrite changes WHEN a value is written (e.g. moving out of an updater changes write timing in a way that breaks a feature) — the writes must stay on the same state transitions as today; if one cannot, revert that site and note it.
- `safeGetItem` swallowing storage-access exceptions hides a real problem in dev — acceptable; warn-level logs remain.

## Maintenance notes

- Plan 014 (copy history) builds on these helpers — coordinate so both don't rewrite the same lines; if 014 lands first, this plan's Step 3 skips the history site.
- Any future persisted state must use these helpers; add a note to `src/styles/README.md`? No — add it to `src/utils/README.md` if one exists, else skip (docs are out of scope).
- localStorage is also written from `useIgnorePatterns.ts` and `useModels.ts` (model cache keys) — plan 030/025 cover those; this plan's helper can be adopted there later.
