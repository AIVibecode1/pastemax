# Plan 015: Unify the IPC channel whitelist and delete the un-whitelisted compat shim

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/preload.js src/App.tsx src/hooks/useIgnorePatterns.ts src/global.d.ts` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW (additive; the app itself must keep working — verify every migrated call site)
- **Depends on**: 013 (listener map must land first — both rewrite `electron/preload.js`)
- **Category**: security
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The preload exposes a backward-compat `ipcRenderer` object whose `send(channel, data)` (preload.js:76-80) passes ANY channel with no whitelist — and the renderer uses it as its PRIMARY IPC surface (`src/App.tsx` and `src/hooks/useIgnorePatterns.ts` call `window.electron.ipcRenderer.*` everywhere, including channels the "safe" whitelisted wrappers don't even cover: `clear-main-cache`, `set-ignore-mode`, `initial-update-status`, `ignore-mode-updated`). The whitelists on the safe wrappers are therefore a dead letter: any script executing in the renderer (XSS, compromised dependency, future navigation gap) can reach every current and future `ipcMain` channel with zero review point. This plan makes the whitelist real: one shared list applied to ALL exposed methods, the renderer migrated onto the safe API, and the compat shim deleted.

## Current state

- `electron/preload.js` structure:
  - safe `send` (lines 44-57): whitelist `['open-folder','request-file-list','debug-file-selection','cancel-directory-loading']`
  - safe `receive` (lines 58-74): whitelist `['folder-selected','file-list-data','file-processing-status','startup-mode','file-added','file-updated','file-removed']` — uses `removeAllListeners` (exclusive owner; see 013)
  - safe `checkForUpdates` (line 43): invoke wrapper for `check-for-updates`
  - compat `ipcRenderer` object (lines 76-124): `send` NO whitelist; `on` NO whitelist; `removeListener` partial whitelist (fixed in 013); `invoke` whitelist `['get-ignore-patterns','check-for-updates','get-token-count','fetch-models']`
- Renderer call sites to migrate (grep to confirm the full list):
  - `src/App.tsx:243-244` (`cancel-directory-loading` send), `:427` (request-file-list send), `:677-678` (set-ignore-mode + clear-ignore-cache sends), `:705` (open-folder send), `:1225-1228` (initial-update-status on/removeListener), `:1247` (check-for-updates invoke), `:1152` (get-token-count invoke), `:1188-1191` (get-token-count invoke), `:641-654` (folder-selected/file-list-data/file-processing-status/ignore-mode-updated on/removeListener), `:817-823` (file-added/file-updated/file-removed on/removeListener)
  - `src/hooks/useIgnorePatterns.ts:63,112,141` (get-ignore-patterns invoke / set-ignore-mode send — read the file for exact channels)
  - `src/hooks/useModels.ts` → `fetchModels` in `src/utils/modelUtils.ts` (get-ignore... no — `fetch-models` invoke lives in modelUtils; grep it)
- `src/global.d.ts:12-15` — the `window.electron` type declaration (typed `any` IPC); update it to the safe API shape.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/preload.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |
| Manual | dev launch + full feature pass | every IPC feature works (Step 4) |

## Scope

**In scope**:
- `electron/preload.js`
- `src/global.d.ts`
- `src/App.tsx`, `src/hooks/useIgnorePatterns.ts`, `src/utils/modelUtils.ts` (call-site migration)

**Out of scope** (do NOT touch):
- `electron/main.js` handler logic (channel names stay identical)
- The `receive()` exclusive-owner semantics (from 013 — keep)
- Any new channel beyond the ones already used

## Git workflow

- Branch: `advisor/015-ipc-whitelist`.
- Commits: `security: unify IPC whitelist in preload`, then `refactor: migrate renderer to whitelisted IPC API`, then `chore: remove compat ipcRenderer shim`.
- Do NOT push.

## Steps

### Step 1: Define one shared whitelist in `preload.js`

```js
const IPC = {
  SEND: ['open-folder', 'request-file-list', 'debug-file-selection', 'cancel-directory-loading', 'set-ignore-mode', 'clear-ignore-cache', 'clear-main-cache'],
  RECEIVE: ['folder-selected', 'file-list-data', 'file-processing-status', 'startup-mode', 'file-added', 'file-updated', 'file-removed', 'initial-update-status', 'ignore-mode-updated'],
  INVOKE: ['check-for-updates', 'get-ignore-patterns', 'get-token-count', 'fetch-models'],
};
```

(Confirm the exact set by grepping every `window.electron.ipcRenderer.*` call in `src/` — the lists above are from the audit; the executor must verify against live call sites and extend if any channel is missing.)

Apply it to the safe wrappers AND to the compat wrappers (so the shim is bounded while it still exists). The compat `invoke` whitelist is replaced by `IPC.INVOKE`.

**Verify**: `node --check electron/preload.js` → exit 0.

### Step 2: Extend the safe bridge to cover everything the renderer needs

The safe object currently has `checkForUpdates`, `send`, `receive`. Add:
- `invoke(channel, data)` — whitelisted by `IPC.INVOKE`
- `on(channel, func)` / `off(channel, func)` — whitelisted by `IPC.RECEIVE`, using the 013 wrapper Map semantics (add/remove pairs; do NOT use `removeAllListeners` here — that stays `receive`'s exclusive-owner behavior)

Keep `receive` as-is (exclusive owner). The result: `window.electron.send/receive/invoke/on/off/checkForUpdates`, all whitelisted.

**Verify**: `node --check electron/preload.js` → exit 0.

### Step 3: Migrate the renderer call sites

Replace every `window.electron.ipcRenderer.send('X', ...)` → `window.electron.send('X', ...)`; `.on('X', fn)` → `window.electron.on('X', fn)`; `.removeListener('X', fn)` → `window.electron.off('X', fn)`; `.invoke('X', ...)` → `window.electron.invoke('X', ...)`. Use sed-like mechanical replacement per file, then review each site:
- `src/App.tsx` (all sites listed above)
- `src/hooks/useIgnorePatterns.ts`
- `src/utils/modelUtils.ts` (fetch-models)
- Any other file grep finds

Update `src/global.d.ts` to declare the safe API with typed channels (at minimum: `send(channel: string, data?: unknown): void; receive(channel: string, fn: (...args: any[]) => void): void; on/off/invoke: ...` — match the actual preload surface; keep the declaration honest about the whitelist by using the union types if convenient, else `string`).

**Verify**: `grep -rn "ipcRenderer" src/` → NO matches; `npm run typecheck` → exit 0.

### Step 4: Delete the compat shim

Remove the whole `ipcRenderer: {...}` object from the preload expose (lines 76-124). The whitelists for compat paths die with it (their `IPC.*` constants remain for the safe wrappers).

**Verify**: `node --check electron/preload.js` → exit 0; `grep -n "compat" electron/preload.js` → no matches (or the name is gone).

### Step 5: Full feature pass (manual)

Launch the app (dev) and exercise EVERY IPC feature:
1. Open folder → file list loads (request-file-list + file-list-data)
2. Escape during load → cancel works (cancel-directory-loading)
3. Model dropdown → models load (fetch-models)
4. Select files → token count updates (get-token-count)
5. Update check button → modal opens (check-for-updates + initial-update-status)
6. Ignore modal → toggle mode, close → mode applied (get-ignore-patterns, set-ignore-mode, ignore-mode-updated, clear-ignore-cache)
7. File watcher: create/edit/delete a file in the folder → tree updates (file-added/file-updated/file-removed)
8. Clear data (if the button exists) → clear-main-cache works

**Verify**: all 8 scenarios work; devtools console shows no `Unhandled IPC` warnings (the compat `invoke` warn at preload.js:121 is gone with the shim — any remaining warn means a missed channel).

## Test plan

- No unit tests (preload needs Electron); the manual pass is the gate.
- `npm test` (002 suite) must pass — no shared modules change.

## Done criteria

All must hold:

- [ ] `node --check electron/preload.js` exits 0
- [ ] `npm run typecheck` exits 0; `npm run lint` exits 0; `npm test` exits 0
- [ ] `grep -rn "ipcRenderer" src/` returns no matches
- [ ] Every channel used by the renderer is in one of the three `IPC.*` lists (verified by grep)
- [ ] All 8 manual scenarios pass
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Grep finds a renderer channel NOT in the audit's lists (e.g. `clear-ignore-cache` is used from somewhere unexpected) — add it to the right list; that is the plan working as intended, not a stop. STOP only if a channel has NO corresponding `ipcMain` handler (then the renderer call is dead — report it).
- Migrating a call site changes behavior (e.g. `receive`'s `removeAllListeners` wipes a sibling listener) — STOP and report; the `on/off` pair is the safe migration path and should be used everywhere `receive` is not already in use.
- `global.d.ts` typing fights the migration (typed as `any` today) — keep the declaration permissive-but-honest; do not fight the type system beyond a reasonable attempt.

## Maintenance notes

- Future IPC channels MUST be added to `electron/preload.js` `IPC.*` lists AND `main.js` handlers together — add a comment at the top of `preload.js` stating this contract.
- Plan 013's `compatListenerWrappers` Map is deleted with the shim; the `on/off` safe wrappers should reuse the same Map pattern (or a fresh one) — keep one Map, one ownership model.
- The `receive` exclusive-owner semantics are now the documented exception; new components must use `on/off`.
- This plan closes the loop on SEC-01: after it lands, the only IPC surface is the whitelisted bridge. SEC-02 (navigation) and SEC-04 (folder consent) remain as defense-in-depth layers.
