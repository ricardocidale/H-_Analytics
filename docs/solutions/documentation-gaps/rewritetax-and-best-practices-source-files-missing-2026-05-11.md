---
title: "Memory.md cites rewritetax.md and best-practices.md but neither file exists at repo root"
date: 2026-05-11
category: documentation-gaps
module: agent-memory-files
problem_type: documentation_gap
component: documentation
severity: high
applies_when:
  - "An agent memory file (memory.md, CLAUDE.md, replit.md) cites a sibling source-of-truth file"
  - "Agents in fresh sessions try to follow the citation and find a missing file"
  - "Project doctrine (rewrite-tax discipline, forward-discipline playbook) lives only inside a file that no longer exists"
symptoms:
  - "`./memory.md` line 20 references `best-practices.md` (project root) — file does not exist"
  - "`./memory.md` line 20 references `rewritetax.md`'s 7 cost vectors — file does not exist"
  - "Agents asked to apply rewrite-tax discipline have no source to cite from"
  - "`docs/memory-archive/2026-04-archive.md` referenced from `./memory.md` line 78 — exists, so the pattern of citing siblings is established"
tags:
  - rewrite-tax
  - memory-files
  - agent-memory
  - documentation-drift
  - source-of-truth
related_components:
  - documentation
---

# Memory.md cites rewritetax.md and best-practices.md but neither file exists at repo root

## Context

`./memory.md` (line 20) contains:

> ## Forward-Discipline Playbook
> See `best-practices.md` (project root) — 22-rule playbook from `rewritetax.md`'s 7 cost vectors. Categories: (A) multi-agent hygiene, (B) avoiding architectural redirection, (C) vendor & library decisions, (D) AI/prompt-tuning, (E) DB & migration hygiene, (F) cosmetic churn, (G) platform tax.

Neither `./rewritetax.md` nor `./best-practices.md` exists at the repo root as of 2026-05-11. Both filenames return file-not-found from `read` and from `find . -maxdepth 4 -iname …`. The 22-rule playbook and the 7 cost vectors that doctrine depends on are no longer in the repository.

This is the rewrite-tax problem documenting itself: the source of truth for the team's discipline against context-loss has itself been lost to context-loss.

## Symptoms in Context

- An agent in a fresh session reads `./memory.md`, sees the citation, opens what it expects to be the playbook, and gets a parser error or a guess. Worst case, the agent fabricates the 22 rules from the seven category letters in the citation.
- Code review and planning agents asked to "apply rewrite-tax discipline" cannot cite specific cost vectors. They fall back to generic engineering hygiene that doesn't match the team's documented framing.
- `replit.md` (line 5) declares `CLAUDE.md` as the canonical deep source. Neither `CLAUDE.md` nor `replit.md` references `rewritetax.md` or `best-practices.md`. The doctrine is orphaned in `./memory.md` only.

## Guidance

**Treat any "see file X" citation in a memory file as a load-bearing reference. Verify the file exists. If it does not, one of three actions is required:**

1. **Restore.** If the file existed and was deleted in error, restore from a checkpoint or from a `.claude/worktrees/agent-*/memory.md` snapshot (these often contain copies of cited files captured during earlier sessions).
2. **Inline.** If the cited content is short (a 22-rule playbook fits in one screen), inline the rules into the memory file itself and remove the citation. This trades file-modularity for guaranteed availability.
3. **Repath.** If the file was moved (e.g., into `docs/`), update the citation to the new path and verify the link.

**Do not silently leave the citation pointing at nothing.** That is strictly worse than no citation at all because it implies the playbook exists and is being followed.

**Add a memory-file integrity check** to the project's pre-merge gates:

```bash
# scripts/check-memory-citations.sh
set -euo pipefail
errors=0
for f in memory.md replit.md CLAUDE.md AGENTS.md; do
  [ -f "$f" ] || continue
  # Extract backtick-wrapped filenames that look like markdown files
  while IFS= read -r cited; do
    if [ ! -e "$cited" ] && [ ! -e "./$cited" ]; then
      echo "::error file=$f::cites missing file: $cited"
      errors=$((errors+1))
    fi
  done < <(grep -oE '`[A-Za-z0-9._/-]+\.md`' "$f" | tr -d '`' | sort -u)
done
exit $errors
```

Wire it into the existing `check:*` workflow set so any future drift fails fast.

## Why This Matters

This isn't a cosmetic doc issue — it is a self-evidencing instance of the rewrite tax. The team built a discipline framework specifically to combat agent context-loss. That framework's source files have themselves vanished, which means:

- Any agent applying the discipline today is applying it from memory of the citation, not from the rules. That is the same failure mode the rules were meant to prevent.
- The 22 rules are the only artifact that operationalizes the 7 cost vectors. Without them, the cost-vector taxonomy is decorative.
- Every fresh session compounds the loss further: agents learn the citation exists, find no file, and either fabricate or ignore. Both outcomes drift.

## When to Apply

- Any time you read a memory file (`memory.md`, `CLAUDE.md`, `replit.md`, `AGENTS.md`) and notice a `see X.md` reference.
- Before relying on any memory-file directive that points at an external source.
- During the discoverability check at the end of `/ce-compound` — verify cited files exist.
- When onboarding a new agent or new session — the citation graph is part of the contract.

## Examples

**Today, in this repo:**

```
$ rg '`[a-z-]+\.md`' memory.md
`best-practices.md` (project root)
`rewritetax.md`'s 7 cost vectors
docs/memory-archive/2026-04-archive.md

$ ls best-practices.md rewritetax.md
ls: cannot access 'best-practices.md': No such file or directory
ls: cannot access 'rewritetax.md': No such file or directory

$ ls docs/memory-archive/2026-04-archive.md
docs/memory-archive/2026-04-archive.md          # this one exists
```

Two of three cited files are missing.

**Recovery options for this specific case:**

- Search `.claude/worktrees/agent-*/memory.md` for verbatim copies of the 22 rules — Claude Code worktree memory files often contain ingested copies of the canonical rules.
- Inline the recovered 22 rules directly into `./memory.md` § "Forward-Discipline Playbook", remove the `see best-practices.md` reference, and let the section stand on its own.
- Add `rewrite-tax: 7-cost-vector synthesis` as a `docs/solutions/best-practices/` doc so future agents discover it through the searchable knowledge store rather than through a brittle root-level citation.

## Related

- `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md` — earlier instance of memory-file drift between `claude.md` and `replit.md`
- `agent-memory-files` skill — harmonization discipline for multi-file memory setups
- `./memory.md` — the file with the broken citation
- `docs/memory-archive/2026-04-archive.md` — the archive pattern that does work, as evidence that this team can do it right
