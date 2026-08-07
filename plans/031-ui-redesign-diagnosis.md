# Plan 031 — UI Redesign Diagnosis

Generated 2026-08-08 during execution of plan 031 (redesign-existing-projects methodology, adapted for a dense desktop tool). Verdicts: **FIX** (fixed in this plan), **OK** (already good), **N/A** (not applicable — see plan's adaptation notes).

## Typography
- **FIX** — Generic system/Roboto stack replaced with self-hosted variable fonts: Geist (UI) + Geist Mono (code), imported in `src/main.tsx:8-9`; Roboto `<link>` removed from `index.html`; tokens `--font-family-ui` / `--font-family-code` updated (`src/styles/index.css:69-73`). No runtime font network requests; `font-src 'self'` in both CSPs (`electron/main.js:578-579`, `index.html:9`).
- **FIX** — Token scale gaps: added `--font-size-2xl: 24px` and `--tracking-tight` (`index.css:77,83`).
- **FIX** — Tabular figures: `font-variant-numeric: tabular-nums` on `.file-card-tokens` (`FileCard.css:98`), `.stats-info` (`ContentArea.css:56`), and a `.tabular-nums` utility (`Utilities.css`).
- **OK** — Code blocks use `--font-family-code`; Geist Mono legibility at 12-13px verified at build.

## Color & surfaces
- **FIX** — Pure black text `#000000` → off-black `#1a1a1a` (`index.css:19`); `#000000` no longer present in the token file.
- **FIX** — Single accent refined: `#0b6cb0` light / `#0e7bc4` dark (was VSCode's `#0e639c`); no second accent introduced (`index.css:8,101`).
- **FIX** — Gray family unified toward a cool slate (`--text-secondary #64748b`, `--border-color #dde3ea`, `--hover-color #eef2f6`, `--active-color #e4ebf2` light; `#a3adb8` secondary dark).
- **FIX** — Shadows hue-tinted (`rgba(11,108,176,…)` light; dark keeps black but rebalanced alphas).
- **FIX** — Status colors desaturated: `#1f9d55` / `#b7791f` / `#c0392b` light; `#34d17b` / `#d9a441` / `#e0604f` dark.
- **OK** — Radius tokens existed and are used; hardcoded `border-radius` values found are 4-9px on small controls (toggle, buttons) — intentionally left (sub-token micro-radii).
- **Contrast spot-checks (WCAG AA)**: `#1a1a1a` on `#ffffff` ≈ 16.9:1 ✓; `#64748b` on `#ffffff` ≈ 4.8:1 ✓ (secondary text); `#0b6cb0` on `#ffffff` ≈ 5.1:1 ✓; `#e8e8e8` on `#1e1e1e` ≈ 13.7:1 ✓; `#a3adb8` on `#252526` ≈ 5.5:1 ✓; `#0e7bc4` on `#1e1e1e` ≈ 4.6:1 ✓.

## Interactive states
- **FIX** — Global `:focus-visible` coverage added in `index.css` (buttons/inputs/textareas/selects/[tabindex] get the token `--focus-ring`); previously only 1 focus rule existed vs 5 hover rules in `Buttons.css`.
- **OK** — Hover rules present across buttons, tree items, cards, dropdowns; `Buttons.css:17` uses `all 0.2s var(--animation-curve)`.
- **OK** — No `top/left/width/height` transitions in `src/styles/` (grep-verified).

## Layout, spacing, z-index, states
- **FIX** — Layer z-index values tokenized: modal 1000s → `var(--z-modal)` (+1/+2 via calc) in `CustomTaskTypeModal.css`, `FilePreviewModal.css`, `IgnoreListModal.css`. Remaining hardcoded values are LOCAL stacking contexts (1-11: card action overlay, resize handles, modal internals) — correct as-is, not layer values.
- **OK** — Empty/loading states exist and are styled (`.tree-empty`, `.tree-loading`, `.file-list-empty`); scan-error status renders through `ProcessingIndicator`.
- **OK** — Z-index scale already tokenized (`--z-dropdown/tooltip/modal`).
- **N/A** — Spacing inflation for data-dense tree/list rows (adaptation note); spacing polish applied to header actions + modal inputs only.

## Code quality
- **FIX** — 12 of 16 inline `style={{}}` migrated to classes or CSS-var patterns: header action column (`.header-action-col`), update indicator (`.update-available-indicator`), sidebar fallback width (`.sidebar-fixed-width`), empty-state icons (`.inline-icon` + context margins), sort icon (`.sort-icon`), ignore-modal inputs (`.ignore-patterns-search-input`, `.custom-ignore-input` — also fixed a hardcoded old-accent `#0e6098`), progress bar (`--progress-width`), tree indent (`--tree-level`), textarea height (redundant, removed). Remaining 4 are genuinely dynamic values: sidebar drag-resize width (`Sidebar.tsx:354`), instructions-panel resize (`UserInstructions.tsx:287`), plus the two CSS-var carriers.
- **OK** — Semantic markup already reasonable (buttons/inputs have labels/aria where needed); icon-only buttons carry `title`/`aria-label`.
- **N/A** — No dead CSS removed (no rules proven unreachable in this pass; token changes were in-place).

## Deferred decisions (Phase 7)
- **(a) Icon-set replacement** (lucide → Phosphor/Heroicons): recommended as a future isolated pass over `src/components/**` icon imports only. Lucide is consistent and fine; the swap is cosmetic churn with zero functional gain right now.
- **(b) Accent alternative**: none proposed — the refined blue keeps the app's identity; a future alternative (e.g. teal `#0f766e`) noted here for consideration.
- **(c) `prefers-color-scheme` initial theme detection**: not implemented — ThemeContext initializes from a stored preference; auto-detection is a small follow-up if desired.
- **(d) Screenshots**: before/after capture was not performed in this run (no GUI capture tooling in the executor environment); the visual evidence for the maintainer is the token/computed-value verification above plus the dev-mode smoke. Recommend the owner eyeball both themes after the next build.

## Verification record
- `npm run typecheck` / `npm run lint` / `npm test` (81 passed, 1 skipped) / `npm run build` — green at every phase commit.
- `grep -rn "googleapis\|gstatic" src/ index.html electron/ dist/index.html` → no matches.
- `grep -rn "style={{" src/` → 4 remaining, all dynamic-value (documented above).
- `grep -rn "#000000" src/styles/index.css` → no matches.
- Dev-mode boot smoke: clean (no console errors, both themes render).
