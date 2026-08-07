# Plan 031: Premium UI redesign (redesign-existing-projects methodology)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- src/styles src/components src/App.tsx src/context/ThemeContext.tsx index.html package.json` — if any of these changed since baseline, compare the excerpts below against live code before proceeding; on mismatch, STOP.
>
> **Suggested executor toolkit**: load the `redesign-existing-projects` skill FIRST (it exists in the executor's skill library) and follow its sequence: Scan → Diagnose → Fix, its Fix Priority order, and its Rules. This plan maps that methodology onto this codebase with the app-specific adaptations in "Adaptation notes".

## Status

- **Priority**: P3
- **Effort**: L (multi-phase visual overhaul; each phase independently verifiable)
- **Risk**: MED (visual-only changes must never break functionality; the skill's "test after every change" rule is enforced per phase below)
- **Depends on**: 002 (recommended — the test suite is the regression net); sequence AFTER the P1 functional/security batch (004-018) and NOT in parallel with 024, 029, 030 (same components/files)
- **Category**: direction (design)
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

PasteMax's interface is a clone of the VSCode Dark+ aesthetic: `--color-primary: #0e639c` (literally VSCode's blue), `#1e1e1e`/`#252526` dark surfaces, system-ui font stack, and Roboto loaded from Google Fonts. For a developer tool whose entire pitch is "make your code look great for LLMs", the interface is the product — and it currently signals "default Electron template" rather than a considered design. The redesign skill's audit categories map cleanly onto this app (typography, color/surfaces, states, layout, code quality), and the app already has the two things that make a redesign low-risk: a CSS-variable design system in `src/styles/index.css` (tokens exist and are used) and a working dark mode (`.dark-mode` class). The work is refinement of tokens and components in place — no stack migration, no functionality changes.

## Current state

- **Design tokens** — `src/styles/index.css:6-94` (light) and `:96+` (dark): full token set exists (colors, spacing, radius sm/md/lg/pill, shadows, z-index scale `--z-dropdown: 100 / --z-tooltip: 500 / --z-modal: 1000`, transitions 150/250/350ms, focus ring `--focus-ring: 0 0 0 2px rgba(14,99,156,0.4)`). Weak points per the skill: `--text-primary: #000000` (pure black), `--color-primary: #0e639c` (VSCode-clone accent), grays are neutral/untinted (`#666666`, `#e0e0e0`, `#f5f5f5` — check warm/cool consistency), shadows are pure-black-at-low-alpha (`rgba(0,0,0,...)`, untinted), `--font-family-ui` is the system stack.
- **Fonts** — `index.html:12-14` loads **Roboto** (weights 300/400/500/700) from Google Fonts; `font-src 'self' https://fonts.gstatic.com` in the CSP meta tag at `index.html:9`. NOTE: there are TWO CSP declarations — the meta tag in index.html AND the header injected in `electron/main.js:520-529` (plan 017 consolidates these; do not change CSP in this plan beyond the font-source coordination in Step 1).
- **Dark mode** — `src/context/ThemeContext.tsx:38-40` toggles `document.body.classList`; `src/components/ThemeToggle.tsx` + `src/styles/header/ThemeToggle.css` render the switch.
- **Inline styles** — 16 `style={{}}` usages across 7 files: `src/App.tsx`, `IgnoreListModal.tsx`, `ModelDropdown.tsx`, `Sidebar.tsx`, `TreeItem.tsx`, `UpdateModal.tsx`, `UserInstructions.tsx` (grep `style={{` to enumerate).
- **CSS structure** — 40+ modular files under `src/styles/` (header/, sidebar/, contentarea/, modals/, base/) all imported globally in `src/main.tsx:10-43`; `src/styles/README.md` documents the modularization convention. `src/styles/backup/` is already deleted by plan 028.
- **Icons** — `lucide-react` (package.json:142) used across components; `ExpandAllIcon`/`CollapseAllIcon` are custom SVG components.
- **Intent docs** — `docs/design.md` (original pixel spec: `#F5F7FA` sidebar, `#2C3E50` text, `#718096` muted — the app has since drifted to the VSCode palette) and `docs/ux-rubric.md` (the owner grades the UI against an A-F rubric on color, layout, typography, hierarchy, accessibility, spacing). The redesign should move the app TOWARD that rubric's A column.
- **Key components** — Sidebar (tree + search + sort/filter buttons), FileList/FileCard (selected files, token counts), CopySettings area, modals (WorkspaceManager, CopyHistory, Update, IgnoreList, FilePreview, CustomTaskType, ConfirmUseFolder), Header (folder path, theme toggle, update button), UserInstructions (resizable panel), ProcessingIndicator.
- **Verification baseline** — `npm run typecheck`, `npm run lint`, `npm test` (after 002), `npm run build` all exist; manual smoke of core flows required per phase.

## Adaptation notes (read before diagnosing — prevents marketing-page mistakes)

This is a DENSE DESKTOP TOOL, not a marketing site. Several skill audit items do not apply and must be marked N/A in the diagnosis rather than "fixed":

- **Do NOT double spacing globally** (skill: "Missing whitespace"). The file tree and file lists are data-dense by design; increase spacing only where it aids scanning (headers, modal padding, card internal rhythm). Whitespace fixes target the header, modals, empty states, and grouping — not the tree rows.
- **Do NOT replace modals with inline panels** (skill: "Modals for everything"). Desktop-app convention; the fix is modal POLISH (consistent padding, header/footer structure, focus handling), not removal.
- **Do NOT add marketing-page patterns** (hero sections, carousels, 3-column feature cards, testimonials, footer link farms): N/A.
- **Do NOT swap the light/dark toggle mechanism** — it works; polish its styling only.
- **Data-heavy numbers need tabular figures**: token counts, file sizes, percentages (`~12,480 tokens`) should render with `font-variant-numeric: tabular-nums` so columns don't jitter — this is a concrete, high-value fix for this app.
- **Code font matters**: the app displays file content in `<pre>` blocks and a monospace tree — the font upgrade must cover BOTH UI and code faces (e.g. Geist + Geist Mono, or Outfit + an existing mono; if a variable font pair is chosen, verify the code blocks at small sizes are legible).
- **Fonts must be SELF-HOSTED** (npm `@fontsource` packages), not CDN: production loads over `file://` and plan 017 tightens `font-src 'self'`. Bundling fonts via `@fontsource-variable/...` keeps CSP strict. Check `package.json` before adding any package (skill rule).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |
| Font dep | `npm install @fontsource-variable/<font>` | exit 0 (only after checking package.json) |

## Scope

**In scope** (visual only):
- `src/styles/**` — token refinement + component CSS
- `index.html` — font link swap (Google Fonts → local imports; the imports themselves live in `src/main.tsx` or `src/styles/index.css` via `@import`? NO — use `import '@fontsource-variable/geist'` in `src/main.tsx` per @fontsource docs, or CSS `@import` — pick the Vite-friendly path)
- `src/main.tsx` — font imports only
- `src/components/**`, `src/App.tsx` — className/token usage, inline-style migration, state markup (loading/empty/error)
- `src/context/ThemeContext.tsx` — ONLY if the theme hook needs a minor addition (e.g. `prefers-color-scheme` initial — judge; keep minimal)
- `plans/031-ui-redesign-diagnosis.md` (create) — the diagnosis artifact (Step 1)
- `plans/assets/` — before/after screenshots (create)

**Out of scope** (do NOT touch):
- Any behavior/functionality change (sorting, copying, scanning, IPC, storage keys)
- CSP declarations (plan 017 owns them; only coordinate the font-src consequence in Step 1's notes)
- The component architecture (plan 029 owns decomposition)
- Icon-set replacement (lucide → Phosphor/Heroicons) — RECOMMENDED as a deferred decision; see Step 7
- `docs/design.md` / `docs/ux-rubric.md` content (report-only)

## Git workflow

- Branch: `advisor/031-ui-redesign`.
- One commit per phase (`style: font and palette foundation`, `style: interactive states`, ...) — each commit independently green (`npm run typecheck && npm run lint && npm test && npm run build`).
- Include the diagnosis doc + screenshots in the first commit.
- Do NOT push.

## Steps

### Step 1: Diagnose (Scan + Diagnose from the skill)

Load the `redesign-existing-projects` skill. Walk its audit categories against the app and produce `plans/031-ui-redesign-diagnosis.md`:
- For EVERY audit bullet, record: `FIX` (present, plan the fix), `OK` (already good), or `N/A` (not applicable to a dense desktop tool — use the adaptation notes).
- Evidence format: bullet + `file:line` (e.g. "Pure black text: `--text-primary: #000000` at `src/styles/index.css:19`").
- Include a current-state inventory: every component's CSS file, the inline-style sites (grep `style={{`), the modal set, the states that exist (ProcessingIndicator, empty tree, error statuses) vs missing (empty-selection getting-started view?).
- Also capture BEFORE screenshots: light + dark mode, main window with a folder loaded, one modal, empty state. Save to `plans/assets/before-*.png`.

**Verify**: the diagnosis file exists, covers all skill categories, and every claim has `file:line` evidence. Commit it.

### Step 2: Font foundation (skill Fix Priority #1 — biggest instant win, lowest risk)

- Add a variable font pair via npm (check `package.json` first): `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` (or Outfit + an existing code face — justify the choice in the commit message; Geist/Geist Mono is the recommended default for a developer tool).
- Import both in `src/main.tsx` (Vite-native path). Remove the Roboto `<link>` from `index.html` (lines 12-14).
- Update tokens: `--font-family-ui` → the new UI font stack (with system fallbacks); `--font-family-code` → the new mono stack. Set `font-variant-numeric: tabular-nums` on token-count/size display elements (FileCard, FileList totals, copy summary).
- Headline presence: audit the header/`h1`-`h3` elements (WorkspaceManager title, modal titles, "Selected Files" heading at App.tsx — find the actual heading elements) — apply the skill's typography guidance (size/weight/letter-spacing) via tokens: add `--font-size-2xl`, `--font-weight-semibold`, and a `--tracking-tight` token if missing.
- Keep font loads 100% local — verify no runtime network fetch (CSP `font-src 'self'` must keep working; check devtools network tab shows fonts from the bundle).

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build` all green; `grep -n "fonts.googleapis" index.html` → no matches; devtools shows no font network requests beyond the local bundle; app renders in both themes.

### Step 3: Color palette cleanup (Fix Priority #2)

Refine the tokens in `src/styles/index.css` (light + dark blocks):
- Replace pure `#000000` text with an off-black (e.g. `#1a1a1a` or a hue-tinted near-black) in light mode; keep dark mode's `#e8e8e8` family but audit its hue consistency.
- Pick ONE accent. The current `#0e639c` (VSCode blue) is the app's identity — decision gate: keep a refined version (desaturated slightly, e.g. a calmer blue) OR propose one alternative accent in the diagnosis and note it in the commit for the maintainer. Do not introduce a second accent anywhere.
- Unify the gray family: tint all grays consistently (warm or cool — choose one; currently they look neutral-mixed). Update `--text-secondary`, `--border-color`, `--hover-color`, `--active-color`, `--background-*` in BOTH themes.
- Tinted shadows: change `--shadow-sm/md/lg` from `rgba(0,0,0,...)` to shadows carrying the surface hue (e.g. a blue-tinted or warm-tinted dark at low alpha).
- Status colors (`--success/warning/error`): desaturate below ~80% saturation; verify contrast on both themes.
- Contrast check: every token pair (text on background, accent on background, focus ring) must pass at least WCAG AA — spot-check the main surfaces; record the contrast ratios you verified in the commit message.

**Verify**: triad + build green; light and dark mode screenshots captured (`plans/assets/after-foundation-*.png`); `grep -n "#000000" src/styles/index.css` → no matches (text usage; `#000` may remain only if justified).

### Step 4: Interactive states (Fix Priority #3)

Audit every interactive element (buttons in `src/styles/base/Buttons.css`, sidebar actions, tree checkboxes, dropdowns, toggle switch, modals' buttons, header buttons, sort dropdown, search bar):
- Hover: background shift or translate/scale present on all.
- Active/pressed: `scale(0.98)` or `translateY(1px)` on press.
- Transitions: 200-300ms on interactive elements (tokens `--transition-fast/normal` already exist — use them consistently; check for elements with zero transition).
- Focus rings: `--focus-ring` applied to ALL keyboard-focusable elements (the token exists; audit coverage — buttons, inputs, tree items, checkboxes, dropdown triggers).
- Remove any transition animating `top/left/width/height`; use `transform`/`opacity` (grep `transition:` in `src/styles/` for offenders).

**Verify**: triad + build green; keyboard-only walkthrough (Tab through the app) shows a visible focus ring on every stop; screenshots of hover/pressed states if feasible.

### Step 5: Layout, spacing, and surface hierarchy (Fix Priority #4 + #6)

- Surfaces: the "generic card look" audit — FileCard, modal bodies, dropdowns. Prefer background-color-only elevation over border+shadow stacks; keep cards only where hierarchy demands (check `FileCard.css`, `ContentArea.css`, `CopySettings.css`).
- Radius hierarchy: tokens exist (sm/md/lg) — verify usage is hierarchical (inner elements tighter, containers softer); fix outliers (grep `border-radius:` for hardcoded values not using tokens).
- Alignment/rhythm: modal headers/footers consistent across the 7 modals; button groups bottom-aligned in cards (FileCard remove buttons); the CopySettings section's controls aligned on one baseline.
- Z-index: already tokenized (`--z-*`) — verify no hardcoded `z-index: 9999`-style values remain (grep `z-index:` in `src/styles/`).
- Empty/loading states (skill #6): the "No Folder Selected" state (Header) and the empty tree — compose a minimal getting-started hint (one sentence + the "Select Folder" action). ProcessingIndicator already exists — polish only. Error states: verify the scan-error status message renders styled (not raw text).

**Verify**: triad + build green; screenshots of the polished states; `grep -rn "z-index: [0-9]" src/styles/ | grep -v "var(--z"` → no matches (hardcoded z-values).

### Step 6: Typography scale and code-quality sweep (Fix Priority #7 + skill Code Quality)

- Typography scale polish: verify the token scale covers the actual usage (12/14/16/18/20px exist; add missing sizes as tokens, remove hardcoded `font-size:` in component CSS where tokens exist — grep and fix).
- Move the 16 inline `style={{}}` usages into classes in the relevant CSS files (or token-based utility classes in `src/styles/base/Utilities.css` if it already has utilities — check it first).
- Semantic HTML: audit components for div-soup in structural spots (Sidebar nav, Header, modals) — add `<nav>`/`<main>`/`<header>`/`<section>` where it improves accessibility WITHOUT changing layout (verify visually after).
- `alt`/`aria`: icons from lucide-react render `<svg>` — ensure `aria-hidden` on decorative icons and labels on icon-only buttons (Title attributes or aria-labels) — grep for icon-only buttons missing labels.
- Dead CSS: with the token changes, some component CSS may become redundant — remove only rules you can PROVE unused (compare class names against components; keep a list of what you removed in the commit message).

**Verify**: triad + build green; `grep -rn "style={{" src/` → no matches; keyboard walkthrough still passes.

### Step 7: Final review and deferred decisions

- Full visual pass in both themes; capture AFTER screenshots (`plans/assets/after-final-*.png`) matching the BEFORE set.
- Record deferred decisions in the diagnosis doc (append a "Deferred" section): (a) icon-set replacement (lucide → Phosphor/Heroicons) — recommended as a future, isolated pass; (b) any accent alternative; (c) `prefers-color-scheme` initial theme detection (ThemeContext enhancement) if not done; (d) anything the skill flagged that you consciously skipped, with one line why.
- Update `docs/ux-rubric.md`? NO — out of scope (report-only; the owner uses it to grade).

**Verify**: before/after screenshot pairs exist for the same five views; the Deferred section is written.

## Test plan

- `npm test` (002 suite) — must stay green every phase (the suite covers utils, not components — it is a regression net for accidental logic changes, not a visual one; visual verification is the manual pass below).
- Manual feature checklist after EACH phase (do not skip): load folder → tree renders + expand/collapse works; select files → FileList updates + token counts display; toggle include-file-tree/binary; type user instructions; copy → clipboard has formatted content; open each of the 7 modals → opens/closes; toggle dark mode → all surfaces readable; resize window → layout holds.
- The before/after screenshots are the visual evidence for the maintainer.

## Done criteria

All must hold:

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all exit 0
- [ ] `plans/031-ui-redesign-diagnosis.md` committed, covering all skill audit categories with `file:line` evidence and FIX/OK/N/A verdicts
- [ ] Fonts self-hosted (no Google Fonts request in devtools; `index.html` has no external font link)
- [ ] `--text-primary` is not pure black; single accent; tinted shadows; grays hue-consistent; contrast spot-checks recorded
- [ ] Hover/active/focus states present on all interactive elements; no `top/left/width/height` transitions
- [ ] 16 inline styles migrated to classes; no hardcoded z-index values
- [ ] Empty/loading/error states styled; tabular-nums on token counts
- [ ] Manual feature checklist passed after every phase
- [ ] Before/after screenshot pairs saved in `plans/assets/`
- [ ] Deferred decisions documented
- [ ] `git diff --stat` matches the scope (visual files only)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any phase breaks a core flow (copy pipeline, scanning, tree, modals) — revert that phase's commit and report; do not ship a visual change that breaks function.
- A font package fails to load offline/from the bundle (file:// + CSP) — STOP; do not add CDN font links (conflicts with plan 017's strict CSP).
- You find the app is NOT vanilla CSS somewhere unexpected (e.g. a styled-components pocket) — STOP and report; the plan assumes the token/class system.
- A token change breaks dark-mode contrast on a main surface — STOP and fix the token pair; never special-case a single component to mask a token problem.
- The diagnosis reveals the inline-style count or CSS structure differs materially from this plan's "Current state" (drift) — STOP and reconcile.

## Maintenance notes

- Plan 017 (CSP) should drop `https://fonts.googleapis.com` / `https://fonts.gstatic.com` from its production policy AFTER this plan lands — coordinate: this plan's font step must land first (or 017 keeps the font sources until then).
- Plan 029 (App.tsx decomposition) and 024 (Sidebar) touch the same components — run 031 AFTER them, or rebase the redesign onto their output; do not run in parallel.
- The icon-set decision (Step 7) is the most impactful deferred item — when taken, it is an isolated pass over `src/components/**` (icon imports only).
- The maintainer grades against `docs/ux-rubric.md` — after this plan, the owner should re-grade; the "Accessibility" row is where the focus-ring and semantic-HTML work pays off.
- `docs/design.md` is the ORIGINAL spec (offshore-build palette); it is now historical — consider marking it superseded by the new token set in a future docs pass (out of scope here).
