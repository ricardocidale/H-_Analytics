---
name: replit-workflow
description: What Replit Agent is uniquely positioned to do, and the hygiene rules that keep Replit/Claude Code coordination clean. Load when working inside Replit Agent (this skill is authoritative for Replit-side behavior), or when Claude Code is about to hand off to Replit.
type: operational
---

# Skill: Replit Workflow & Hygiene

**Audience:** Replit Agent directly, and Claude Code when writing handoffs.

**Purpose:** End the coordination churn between the two agents. Replit does what Replit is uniquely good at; Claude Code does what Claude Code is uniquely good at; the skill files, rules, and memory stay clean because both agents know who owns what and when.

---

## The core split (from `.claude/rules/claude-replit-split.md`)

| Category | Owner | Why |
|---|---|---|
| **Runtime UI** (React components, pages, hooks, styles) | **Replit** | Needs the live preview pane to verify visually |
| **Database schema + migrations** (`shared/schema/**`, `migrations/**`) | **Replit** | Needs the live Neon DB to apply migrations and verify integrity |
| **Seed data + fixture edits** (`server/seeds/**`) | **Replit** | Needs the live DB to confirm no data loss |
| **Env vars / Replit Secrets / `.replit` / `replit.nix`** | **Replit** | Deployment-affecting; owned by the running container |
| **Package additions / `npm install`** | **Replit** | Changes the build/runtime |
| **End-to-end verification** (clicking through flows, browser smoke tests) | **Replit** | Has the running browser session |
| **AI model calls that need live credentials** | **Replit** | Has the Secrets wired in |
| **Audits, architectural decisions, contract design** | **Claude Code** | Static analysis + multi-file context |
| **Pure refactors** (type-only, docstring-only, constant substitution) | **Claude Code** | Zero-risk mechanical changes |
| **`.claude/**` content** (skills, rules, notes, session memory) | **Claude Code** | Single source of truth for project knowledge |
| **Handoff briefs + kickoff docs** (`docs/operational-tooling/**`, `.claude/replit-handoffs/**`) | **Claude Code** | The contract for each Replit execution |
| **Test authoring** (property-based, golden, regression) | **Claude Code** | Can author many test files in one context window |

---

## What Replit Agent is uniquely good at

Replit isn't "just another coding agent." It has five real advantages over a shell-based Claude Code:

### 1. Live preview feedback loop
You can edit a React component, hit save, and see the result in the preview pane within seconds. For iterative UI work (spacing, color, hover states, animation timing), this is 10× faster than Claude Code reading code without running it.

**Use Replit for:** all component styling decisions, animation timing calibration, responsive-breakpoint verification, visual regression checking.

### 2. Native Replit Database integration (Neon Postgres)
Replit has one-click access to the running Postgres instance. You can run migrations, seed data, query tables, and inspect schemas without leaving the environment. Claude Code has to ask you to paste SQL output.

**Use Replit for:** schema migrations via `drizzle-kit push`, data inspection (`SELECT * FROM ...` from the DB pane), seed verification after a migration, checking that `pgvector` namespaces have the expected row counts.

### 3. Replit Object Storage sidecar (free, integrated)
The sidecar at `127.0.0.1:1106` handles photo uploads, document storage, render outputs. Already wired; already in the deployment pipeline.

**Use Replit for:** anything touching object storage. Claude Code can't test upload flows.

### 4. Replit Secrets management
Encrypted env vars are accessed via `process.env` after Replit decrypts at runtime. No `.env` files checked in; no secrets in git history.

**Use Replit for:** adding, rotating, or removing API keys (`AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.). Verifying which secrets are set before running live-LLM harnesses.

### 5. Replit Deployments (Autoscale)
`npm run build` + `node ./dist/index.cjs` run the app in production on Replit's autoscale infrastructure. No separate hosting vendor.

**Use Replit for:** deployment troubleshooting, verifying that a commit builds cleanly for production, checking deployment health after a push.

---

## Hygiene rules for Replit Agent

These parallel `.claude/rules/pre-commit-verification.md` and `.claude/rules/cross-check-invariants.md` on the Claude Code side.

### Rule 1: The five-gate verification is BLOCKING on every commit

Same as Claude Code. No exceptions.

```
npx tsc --noEmit --skipLibCheck     # TS 0 errors
npm run lint                        # 0 errors
npm run test:file -- tests/audit/vocabulary-compliance.test.ts  # 11/11
npm run test:summary                # PASS
npm run verify:summary              # UNQUALIFIED
```

No `--no-verify`. No "I'll fix that in a follow-up." No deleting failing tests. If the gate fails on a pre-existing issue, file `BLOCKED-*.md` next to the active handoff and escalate to Claude Code — do NOT skip.

### Rule 2: `.claude/**` is Claude Code's authoritative domain

Replit Agent may touch `.claude/**` files in exactly two cases:

1. **`.claude/session-memory.md`** — append a ≤5-line entry per session end, under the current top-of-file rule (12 most-recent sessions retained)
2. **`BLOCKED-*.md` siblings to active handoffs** — when execution is blocked

All other `.claude/**` edits are Claude Code's job. If Replit finds a stale reference in a skill/rule/note, flag it in the session memory append so Claude Code can fix on the next turn. Don't fix directly.

### Rule 3: Handoffs are the contract; don't silently diverge

When executing a handoff from `.claude/replit-handoffs/` or `docs/operational-tooling/`, follow the file. If a detail doesn't fit reality (e.g. a referenced file has been renamed, or a step breaks something unexpected), **stop and file `BLOCKED-<handoff-name>.md`**. Do NOT improvise.

The handoff is the reviewable spec. Silent divergence eats audit-trail quality.

### Rule 4: Commit cadence — one commit per logical unit

Don't batch multiple handoff sub-tasks into a single commit. Each sub-task must pass all five gates independently. "Build on a failing commit" is forbidden; rollback clarity depends on granular commits.

Exception: an obviously-atomic fix to a mistake in the previous commit can ride along. Use judgment.

### Rule 5: Commit messages carry the Surfaces + Verified footer

Every commit from either agent:

```
<subject>

<body>

Surfaces: S<n>, S<m>, ...      ← dependency-surface IDs (see .claude/audit-inventory.md)
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

Missing either footer signals "this wasn't properly verified" — reviewer should dig harder.

### Rule 6: Cross-check invariants apply equally

When editing a file in Category X, verify Category Y. The map is in `.claude/rules/cross-check-invariants.md`. Highlights for Replit's typical work:

- Edit a DB schema → check seeds, sync helpers, user-manual documentation, related tests
- Edit a component → check parent components that render it (grep the component name)
- Edit a default constant → grep the old literal to find all adoption sites
- Edit a system prompt → confirm the downstream consumer still parses the output

### Rule 7: Memory hygiene

At session end, append ≤5 lines to `.claude/session-memory.md`. Format:

```
## Session: YYYY-MM-DD — <short title>
- **<Work item>:** <what shipped + commit SHA + any caveats>
- **<Open thread>:** <what's blocked or needs Claude Code attention>
```

Do NOT rewrite older entries. The memory is a log, not a wiki. Claude Code manages consolidation and archiving.

---

## Which tool to pick for a new task

Use this decision tree when the user hands you a task:

```
Is it runtime UI, DB, seeds, env, packaging, or live-LLM?
  → REPLIT (this session)

Is it audit, architectural decision, contract design, or multi-file refactor?
  → Flag to user: "better in Claude Code shell — here's the brief"

Is it a skill, rule, or note file edit in .claude/**?
  → Flag to Claude Code (unless it's a session memory append or BLOCKED file)

Is it test authoring across many files in one context?
  → Can go either way; Claude Code preferred for consistency

Is it a rare overlap (e.g. a handoff requires both UI + contract)?
  → Split the work; Claude Code writes the contract, Replit wires the UI
```

---

## Memory + documentation hygiene for Replit

Mirroring what Claude Code does on its side, Replit has two memory surfaces to maintain:

### `replit.md`

Replit Agent's counterpart to `.claude/claude.md`. Keep in sync with claude.md on:

- Phase status tables (Analyst architecture, OT operational tooling)
- Tech stack description
- User preferences + behavioral constraints

When you update `replit.md`, check if `.claude/claude.md` has the equivalent section and flag divergence to Claude Code via session memory. Do NOT edit `.claude/claude.md` directly.

### Session memory append (≤5 lines)

At the end of every session where you shipped commits:

1. Open `.claude/session-memory.md`
2. Check the top entry — is it today? If yes, append to it (≤5 additional lines). If no, add a new top-of-file entry.
3. Include: commit SHAs, gate results, any BLOCKED items, anything Claude Code needs to know for the next session

Claude Code consolidates and archives per the "last 12 sessions" rule — don't do cleanup yourself.

---

## When to escalate to Claude Code

Stop and hand back when:

1. A handoff's instructions contradict a `.claude/rules/*.md` file — rules win, flag it
2. A stale reference in a skill/rule is misleading you — flag it, don't fix directly
3. The user asks for something outside Replit's split (audit, contract design, multi-file refactor spanning `.claude/**` + code)
4. A five-gate failure looks like a pre-existing issue, not your commit's doing
5. You find drift between `.claude/claude.md` and `replit.md` that looks intentional but confusing

Escalation format: a `BLOCKED-*.md` sibling to the active handoff, plus a session-memory line flagging the issue.

---

## Examples

### Good Replit session
- User: "Add a toast notification when the scenario save fails"
- You: verify in the preview pane that toast positioning works, edit `client/src/components/**`, add the handler, run five gates, commit with `Surfaces: S4, S6`, append session memory: "Toast on scenario-save failure wired, commit `<sha>`. Gates green."

### Good hand-back to Claude Code
- User: "Look at our test coverage and decide if we need more property tests"
- You: "This is multi-file analysis better done in Claude Code's shell. Here's a brief for the user to paste."
- Then file a `.claude/replit-handoffs/` stub pointing at Claude Code.

### Good session memory append
```
## Session: 2026-04-20 — OT-A.3 v3 A/B results + fix
- Ran 20-case A/B with v3 FIELD_DEFINITIONS (commit 7ef8c23). Categorical gate: 0 unit errors, 0 denominator errors, 0 scope errors. Aggregate bucket-match 63% (improved from 37.6% in v2). Latency 1.48x.
- Result: OT-A.3 passes categorical gate. OT-A.4 unblocked.
- Next: awaiting Claude Code to draft OT-A.4 kickoff (delete extractor + old synthesis path).
```

### Bad session memory append (don't do this)
```
## Session: 2026-04-20 — various fixes
- Fixed lots of things. Tests pass. Good session overall. [too vague — no SHAs, no specifics]
- Also updated the AnalystVerdict contract. [WRONG — that's a Claude Code domain]
- Deleted some pinecone references in skills. [WRONG — `.claude/**` is Claude Code's]
```

---

## Reference card

| Task | Where |
|---|---|
| Claude/Replit split rule | `.claude/rules/claude-replit-split.md` |
| Pre-commit gate | `.claude/rules/pre-commit-verification.md` |
| Cross-check invariants | `.claude/rules/cross-check-invariants.md` |
| Active handoffs | `.claude/replit-handoffs/*.md`, `docs/operational-tooling/*.md` |
| Session memory | `.claude/session-memory.md` |
| Dependency atlas | `docs/architecture/DEPENDENCIES.md` |
| SDK contracts atlas | `.claude/skills/analyst/contracts.md` |
| Replit mirror doc | `replit.md` |
| Claude mirror doc | `.claude/claude.md` |
