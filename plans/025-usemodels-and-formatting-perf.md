# Plan 025: Fix useModels refetch-on-select and move large content formatting off the UI thread

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/hooks/useModels.ts src/App.tsx src/utils/modelUtils.ts` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M (the worker extraction is the M part; the hook fix alone is S — do the hook fix first, then the worker, and STOP at the worker if it proves invasive)
- **Risk**: LOW (behavior-preserving; the worker extraction is additive)
- **Depends on**: 002 (suite exists; token-format helpers are characterized there)
- **Category**: perf
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

Two avoidable recomputations hurt interaction smoothness:

1. **`useModels` re-fetches on every model selection**: the load effect (`useModels.ts:20-47`) lists `selectedModelId` in its deps (line 47) purely for the `if (!selectedModelId)` auto-select guard. Every dropdown selection re-runs `fetchModels()` — after the first load this hits the 1h localStorage cache (`modelUtils.ts:11`), but it still re-renders the whole dropdown list, and once the cache expires it fires a real OpenRouter IPC fetch mid-interaction ("Loading models..." flash, list re-sort).
2. **Megabyte-scale string formatting on the UI thread**: the debounced effect at `App.tsx:1137-1175` runs `formatBaseFileContent` — string concatenation of ALL selected file contents (potentially megabytes) — synchronously in the renderer on every selection/sort/option change, before the token-count IPC. On large selections this blocks frames.

## Current state

- `src/hooks/useModels.ts:20-47` — see above; `refreshModels` (lines 50-77) is the intended manual reload path.
- `src/App.tsx:1137-1175` — the `updateBaseContent` debounced effect (300ms) computing `formatBaseFileContent({...})` and then invoking `get-token-count` via IPC with the full string.
- `src/utils/contentFormatUtils.ts` — `formatBaseFileContent`, `assembleCopyContent` (post-plan-004), `getLanguageFromFilename` from `languageUtils.ts`, `generateAsciiFileTree` from `pathUtils.ts` — all pure functions, worker-compatible.
- `src/utils/modelUtils.ts` — `fetchModels` with localStorage cache (keys `llm-models-cache` / `llm-models-fetch-time`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 (worker bundling) |

## Scope

**In scope**:
- `src/hooks/useModels.ts` — effect deps fix
- `src/App.tsx` — formatting moved off the main thread (worker) OR deferred; token-count IPC moved to consume the worker result

**Out of scope** (do NOT touch):
- `modelUtils.ts` cache design (fine as is)
- The token-count IPC in the main process
- Plan 023/026 (other perf items)

## Git workflow

- Branch: `advisor/025-usemodels-formatting-perf`.
- Commits: `fix: useModels loads models once`, then `perf: format copy content in a worker`.
- Do NOT push.

## Steps

### Step 1: Fix the useModels effect

Change the effect to run once on mount only:

```ts
useEffect(() => {
  let cancelled = false;
  const loadModels = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedModels = await fetchModels();
      if (cancelled) return;
      if (fetchedModels && fetchedModels.length > 0) {
        setModels(fetchedModels);
        setSelectedModelId((current) => current || fetchedModels[0].id);
      } else {
        setError('Failed to load models');
      }
    } catch (err) {
      if (cancelled) return;
      setError('Error loading models');
      console.error('Error loading models:', err);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  };
  loadModels();
  return () => { cancelled = true; };
}, []);
```

Note the functional `setSelectedModelId((current) => current || ...)` — no dependency on the current value, so the effect can be `[]`. `refreshModels` stays as the manual reload (it already handles the stale-selection case at lines 65-67).

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0. Manual: select models repeatedly — no re-fetch (check the network/IPC log; the model dropdown never flashes "Loading").

### Step 2: Move formatting into a Web Worker

Create `src/utils/formatWorker.ts`:

```ts
/// <reference lib="webworker" />
import { formatBaseFileContent } from './contentFormatUtils';

self.onmessage = (e: MessageEvent) => {
  const { id, params } = e.data;
  try {
    const content = formatBaseFileContent(params);
    (self as unknown as Worker).postMessage({ id, content });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
```

In `src/App.tsx`, create the worker once (module-level or `useMemo`): `new Worker(new URL('./utils/formatWorker.ts', import.meta.url), { type: 'module' })` — Vite supports this pattern natively (worker bundling). Then the `updateBaseContent` effect (1137-1175) becomes: post `{ id, params }` to the worker; on message, `setCachedBaseContentString(content)` and invoke `get-token-count` with the result. Handle worker errors by falling back to synchronous formatting (the old path) so a worker failure never breaks copy. Clean up on unmount (`worker.terminate()`).

**Verify**: `npm run build` → exit 0 (worker bundles); `npm run typecheck` → exit 0. Manual: select a large set of files — the UI thread no longer blocks during the 300ms debounce window (check with the performance panel; the main-thread task should be small).

### Step 3: Tests

- The worker's core (`formatBaseFileContent`) is already characterized by plan 002 — no new unit tests needed for the logic.
- If the worker plumbing is extractable into a hook (`useFormatWorker`), keep it minimal; no test required beyond typecheck + manual.

### Step 4: Manual verification

1. Model dropdown: click through models — no loading flash, list stays put.
2. Large selection (or the whole repo): select all → UI stays responsive (60fps during the debounce); token count updates as before; copy produces identical content (paste and diff against the pre-change output for a small selection).
3. Copy still works if you can force a worker error (temporarily break the worker import — do NOT ship that; just confirm the fallback path exists by code review).

**Verify**: scenarios 1-2 pass; fallback path exists in code.

## Test plan

- 002 suite: `npm test` → all pass (formatting logic unchanged; only its execution context moved).
- Manual scenarios are the gate for the worker plumbing.

## Done criteria

All must hold:

- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all exit 0
- [ ] `useModels` effect deps are `[]` (or the cancelled/functional-update pattern); selecting models never re-fetches
- [ ] Formatting runs in the worker; token-count IPC consumes the worker result; sync fallback exists
- [ ] Manual scenarios 1-2 verified
- [ ] `git diff` touches only the in-scope files (+ the new worker file)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Vite's worker bundling fails for this project setup (worker + `base: './'` + the `build.js` path-fixer — verify the built `dist/assets/` contains the worker chunk and the packaged app loads it; if the worker cannot be made to work in the PACKAGED app, revert to the synchronous path and ship Step 1 only, reporting the worker as blocked).
- The worker result ordering races with rapid selection changes (out-of-order responses) — add a monotonically increasing id and ignore stale responses (that is the designed pattern; only STOP if the race persists despite it).
- `formatBaseFileContent` turns out to use something worker-incompatible (it doesn't — pure functions; only STOP if a dependency was added since).

## Maintenance notes

- The worker imports `contentFormatUtils` → `languageUtils`/`pathUtils` — keep those modules free of DOM/window references (the 002 characterization tests enforce this indirectly).
- The `get-token-count` IPC now receives the worker-produced string — same payload as before, so main-process caching is unaffected.
- If a future feature formats on every keystroke (live preview), the worker is the seam.
- Plan 029 (App.tsx decomposition) should extract the worker lifecycle into the `useCopyPipeline` hook — note the handoff.
