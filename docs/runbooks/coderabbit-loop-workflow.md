---
title: "CodeRabbit Loop Workflow"
date: 2026-05-12
category: docs/runbooks
module: development_workflow
tags:
  - coderabbit
  - iterative-review
  - pr-workflow
  - autofix
---

# CodeRabbit Loop Workflow
*Created and maintained by Ricardo Cidale*

Runbook for the six `coderabbit-loop` commands: global install, prerequisites, the two iterative session variants, the §9 protected-surface policy, wall-time expectations, natural-language triggers, and troubleshooting.

---

## 1. Global install (one-time setup per machine)

Run once from the H+ Analytics repo:

```bash
pnpm coderabbit-loop:install
# or equivalently:
bash scripts/install-coderabbit-loop.sh
```

This copies:
- `.claude/commands/coderabbit-loop-*.md` → `~/.claude/commands/`
- `scripts/coderabbit-loop*.sh`, `scripts/opmode-active.sh`, `scripts/print-opmode-banner.sh` → `~/.local/share/coderabbit-loop/`

After install, all six commands are available in every Claude Code session on this machine, in any repo.

**Install the CodeRabbit CLI (if not done):**
```bash
bash scripts/install-coderabbit-cli.sh
coderabbit auth login   # interactive one-time OAuth
```

**Set GITHUB_PAT for autofix loops:**
```bash
export GITHUB_PAT=<your-personal-access-token>
```
Required scopes: `repo` (classic PAT) — or for fine-grained: `Pull Requests: Read and Write`. Add to your shell rc file (`~/.zshrc` or `~/.bashrc`) so it persists across sessions.

---

## 2. Arm the loop

The loop must be armed before invoking either session command:

```bash
pnpm coderabbit-loop:on        # or: /coderabbit-loop-on
```

Verify:
```bash
pnpm coderabbit-loop:status    # or: /coderabbit-loop-status
```

The status command shows toggle state, CodeRabbit CLI version, auth status, and any active loop session.

---

## 3. Working-tree review loop (`/coderabbit-loop-review`)

**Use when:** you have uncommitted changes you want reviewed before opening a PR.

**Preconditions:**
- Loop is ON
- `coderabbit` CLI is installed and authenticated (`coderabbit auth status`)
- Working tree has uncommitted changes (`git status` shows edits)

**Start:**
```
/coderabbit-loop-review
```

**What Claude does:**
1. Checks preconditions (toggle ON, CLI installed, changes present)
2. §9 preflight: lists changed files, checks for protected engine paths
3. Runs `cr review --type uncommitted --agent` — captures NDJSON output
4. Parses findings at severity ≥ minor (critical/major/minor are actionable; trivial/info are not)
5. If zero actionable findings → runs quality gates → exits clean
6. Applies fixes using Edit tool (skips §9-protected paths and out-of-scope paths)
7. Runs per-iteration gates: typecheck (if present), magic-numbers (if present)
8. Commits the fixes
9. Repeats up to 4 iterations; reports residual findings if capped

**Wall time:** seconds to a few minutes per iteration (local CLI, no network poll).

**Exit states:**
- `complete-clean` — zero actionable findings, all gates pass
- `complete-residual` — 4 iterations, findings remain
- `gate-failed` — a quality gate failed (typecheck, magic-numbers)
- `failed` — CodeRabbit CLI error

---

## 4. Open-PR autofix loop (`/coderabbit-loop-autofix`)

**Use when:** you have an open PR with a prior CodeRabbit review and you want to autofix + re-review.

**Preconditions:**
- Loop is ON
- `gh` CLI is installed and authenticated (`gh auth status`)
- `GITHUB_PAT` env var is set with required scopes
- Current branch has an open PR (`gh pr view`)
- At least one prior CodeRabbit review exists on the PR

**Start:**
```
/coderabbit-loop-autofix
```

**What Claude does (iteration 1 — autofix):**
1. Checks all preconditions
2. §9 pre-check: `gh pr diff --name-only` vs. §9 path list
   - On intersection → falls back to review-only for all iterations
3. Posts `@coderabbitai autofix` comment via GitHub API
4. Polls for bot commit landing (timeout 5 min)
5. §9 post-commit re-check: if bot introduced new §9 paths → reverts bot commit, continues review-only
6. Branch hygiene check with `--mode=autofix`: verifies no Replit-Agent intrusions, reports bot commit SHAs

**Iterations 2–4 (review-only):**
1. Posts `@coderabbitai review` comment
2. Polls for new review (timeout 10 min)
3. Parses "Actionable comments posted: N" from review body
4. If zero → checks `statusCheckRollup` → exits if clean
5. Fetches PR inline comments, applies fixes (with §9 + scope filters)
6. Checks branch hygiene, auto-checkpoint guard, quality gates
7. Pushes and continues

**Wall time:** 7–30+ minutes per iteration (PR bot review latency). Total for 4 iterations: up to ~2 hours for a complex PR. Plan accordingly.

**Exit states:**
- `complete-clean` — zero actionable findings, CI passes
- `complete-residual` — 4 iterations, findings remain
- `ci-pending` — zero findings but CI checks still running
- `gate-failed` — typecheck/magic-numbers/CI failed
- `autofix-timeout` — bot did not commit within 5 min (fell back to review-only)
- `autofix-section9-revert` — bot introduced §9 edits; commit reverted, loop continued review-only
- `review-timeout` — bot review did not arrive within 10 min

---

## 5. §9 Financial Engine protection policy

The §9 rule applies to **any code that touches the financial projection surface.** Neither the working-tree loop nor the autofix loop will auto-apply fixes to:

```
lib/engine/src/
lib/calc/src/
lib/shared/src/constants*.ts
lib/db/src/constants*.ts
artifacts/api-server/src/finance/
artifacts/api-server/src/report/
artifacts/api-server/src/tests/proof/
artifacts/api-server/src/tests/engine/
```

**Review-only loop (`/coderabbit-loop-review`):** Findings targeting §9 paths are surfaced with `⚠ Skipped (§9 protected)` — Claude shows them but does not apply. Apply manually after reviewing.

**Autofix loop (`/coderabbit-loop-autofix`):** If the PR diff includes any §9 path at pre-check, autofix is blocked and all iterations run review-only. If the CR bot introduces new §9 edits despite a clean pre-check (post-commit re-check), the bot commit is automatically reverted and the loop continues review-only.

To apply §9 findings: review them manually, make the edit yourself, and re-invoke the review loop on the result.

---

## 6. Per-iteration quality gates

After each fix-application step, the loop runs these gates (all conditional):

| Gate | Condition to run | Fail behavior |
|---|---|---|
| `pnpm run typecheck` | `typecheck` script exists in root `package.json` | Loop asks user whether to continue |
| `scripts/src/check-magic-numbers.ts` | Script file exists | Loop asks user whether to continue |
| `git log … \| grep Replit-Agent-email` | Always | Loop aborts with cherry-pick recovery instructions |

In other repos (no `lib/engine/src/`, no magic-numbers script, no `typecheck` script), all gates except branch-hygiene are silently skipped.

---

## 7. Natural-language triggers

| Natural-language phrase | Command |
|---|---|
| "turn coderabbit loop on", "arm the loop" | `/coderabbit-loop-on` |
| "turn coderabbit loop off", "disarm the loop" | `/coderabbit-loop-off` |
| "coderabbit loop status", "is the loop on" | `/coderabbit-loop-status` |
| "coderabbit loop help" | `/coderabbit-loop-help` |
| "run coderabbit review loop", "review my working tree" | `/coderabbit-loop-review` |
| "run coderabbit autofix", "loop with autofix", "autofix my PR" | `/coderabbit-loop-autofix` |

---

## 8. GITHUB_PAT — generation and rotation

Generate at `https://github.com/settings/tokens`:

**Classic PAT (simpler):** scope `repo` covers everything needed.

**Fine-grained PAT (more restrictive):**
- Repository access: the target repo (e.g., `Norfolk-Group/H-Analytics`)
- Permissions: Pull requests → Read and write

Set and persist:
```bash
export GITHUB_PAT=<token>
echo 'export GITHUB_PAT=<token>' >> ~/.zshrc  # or ~/.bashrc
```

**Rotation cadence:** GitHub classic PATs expire per their expiry setting (recommend 90 days). Fine-grained PATs: same. Rotate before expiry; update your shell rc file.

**Scope check:** the autofix loop runs `pat-scope-check` as a precondition and will tell you if scopes are insufficient.

---

## 9. Troubleshooting

**"CodeRabbit loop is OFF"**
→ Run `/coderabbit-loop-on` or `pnpm coderabbit-loop:on`

**"CodeRabbit CLI not installed"**
→ Run `bash scripts/install-coderabbit-cli.sh && coderabbit auth login`

**"No open PR found"**
→ Push your branch and open a PR on GitHub first

**"No prior CodeRabbit review on this PR"**
→ Wait for the initial CodeRabbit review to post (usually within 60s of PR creation), then re-invoke

**"PAT scope insufficient"**
→ Regenerate your PAT with `repo` scope (classic) or Pull Requests read+write (fine-grained)

**"BOT_COMMIT_TIMEOUT after 5 minutes"**
→ CodeRabbit autofix may be queued or have failed. Check the PR timeline on GitHub. The loop falls back to review-only automatically.

**"BOT_REVIEW_TIMEOUT after 10 minutes"**
→ CodeRabbit review is slow or failed. Check GitHub. Re-invoke to retry.

**"§9 post-commit intersect — bot commit reverted"**
→ CodeRabbit's autofix touched protected engine code. The loop reverted the commit and continued review-only. Review the finding manually and apply the fix yourself after confirming it follows §9 rules.

**"HYGIENE_FAIL — Replit-Agent commits detected"**
→ Replit Agent committed to this branch during the loop. Cherry-pick only your CC commits onto a fresh branch per the CC branch hygiene workflow in `CLAUDE.md`.

**"Gate check failed: typecheck"**
→ Fix the TypeScript error before re-invoking. The loop reports the failing file/line.

**Loop killed mid-session**
→ Re-invoke from scratch. The loop is stateless — it always starts at iteration 1. `run.json` shows the last known state for diagnostic purposes only.
