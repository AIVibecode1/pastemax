# Plan 022: Prune dead and at-risk runtime dependencies (gpt-3-encoder, lodash, node-fetch)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- package.json package-lock.json electron/dev.js electron/watcher.js electron/main.js electron/fix-dependencies.js scripts/fix-dependencies.js src/global.d.ts` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED (token-count behavior must be re-tested after the dev.js change; the fetch swap is behavior-identical for the single GET)
- **Depends on**: none (do NOT run concurrently with 010 — both touch `electron/main.js`'s fetch; sequence after 010 if both in flight)
- **Category**: deps
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

Three dependencies ship in every production build (via `files: ["node_modules/**/*"]` + `asarUnpack`) with little or no runtime value:

1. **`gpt-3-encoder`** (package.json:139, asarUnpack:106): a GPT-2/3-era tokenizer imported NOWHERE in runtime code — only in the dev-entry smoke test (`electron/dev.js:6`) and a type shim (`src/global.d.ts:38`). It is dead weight in the manifest, in `asarUnpack`, and force-installed by `scripts/fix-dependencies.js` (lines 16, 64, 82 per the audit). Actual token counting uses `tiktoken` (o200k_base) in `electron/file-processor.js`.
2. **`lodash`** (package.json:141): used for exactly one function — `const { debounce } = require('lodash')` at `electron/watcher.js:2`. npm audit flags lodash 4.17.21 HIGH (GHSA-r5fr-rjxr-66jc `_.template` code injection; GHSA-f23m-r3pf-42rh prototype pollution) with NO patched version (4.17.21 is the final release) — so the advisory can only be cleared by removing the dependency.
3. **`node-fetch` v2** (package.json:142): used only at `electron/main.js:474` (the OpenRouter models fetch). Last release 2.7.0 ~3 years ago; maintenance rating "Inactive" per Snyk (verified 2026-08-07; npm versions tab shows 2.7.0 as the final 2.x release). Electron 40+ ships Node with a stable built-in `fetch` — the dependency is unnecessary.

## Current state

- `electron/dev.js:1-11` — the dependency smoke test requires `ignore`, `tiktoken`, `gpt-3-encoder`.
- `electron/watcher.js:2` — `const { debounce } = require('lodash');` — find its usages in the file (debounced watcher events, likely 1-2 call sites).
- `electron/main.js:472-508` — `const fetch = require('node-fetch');` (line 474) then `fetch('https://openrouter.ai/api/v1/models')`.
- `scripts/fix-dependencies.js` — references `gpt-3-encoder` at ~lines 16, 64, 82 (read the file; it force-installs/verifies deps).
- `src/global.d.ts:38` — a `gpt-3-encoder` type shim (read it; remove if it exists solely for that module).
- `package.json:103-108` — `asarUnpack` lists `node_modules/gpt-3-encoder/**` (also `ignore`, `tiktoken`, `chokidar` — keep those).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Uninstall | `npm uninstall gpt-3-encoder lodash node-fetch` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |
| Dev check | `node electron/dev.js` (aborts early if it works) | see Step 2 |
| Audit | `npm audit` | lodash + gpt-3-encoder items gone |

## Scope

**In scope**:
- `package.json` + `package-lock.json` (remove the three deps + the gpt-3-encoder asarUnpack entry)
- `electron/dev.js` (drop the gpt-3-encoder probe line)
- `electron/watcher.js` (replace lodash debounce with a local implementation)
- `electron/main.js` (swap node-fetch for global fetch — coordinate with 010)
- `scripts/fix-dependencies.js` (remove gpt-3-encoder references)
- `src/global.d.ts` (remove the gpt-3-encoder shim if present)

**Out of scope** (do NOT touch):
- `tiktoken`, `ignore`, `chokidar`, `p-queue`, `semver` (all used)
- The `asarUnpack` entries for `ignore`/`tiktoken`/`chokidar` (keep)

## Git workflow

- Branch: `advisor/022-prune-dead-deps`.
- Commits: `deps: remove gpt-3-encoder (unused)`, `deps: replace lodash debounce with local util`, `deps: use built-in fetch instead of node-fetch`.
- Do NOT push.

## Steps

### Step 1: Remove the dependencies

`npm uninstall gpt-3-encoder lodash node-fetch`. Also remove the `node_modules/gpt-3-encoder/**` line from `package.json` `build.asarUnpack` (lines 103-108).

**Verify**: `grep -n "gpt-3-encoder\|lodash\|node-fetch" package.json` → no matches (outside nothing); `npm ls gpt-3-encoder lodash node-fetch` → "empty" (exit code 1 with EMPTY output is the expected npm ls result for absent packages — that is fine).

### Step 2: Update `electron/dev.js`

Remove the `require('gpt-3-encoder');` line (dev.js:6). Keep `ignore` and `tiktoken` probes.

**Verify**: `node --check electron/dev.js` → exit 0. Note: `node electron/dev.js` will try to start the dev servers — do NOT run it fully; the check is syntax-only. The smoke test's real purpose (fail fast on missing deps) is preserved for the two remaining deps.

### Step 3: Replace lodash debounce in `watcher.js`

Read `electron/watcher.js` — find the `debounce` usage(s). Add a small local debounce (or import from a shared spot; `electron/utils.js` is the natural home):

```js
// electron/utils.js
function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, waitMs);
  };
}
```

Export it; in `watcher.js`, replace `const { debounce } = require('lodash');` with a require from `./utils.js` and adjust call sites if the lodash API shape differs (lodash debounce also supports leading/trailing options — check whether the watcher uses any options; if it does, preserve the behavior with the local implementation or note the difference).

**Verify**: `node --check electron/watcher.js` → exit 0; `grep -rn "lodash" electron/ src/ scripts/` → no matches.

### Step 4: Swap node-fetch for global fetch in `main.js`

At `electron/main.js:472-508`: remove `const fetch = require('node-fetch');` and rely on the global `fetch` (Electron 40's Node has it). If plan 010 already replaced this call with an AbortController version, this step is just deleting the require line. Keep the timeout behavior from 010 if present.

**Verify**: `node --check electron/main.js` → exit 0; `grep -rn "node-fetch" electron/ src/ scripts/ package.json` → no matches.

### Step 5: Update `fix-dependencies.js` and `global.d.ts`

Read `scripts/fix-dependencies.js` — remove the gpt-3-encoder entries (lines ~16, 64, 82 — adapt to the actual file). Read `src/global.d.ts:38` — remove the gpt-3-encoder shim if it exists solely for that module.

**Verify**: `grep -rn "gpt-3-encoder" . --include="*.js" --include="*.ts" --include="*.json" --include="*.tsx" -l` (excluding node_modules, package-lock.json residual) → no matches in source files; `npm run typecheck` → exit 0.

### Step 6: Full verification

`npm install` (to sync the lockfile cleanly), `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Then launch the app and verify: file scan + token counts work (tiktoken path), model dropdown loads (fetch swap), watcher still debounces file changes.

**Verify**: all commands exit 0; the three manual checks pass; `npm audit` no longer lists lodash/gpt-3-encoder.

## Test plan

- 002 suite: `npm test` — all pass (no shared module changes).
- If a watcher test exists in the 002 suite, it covers the debounce swap; otherwise manual: create/edit/delete files in the watched folder and confirm the tree updates (debounced as before).

## Done criteria

All must hold:

- [ ] `npm ls gpt-3-encoder lodash node-fetch` shows none installed
- [ ] `grep -rn "lodash\|node-fetch\|gpt-3-encoder" electron/ src/ scripts/ package.json` → no matches
- [ ] `node --check` passes on the changed electron files
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all exit 0
- [ ] Manual: scan + tokens + models + watcher all work
- [ ] `npm audit` no longer lists the lodash/gpt-3-encoder items
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `electron/watcher.js` uses lodash debounce with options (leading/trailing/maxWait) that the local implementation cannot replicate — STOP and report; do not ship a behavior change to watcher debouncing.
- `global.d.ts` shim is load-bearing for tiktoken types too — read it first; if removing the gpt-3-encoder portion breaks the tiktoken typing, keep the file and remove only the gpt-3-encoder part.
- The token-count IPC fails after the dev.js change (unlikely — dev.js only probes loadability) — STOP and report.

## Maintenance notes

- The gpt-3-encoder abandonment claim (GitHub repo `latitudegames/GPT-3-Encoder`, no maintenance activity) was marked unverified in the audit (npm page unreachable) — the removal doesn't depend on it: the dependency is unused regardless of its maintenance status.
- After this plan, the runtime dependency set is: chokidar, ignore, lucide-react, p-queue, react, react-dom, semver, tiktoken — all used.
- Plan 010's timeout work on the models fetch must land with or before this plan's fetch swap (sequence: 010 first) so the AbortController logic isn't lost in the swap.
