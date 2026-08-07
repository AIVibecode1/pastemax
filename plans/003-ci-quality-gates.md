# Plan 003: Add typecheck and lint gates to CI

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat <baseline SHA>..HEAD -- package.json .github/workflows/build.yml` — if changed since baseline, compare excerpts before proceeding; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: 001 (git repo must exist for the workflow to be meaningful)
- **Category**: dx
- **Planned at**: 2026-08-07 (baseline = commit created by plan 001)

## Why this matters

The release workflow `.github/workflows/build.yml` runs only `npm run build` (which is `vite build` — esbuild transpile with NO type checking) and never runs lint. Meanwhile the guardrails that exist are switched off: `.eslintrc.cjs:24` disables `react-hooks/exhaustive-deps`, `.eslintrc.cjs:21` disables `no-explicit-any`, and `tsconfig.json:19-20` disables `noUnusedLocals`/`noUnusedParameters`. Type errors, stale-closure bugs, and dead code currently ship in tag-triggered releases with zero machine-checkable feedback. This plan adds the typecheck script and gates CI on typecheck + strict lint.

## Current state

- `package.json` scripts (line 26): `"lint": "eslint . --ext ts,tsx,js,jsx --report-unused-disable-directives"`; line 27: `"lint:strict": "eslint . --ext ts,tsx,js,jsx --report-unused-disable-directives --max-warnings 0"`. Both exist but nothing runs them.
- No `typecheck` script exists. `tsconfig.json` is strict (`"strict": true`, line 18) with `noEmit: true`.
- `.github/workflows/build.yml` lines 45-46: `- name: Build Vite app\n  run: npm run build` — the only quality step.
- Known current lint state (baseline — do not fix in this plan, just record): the codebase likely has warnings under `lint:strict` (e.g. `react-refresh/only-export-components` is warn-level). Fixing that backlog is NOT part of this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint:strict` | exit 0 (may fail today — see Step 3) |
| Workflow lint | `npx actionlint` or manual review | n/a (actionlint optional) |

## Scope

**In scope**:
- `package.json` — add `"typecheck": "tsc --noEmit"` script
- `.github/workflows/build.yml` — insert a quality-gate step before the Vite build

**Out of scope** (do NOT touch):
- `.eslintrc.cjs` / `tsconfig.json` rule changes (fixing the warning backlog is a separate, deliberate effort — the executor of THIS plan must not start flipping rules)
- Any source code
- The `release` job of the workflow

## Git workflow

- Branch: `advisor/003-ci-gates`.
- Commit: `ci: gate builds on typecheck and strict lint`.
- Do NOT push.

## Steps

### Step 1: Add the typecheck script

Add to `package.json` scripts: `"typecheck": "tsc --noEmit"`.

**Verify**: `npm run typecheck` → exits 0 (if it does not, STOP and report — a type error would mean the baseline is broken; do not fix source code in this plan).

### Step 2: Insert the quality gate into the workflow

In `.github/workflows/build.yml`, immediately before the `Build Vite app` step (line 45), insert:

```yaml
      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint:strict
```

**Verify**: `git diff .github/workflows/build.yml` shows only this insertion; the `Install dependencies` step (`npm ci`) remains above it.

### Step 3: Record the current strict-lint baseline

Run `npm run lint:strict` locally. It may exit non-zero (pre-existing warnings/errors). If it fails:
- Do NOT fix the code.
- Capture the count: `npm run lint:strict 2>&1 | tail -20` and note in your completion report how many problems exist, so the maintainer can schedule the cleanup.
- The CI gate will fail until that backlog is cleared — flag this explicitly in `plans/README.md` as a known consequence (the gate is intentional: it makes the backlog visible instead of silent).

**Verify**: the exit code and problem count are recorded in your report.

## Test plan

- No runtime tests (CI config only). Verification is: `npm run typecheck` (exit 0), `npm run lint` (exit 0 — warnings allowed), and the workflow YAML parses (`python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build.yml'))"` or equivalent; note the workflow uses `on:` which plain YAML 1.1 parsers may read as boolean — use `yaml.safe_load` with the `BaseLoader` workaround if needed, or just eyeball the diff).

## Done criteria

All must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `.github/workflows/build.yml` contains the Typecheck and Lint steps before `Build Vite app`
- [ ] No source file was modified (`git status`)
- [ ] Strict-lint backlog count recorded in the completion report and `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run typecheck` fails — the baseline has a type error; report the error and stop (fixing it is out of scope).
- The workflow file structure differs materially from the excerpt (e.g. the build step was renamed) — adapt the insertion point to the actual step name, but only for placement; if the file has been rewritten, STOP.

## Maintenance notes

- Once the lint backlog is cleared, CI is green again; until then every tag push shows a red Lint step — that is the intended pressure.
- Plan 029 (App.tsx decomposition) will change lint counts; the gate will catch regressions during that work.
- If the maintainer later wants `noUnusedLocals` re-enabled, do it after 029 (dead code removal) — the typecheck gate will then enforce it.
