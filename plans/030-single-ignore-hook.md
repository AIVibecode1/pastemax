# Plan 030: Single useIgnorePatterns instance — remove the dual-instance reload hack

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/App.tsx src/hooks/useIgnorePatterns.ts src/components/IgnoreListModal.tsx` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: MED (ignore filtering correctness depends on this; the reload removal must be replaced with a real re-scan)
- **Depends on**: 002 (suite exists — the hook's transitions should be characterized first; if 002 skipped the hook test, rely on the manual pass)
- **Category**: tech-debt
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

`useIgnorePatterns` is instantiated TWICE: in `App.tsx:135-145` (whose state drives the file-list request payload at App.tsx:423-432 and the `set-ignore-mode` IPC at :677) and again inside `IgnoreListModal.tsx:113-116`. When the user changes the mode or custom ignores in the modal, ONLY the modal's private instance updates (both write localStorage); App's instance stays stale. The app papers over the divergence with a full `window.location.reload()` (App.tsx:680-684) after an 800ms "Applying ignore mode…" toast. It works — until any future change skips or defers the reload, at which point stale ignore settings silently reach the main process. The reload also nukes all in-memory state (selection, expanded nodes, workspace context) as a side effect the user never asked for. The fix: one instance, state passed down, and a targeted re-scan instead of a page reload.

## Current state

- `src/App.tsx:135-145` — `const { isIgnoreViewerOpen, ignorePatterns, ignorePatternsError, handleViewIgnorePatterns, closeIgnoreViewer, ignoreMode, customIgnores, ignoreSettingsModified, resetIgnoreSettingsModified } = useIgnorePatterns(selectedFolder, isElectron);`
- `src/components/IgnoreListModal.tsx:113-116` — `const { ignoreMode, setIgnoreMode, customIgnores, setCustomIgnores } = useIgnorePatterns(selectedFolder, isElectron);` (its own instance)
- `src/App.tsx:665-688` — `handleIgnoreViewerClose(changesMade?)`: closes the viewer; if changes: sets processing status, sends `set-ignore-mode` + `clear-ignore-cache` IPC, then `setTimeout(() => window.location.reload(), 800)`.
- `src/App.tsx:423-432` — the `request-file-list` payload includes `ignoreMode` and `customIgnores` (from App's instance) and `ignoreSettingsModified`.
- The hook (`src/hooks/useIgnorePatterns.ts`, ~185 lines): state + localStorage sync + IPC calls (`get-ignore-patterns` invoke, `set-ignore-mode` send — see plan 015 for the channel migration; coordinate).
- The modal snapshots initial values on open (IgnoreListModal.tsx:118-129) and computes `changesMade` on close (149-158) — that logic stays, but sourced from props instead of a second hook instance.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |
| Manual | ignore-mode flows (Step 4) | all pass |

## Scope

**In scope**:
- `src/App.tsx` — pass ignore state down to the modal; replace the reload with a re-scan
- `src/components/IgnoreListModal.tsx` — accept props instead of calling the hook
- `src/hooks/useIgnorePatterns.ts` — only if a small change is needed (e.g. exposing a refresh callback); prefer no hook change

**Out of scope** (do NOT touch):
- The main-process ignore logic (`ignore-manager.js`)
- The `set-ignore-mode`/`clear-ignore-cache` IPC sequence (keep — it stays correct)
- Plan 015's IPC migration (if it hasn't landed, keep using `window.electron.ipcRenderer.*` as-is; if it HAS landed, use the new API — adapt)

## Git workflow

- Branch: `advisor/030-single-ignore-hook`.
- Commits: `refactor: pass ignore state to IgnoreListModal as props`, then `fix: re-scan instead of full reload after ignore changes`.
- Do NOT push.

## Steps

### Step 1: Pass state down to the modal

In `App.tsx`, extend the `IgnoreListModal` usage (find the render site) to pass:

```tsx
<IgnoreListModal
  isOpen={isIgnoreViewerOpen}
  onClose={handleIgnoreViewerClose}
  patterns={ignorePatterns}
  error={ignorePatternsError}
  selectedFolder={selectedFolder}
  isElectron={isElectron}
  ignoreSettingsModified={ignoreSettingsModified}
  ignoreMode={ignoreMode}
  onIgnoreModeChange={setIgnoreMode}
  customIgnores={customIgnores}
  onCustomIgnoresChange={setCustomIgnores}
/>
```

In `IgnoreListModal.tsx`: remove the `useIgnorePatterns` call (lines 113-116); use the props for state + setters. Keep the snapshot-on-open effect (118-129) and `changesMade` computation (149-158) — they now read from props, which reflect the SHARED instance, so the modal's edits immediately update App's instance (via the setters passed down). Remove the DEBUG logging effect (132-140) if it is pure noise — judge: it logs full pattern JSON on every open; keep only if the maintainer relies on it (note your choice in the report).

**Verify**: `npm run typecheck` && `npm run lint` → pass; `grep -n "useIgnorePatterns" src/components/IgnoreListModal.tsx` → no matches.

### Step 2: Replace the reload with a targeted re-scan

In `handleIgnoreViewerClose` (App.tsx:665-688): keep `closeIgnoreViewer()`, the processing-status message, and the IPC sends (`set-ignore-mode`, `clear-ignore-cache`). Replace the `setTimeout(() => window.location.reload(), 800)` with a re-scan of the current folder using the UPDATED ignore state — the file-list request path already exists (the `request-file-list` payload builder at 423-432 reads `ignoreMode`/`customIgnores` from App's instance, which is now fresh). Trigger it the same way the refresh button does (find the refresh handler — likely increments `reloadTrigger` or re-sends `request-file-list` with `ignoreSettingsModified: true`; reuse that exact mechanism).

Also handle the no-folder edge: if `selectedFolder` is null, skip the re-scan (nothing to scan).

**Verify**: `npm run typecheck` && `npm run lint` → pass; `grep -n "location.reload" src/` → no matches (after this plan, the reload is gone — unless another feature legitimately reloads; verify each match).

### Step 3: Tests

If the 002 suite characterized `useIgnorePatterns` transitions, update/extend those tests for the new prop-based flow (the hook itself is unchanged — only its call sites changed, so hook tests may pass untouched). If the suite skipped hook tests, note that the manual pass is the gate.

**Verify**: `npm test` → all pass.

### Step 4: Manual verification (the critical gate)

1. Load a folder (automatic mode). Open the ignore modal → switch to Global mode → close → **no page reload** (watch the app: no flicker, selection/expanded state intact) → the file list re-scans and the tree reflects global-mode exclusions (node_modules etc. hidden as configured).
2. Add a custom ignore pattern (e.g. `*.log`) in Global mode → close → tree re-scans and `.log` files disappear.
3. Switch back to Automatic → close → `.gitignore`-based filtering returns.
4. Verify `set-ignore-mode`/`clear-ignore-cache` IPC still fire (main-process console logs).
5. Selection survival: select some files BEFORE changing ignore mode → after the change, selection persists (previously the reload wiped it — this is the UX improvement; verify it works).

**Verify**: scenarios 1-5 pass; no reload anywhere.

## Test plan

- Step 3 hook tests (if they exist).
- Step 4 manual scenarios are the gate — especially 1 and 5.

## Done criteria

All must hold:

- [ ] `npm run typecheck`, `npm run lint`, `npm test` all exit 0
- [ ] `grep -n "useIgnorePatterns" src/components/IgnoreListModal.tsx` → no matches
- [ ] `grep -rn "location.reload" src/` → no matches (or every remaining match justified)
- [ ] Manual scenarios 1-5 pass (no reload; ignore changes applied via re-scan; selection survives)
- [ ] `git diff` touches only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Removing the reload breaks mode application (e.g. the main process needs the reload to re-read `.gitignore` files — it does not: `request-file-list` with `ignoreSettingsModified: true` clears the ignore cache on the main side, main.js:344-347 — verify that path exists before relying on it) — if the cache-clear path is missing, STOP and report.
- The modal's `changesMade` computation breaks when sourced from props (snapshot vs live value timing) — the snapshot-on-open effect must capture the values at open; if prop updates during the modal's lifetime break the comparison, STOP and report.
- Plan 015 hasn't landed and the IPC channel names here conflict with its migration — this plan does NOT touch channels; only STOP if a channel used here (`set-ignore-mode`, `clear-ignore-cache`) is absent from the current preload whitelist (it is used today, so it works).

## Maintenance notes

- The 800ms toast timing becomes irrelevant (no reload) — the "Applying ignore mode…" status now transitions into the re-scan's own processing status; verify the UX reads naturally.
- `resetIgnoreSettingsModified` usage (App.tsx:144): with no reload, the flag must be reset after the re-scan completes — check the current reset point and adjust (it may have relied on the reload to reset it implicitly).
- Plan 029's App.tsx decomposition should fold the ignore wiring into a `useIgnoreSettings` hook (or keep it in App) — coordinate; this plan is the prerequisite.
- The DEBUG logging removal decision (Step 1) is a judgment call the maintainer may want to revisit — flag it in the completion report.
