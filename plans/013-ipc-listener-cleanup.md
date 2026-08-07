# Plan 013: Fix IPC listener registration/removal in the preload bridge

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/preload.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none (must land BEFORE plan 015 — both rewrite `electron/preload.js`)
- **Category**: bug
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The preload's listener cleanup is a guaranteed no-op. The compat `removeListener` (preload.js:95-107) constructs a BRAND-NEW wrapper function and passes it to `ipcRenderer.removeListener` — it can never match the wrapper that compat `on` (preload.js:81-94) registered, so removal never happens. Every App.tsx effect cleanup that calls it (`App.tsx:646-654, 819-823, 1226-1228`) silently leaks listeners. In dev, React StrictMode double-mounts components, so every IPC event (`file-list-data`, `file-processing-status`, `file-added`...) is handled TWICE per mount, and HMR remounts accumulate handlers. Additionally, the compat `removeListener` has a channel whitelist that is missing channels the app actually uses (`initial-update-status` at App.tsx:1225-1227, `ignore-mode-updated` at App.tsx:644) — so even a correct removal would be silently refused for those. And the whitelisted `receive()` (preload.js:58-74) uses `removeAllListeners`, which would wipe another component's listeners on the same channel — a latent trap if anyone adopts it.

## Current state

- `electron/preload.js:81-94` (compat `on`):
  ```js
  on: (channel, func) => {
    const wrapper = (event, ...args) => { ... func(...args); };
    ipcRenderer.on(channel, wrapper);
    return wrapper;
  },
  ```
- `electron/preload.js:95-107` (compat `removeListener`):
  ```js
  removeListener: (channel, func) => {
    const validChannels = ['folder-selected', 'file-list-data', 'file-processing-status', 'startup-mode', 'file-added', 'file-updated', 'file-removed'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, (event, ...args) => func(...args)); // NEW wrapper — never matches
    }
  },
  ```
- `electron/preload.js:58-74` (whitelisted `receive`): registers via `ipcRenderer.on(channel, ...)` and calls `ipcRenderer.removeAllListeners(channel)` at registration time — removes ALL listeners including any registered by the compat path.
- Call sites in the renderer all use the compat path (`window.electron.ipcRenderer.on/removeListener`): App.tsx:641-654 (folder-selected, file-list-data, file-processing-status, ignore-mode-updated), :817-823, :1225-1228 (initial-update-status), and useIgnorePatterns.ts (check its channels).
- React StrictMode: `src/main.tsx:71-75` wraps `<App />` in `<React.StrictMode>` — double effect invocation in dev.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/preload.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |
| Manual | dev-mode launch + folder load | no duplicate events (see Step 3) |

## Scope

**In scope**:
- `electron/preload.js` — the compat `on`/`removeListener` pair and the `receive()` contract

**Out of scope** (do NOT touch):
- The channel whitelists for `send`/`invoke` (plan 015 unifies them)
- Renderer call sites (they keep using the compat API — it just starts working)
- `src/main.tsx` StrictMode (keep it; the fix makes StrictMode safe)

## Git workflow

- Branch: `advisor/013-ipc-listener-cleanup`.
- Commit: `fix: preload listener removal actually removes listeners`.
- Do NOT push.

## Steps

### Step 1: Track registered wrappers in a Map

In `preload.js`, add module-level state:

```js
const compatListenerWrappers = new Map(); // channel -> Set<wrapper>
```

In compat `on`, after registering, store the wrapper:

```js
on: (channel, func) => {
  const wrapper = (event, ...args) => { ...existing... };
  ipcRenderer.on(channel, wrapper);
  if (!compatListenerWrappers.has(channel)) compatListenerWrappers.set(channel, new Set());
  compatListenerWrappers.get(channel).add(wrapper);
  return wrapper;
},
```

In compat `removeListener`, use the stored wrapper (and keep the whitelist, EXTENDED with the channels the app actually uses):

```js
removeListener: (channel, func) => {
  const validChannels = [
    'folder-selected', 'file-list-data', 'file-processing-status', 'startup-mode',
    'file-added', 'file-updated', 'file-removed',
    'initial-update-status', 'ignore-mode-updated',
  ];
  if (!validChannels.includes(channel)) return;
  const wrappers = compatListenerWrappers.get(channel);
  if (!wrappers) return;
  // ipcRenderer.removeListener needs the exact wrapper; we cannot reconstruct it from func,
  // so remove all wrappers for this channel when the caller asks to remove one (the renderer
  // registers exactly one listener per channel per component instance).
  for (const wrapper of wrappers) ipcRenderer.removeListener(channel, wrapper);
  compatListenerWrappers.delete(channel);
},
```

Rationale for removing all wrappers per channel: the renderer registers at most one listener per channel per mount (the whitelisted `receive` already assumes single-owner semantics); removing the set is safe and matches the existing "removeAllListeners on register" style of `receive`. If a future renderer needs multiple listeners on one channel, `receive`'s semantics must change — note it in the maintenance notes.

**Verify**: `node --check electron/preload.js` → exit 0.

### Step 2: Make `receive()` ownership explicit

Keep `receive()`'s `removeAllListeners` but add a comment documenting it as exclusive-owner semantics ("only one component may receive this channel; do not mix with compat `on` on the same channel"). Optionally, in dev only, `console.warn` when `receive()` is called for a channel that already has compat wrappers registered. No functional change.

**Verify**: comment + optional warn present; `node --check` passes.

### Step 3: Manual verification (dev)

Run `npm run dev` and `npm run dev:electron`. In the Electron devtools console, add a counter: after loading a folder, `window.electron.ipcRenderer.listenerCount('file-list-data')` — wait, `ipcRenderer` is not directly exposed; instead verify behaviorally: open the devtools console and confirm `file-processing-status` messages appear ONCE per progress tick (before the fix, StrictMode double-registration made each event fire twice). If a second copy of the app/window exists, close it first.

**Verify**: each status event fires once; `npm run lint` → exit 0.

## Test plan

- Unit-testing preload requires an Electron runtime; skip unit tests. Verification is the manual dev check + code review.
- `npm test` → all pass (nothing else changes).

## Done criteria

All must hold:

- [ ] `node --check electron/preload.js` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `compatListenerWrappers` Map exists; `removeListener` uses stored wrappers; whitelist includes `initial-update-status` and `ignore-mode-updated`
- [ ] Manual dev check: single delivery per event
- [ ] `git diff` touches only `electron/preload.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any renderer component registers TWO listeners on the SAME channel in one mount (grep App.tsx and useIgnorePatterns.ts for duplicate `on('channel'` calls) — the "remove all wrappers" approach would then remove a sibling's listener; STOP and report rather than choosing which to keep.
- `receive()` is used anywhere in `src/` today (the audit found none) — if a component adopted it since, reconcile ownership before proceeding.

## Maintenance notes

- Plan 015 builds on this: it migrates renderer call sites to the whitelisted `send/receive` API and deletes the compat shim — after that, `compatListenerWrappers` dies with it. Do not delete it before 015.
- If multiple listeners per channel are ever needed, `receive` must move to add/remove pairs with named registrations; the exclusive-owner comment marks the decision point.
- StrictMode double-mounting is now safe; if duplicate handling is still observed after this plan, the leak is elsewhere (check `main.tsx`'s `beforeunload` handler — plan 028 removes it).
