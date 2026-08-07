# Plan 008: Restore the selected task type on launch

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/App.tsx src/components/TaskTypeSelector.tsx src/components/CustomTaskTypeModal.tsx` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The selected task type (None/Feature/Refactor/Question/Debug or a custom type) resets to "None" on every app launch, and worse, the saved value is destroyed: the persist effect writes the fresh `''` over the previously stored value on first mount. The restore line was deliberately removed (`App.tsx:83` comment: "Removed this line"), and `clearSavedState` even preserves the key (`App.tsx:214-219`) — but nothing ever reads it back. Users lose their task type preference every session, and the persisted-state contract is write-only. This plan restores the value (validated against known ids) and re-enables the read.

## Current state

- `src/App.tsx:83`:
  ```ts
  // const savedTaskType = localStorage.getItem(STORAGE_KEYS.TASK_TYPE); // Removed this line
  ```
- `src/App.tsx:174`:
  ```ts
  const [selectedTaskType, setSelectedTaskType] = useState('');
  ```
- `src/App.tsx:330-333` persist effect:
  ```ts
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TASK_TYPE, selectedTaskType);
  }, [selectedTaskType]);
  ```
  → on first mount, writes `''` over the stored value.
- Task type ids come from `TaskTypeSelector.tsx` (defaults: None/Feature/Refactor/Question/Debug + custom types from localStorage via `CustomTaskTypeModal`). Check the exact default ids in `TaskTypeSelector.tsx` before writing the validator. The valid set is: the built-in ids plus the custom task types stored under the task-types key used by `TaskTypeSelector`/`CustomTaskTypeModal` (find the key name in those files).
- `App.tsx:205-208` — `selectedModelId` shows the existing lazy-init pattern (reads localStorage in a `useState` initializer).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `src/App.tsx` — restore the read (lines 83, 174), validate the value, keep the persist effect
- If `TaskTypeSelector.tsx` needs no changes, do not touch it; if the id set is not exported from it, add a minimal export of the built-in ids OR validate by string-nonempty + length cap (see Step 1 decision)

**Out of scope** (do NOT touch):
- `CustomTaskTypeModal.tsx` behavior
- The task-type prompt content
- `clearSavedState` (already preserves the key)

## Git workflow

- Branch: `advisor/008-restore-task-type`.
- Commit: `fix: restore selected task type on launch`.
- Do NOT push.

## Steps

### Step 1: Determine the valid id set

Read `src/components/TaskTypeSelector.tsx` and `src/components/CustomTaskTypeModal.tsx`. Find: the built-in task type ids, and the localStorage key + shape used for custom task types. Decide:
- If the built-ins are a constant you can import/export cleanly, validate against it.
- If validation against the full set is awkward, validate conservatively: restore only if the stored value is a non-empty string and (if the built-ins are known) matches a built-in id or is present in the custom types array. Anything else → `''`.

**Verify**: you can name the exact default ids (from the files) in your completion report.

### Step 2: Restore the read

At `App.tsx:174`, replace with:

```ts
const [selectedTaskType, setSelectedTaskType] = useState(() => {
  const saved = localStorage.getItem(STORAGE_KEYS.TASK_TYPE);
  return isValidTaskType(saved) ? saved : '';
});
```

where `isValidTaskType` is the validation from Step 1 (implement it inline or as a small helper near the top of App.tsx — inline is fine for this plan). Remove the stale comment at `App.tsx:83` (or restore a real `savedTaskType` read if the initializer uses it — pick one pattern; the lazy initializer is preferred, matching `selectedModelId`).

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 3: Manual verification

Launch the app (dev: `npm run dev` + `npm run dev:electron`, or built), select a task type (e.g. Refactor), close and relaunch — the selector must show the previously selected type, and `localStorage['pastemax-selected-task-type']` (or the key named in `STORAGE_KEYS.TASK_TYPE` — check the constant's value at App.tsx:62) must still hold the value after relaunch (previously it was overwritten with `''`).

**Verify**: relaunch shows the task type preserved; the storage key holds the id.

## Test plan

- If plan 002's suite exists: add a small unit test if the validation helper is extracted to `src/utils` — otherwise the manual verification is the check (the behavior lives in a component initializer, which is out of test scope until component testing exists).
- Run `npm test` regardless to confirm no regressions.

## Done criteria

All must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 (if suite exists)
- [ ] Launch → select task type → relaunch → selection restored; storage key not overwritten with `''`
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The task-type storage key turns out to be shared with another feature (check `STORAGE_KEYS` and TaskTypeSelector's custom-types key) — STOP and report the collision.
- The custom task types are stored in a shape that makes validation impossible without parsing JSON in the initializer — that is fine (use `safeParseJSON` from plan 007 if available); only STOP if the parse is in a hot path (it is not).

## Maintenance notes

- If a future plan makes task types a proper settings object, this restore logic moves with it.
- `clearSavedState` intentionally preserves this key — the restored read now makes that preservation meaningful; do not change `clearSavedState`.
- Watch `TaskTypeSelector`'s "None" semantics: restoring a custom type id whose definition was deleted (custom types removed) should fall back to `''` — the validator in Step 1 handles that if it checks the custom list; if not, note it in the completion report.
