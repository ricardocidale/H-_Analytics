---
title: "CC branch hygiene: Replit Agent stages unreviewed commits on CC PR branches"
date: 2026-05-10
last_updated: 2026-05-12
category: docs/solutions/workflow-issues
module: cc-replit-branch-hygiene
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - Claude Code creates a PR branch and pushes it to the shared remote repository
  - The Replit Agent is running concurrently in the same workspace
  - A CC PR branch remains on remote while waiting for CI or CodeRabbit review
  - A PR is being prepared for merge and its commit scope needs verification
  - Local main (not a PR branch) has accumulated mixed CC + Replit Agent commits before push
  - A valuable Replit Agent commit needs to ship but cannot be mixed into a CC PR
  - Multiple PRs need to wait for CI gates and manual polling would otherwise be required
  - CC is actively authoring a file across multiple bash calls and the Replit Agent may touch the same path
  - "An agent's edits appear to have vanished after a branch switch — check reflog and `git log --all` before redoing the work"
tags:
  - git-hygiene
  - branch-management
  - cc-replit-collaboration
  - pr-scope
  - cherry-pick
  - agent-coordination
  - reflog-recovery
  - orphan-commit
---

# CC branch hygiene: Replit Agent stages unreviewed commits on CC PR branches

## Context

In this monorepo, Claude Code (CC) and the Replit Agent share a live workspace. The Replit Agent commits to whatever branch is currently checked out. When CC creates a fix or feature branch, pushes it to remote, and leaves it open while waiting for CI or CodeRabbit review, the Replit Agent treats the active remote branch as a valid staging target and pushes its own unrelated work onto it. Those commits travel invisibly inside the CC PR's squash merge and ship on `main` under the CC PR's stated title without scoped review of the extra content.

Three successive PRs (#63, #64, #65) hit this pattern. In the most complete instance (PR #65), CC created `fix/coderabbit-64` to fix 8 specific CodeRabbit findings. While CI ran, the Replit Agent pushed 9 files — a new `check-timing-report.ts` tool (213 lines), cache-busting changes to 6 check scripts, output sorting in `check-selective.ts`, and a new `check:timing-report` entry in `scripts/package.json`. The squash commit shipped all 15 files under "fix(coderabbit): 8 findings from PR #64". The extra content was benign, but it shipped without scoped review and its provenance was invisible in the PR description.

## Guidance

**Identify Replit Agent commits by author email, not a special header.** The commits carry no distinguishing git trailer. The two email patterns in this repo:

| Author | Email |
|---|---|
| Claude Code (shell CC) | `ricardo.cidale@norfolkgroup.io` |
| Replit Agent | `52429710-ricardocidale@users.noreply.replit.com` |

**Mandatory pre-merge scope check for every CC PR:**

```bash
# Step 1 — List all commits on the branch with author email
git log origin/main..origin/<branch> --format="%h %ae %s"

# Step 2 — List all files in the branch diff
git diff origin/main...origin/<branch> --name-only
```

If Step 1 shows any line whose email is `52429710-ricardocidale@users.noreply.replit.com`, the branch has Replit Agent commits. Compare Step 2's file list against the PR description. Files outside the stated scope that arrived via Replit commits require explicit handling.

**Cherry-pick workflow when Replit Agent commits are present:**

```bash
# Find CC-only commit SHAs (filter by CC email)
git log origin/main..origin/<branch> \
  --format="%h %ae %s" \
  | grep "ricardo.cidale@norfolkgroup.io" \
  | awk '{print $1}'

# Create a clean branch from main
git checkout -b <branch>-clean origin/main

# Cherry-pick only the CC commits (oldest-first order)
git cherry-pick <cc-sha1> <cc-sha2>

# Push clean branch and open the PR from it
git push -u origin <branch>-clean
gh pr create --title "..." --body "..."
```

**Rule:** Never merge a PR whose diff contains files outside the stated scope without explicitly naming them in the PR description. If the extra files are intentional and benign, acknowledge them: "This PR also includes [X, Y] staged by the Replit Agent — reviewed and in scope."

## Why This Matters

`git log --oneline` hides author email, so the scope violation is invisible unless the reviewer explicitly checks author metadata or scans the full file diff. A squash merge erases the commit-level distinction permanently on `main`. The result is that changes nobody explicitly approved for a given PR become unattributed work on `main` with no review trail.

The practical risk is not malicious — the Replit Agent's additions have been benign. The risk is loss of review discipline: if a Replit Agent commit contained a regression or a magic-number violation, it would ship under the CC PR's stated verification gates (typecheck, check-magic-numbers, tests) without anyone confirming those gates apply to the new files. PR #66 — a `DEFAULT_STAFF_SALARY` shadow declaration fix surfaced by Vito — was merged cleanly in the same session because the scope check was applied immediately after the rule was added.

## When to Apply

- Before merging any CC PR where the branch has been live on remote for more than a few minutes
- Whenever CI takes more than ~2 minutes — this is the primary window where the Replit Agent stages commits
- Before using `gh pr merge --auto` on a mixed-author branch — auto-merge gives no natural pause to run the scope check. After splitting into per-author PRs (see § "Per-commit triage and conditional auto-merge watchers"), each PR is single-author by construction and the conditional watcher is safe
- When the PR file count in the CodeRabbit summary is higher than expected
- When `git log origin/main..origin/<branch> --oneline` shows more commits than the CC session authored

## Examples

**Detecting Replit Agent commits on a CC branch:**

```bash
git log origin/main..origin/fix-coderabbit-64 --format="%h %ae %s"
# 3a9f1bc  ricardo.cidale@norfolkgroup.io                              fix(tools): remove duplicate tool registrations
# 7d22a01  52429710-ricardocidale@users.noreply.replit.com  feat(scripts): add timing report tool
# 1f08c44  52429710-ricardocidale@users.noreply.replit.com  fix(check-cache): bust cache on pnpm-lock.yaml
# ↑ Two Replit Agent commits on what should be a CC-only fix branch
```

**Confirming the file scope matches the scope violation:**

```bash
git diff origin/main...origin/fix-coderabbit-64 --name-only
# artifacts/api-server/src/routes/tools.ts        ← CC commit (in scope)
# scripts/src/check-timing-report.ts              ← Replit Agent (out of scope)
# scripts/src/check-magic-numbers.ts              ← Replit Agent (out of scope)
# ...
```

**Clean-branch cherry-pick in practice:**

```bash
# Only CC commit: 3a9f1bc
git checkout -b fix-coderabbit-64-clean origin/main
git cherry-pick 3a9f1bc
git push -u origin fix-coderabbit-64-clean
gh pr create --title "fix(coderabbit): 8 findings from PR #64"
# git diff origin/main...origin/fix-coderabbit-64-clean --name-only
# now shows only the CC-authored file — scope is clean
```

**Acknowledging benign out-of-scope files instead of cherry-picking:**

When the Replit Agent's additions are small and harmless, acknowledge them explicitly in the PR description rather than cherry-picking:

```
## Scope note
This PR also includes 3 script files staged by the Replit Agent
(check-timing-report.ts, check-selective.ts sort order, package.json entry).
Reviewed and safe to ship alongside the CodeRabbit fixes.
```

## Per-commit triage and conditional auto-merge watchers

The PR-branch pattern above handles the case where the Replit Agent stages commits onto a CC branch already on remote. The generalization: when **local `main`** (not a PR branch) accumulates mixed CC + Replit Agent commits before push, split it into per-author PRs, and use a backgrounded `until` loop to wait for CI gates without manual polling.

### Step 1 — Inspect each Replit Agent commit on its merits

For each commit, `git show --stat <sha>` and read the diff. Decide:

- **Worthless** — empty commit (zero file changes), workflow-ops log entry, or content that duplicates/conflicts with CC work. Mark for drop.
- **Valuable** — real content (e.g., a `docs/solutions/` learning doc syncing to a refactor; a test fixture). Mark for cherry-pick.

Empty commits are virtually always worthless — they're Replit Agent restart/workflow log artifacts masquerading as commits.

### Step 2 — Cherry-pick each valuable commit to its own fresh branch off `origin/main`

One branch per logical change. Cherry-picking preserves the original committer authorship — important for the audit trail:

```bash
git fetch origin main

# CC commit
git checkout -b chore/<cc-branch-name> origin/main
git cherry-pick <cc-sha>
git push -u origin chore/<cc-branch-name>

# Valuable Replit Agent commit — separate branch, never mix
git checkout -b docs/<replit-branch-name> origin/main
git cherry-pick <replit-sha>
git push -u origin docs/<replit-branch-name>
```

### Step 3 — PR body explicitly acknowledges Replit Agent authorship

For a CC PR, business as usual. For any cherry-picked Replit Agent commit, the PR body must state where the commit came from and why the content is being shipped. The cherry-pick **is** the in-scope acknowledgement; the PR body makes it visible:

> Cherry-picked from a Replit Agent commit (`<sha>`) and shipped via a clean branch off `origin/main` per CC branch hygiene discipline. No CC review skipped — this PR is the review.
>
> **Why ship this Replit Agent commit:** [one-paragraph explanation of the content value]

### Step 4 — Background a conditional auto-merge watcher per PR

After the per-commit split each PR is single-author by construction, so auto-merge is safe. Use a backgrounded `until` loop to wait for CI gates and merge without manual polling. Two variants:

**Variant A — wait for all checks to pass, then merge:**

```bash
timeout 1800 bash -c '
until ! gh pr checks <PR> 2>&1 | grep -q pending; do sleep 30; done
FINAL=$(gh pr checks <PR> 2>&1)
if echo "$FINAL" | grep -qE "^[^\t]+\tfail"; then
  echo "FAILURES — NOT MERGING"
  exit 1
fi
gh pr merge <PR> --squash --delete-branch
'
```

**Variant B — gate on one specific check, ignore optional/noisy checks (e.g., Railway preview):**

```bash
timeout 1800 bash -c '
until ! gh pr checks <PR> 2>&1 | grep "^CodeRabbit" | grep -q pending; do sleep 30; done
FINAL=$(gh pr checks <PR> 2>&1)
FAILS=$(echo "$FINAL" | grep -E "\tfail\t" | grep -v "H+ Analysis - H-Analytics")
if [ -n "$FAILS" ]; then exit 1; fi
gh pr merge <PR> --squash --delete-branch
'
```

Run via `Bash(..., run_in_background=true)`. The 30-minute `timeout` keeps a stuck watcher from running forever. `gh pr merge --squash --delete-branch` deletes both local and remote branches — no separate cleanup needed.

### Step 5 — Drop the worthless commits via hard reset

Once every valuable commit is preserved on a pushed PR branch:

```bash
git checkout main
git reset --hard origin/main
```

Safe because (a) the CC commit is on its PR branch, (b) the valuable Replit commits are on their PR branches, (c) worthless Replit commits are by definition disposable. After each PR merges, `git pull --ff-only origin main` brings local `main` forward with the squashed merge commits.

## Sub-pattern: Replit Agent edits CC's in-flight WIP file mid-session

The PR-branch and local-main patterns above cover the case where the Replit Agent stages **new, unrelated** commits onto a CC branch. A sharper variant: while CC is **actively authoring a file** across multiple bash calls (typical for a spike, a scratch script, or any multi-step edit), the Replit Agent commits its own version of the same file onto the same branch — overwriting CC's WIP state in the working tree at the next `git checkout`.

### When it surfaces

- CC creates a feature branch and starts work that involves several rounds of edit → run → debug → edit (e.g., the U1 pptx substitution spike on 2026-05-11)
- The Replit Agent independently decides to edit a file CC has open and commits its take
- `git status` on the CC side starts showing `deleted:` or `modified:` for files CC was authoring — the Replit commit overwrote them
- `git log origin/main..HEAD` shows two Replit-authored commits between CC's commits, one of which has a subject like "Update script to customize…" matching the file CC was editing

### Why cherry-picking-only is insufficient

The standard cherry-pick workflow (§ Step 2 above) assumes CC's work is already **committed**. When CC's work is partially committed and partially WIP, naive cherry-picking will:

- Reset the WIP files to the Replit-edited version (silently discarding CC's in-progress changes)
- Or skip the WIP files entirely, leaving CC to manually reconstruct them from memory

The recovery has to preserve CC's WIP outside Git first.

### Recovery procedure (`*-DIRTY-with-replit` branch rename)

```bash
# 1. Back up CC's uncommitted/WIP files OUTSIDE the repo before any branch ops
mkdir -p /tmp/<unit>-backup
cp <cc-wip-file-1> <cc-wip-file-2> ... /tmp/<unit>-backup/

# 2. Save any remaining uncommitted state as a safety net
git stash --include-untracked

# 3. Rename the dirty branch to preserve Replit's commits for a separate PR
git branch -m <cc-branch> <cc-branch>-DIRTY-with-replit

# 4. Create a fresh clean branch from origin/main
git checkout -b <cc-branch> origin/main

# 5. Cherry-pick any pre-existing fixes you authored elsewhere
git cherry-pick <fix-sha>

# 6. Re-run any installs / codegen / migrations that were part of CC's work
pnpm --filter <pkg> add <dep>

# 7. Restore the backed-up WIP files to their canonical paths
cp /tmp/<unit>-backup/<file> <restore-path>

# 8. Stage and commit as a single CC-authored commit
git add <cc-files>
git commit -m "<unit-scoped message>"

# 9. Push the clean branch and open the PR
git push -u origin <cc-branch>
gh pr create --title "..." --body "..."
```

The `*-DIRTY-with-replit` branch acts as a safety net — until both PRs ship (the clean CC PR plus a separate PR cherry-picking Replit's valuable commits), no work is lost. Once both have merged, `git branch -D <cc-branch>-DIRTY-with-replit` cleans up.

### Why this works

- **Filesystem backup is the durable checkpoint.** Git stash is fragile across branch ops when working-tree state is messy; `cp` to `/tmp` guarantees the WIP survives any branch operation
- **Renaming preserves both bodies of work.** Replit's commits live on the renamed branch and can be cherry-picked into their own PR with the correct title and scope. CC's clean branch ships CC-only history
- **Cherry-pick + re-install is faster and safer than history rewriting.** No risk of corrupting refs that may already have been pushed; no fragile rebase conflicts; each commit on the new branch has a single clear author

### Anti-patterns (would destroy work)

- `git reset --hard origin/main` in place — destroys both Replit's valuable commits AND CC's uncommitted WIP
- `git filter-branch` / interactive rebase to drop Replit commits — destructive history rewriting; loses Replit's work entirely
- Merging Replit's commits into the CC PR — ships unreviewed-in-context work under a CC PR title; violates the same scope rule § "Cherry-pick workflow" enforces

### Proactive check

When starting CC work that will span more than ~10 minutes of bash calls on a single file, snapshot first:

```bash
cp scripts/src/<wip-file>.ts /tmp/<unit>-backup/  # immediate snapshot
```

Cheap insurance: even one snapshot at the start gives a recovery point if Replit commits over the file later.

### Worked example — 2026-05-11 session

Starting state of local `main`:

```
8fbe53c3 [Replit Agent] chore: restart stopped workflows for logo login        ← empty, worthless
9088c7a9 [Replit Agent] Update documentation to reflect recent code refactoring ← valuable
94f54990 [CC]           chore(docs): trim CLAUDE.md (539→493) closes U5 gap    ← CC work
```

Inspection: `8fbe53c3` has zero files changed (drop). `9088c7a9` updates two `docs/solutions/architecture-patterns/` learnings to match the post-split file layout — `DataChangedEntry` union grown 12 → 16 types, `chat.ts` references updated to the new `chat-loop.ts` / `chat-llm.ts` / `chat-sse.ts` split (valuable, cherry-pick).

Cherry-picked CC commit → PR #90 (Variant B watcher: gate on CodeRabbit, ignore Railway preview).  
Cherry-picked Replit Agent commit → PR #91 with explicit authorship acknowledgement in the body (Variant A watcher: all checks must pass).

Both merged successfully: PR #90 as `5e245b24` (CodeRabbit "Review completed" PASS); PR #91 as `9be96277` (CodeRabbit "Review skipped" on docs-only diff, all other gates green). No Replit Agent commits in either PR's diff scope; both authors preserved in commit history. The empty `8fbe53c3` dropped via `git reset --hard origin/main`.

### Worked example — 2026-05-11 U1 spike session (WIP-file collision variant)

CC was executing U1 of the Factory v2 plan (PPTX substitution library spike). CC's flow: create `feat/u1-pptx-substitution-spike` from `origin/main`, `pnpm add pptx-automizer`, write `scripts/src/pptx-substitution-spike.ts` over ~6 rounds of edit/run/debug (discovered `cleanup: true` triggers a content-tracker bug, `modify.replaceText` is unstable on the canonical PPTX, pivoted to `modify.setText`), then start the decision doc.

While CC was mid-debug, the Replit Agent committed twice onto the same branch:

```
51d34750 [Replit Agent] Update script to customize presentation text and save output
27e10979 [Replit Agent] feat(company): graduate Swiss-Minimal KPI hero into KPIGrid + per-card accents
```

`27e10979` was independent and valuable (graduating a sandbox mockup into production `KPIGrid` with `variant="swiss"` + Y1 baselines + per-card accents). `51d34750` was Replit's own version of the spike file — overwriting CC's WIP. The diff stat showed `scripts/src/pptx-substitution-spike.ts | 56 ++++++++++++++++------------------` confirming Replit had rewritten CC's in-flight file.

Recovery applied the `*-DIRTY-with-replit` procedure above:

```bash
mkdir -p /tmp/u1-backup
cp scripts/src/pptx-substitution-spike.ts \
   docs/solutions/architecture-patterns/pptx-substitution-library-decision-2026-05-11.md \
   /tmp/u1-backup/

git stash --include-untracked
git branch -m feat/u1-pptx-substitution-spike feat/u1-spike-DIRTY-with-replit
git checkout -b feat/u1-pptx-substitution-spike origin/main
git cherry-pick fc436579   # pre-existing typecheck fix
pnpm --filter @workspace/api-server --filter @workspace/scripts add pptx-automizer
cp /tmp/u1-backup/pptx-substitution-spike.ts scripts/src/
cp /tmp/u1-backup/pptx-substitution-library-decision-2026-05-11.md \
   docs/solutions/architecture-patterns/

git add scripts/src/pptx-substitution-spike.ts \
        docs/solutions/architecture-patterns/pptx-substitution-library-decision-2026-05-11.md \
        artifacts/api-server/package.json scripts/package.json pnpm-lock.yaml
git commit -m "feat(factory-v2): U1 — choose pptx-automizer..."
git push -u origin feat/u1-pptx-substitution-spike
gh pr create --title "feat(factory-v2): U1 — pptx-automizer chosen, spike + decision doc"
```

Result: PR #112 shipped from the clean CC branch with CC-only history (verified via `git log --format='%h %an %ae'` showing zero `Replit-Commit-Author` trailers). The Swiss-Minimal KPI work on `feat/u1-spike-DIRTY-with-replit` remains locally available for a follow-up PR cherry-picking only `27e10979`.

## Sub-pattern: orphan auto-checkpoint commit on a wrong-branch lineage (reflog recovery)

The two patterns above assume your work is either uncommitted (WIP-collision recovery) or committed on the branch you expect (cherry-pick scope check). A third variant: the Replit Agent's auto-checkpoint **already committed your edits** — but onto a branch lineage you didn't intend (often because CC had moved HEAD between your edit and the checkpoint, or because the user paused you mid-task and CC switched branches before you resumed). When you come back, `grep` for your changes in the working tree returns nothing and the work appears lost. It isn't — the commit is reachable via reflog and `git log --all`.

### When it surfaces

- You edit one or more files, are paused mid-task, and the user warns "CC is working on the same code"
- When you resume, the current branch is different from what you expected (often a CC PR-rebase branch or a CC refactor topic branch — visible via `git --no-optional-locks branch --show-current`)
- `grep`/`rg` for your additions in the working tree returns zero matches
- `git --no-optional-locks status` shows a clean working tree — no stash, no untracked WIP
- The auto-checkpoint message in the system feed referenced a commit SHA that doesn't appear in `git log -5` on the current branch

### Why the work isn't actually lost

The Replit Agent auto-checkpoint runs against whatever HEAD was checked out at the moment your edits were dirty. If CC had not yet switched branches when the checkpoint fired, your edits landed as a Replit-Agent-authored commit on **that** branch's tip. CC's subsequent branch switch moves HEAD away — leaving your commit on a branch that may now look orphaned relative to the current checkout, but is still fully reachable via SHA, reflog, and `git log --all`.

The auto-checkpoint commit message is descriptive (the Replit Agent infers a one-line summary from the diff content), which makes the commit findable by content keywords even when you don't know the SHA.

### Recovery procedure

```bash
# 1. Survey ALL recent commits across every ref, not just current branch
git --no-optional-locks log --all --oneline --since="3 days ago" | head -40

# 2. Search by content keyword from your edit (column name, function name, etc.)
git --no-optional-locks log --all --oneline --grep="<keyword-from-your-edit>" -i \
    --since="3 days ago"

# 3. Walk the reflog — your edits may also be reachable via a recent HEAD position
git --no-optional-locks reflog | head -20

# 4. Check stashes — lint-staged and other hooks auto-stash on commit
git --no-optional-locks stash list

# 5. Once the commit SHA is identified, verify its diff matches your work
git --no-optional-locks show <sha> --stat
git --no-optional-locks show <sha> -- <file-you-edited>

# 6. If the commit is on a branch lineage you do NOT want to ship from
#    (e.g., a CC PR-rebase branch unrelated to your task), cherry-pick it
#    onto a fresh branch off origin/main — DO NOT mix it into the unrelated branch
git fetch origin main
git checkout -b <task-scoped-branch-name> origin/main
git cherry-pick <sha>
```

Step 1 is the highest-leverage move. The Replit Agent's friendly commit titles (`"Add fields to track property improvements and their descriptions"`, `"Update documentation for property edit page restructure"`, etc.) make `git log --all --oneline --since=<window>` a fast scan. **Always do this before re-typing edits** — the cost of a one-line `git log` is trivial vs. re-deriving committed work and producing a duplicate orphan.

### When to suspect this pattern over WIP-collision

| Signal | This pattern (orphan commit) | WIP-collision pattern |
|---|---|---|
| `git status` after resume | Clean | Modified/deleted files |
| Working tree has your edits | No | Partially yes |
| Recent commits in `git log --all` matching your work | Yes (Replit-Agent author) | Yes (Replit-Agent author) on current branch |
| Branch HEAD vs. expected | Different (CC moved it) | Same |
| Recovery primitive | `git cherry-pick` onto fresh branch | Filesystem backup + branch rename |

Both patterns share the same prevention rules below — the difference is purely diagnostic.

### Worked example — 2026-05-12 Task #1404 (Property Assumptions Restructure — Milestone A)

The Replit Agent edited `lib/db/src/schema/properties.ts` to add 6 nullable columns (`fbVenuesImproved`, `fbSeatsImproved`, `eventSpaceSqftImproved`, `totalBuildingSqftImproved`, `plannedReopeningYear`, `descriptionImproved`) plus the matching `insertPropertySchema.pick({...})` entries. The user paused with "CC is working on same code" before the migration could be generated. On resume, the branch was `update/pr124-rebase` (later moved to `refactor/lorenzo-vision-model-relocation`), and `rg "Improved" lib/db/src/schema/properties.ts` returned zero matches. `git status` was clean.

Initial reaction was to re-apply the schema edits. Instead, the recovery scan above found the work intact:

```bash
$ git --no-optional-locks log --all --oneline --since="3 days ago" | head -10
9e332d2c refactor(slides): add resolveLorenzoVisionModelId() resolver (U2)
ae5439dc refactor(slides): seed factory-v2-lorenzo-vision llm_slot row (U1)
6cacfd09 Update documentation for code improvements and model relocation
e363dc0a feat(factory-v2): U8 — Lucca best-shot + Builder substitution map + Marco assembly
a10aeacd chore(merge): resolve conflict in slide-6-embed-flow.test.ts
...
fd67f146 Add fields to track property improvements and their descriptions       ← !
f22bbe44 Add fields to track property improvements and their descriptions       ← !
```

`git show f22bbe44 --stat` confirmed the exact 24-line diff to `lib/db/src/schema/properties.ts` (6 columns + 6 picks). Both `f22bbe44` and `fd67f146` were duplicate auto-checkpoints. They descended from `e075cb2d` on the `fix/coderabbit-pr117-pr118-followups` lineage — not from `main`, and not from any milestone-A branch. Recovery plan: cherry-pick `f22bbe44` onto a fresh `feat/property-assumptions-milestone-a` off `origin/main` instead of re-typing the schema. Time saved: ~10 minutes of re-derivation plus the risk of producing a third duplicate auto-checkpoint.

### Prevention

- **First diagnostic on every "where did my work go?" moment is `git log --all --oneline --since=<window>`.** Run it before any keystroke that recreates work. The Replit Agent commit message is descriptive enough that scanning 30 lines is faster than re-typing one column.
- **When the user pauses you with a CC-collision warning, note the exact files you had edited.** A one-line scratch note ("edited properties.ts schema + insertPropertySchema picks") makes the post-resume content search trivial.
- **Do not re-apply edits onto whatever branch is currently checked out post-resume.** The current HEAD is whatever CC left it on — almost never the right target for your task. Always verify intended branch (`git branch --show-current`) and create or check out a task-scoped branch before redoing.
- **Treat orphan auto-checkpoint commits as recoverable assets, not garbage.** Cherry-pick them into the right branch instead of ignoring them — the commit message preserves the agent's edit summary.

## Related

- `CLAUDE.md` § "CC branch hygiene — Replit agent staging risk" — the live enforcement rule (added PR #67, 2026-05-10)
- `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` — covers the Replit auto-checkpoint mechanism that enables this staging pattern
- `docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md` — the existing pre-merge gate sequence that the new scope-check gate extends
- `docs/solutions/workflow-issues/squash-merge-with-failing-required-check-2026-05-11.md` — the complementary failure mode where a PR ships with a red required check and downstream branches inherit a regression
