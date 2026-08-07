# Plan 016: Navigation handlers — deny everything except http(s) links opened externally

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/main.js` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

Both navigation guards are inverted. `will-navigate` (main.js:549-556) calls `preventDefault` ONLY when the URL starts with `http:`/`https:` — so `file:`, `data:`, `about:` and custom-scheme navigations pass through unblocked. `setWindowOpenHandler` (main.js:559-565) returns `{ action: 'allow' }` for every scheme EXCEPT http(s) — meaning a compromised or injected renderer script can `window.open('file:///C:/...')` and get a NEW BrowserWindow that inherits the parent's `webPreferences`, including the preload (main.js:533-545). Attacker-chosen local HTML then runs with the full IPC bridge (arbitrary folder reads — see SEC-04/plan 018). The intent is clearly "external links open in the default browser; nothing else navigates" — the code implements the opposite for non-http schemes.

## Current state

- `electron/main.js:549-556`:
  ```js
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (mainWindow.webContents.getURL() !== url) {
        event.preventDefault();
        shell.openExternal(url);
      }
    }
  });
  ```
- `electron/main.js:559-565`:
  ```js
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  ```
- Context: the app loads via `loadFile` (production) / `loadURL` (dev) from the main process — those do NOT fire `will-navigate` (it only fires for renderer-initiated navigations: link clicks, `window.location`, `window.open`). The `getURL() !== url` guard in the current code appears intended to avoid blocking the initial load; it is unnecessary but harmless to keep for http(s).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check electron/main.js` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Manual | dev launch, click external links | opens in default browser; file:/data: blocked (Step 3) |

## Scope

**In scope**:
- `electron/main.js` — the two handlers only

**Out of scope** (do NOT touch):
- CSP (plan 017), preload (015), folder consent (018) — related but separate plans
- `shell.openExternal` usage elsewhere

## Git workflow

- Branch: `advisor/016-navigation-deny-by-default`.
- Commit: `security: deny all renderer navigation except http(s) via external browser`.
- Do NOT push.

## Steps

### Step 1: Deny-by-default in `setWindowOpenHandler`

```js
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('https:') || url.startsWith('http:')) {
    shell.openExternal(url);
  }
  // Everything else (file:, data:, about:, custom schemes): deny silently.
  return { action: 'deny' };
});
```

**Verify**: `node --check electron/main.js` → exit 0.

### Step 2: Deny-by-default in `will-navigate`

```js
mainWindow.webContents.on('will-navigate', (event, url) => {
  // Renderer-initiated navigations: allow nothing in-app. http(s) opens externally.
  if (url.startsWith('https:') || url.startsWith('http:')) {
    if (mainWindow.webContents.getURL() !== url) {
      event.preventDefault();
      shell.openExternal(url);
    }
    return;
  }
  // file:, data:, about:, devtools:, custom schemes — block.
  event.preventDefault();
});
```

Note: keep the `getURL() !== url` guard for http(s) (it prevents a loop when the external URL equals the current one). If dev mode needs HMR reloads (`window.location.reload()` — which fires will-navigate with the dev server URL), verify Step 3: the reload URL is `http://localhost:5173/` — the guard `getURL() !== url` allows it if the current URL equals it; if reloads break, special-case `process.env.NODE_ENV === 'development'` to allow same-origin `http://localhost:*` navigations — choose the minimal exception and document it.

**Verify**: `node --check electron/main.js` → exit 0.

### Step 3: Manual verification

Dev launch:
1. Click a normal external link (release-notes button, GitHub links) → opens in the default browser, app window unchanged.
2. In the devtools console run `window.open('file:///C:/Windows/win.ini')` → the attempt is denied (no new window opens; check for a console message or just observe no window appears).
3. `window.location.href = 'file:///C:/Windows/win.ini'` → blocked (app stays on its page).
4. If dev HMR/reload broke (Step 2 note), verify `Ctrl+R` and automatic HMR still work in dev.

**Verify**: scenarios 1-3 behave as specified; scenario 4 noted.

## Test plan

- No unit tests (Electron lifecycle); the manual scenarios are the gate.
- `npm test` → all pass (002 suite; nothing shared changes).

## Done criteria

All must hold:

- [ ] `node --check electron/main.js` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] Both handlers return/act deny-by-default; http(s) → `shell.openExternal`
- [ ] Manual scenarios 1-3 verified (4 documented if applicable)
- [ ] `git diff` touches only `electron/main.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A legitimate in-app navigation exists that this breaks (e.g. the app navigates to a local help page, or dev HMR cannot be preserved with the documented exception) — STOP and report the case; do not silently allow a scheme.
- `window.open` is used by the app itself anywhere (grep `window.open` in `src/`) — if so, STOP; the handler change would break it.

## Maintenance notes

- After this plan, the only remaining renderer-compromise escalation paths are CSP weaknesses (017) and the unvalidated folder-scan surface (018) — both planned.
- If the app ever ships an in-app webview or help window, it must use a separate `BrowserWindow` with its OWN webPreferences (no preload) — note this in review.
- The `will-navigate` http(s) guard's `getURL()` comparison is the one subtle piece a reviewer should scrutinize.
