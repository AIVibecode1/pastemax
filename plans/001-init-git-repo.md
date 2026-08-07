# Plan 001: Init git repo and add hygiene ignores

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: there is no git yet, so no drift check is possible. Verify the files mentioned in "Current state" exist before starting.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: no VCS (repo not under version control), 2026-08-07. This plan creates the baseline commit that all other plans drift-check against.

## Why this matters

The repo ships `.github/workflows/build.yml` (tag-triggered), a `debug-gh-release` npm script that runs `git tag` + `git push`, and a `.gitignore` — but there is no `.git` directory. The entire release process is dead weight, nothing is recoverable, and every other plan in this series needs git for drift detection. This plan makes the existing apparatus real and keeps known cruft out of history.

## Current state

- Repo root: `C:\Users\Hp\Desktop\My Agent Space\pastemax` — `git rev-parse` fails with "not a git repository".
- `.gitignore` exists and already covers `node_modules`, `dist`, `release-builds`, `.env*`, logs, OS files.
- Cruft present in the tree that should NOT enter history:
  - `.agents/skills/` — 15 copies of third-party agent skills (brandkit, design-taste-frontend, improve, etc.). Possibly used by the owner's local tooling — do NOT delete, add to `.gitignore`.
  - `electron/backup/OldMain.js` — 1,316-line dead duplicate (deleted by plan 028; for now ignore).
  - `src/styles/backup/index.css.bak` — 4,179-line backup (deleted by plan 028; for now ignore).
  - `.github/workflows/release.yml.disabled`, `.github/workflows/debug-build.yml` — dead workflows (deleted by plan 028; for now ignore).
- Git identity to use: repo-local only, never global. Author name `AIVibecode`, email `aivibecode@hotmail.com` (do not use any other identity).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Init | `git init` | `Initialized empty Git repository in .../.git/` |
| Identity | `git config user.name "AIVibecode" && git config user.email "aivibecode@hotmail.com"` | exit 0 |
| Baseline | `git add -A && git commit -m "chore: initial commit (pre-audit baseline)"` | commit created |

## Scope

**In scope**:
- `git init` + repo-local identity config
- `.gitignore` additions (below)
- one baseline commit of the current tree

**Out of scope** (do NOT touch):
- Deleting any file (plan 028 does that)
- `.github/workflows/build.yml` content (plan 003 modifies it)
- `package.json` (other plans modify it)

## Git workflow

- Branch: `main` (repo has no branches yet; create the default).
- Single commit for the baseline; message: `chore: initial commit (pre-audit baseline)`.
- Do NOT push (no remote is configured, and none should be added by this plan).

## Steps

### Step 1: Append hygiene entries to `.gitignore`

Append to the end of `.gitignore` (keep existing content):

```
# Local tooling and agent skill copies (not part of the project)
.agents/

# Backups and dead files awaiting deletion (plans 028)
electron/backup/
src/styles/backup/
.github/workflows/*.disabled
```

**Verify**: `grep -n "agents" .gitignore` → shows the `.agents/` line; `git check-ignore .agents/skills/improve/SKILL.md` → prints the path (exit 0).

### Step 2: Init the repository and set repo-local identity

Run: `git init`, then `git config user.name "AIVibecode"` and `git config user.email "aivibecode@hotmail.com"` (repo-local — no `--global`).

**Verify**: `git config user.name` → `AIVibecode`; `git config user.email` → `aivibecode@hotmail.com`; `git config --global user.name` is unchanged (do not touch it).

### Step 3: Baseline commit

`git add -A` then `git commit -m "chore: initial commit (pre-audit baseline)"`.

**Verify**: `git status --short` → empty (clean tree); `git log --oneline -1` → `chore: initial commit (pre-audit baseline)`; `git ls-files | grep -c "^\.agents/"` → `0` (cruft ignored); `git rev-parse --short HEAD` → a short SHA. **Record this SHA** — it is the baseline for every other plan's drift check; write it into `plans/README.md` (replace "the one created by 001" wording with the actual SHA).

## Test plan

- No code changes; verification is the git checks above.

## Done criteria

All must hold:

- [ ] `git rev-parse --show-toplevel` prints the repo root
- [ ] `git status --short` is empty
- [ ] `git log --oneline -1` shows the baseline commit
- [ ] `.agents/`, `electron/backup/`, `src/styles/backup/` are NOT in `git ls-files`
- [ ] repo-local identity is `AIVibecode <aivibecode@hotmail.com>`, global identity untouched
- [ ] baseline SHA recorded in `plans/README.md`
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- A git repo already exists (someone initialized it between planning and execution) — reconcile instead.
- Any command mutates global git config or a different repo.
- The user's machine has no git installed (`git --version` fails).

## Maintenance notes

- All later plans use `git diff --stat <baseline SHA>..HEAD -- <paths>` as their drift check; if a plan was already partially applied before 001 ran, tell the reviewer.
- Plan 028 deletes the ignored backup files; after it lands, the `.gitignore` entries for `electron/backup/` etc. can be removed (leave that to 028's executor or a follow-up).
- Keep `plans/` committed — it is the working index for this plan series.
