# Plan 017: Harden the production Content-Security-Policy

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- electron/main.js index.html` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: MED (a too-strict CSP can break the built app — the verification steps exist to catch that before shipping)
- **Depends on**: none
- **Category**: security
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The CSP header set in `main.js:524-526` includes `script-src 'self' 'unsafe-inline'` — which nullifies the policy for scripts: any injected `<script>` or inline handler executes anyway. The app is a file viewer whose entire purpose is displaying user-chosen file content; React escaping is the current protection (no `dangerouslySetInnerHTML` sinks found in the audit), and the CSP is supposed to be the last line of defense behind it. The policy also ships `connect-src` wildcards (`http://localhost:* ws://localhost:*`) that production doesn't need, and the app loads over `file://` where Electron grants more privileges than a browser (per Electron's security tutorial). This plan tightens the production policy to what the built app actually needs, while keeping dev working.

## Current state

- `electron/main.js:520-529`:
  ```js
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:* ws://localhost:* https://openrouter.ai/*; object-src 'none';",
        ],
      },
    });
  });
  ```
- The renderer never fetches directly: `fetch-models` and `check-for-updates` go through IPC to the main process (node-fetch/https). So `connect-src` needs only what the RENDERER itself connects to — which is nothing in production except possibly nothing at all; dev needs `http://localhost:*` and `ws://localhost:*` for HMR.
- Fonts: `style-src` allows `https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com` — grep `src/` for Google Fonts imports before deciding whether to keep them (if no font/link tags exist, drop the external font sources).
- The build: `vite build` produces `dist/` with hashed, external scripts (`<script type="module" crossorigin src="/assets/index-*.js">`). Verify there are no inline scripts in the built `index.html` (the executor MUST check before removing `'unsafe-inline'`). Note `electron/build.js` post-processes `dist/index.html` (it "fixes resource paths") — re-verify AFTER that script runs (i.e. check the final `dist/index.html` used by the packaged app).
- Dev mode: Vite dev server injects inline scripts for HMR — the dev CSP must keep `'unsafe-inline'` (or omit the header in dev).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `npm run build` | exit 0 |
| Inspect | `grep -o '<script[^>]*>' dist/index.html` | only `src=` scripts, no inline bodies |
| Run | `npm start` (after build) | app loads with no console CSP errors |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**:
- `electron/main.js` — the CSP header logic (split by dev/prod)

**Out of scope** (do NOT touch):
- The `file://` → custom-protocol migration (Electron docs recommend it, but it is a larger change touching `main.js` loading + `build.js` + packaging; noted in maintenance notes)
- `index.html` content
- Preload/IPC (015)

## Git workflow

- Branch: `advisor/017-csp-hardening`.
- Commit: `security: strict production CSP, permissive dev CSP`.
- Do NOT push.

## Steps

### Step 1: Verify the built HTML has no inline scripts

Run `npm run build`, then inspect `dist/index.html`: `grep -c "<script" dist/index.html` and read the script tags. Confirm every `<script>` has a `src` attribute and no inline body. Also run the electron build post-process if `electron/build.js` modifies index.html (`npm run build:electron` runs vite + the fixer — check `scripts/` or `electron/build.js` for what it does; if it injects anything inline, STOP).

**Verify**: no inline script bodies in the final `dist/index.html`.

### Step 2: Split the CSP by environment

Replace the single header with environment-dependent values:

```js
const isDev = process.env.NODE_ENV === 'development';
const csp = isDev
  ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none';"
  : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
```

Notes:
- Production keeps `style-src 'unsafe-inline'` ONLY if the app injects inline styles (React inline `style={}` props do NOT need it — they are not blocked by CSP; `<style>` tags DO). Check `dist/index.html` for `<style>` tags and grep `src/` for `createElement('style'`/`<style>` usage; drop `'unsafe-inline'` from style-src too if there are none (preferred).
- `connect-src 'self'` in production: if the renderer makes zero direct network calls (verify: grep `fetch(` and `XMLHttpRequest` and `WebSocket` in `src/`), `'self'` is enough. If the audit missed a renderer-side fetch, add the specific origin.
- Drop `https://openrouter.ai/*` from connect-src (renderer doesn't fetch it directly — verify first).
- `base-uri 'none'; frame-src 'none'; form-action 'none'` are additive hardening.

**Verify**: `node --check electron/main.js` → exit 0.

### Step 3: Build and run with the strict policy

`npm run build` + `npm start`. Open devtools console: zero CSP violations. Exercise: load a folder, select files, copy, open the model dropdown, open update modal, toggle ignore mode — all work.

**Verify**: no `Refused to ... violates the following Content Security Policy` console errors; all features work.

### Step 4: Dev mode still works

`npm run dev` + `npm run dev:electron`: HMR works, no CSP errors in the devtools console.

**Verify**: dev server loads, hot reload functions.

## Test plan

- No unit tests; the build-run checks are the gate.
- `npm test` → all pass.

## Done criteria

All must hold:

- [ ] `npm run build` exits 0; `dist/index.html` has no inline scripts/styles (per Step 1/2 findings)
- [ ] Production launch shows zero CSP violations in devtools
- [ ] All core features work under the strict policy (Step 3 list)
- [ ] Dev mode HMR unaffected
- [ ] `git diff` touches only `electron/main.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The built `index.html` contains inline scripts (Vite plugin or the build fixer injects them) — STOP and report; removing `'unsafe-inline'` is not possible until that's resolved.
- A feature breaks under the strict policy and the fix requires adding a broad source (e.g. `'unsafe-eval'`, `https://*`) — STOP and report the tradeoff rather than shipping a permissive policy.
- `electron/build.js` post-processing turns out to inject inline content — STOP.

## Maintenance notes

- The proper long-term fix for `file://` privileges is a custom `app://` protocol (`protocol.handle`) serving `dist/` — Electron docs recommend it; out of scope here, but note it for the maintainer.
- Every future renderer-side network call must be added to `connect-src` explicitly — add a comment next to the CSP string stating this.
- If Google Fonts are truly used (Step 2 check), the production policy must keep `https://fonts.googleapis.com` / `https://fonts.gstatic.com` — the split above drops them; only drop if verified unused.
