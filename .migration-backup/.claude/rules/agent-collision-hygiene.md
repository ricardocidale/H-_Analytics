# Agent Collision Hygiene

## Rule

When two agents (Claude Code + Replit Agent) work on the same branch concurrently, **uncommitted work is at risk of being silently bundled into the other agent's commit.** This rule codifies atomic-commit discipline and pre-commit `git status` checks that prevent it.

Binding on both agents.

## The failure mode (observed 3 times in this repo)

Without this discipline, the following sequence happens:

1. Agent A starts a multi-file edit at 14:00.
2. Agent A is mid-work at 14:15; files modified but not committed.
3. Agent B (in a separate session) runs `git add -A && git commit -m "..."` at 14:20.
4. Agent B's commit bundles Agent A's uncommitted files under Agent B's authorship + commit message.
5. Agent A discovers the collision later when `git commit` reports "nothing to commit, working tree clean" — their work shipped under the wrong attribution.

**Observed collisions in this repo (April 2026):**
- Lint Batch 8 (Claude Code's 38 `as any` fixes) bundled into Replit's `9058b1ce` mode-collapse commit.
- Doc hygiene refresh (Claude Code's SYSTEM-MODEL + claude.md + parity-exemption-classes rule) bundled into Replit's `b9e840e4` OT-A.4 commit.
- Plus one earlier incident documented in session memory.

**Cost of each collision:**
- Attribution lost (session memory append becomes the only Claude Code record of the work).
- Commit messages diverge from actual content (reviewer sees "OT-A.4 shipped" but the commit also contains lint cleanup).
- Rollback scope becomes fuzzy — reverting one logical unit reverts unrelated work.
- Reviewer trust erodes.

## Six disciplines (mandatory, both agents)

### 1. Atomic commit cadence

Any logical unit of work that takes **≤ 10 minutes** must commit immediately on completion. Don't hold completed work uncommitted "until the batch is done." The other agent may be working concurrently.

Unit examples:
- One lint batch → one commit
- One ADR draft → one commit
- One rule file addition → one commit
- One session-memory append → one commit

Multi-unit work should commit unit-by-unit, not in one aggregated push.

### 2. Pre-add `git status` check

Before running `git add -A` or `git add .`, run `git status` (mental check: "Are any of these files I didn't touch this session?"). If yes: the other agent has in-flight work. Do NOT include those files in your commit.

Safe pattern:

```
# BAD — includes the other agent's work
git add -A && git commit -m "my work"

# GOOD — stages only files you touched
git add -p   # or stage explicit files by name
git status    # verify staged matches your work
git commit -m "my work"
```

The `-A` flag is a footgun when another agent is active. Prefer explicit staging.

### 3. Pull before starting any logical unit

At the start of each new logical unit (rule file, test file, doc edit, code fix), run `git pull --ff-only origin main`. This surfaces any commits landed by the other agent since your last pull. If the pull fails (non-ff): stop, investigate, don't force.

### 4. Branch for anything > 30 minutes

If a logical unit will take longer than 30 min, open a feature branch (`feature/claude-<topic>` or `feature/replit-<topic>`). Commit to the branch. Merge to main when done.

This prevents the "I have 45 minutes of uncommitted work on main" anti-pattern.

Exception: observation-phase holds (like the OT-A.4 72h window) are exempt — they're intentionally uncommitted drafts. Place them in `.local/drafts/` (untracked) or a holding branch until the window closes.

### 5. If a collision happens — attribute in session memory

When a collision is discovered post-hoc:

1. Do NOT rewrite history. The collided commit stays as-is.
2. Append a session-memory line naming what the other agent's commit actually contained beyond its message. Example:

   > "Note: commit `b9e840e4` (message: OT-A.4 flip) also contains Claude Code's SYSTEM-MODEL + parity-exemption-classes rule landing. Collision, not misattribution."

3. The attribution correction lives in session memory + this rule's precedent section, not in commit history.

### 6. Blame-neutral framing

Collisions are structural (two agents, one branch) not fault-based. Don't frame as "Replit overwrote my work" or "Claude left files dirty." Frame as "shared-branch concurrency requires discipline, here's what we learned."

## What this rule does NOT require

- Separate branches per agent as a default. Monolithic `main` with short-lived branches is fine.
- Commit hooks that reject multi-author changes. Git doesn't support that cleanly.
- Real-time locks between agents. Not architecturally feasible across session boundaries.

This is a behavioral discipline, not a tooling enforcement. Both agents have the context to follow it.

## When this rule is hardest to follow

- **Review-heavy sessions** — when an agent is mid-review of multiple files before committing, unstaged work accumulates. Mitigation: commit a "WIP: <scope>" checkpoint, amend later (per-agent, on your own branch), or use `git stash` if the check needs to pause work.
- **Multi-file refactors** — lint cleanup batches, doc sweeps. Mitigation: commit after each file or each sub-batch.
- **Long-running test/verify suites** — when five gates take 10+ minutes, don't start new edits mid-run. Wait, commit, then start the next unit.

## Related

- `.claude/rules/claude-replit-split.md` — split of concerns between agents (prevents overlap at the planning level).
- `.claude/rules/pre-commit-verification.md` — five gates (prevents bad commits, orthogonal to collision).
- `.claude/session-memory.md` — log post-hoc attribution corrections when collisions happen.
