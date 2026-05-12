---
title: "feat: Rewrite coderabbit-loop commands as iterative review-and-fix loops"
type: feat
status: active
date: 2026-05-12
---

# feat: Rewrite coderabbit-loop commands as iterative review-and-fix loops

## Summary

Rewrite the H+ Analytics `coderabbit-loop` command surface as an iterative review-and-fix loop — up to 4 iterations, exiting early on zero actionable findings, with Claude Code applying fixes between iterations. Six slash commands: four toggle/info commands renamed with the `-loop-` infix, plus two new session-launching commands (`-review` for the working-tree loop and `-autofix` for the open-PR loop with CodeRabbit autofix on iteration 1). Built on a fresh branch off `main`, cherry-picking only support infra from the unmerged `feat/csrf-mig-3-scenarios`.

---

## Problem Frame

Today the only working CodeRabbit workflow on `main` is the manual curl-trigger-and-poll pattern documented in `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md`. The single-shot tooling on `feat/csrf-mig-3-scenarios` (`coderabbit:on/off/status/help` + `review:uncommitted`) was never merged and is single-shot anyway — each invocation runs `cr review` once and surfaces findings. There is no orchestrated multi-pass review-and-fix loop, and no surface for invoking CodeRabbit's autofix feature. The user's request is to close that gap with a six-command set that automates the iterate-until-clean discipline already documented as institutional knowledge.

---

## Requirements

- R1. Six slash commands exist on `main`: `/coderabbit-loop-on`, `/coderabbit-loop-off`, `/coderabbit-loop-status`, `/coderabbit-loop-help`, `/coderabbit-loop-review`, `/coderabbit-loop-autofix`.
- R2. A loop session activates only via `/coderabbit-loop-review` or `/coderabbit-loop-autofix`; the four toggle/info commands are non-iterative.
- R3. Every iterating variant caps at 4 iterations and exits early the moment **actionable** findings reach zero.
- R4. The autofix variant uses CodeRabbit's autofix feature on iteration 1 only; iterations 2–4 are review-and-fix without autofix.
- R5. Between non-autofix iterations, Claude Code in the same session applies the fixes, then the loop re-reviews.
- R6. Iteration 1 of the autofix variant aborts and falls back to review-only mode for the remaining iterations if CodeRabbit's autofix would touch any path in the §9 protected surface.
- R7. Existing institutional gates run between iterations: typecheck, magic-numbers gate, relevant test suite, branch-hygiene check, auto-checkpoint detection, stale-anchor disambiguation.
- R8. Long-running PR-bot loop iterations (7–30+ min each) do not block the slash command — the loop runs as a backgrounded watcher with state checkpointed under `.local/`.
- R9. CLAUDE.md and replit.md carry a harmonized natural-language trigger table covering all six commands.
- R10. A runbook documents install, auth, the two session variants, the §9 policy, wall-time expectations, and the natural-language triggers.

---

## Scope Boundaries

- Editing `.coderabbit.yaml` (GitHub-bot config) — existing `path_filters` / `path_instructions` already work.
- Editing any existing CE skill SKILL.md — this plan composes a wrapper around the existing `ce-resolve-pr-feedback` pattern; it does not edit it.
- Updating `docs/discipline/agent-native-parity-map.md` — these are dev-only commands, not product UI; parity discipline does not apply.
- A seventh `loop-abort` / `loop-resume` slash command — resume falls out of the watcher's state files; no separate UI in this plan.
- Re-deriving the operating-mode doc / toggle contract from task-1385.
- Adding GitHub Actions or CI changes — local shell only.
- Re-architecting `ce-resolve-pr-feedback`.

### Deferred to Follow-Up Work

- An explicit `loop-abort` / `loop-resume` slash command, if the implicit resume-from-state-file proves clunky in practice.
- A Rebecca tool for orchestrating PR-review loops from chat (the legitimate agent-native parity counterpart of these dev commands).
- Stacked-PR autofix variant (`@coderabbitai autofix stacked pr`) — single-branch autofix is the only path in this plan.

---

## Context & Research

### Relevant Code and Patterns

- `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` — canonical curl trigger + poll pattern; `Actionable comments posted: N` is the loop's exit signal; ♻️ duplicate-comments line-number staleness rule.
- `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md` — branch-hygiene check filtering for Replit-Agent author commits before every iteration's push; backgrounded `until`-loop watcher pattern.
- `docs/solutions/integration-issues/replit-ide-auto-checkpoint-captures-cc-edits-2026-05-11.md` — auto-checkpoint capture detection via `git log -1 --format='%ae'` and soft-reset recovery.
- `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` — §9 protected-path list must be named explicitly in any fix-application prompt; magic-numbers gate alone won't catch the leak.
- `docs/solutions/workflow-issues/squash-merge-with-failing-required-check-2026-05-11.md` — exit-condition discipline: `gh pr view --json statusCheckRollup` must also be clean.
- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — known false-positive classes the loop must not auto-fix.
- `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` — autofix-inserted string literals for model names / API slugs / endpoint URLs are §1 violations regardless of `const` wrapping.
- `scripts/opmode-active.sh`, `scripts/print-opmode-banner.sh`, `scripts/install-coderabbit-cli.sh` (on `origin/feat/csrf-mig-3-scenarios`) — support infra to cherry-pick onto the fresh branch.
- `scripts/apply-pr39-coderabbit-fixes.sh` — local reference for shell-script idioms (`set -euo pipefail`, `python3` heredocs, branch-checkout-with-cleanup-trap).
- `.local/tasks/task-1386.md` — original design intent for the toggle + scoped review surface.
- `.agents/skills/ce-resolve-pr-feedback/SKILL.md` — canonical "resolve PR feedback" workflow; this plan's loop is the orchestrated version of its pattern.

### Institutional Learnings

Carry forward verbatim into per-iteration discipline (see U2/U3 Approach):

- **Polling cadence:** `sleep 90` between trigger and first poll, +60s when empty.
- **Duplicate-thread handling:** read the file at both the listed line and ±20 lines before re-editing; if the fix is visibly present, post `@coderabbitai resolve` instead.
- **Branch hygiene:** every iteration pre-push runs `git log origin/main..HEAD --format="%h %ae"` filtered for `52429710-ricardocidale@users.noreply.replit.com`.
- **Auto-checkpoint capture:** detect via `git log -1 --format='%ae'` after the fix-application step; recover via `git reset --soft HEAD~1` and re-commit cleanly.
- **Exit gate:** zero actionable findings AND `statusCheckRollup ≠ PENDING|FAILURE`.

### External References

- CodeRabbit docs — Autofix (`https://docs.coderabbit.ai/finishing-touches/autofix`): triggers are `@coderabbitai autofix` (commit-to-current-branch) and `@coderabbitai autofix stacked pr` (separate PR). CLI autofix skill is agent-integrated, requires `gh` + open PR.
- CodeRabbit docs — CLI Reference (`https://docs.coderabbit.ai/cli/reference`): `cr review --agent` emits NDJSON; event types `review_context`, `status`, `finding`, `complete`, `error`. Finding fields include `severity` (`critical|major|minor|trivial|info`), `fileName`, `codegenInstructions`, `suggestions`.
- CodeRabbit docs — Claude Code Integration: `/coderabbit:review` is the official plugin command — our `-loop-review` is a multi-iteration wrapper around it, not a reimplementation.
- CodeRabbit docs — Skills: autofix skill checks local branch status, locates the open PR, fetches unresolved review threads, optionally auto-applies all fixes, creates a consolidated commit.

---

## Key Technical Decisions

- **Two scopes, one prefix.** `/coderabbit-loop-review` runs against the working tree (pre-PR) using the local CodeRabbit CLI in `--agent` mode. `/coderabbit-loop-autofix` runs against an open PR using the GitHub bot trigger (`@coderabbitai autofix` then `@coderabbitai review`). The command-name prefix is shared because the user-facing concept is shared; the implementation surfaces and preconditions are not.
- **"Actionable" defined per surface, consistent exit semantics.** Local CLI: count of `finding` NDJSON events at `severity ≥ minor`. PR bot: parse the literal "Actionable comments posted: N" string from the latest CodeRabbit review summary body. Both definitions exit the loop at 0.
- **Wall-time pattern: background watcher with persisted state.** PR-bot iterations take 7–30+ min each; four iterations is hours. The slash command launches a backgrounded watcher process that polls and writes per-iteration state to `.local/coderabbit-loop/`, returning to the user immediately. The user can re-invoke the slash command later to see status; the watcher emits notifications when an iteration completes.
- **§9 protected-path policy: refuse autofix on intersect.** Iteration 1 of `/coderabbit-loop-autofix` runs `gh pr diff --name-only` against the §9 path list. On intersection, autofix is aborted with a clear message and the loop continues in review-only mode for iterations 2–4. No stacked-PR fallback (deferred).
- **Cherry-pick, don't merge.** The 12 commits on `feat/csrf-mig-3-scenarios` include unrelated CSRF/scenarios work. Cherry-pick only the loop-tooling commits and rewrite the loop core for iteration; do not merge the branch.
- **Naming parity across surfaces.** Slash commands use the `coderabbit-loop-*` form (dashes). pnpm scripts use `coderabbit-loop:*` (the colon stays as pnpm convention; the `-loop` infix matches the slash commands). Shell-script filenames use dashes.
- **Toggle preserved, scope unchanged.** The `.local/opmode/active` marker file pattern from task-1386 is preserved verbatim. The four toggle/info commands behave identically to their predecessors apart from the rename.

---

## Open Questions

### Resolved During Planning

- **How does CodeRabbit's autofix get triggered?** Two paths: GitHub bot comment `@coderabbitai autofix` (preferred — scriptable via curl with `$GITHUB_PAT`) and CLI chat-mode autofix skill (agent-integrated, not directly scriptable). Plan uses the bot path for iteration 1.
- **What's the exit signal from the PR bot?** "Actionable comments posted: N" in the review body. From the local CLI: count of NDJSON `finding` events at `severity ≥ minor`.
- **How does the loop survive 30-min iteration times?** Backgrounded watcher writing checkpoint state under `.local/coderabbit-loop/`; slash command launches and returns.

### Deferred to Implementation

- Exact watcher process model (nohup vs disown vs systemd-run --user vs simple `&`). Decide during U3/U4 based on what survives Replit shell quirks.
- Notification mechanism when an iteration completes (terminal bell, file marker, slack-style toast). Pick the lightest-weight option that the user actually sees.
- Exact wording of the natural-language trigger phrases in the harmonized table (revisit during U5 based on what reads naturally in CLAUDE.md/replit.md tone).
- Whether the watcher's per-iteration log goes to a single `run.log` or per-iteration `iteration-NN.log`. Resolve during U3.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Two scopes, two flows

| Command | Scope | Trigger | Iteration source | Fix author | Exit signal |
|---|---|---|---|---|---|
| `/coderabbit-loop-review` | Working tree (pre-PR) | Local `cr review --agent` | NDJSON `finding` events at severity ≥ minor | Claude Code in-session | Zero actionable findings, or 4 iterations |
| `/coderabbit-loop-autofix` (iter 1) | Open PR | `@coderabbitai autofix` via gh API | PR bot fixup commit | CodeRabbit bot | Bot commit lands (counted as iteration 1) |
| `/coderabbit-loop-autofix` (iter 2–4) | Open PR | `@coderabbitai review` via gh API | "Actionable comments posted: N" parser | Claude Code in-session | Zero actionable findings, or iteration 4 done |
| `/coderabbit-loop-autofix` (§9 intersect) | Open PR | (autofix skipped) | "Actionable comments posted: N" parser | Claude Code in-session | Same as review-only path |

### Watcher / state model

```text
.local/coderabbit-loop/
├── run.json            # manifest: pid, started_at, mode, pr_number, head_sha, status
├── iteration-01.ndjson # local-CLI mode only — raw --agent output for iter 1
├── iteration-01.log    # plain-text status: trigger, poll cycles, fixes summary
├── iteration-02.ndjson
├── iteration-02.log
└── ...
```

State is wiped at session start. The `/coderabbit-loop-status` command reads `run.json` plus the latest iteration log to show progress.

---

## Implementation Units

- U1. **Fresh branch, cherry-pick support infra, rename toggle surface**

**Goal:** Establish a clean branch off `main` carrying just the toggle helper, banner, install helper, and the renamed (`coderabbit-loop-*`) toggle/info slash commands and pnpm scripts.

**Requirements:** R1 (partial — 4 of 6 commands), R2 (toggle commands are non-iterative).

**Dependencies:** None.

**Files:**
- Create: `scripts/opmode-active.sh` (cherry-picked from branch)
- Create: `scripts/print-opmode-banner.sh` (cherry-picked)
- Create: `scripts/install-coderabbit-cli.sh` (cherry-picked)
- Create: `scripts/coderabbit-loop.sh` (rewritten from `coderabbit-loop.sh`, renamed namespace; preserves on/off/status/help subcommands)
- Create: `.claude/commands/coderabbit-loop-on.md`
- Create: `.claude/commands/coderabbit-loop-off.md`
- Create: `.claude/commands/coderabbit-loop-status.md`
- Create: `.claude/commands/coderabbit-loop-help.md`
- Modify: `package.json` (add `coderabbit-loop:on/off/status/help` pnpm script entries)
- Modify: `.gitignore` (ensure `.local/coderabbit-loop/` is gitignored — `.local/` already is, verify and document)
- Test: `scripts/tests/coderabbit-loop-toggle.test.sh` (toggle round-trip + status output)

**Approach:**
- Cherry-pick the support-infra commits from `feat/csrf-mig-3-scenarios` (identified as those touching only `scripts/opmode-active.sh`, `scripts/print-opmode-banner.sh`, `scripts/install-coderabbit-cli.sh`, plus their `package.json` entries).
- Resolve `package.json` conflicts by adding the renamed entries; do not migrate the old `coderabbit:*` names — they never landed on `main`.
- Rewrite `scripts/coderabbit-loop.sh` from the branch version with the renamed subcommand names in help output and a refreshed inner-loop reference (mentions the two new session commands instead of the four old `review:*` ones).
- Slash-command files follow the YAML-frontmatter + prose-body convention from the unmerged branch (`description:` only; body is imperative instructions to invoke the pnpm script and report output).

**Patterns to follow:**
- Shell-script idioms from `scripts/apply-pr39-coderabbit-fixes.sh` (`set -euo pipefail`, repo-root resolution via `BASH_SOURCE` + `cd`).
- `coderabbit-loop.sh` "status is best-effort" pattern — no `set -e` for the status subcommand, keep it forgiving.
- Slash-command body shape from the unmerged branch (delegate to pnpm, three-bullet body, closing follow-up directive).

**Test scenarios:**
- Happy path: `pnpm coderabbit-loop:on` creates `.local/opmode/active`; `pnpm coderabbit-loop:status` reports ON with trigger and armed-at timestamp; `pnpm coderabbit-loop:off` removes the marker and reports OFF.
- Edge case: `pnpm coderabbit-loop:status` with neither marker file nor env var set reports OFF cleanly and prints repo root + banner-wrap status.
- Edge case: env var `OPMODE_LARGE_REPO_SHELL=1` with no marker file reports ON with env-var trigger source.
- Error path: `pnpm coderabbit-loop:status` runs cleanly even when CodeRabbit CLI is not installed (degraded output, exit 0).
- Integration: slash command invocations from a clean repo state produce the same pnpm-output text the user would see directly.

**Verification:**
- All four pnpm scripts and four slash commands exist and round-trip the toggle state correctly.
- `pnpm run typecheck` passes (no new TS code added; baseline).
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` passes.

---

- U2. **Working-tree iterative review loop (`/coderabbit-loop-review`)**

**Goal:** Implement the working-tree iterative review-and-fix loop. Up to 4 iterations of `cr review --agent`, fix application by Claude Code between iterations, exit early on zero actionable findings.

**Requirements:** R1 (partial), R2, R3, R5, R7, R8.

**Dependencies:** U1.

**Files:**
- Create: `scripts/coderabbit-loop-review.sh` (the loop driver, sourced subcommand of `coderabbit-loop.sh` or standalone — decide during impl based on which keeps `coderabbit-loop.sh` short)
- Create: `.claude/commands/coderabbit-loop-review.md`
- Modify: `package.json` (add `coderabbit-loop:review` pnpm script)
- Test: `scripts/tests/coderabbit-loop-review.test.sh` (NDJSON parser + severity counter + iteration cap)

**Approach:**
- Slash command body: launch the backgrounded watcher via the pnpm script, return immediately with the manifest path the user can poll via `/coderabbit-loop-status`.
- Watcher does: ensure loop is ON (else exit with toggle-OFF message); ensure CodeRabbit CLI is installed and authed (else degrade gracefully with install pointer); wipe `.local/coderabbit-loop/`; loop up to 4 iterations; per iteration: run `cr review --type uncommitted --agent` capturing NDJSON to `iteration-NN.ndjson`; count `finding` events at `severity ≥ minor`; if 0, write `run.json` status=complete-clean and exit; else pause for Claude Code to apply fixes (mechanism: write a `iteration-NN.fixes-needed` marker, the slash command picks it up and the agent in the same session applies fixes); after fix application, run per-iteration gates (typecheck, magic-numbers, relevant tests, branch-hygiene check); commit cleanly (guard against auto-checkpoint capture); loop.
- The "Claude Code applies fixes" handoff is the trickiest piece — the watcher emits a structured payload (NDJSON findings + `codegenInstructions` for each) into a file the slash command's follow-up message reads, then Claude Code uses standard Edit tools to apply fixes, then notifies the watcher to proceed.
- Hard cap at 4: if iteration 4 still has findings, exit with status=complete-residual and surface the unresolved findings to the user.

**Patterns to follow:**
- Backgrounded `until`-loop watcher pattern from `cc-replit-branch-hygiene-2026-05-10.md` (Variant B).
- `coderabbit-review.sh` invocation pattern (toggle guard, CLI guard, `git status --porcelain` check before review).
- §1 magic-numbers gate invocation per CLAUDE.md.

**Test scenarios:**
- Happy path (synthetic NDJSON fixture): a 3-finding payload at severities major/minor/trivial counts as 2 actionable; the loop runs one iteration, fixes are applied (mocked), the next iteration shows zero, exit clean.
- Edge case: empty working tree → loop exits with "no uncommitted changes" before invoking CR; status=skipped.
- Edge case: NDJSON parser handles `review_context`, `status`, `error`, `complete` events without counting them as findings.
- Edge case: iteration 4 still has actionable findings → exit with status=complete-residual; manifest lists the still-open findings.
- Error path: CodeRabbit CLI returns a non-zero exit code (auth failure, network) → watcher captures the `error` event, writes status=failed, surfaces a meaningful message.
- Integration: branch-hygiene check trips on a synthetic Replit-Agent-authored commit between iterations and aborts cleanly with an actionable message.
- Integration: auto-checkpoint capture (synthetic test: pre-stage a commit with `Replit-Commit-Author: Agent` header containing the in-flight edit) is detected and the watcher recovers via soft-reset and re-commit.

**Verification:**
- All test scenarios above pass.
- Manual smoke test against a real repo working tree with a known-flagged change shows the loop run, fix application invitation surface to Claude, re-review, and clean exit.
- `pnpm run typecheck` + magic-numbers gate pass.

---

- U3. **Open-PR autofix iterative loop (`/coderabbit-loop-autofix`)**

**Goal:** Implement the open-PR variant. Iteration 1 triggers `@coderabbitai autofix` via the GitHub Issues Comments API; iterations 2–4 trigger `@coderabbitai review` and parse the PR review summary. §9 protected-path pre-check before iteration 1.

**Requirements:** R1 (partial), R2, R3, R4, R5, R6, R7, R8.

**Dependencies:** U1.

**Files:**
- Create: `scripts/coderabbit-loop-autofix.sh`
- Create: `.claude/commands/coderabbit-loop-autofix.md`
- Modify: `package.json` (add `coderabbit-loop:autofix` pnpm script)
- Test: `scripts/tests/coderabbit-loop-autofix.test.sh` (§9 intersect detection + summary parser + duplicate-thread handling)

**Approach:**
- Preconditions enforced before iteration 1: `gh` CLI present, `$GITHUB_PAT` set, current branch has an open PR (`gh pr view --json number,headRefOid`), at least one prior CodeRabbit review exists on the PR (else surface "no prior CR review — push some commits and let CR run first, then re-invoke").
- §9 pre-check: `gh pr diff --name-only` ∩ §9 path list (`lib/engine/src/`, `lib/calc/src/`, `lib/shared/src/constants*.ts`, `lib/db/src/constants*.ts`, `artifacts/api-server/src/finance/`, `artifacts/api-server/src/report/`, `artifacts/api-server/src/tests/proof/`, `artifacts/api-server/src/tests/engine/`). On intersect: write `iteration-01.log` noting "autofix skipped — §9 intersect on <paths>"; iteration 1 falls back to review-only mode (post `@coderabbitai review`, parse "Actionable comments posted").
- Iteration 1 normal path: post `@coderabbitai autofix` via curl to `/repos/Norfolk-Group/H-Analytics/issues/<pr>/comments`; poll `gh pr view --json commits` waiting for a new commit by the CodeRabbit bot user (timeout ~5 min); on commit landing, fetch `gh pr view --json statusCheckRollup` and consider iteration 1 complete when checks settle.
- Iterations 2–4: post `@coderabbitai review`; poll `/pulls/<pr>/reviews` for a new review by `coderabbitai[bot]`; parse "Actionable comments posted: N" from the body; if 0 → exit clean (also verify statusCheckRollup ≠ FAILURE/PENDING); else fetch the review body + `/pulls/<pr>/comments?since=<ISO>`, surface findings to Claude Code in the same session, apply fixes, push (with branch-hygiene + auto-checkpoint guards), loop.
- Duplicate-thread handling: when the review body opens with `<details><summary>♻️ Duplicate comments (N)`, parse the prose-acknowledged fix list and avoid re-editing lines flagged in the duplicate block; post `@coderabbitai resolve` for verified-on-disk fixes before the next iteration.
- Hard cap at 4; final status mirrors U2.

**Patterns to follow:**
- Curl-trigger pattern from `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` (sleep 90 then poll, +60s on empty).
- Stale-anchor disambiguation rule from the same doc (read file at both listed line and likely-shifted location before re-editing).
- `gh pr view --json statusCheckRollup` exit-gate from `squash-merge-with-failing-required-check-2026-05-11.md`.

**Test scenarios:**
- Happy path: open PR with 2 prior CR findings; iteration 1 fires autofix, bot commits, checks pass, iteration 2 review reports 0 actionable, exit clean.
- §9 intersect: pre-staged PR diff includes `lib/calc/src/exit.ts`; autofix is skipped, iteration 1 runs review-only, behavior thereafter matches the review path.
- No-prior-CR-review precondition: PR with no prior bot comments → loop exits with actionable message, does not post any comment.
- Duplicate-thread re-list: iteration 2's review body re-lists 3 prior findings under ♻️ Duplicate comments, all verified-on-disk; loop posts `@coderabbitai resolve` and proceeds to iteration 3 without re-editing.
- Edge case: autofix bot commit times out (5-min limit elapses with no bot commit) → write status=autofix-timeout, fall back to review-only iteration 2.
- Error path: `$GITHUB_PAT` missing or 401 → fail fast with explicit message; no retry.
- Error path: `statusCheckRollup` returns FAILURE after iteration 3's fix-application → loop does not exit clean even if actionable count is 0; surfaces failing checks for the user to address.
- Integration: branch-hygiene check trips on a Replit-Agent commit landing during a poll cycle → aborts with cherry-pick-recovery instructions referencing the relevant SHAs.

**Verification:**
- All test scenarios pass.
- Manual smoke test against a real low-stakes PR (a docs-only branch, not an engine touch) confirms iteration 1 autofix → iteration 2 review → exit clean.
- `pnpm run typecheck` + magic-numbers gate + `pnpm run check:lint` all pass.

---

- U4. **Slash-command + pnpm-script wiring polish**

**Goal:** Ensure all six slash commands and six pnpm scripts are wired, discoverable, and the help/status commands reflect the new commands.

**Requirements:** R1, R9 (partial — wiring side).

**Dependencies:** U1, U2, U3.

**Files:**
- Modify: `scripts/coderabbit-loop.sh` (refresh `help` subcommand output to list all six commands and the inner-loop discipline; refresh `status` to surface the watcher manifest path if a session is active)
- Modify: `.claude/commands/coderabbit-loop-help.md` (point at `pnpm coderabbit-loop:help`)
- Modify: `.claude/commands/coderabbit-loop-status.md` (note that status surfaces the active watcher if any)
- Modify: `package.json` (final pnpm-script set: 6 entries — `coderabbit-loop:{on,off,status,help,review,autofix}`)
- Test: `scripts/tests/coderabbit-loop-help.test.sh` (help output mentions all six commands and the §9 policy in a one-screen reminder)

**Approach:**
- The `help` output is the user's primary discovery surface — make it tight, one-screen, listing the six commands grouped (toggle/info vs session) with one-line summaries.
- The `status` output gains a "Active watcher" section when `.local/coderabbit-loop/run.json` exists: shows mode (review/autofix), iteration number, started-at, last-event timestamp.
- pnpm script names are stable from this PR onward — document the rename rationale in `package.json` next to the entries (one-line comment via field convention or sibling doc).

**Patterns to follow:**
- Existing `help` subcommand in `coderabbit-loop.sh` (the branch version is already tight; extend without bloating).

**Test scenarios:**
- Happy path: `pnpm coderabbit-loop:help` lists all six commands; output fits in 80 columns × 30 rows.
- Happy path: `pnpm coderabbit-loop:status` with an active watcher manifest shows the active session block.
- Edge case: `pnpm coderabbit-loop:status` with stale manifest (watcher pid no longer alive) reports "stale manifest — last seen N seconds ago" and offers cleanup hint.

**Verification:**
- All six slash commands invoke the corresponding pnpm script and surface the expected output.
- Help output is one-screen and includes the §9 policy callout for the autofix command.

---

- U5. **Memory-file harmonization + natural-language trigger table**

**Goal:** Add a natural-language trigger table to both `CLAUDE.md` and `replit.md` (identical wording, harmonized per the mandatory gate) covering all six commands.

**Requirements:** R9.

**Dependencies:** U4.

**Files:**
- Modify: `CLAUDE.md` (add a new top-level section or extend the existing skill-routing area with the trigger table; pointer to the runbook)
- Modify: `replit.md` (mirror the same section verbatim per the harmonization gate)

**Approach:**
- Three-column table: `Natural-language phrase | Slash command | pnpm equivalent`. Include 2–3 synonym phrases per command in the first column (comma-separated). Examples: "turn coderabbit loop on" / "arm the loop" → `/coderabbit-loop-on` → `pnpm coderabbit-loop:on`; "run coderabbit autofix" / "loop with autofix" → `/coderabbit-loop-autofix` → `pnpm coderabbit-loop:autofix`.
- Trigger-table lives in the same relative position in both files (mid-section, after the skill table). Both files reference `docs/runbooks/coderabbit-loop-workflow.md` for full operator detail.
- Memory-file harmonization gate applies: shared rows must have identical wording; file-specific extras stay in their respective file.

**Patterns to follow:**
- `agent-memory-files` skill (per CLAUDE.md "Memory-file harmonization (mandatory shipping gate)").
- Trigger-table convention from the unmerged-branch `replit.md` lines 99–103 (header `## Natural-language commands`).

**Test scenarios:**
- `Test expectation: none — documentation-only change. Verification is the harmonization check: shared rows must be identical between the two files.`

**Verification:**
- `diff <(awk '/## Natural-language commands/,/^---$/' CLAUDE.md) <(awk '/## Natural-language commands/,/^---$/' replit.md)` reports no differences.
- Manual read: a fresh agent session opening either memory file sees the table and the runbook pointer.

---

- U6. **Runbook + final verification**

**Goal:** Document the full operator surface in a runbook and run the final repo-wide verification.

**Requirements:** R10, plus closure on R7/R8 by documenting them.

**Dependencies:** U5.

**Files:**
- Create: `docs/runbooks/coderabbit-loop-workflow.md`
- Test: `scripts/tests/coderabbit-loop-integration.test.sh` (end-to-end smoke: toggle on, kick off review loop against a synthetic working tree, confirm watcher writes manifest, abort and clean up)

**Approach:**
- Runbook structure (in order): one-paragraph What This Is; Install (`bash scripts/install-coderabbit-cli.sh`, then `coderabbit auth login`); Toggle the loop (on/off/status/help, copy-pasteable commands at the top); Run a working-tree loop (`/coderabbit-loop-review` end-to-end, including the wall-time expectation and the watcher pattern); Run an autofix loop (`/coderabbit-loop-autofix` end-to-end, §9 policy callout, autofix-skipped fallback behavior); Natural-language triggers (the table from U5); Troubleshooting (stale manifest, branch hygiene, auto-checkpoint capture, duplicate-thread handling); Reverting to today's behavior (`rm -f .local/opmode/active`).
- Cross-references: pointer to `ce-resolve-pr-feedback` skill as the canonical "resolve PR feedback" workflow this loop wraps; pointer back to the source institutional learning.

**Patterns to follow:**
- Runbook structure from `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` (the canonical companion).
- Toggle-on/off / current-state section at the top, as task-1386 specified for the original runbook.

**Test scenarios:**
- Integration: end-to-end smoke against a clean repo state passes (toggle on, kick off review loop against a synthetic tree, abort, verify state cleanup).
- Documentation: runbook is searchable by the keywords `coderabbit`, `loop`, `autofix`, `section 9`, `branch hygiene` — verifiable via `grep -i` of the runbook.

**Verification:**
- `pnpm run typecheck` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` clean.
- `pnpm run check:lint` clean.
- `pnpm --filter @workspace/scripts run check:replit-independence` clean (the install path must not introduce a Replit-managed dep).
- Manual: invoke every slash command at least once from a fresh session and confirm the help / status / trigger-table all reflect the new namespace.

---

## System-Wide Impact

- **Interaction graph:** loop watcher process polls GitHub API + reads local repo state; no in-app callbacks affected. Slash commands call pnpm scripts which call shell scripts — no other entry points touched.
- **Error propagation:** loop watcher writes structured status to `run.json` and exits non-zero on hard failures; slash command's status command surfaces the latest status; nothing else in the app reads `.local/coderabbit-loop/`.
- **State lifecycle risks:** `.local/coderabbit-loop/` is wiped at each loop start; stale state from a killed watcher is detectable via pid liveness check (status command surfaces "stale manifest"). No DB state, no persisted server-side state.
- **API surface parity:** N/A — dev-only tooling, not an app API.
- **Integration coverage:** branch-hygiene, auto-checkpoint, statusCheckRollup, and duplicate-thread handling are all integration-tested per unit; the cross-layer behaviors mocks alone won't prove (Replit-Agent commit interleaving, real CR bot timing) are smoke-tested manually in U2/U3 verification.
- **Unchanged invariants:** the toggle marker file pattern at `.local/opmode/active` is preserved verbatim; `OPMODE_LARGE_REPO_SHELL=1` env-var equivalence is preserved; the `.coderabbit.yaml` bot config is untouched; the §9 protected surface is not edited by any loop variant (the autofix policy in U3 guards this at the loop level).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| CodeRabbit CLI's `--agent` NDJSON schema changes (no version pin available) | Loop's NDJSON parser is forgiving on unknown event types and unknown finding fields; surface a clear error on missing required fields rather than failing silently. Re-run U2 test fixture if CR releases a new CLI minor. |
| CodeRabbit bot rate-limits or queues `@coderabbitai review` triggers under load | Poll cadence respects the +60s backoff already in the institutional learning; cap total polling time at 30 min per iteration; surface "CR review taking longer than expected" notice if hit. |
| `@coderabbitai autofix` bot commit lands but breaks the build | Per-iteration gates (typecheck, magic-numbers, tests) run AFTER the bot commit and BEFORE the next iteration's review trigger; loop pauses on gate failure for human resolution rather than continuing on a broken tree. |
| Iteration 4 cap is too low for noisy PRs | The cap is a hard safety; status=complete-residual lists the open findings so the user can decide to re-invoke. Don't auto-extend — the cap exists to prevent runaway loops. |
| Background watcher process is killed by Replit shell session ending | Watcher writes state to disk per iteration; user can re-invoke `/coderabbit-loop-status` to see last-known state; resume is implicit by re-invoking the original session command (it picks up from the last manifest iteration). |
| `gh` CLI not installed in the runtime env | U3 precondition check fires before any work; surfaces "gh CLI required — install via `brew install gh` or equivalent" message. |
| Auto-checkpoint capture hides CC's fix commit under Replit-Agent attribution | Detection + soft-reset recovery is baked into per-iteration gates (per the institutional learning); the watcher's git-author check is the safety net. |

---

## Documentation / Operational Notes

- New runbook at `docs/runbooks/coderabbit-loop-workflow.md` (U6) is the operator surface.
- CLAUDE.md and replit.md updated with the trigger table (U5).
- No rollout plan needed — these are local dev commands, no production impact.
- No monitoring needed — the watcher's `run.json` is the operator's surface.
- After merge: refresh the existing institutional learning at `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` to point at the new commands for any future agent session that finds the doc first.

---

## Sources & References

- Repo: `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` (canonical iterative-review pattern)
- Repo: `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md` (branch hygiene + watcher pattern)
- Repo: `docs/solutions/integration-issues/replit-ide-auto-checkpoint-captures-cc-edits-2026-05-11.md` (auto-checkpoint detection)
- Repo: `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` (§9 protected-path discipline)
- Repo: `docs/solutions/workflow-issues/squash-merge-with-failing-required-check-2026-05-11.md` (statusCheckRollup exit gate)
- Repo: `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` (magic-numbers gate false-positive classes)
- Repo: `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` (§1 integration-identifier discipline)
- Repo: `.local/tasks/task-1386.md` (original toggle + scoped-review design)
- Repo: `.agents/skills/ce-resolve-pr-feedback/SKILL.md` (canonical PR-feedback resolution skill this plan wraps)
- Branch: `origin/feat/csrf-mig-3-scenarios` (support infra to cherry-pick)
- External: `https://docs.coderabbit.ai/finishing-touches/autofix` (bot autofix triggers)
- External: `https://docs.coderabbit.ai/cli/reference` (NDJSON --agent schema)
- External: `https://docs.coderabbit.ai/cli/claude-code-integration` (`/coderabbit:review` plugin command)
- External: `https://docs.coderabbit.ai/cli/skills` (CLI autofix skill behavior + `gh` + open-PR requirement)
