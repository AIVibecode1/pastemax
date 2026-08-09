# AGENTS.md — PasteMax

## What this is

Electron + React + TypeScript desktop app for selecting files and copying
token-counted content into LLM prompts. Fork of kleneway/pastemax.

## How to verify

- `npm install`
- `npm run typecheck`
- `npm run lint`
- `npm test`          # 92 unit tests (utils + electron pure logic + components)
- `npm run build`
- Manual smoke: open folder → select → copy → toggle theme → open modals

## Design system

- All colors, spacing, radii, fonts live in `src/styles/index.css` as CSS variables.
- Light tokens under `:root`, dark under `.dark-mode`.
- Do not introduce new hardcoded colors; extend the token file.
- Fonts: Geist Variable (UI) + Geist Mono Variable (code), self-hosted.

## Architecture notes agents must respect

- Renderer never talks to Node APIs directly; only through the preload whitelist
  (`electron/preload.js`). Do not broaden the whitelist without a security plan.
- File-tree state is owned by App + Sidebar; selection is a list of paths.
- The sidebar tree and the selected-file card grid are virtualized
  (`@tanstack/react-virtual`); rows are fixed-height (tree ~40px, cards 92px
  including gap). Do not reintroduce full-list rendering.
- Copy formatting runs in a Web Worker (`src/utils/formatWorker.ts`) for large payloads.
- Plans live in `plans/`; the improve cycle 001–036 is complete.

## Conventions

- TypeScript strict; prefer explicit types from `src/types/`.
- No `any` on new code.
- CSS: component files under `src/styles/{area}/`, tokens only in `index.css`.
- Tests: vitest; node environment for pure logic, jsdom (per-file
  `@vitest-environment jsdom` pragma) for component/hook tests under
  `src/components/__tests__` and `src/hooks/__tests__`.

## Out of scope for casual changes

- Electron major bumps, notarization, or CSP changes without a dedicated plan.
- Replacing the design tokens wholesale.
