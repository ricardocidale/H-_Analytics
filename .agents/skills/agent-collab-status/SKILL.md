---
name: agent-collab-status
description: Two-file coordination protocol so CC (shell Claude Code) and Replit Agent know what the other is doing and avoid overwriting each other's work. Read before touching any file; update at session boundaries.
---

# Agent Collaboration Status

H+ Analytics has two code-writing agents: **CC** (shell Claude Code, runs locally) and **Replit Agent** (runs in the Replit workspace). Both share the same working tree and can commit to the same branches. Without coordination, one agent routinely overwrites the other's in-progress work.

This skill defines the protocol.

---

## The Two Files

| File | Owner (sole writer) | Reader |
|---|---|---|
| `.agents/status/cc.md` | CC only | Replit reads, never edits |
| `.agents/status/replit.md` | Replit only | CC reads, never edits |

**One owner per file, no exceptions.** This eliminates merge conflicts at the protocol layer — each agent writes only to its own file.

Both files are tracked in the repo (not gitignored). Rationale: both agents share the same working tree and can see each other's writes immediately. The git history gives an audit trail of coordination events, directly serving the "avoid rewrites" goal.

---

## File Format

```markdown
# <Agent Name> — Agent Status

<!-- <Agent> is the SOLE WRITER of this file. <Other> reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: <ISO 8601 timestamp>
Status: <idle | active | handoff-pending>

## Active Branch

<branch name, or "None">

## Last Commit on Branch

`<short SHA>` — "<commit message>"

## What <Agent> Did This Session

- <bullet summary of changes made>

## Files <Agent> Owns Right Now

<list of files/dirs currently being edited, or "None">

## Handoff to <Other Agent>

<specific instruction for what the other agent should pick up, or "(none pending)">

## Pending <Agent> Work (do NOT touch — <Agent> will handle)

<numbered list of items the counterpart must leave alone>

## Do Not Touch

<always-on list of surfaces permanently off-limits to the counterpart>
```

---

## Status Values

| Value | Meaning |
|---|---|
| `idle` | Agent is not currently active in this repo |
| `active` | Agent is running a session right now |
| `handoff-pending` | Agent finished work; counterpart has a pending pickup |

---

## Staleness Clause

If `Updated` timestamp is **more than 24 hours ago**, treat the status as `idle` regardless of what the `Status` field says. Crashed or abandoned sessions do not hold locks indefinitely.

---

## The Branch Is the Primary Collision Signal

The most common failure mode is: CC opens a branch for a PR, pushes it, and leaves it open waiting for CI. Replit agent, unaware, commits to that branch — those commits ship under the CC PR title, bypassing review scope.

**Before starting any work, read the counterpart's `Active Branch`.** If the counterpart has an active branch:

1. Check whether you need to touch the same files.
2. If yes, wait or coordinate explicitly (leave a note in your status file's `Handoff` section).
3. If no, proceed — but avoid committing to the counterpart's branch unless explicitly instructed.

The `Last Commit on Branch` SHA lets you verify what landed without running `git log`.

---

## Update Cadence

### Session start
1. Read the counterpart's status file.
2. Note any active branch or "do not touch" files.
3. Update **your own** status file: set `Status: active`, record `Active Branch`, set `Updated` to now.

### During the session
Update `Files <Agent> Owns Right Now` when you begin editing a significant file or directory. Remove entries when you're done with them.

### Session end
1. Set `Status: idle` (or `handoff-pending` if you want the other agent to pick something up).
2. Clear `Files <Agent> Owns Right Now` → `None`.
3. Fill in `Handoff to <Other Agent>` if applicable.
4. Set `Updated` to the current time.
5. Commit the status file as part of your session's final commit (or as a standalone `chore(status)` commit).

---

## Surfaces Permanently Off-Limits to Replit Agent

Even if the status files show no active CC session, Replit must **never** touch:

- `lib/engine/src/` — financial engine (CC-only per CLAUDE.md §9)
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests

These restrictions are in `CLAUDE.md §9` and enforced regardless of coordination status.

---

## Composition with Other Skills

- **`agent-memory-files`** — the TODO lists in `CLAUDE.md` and `replit.md` are the canonical backlog. Status files carry the current-session snapshot; TODO lists carry the durable cross-session backlog.
- **`agent-handoff-briefs`** — for complex handoffs, a full brief supplements the status file's `Handoff` section.
- **CC branch hygiene** (`CLAUDE.md` § "CC branch hygiene") — the branch-is-primary-signal rule here directly prevents the CC/Replit branch contamination failure described there.
