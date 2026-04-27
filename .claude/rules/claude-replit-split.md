# Claude Code / Replit Agent — Division of Labor

> **Revised 2026-04-27** — Replit's lane is now narrowed to UI/UX only. Every other lane (engine, server/ai, server/routes, schema, seeds, tests, doctrine, packets, scripts, config, package management) is CC's. Reverses the broader lanes Replit held in prior revisions. See [Revision history](#revision-history) for the full delta.

## Rule

This project uses two AI coding agents. Each owns specific categories of
work. **Claude Code owns everything that is not visibly UI; Replit Agent owns
the UI and UX.** CC writes engine code, server code, route handlers, tests,
schema, seeds, doctrine, packets, and scripts. Replit writes React
components, CSS, pages, and fixes UI/UX bugs that need browser iteration.

## Hard split

| Category | Owner | Reason |
|---|---|---|
| Audits, reviews, architectural decisions, plans, ADRs | **Claude Code** | Static analysis + multi-file context + authoritative rule checks |
| `.claude/**` docs, rules, session memory, skill files, handoff packets | **Claude Code** | Single source of truth for project knowledge |
| **Engine code** (`engine/**`) — analyst, watchdog, cognitive, contracts, router, voice, quality | **Claude Code** | AI-engine-architect work; multi-file context essential |
| **Server AI code** (`server/ai/**`) — research orchestrator, specialists, prompt builders, adapters, clients | **Claude Code** | AI-engine-architect work; cross-vendor model knowledge |
| **Server routes** (`server/routes/**`) — every route handler, including AnalystButton-triggered routes | **Claude Code** | Route handlers ARE the bridge between engine and UI; semantic source-of-truth lives server-side |
| **Server non-UI code** (`server/**` except `server/static/`) — auth, storage, helpers, middleware | **Claude Code** | Server-side correctness + invariants |
| **Shared types + schema** (`shared/**`) — schema, types, constants | **Claude Code** | Single source of truth; cross-cutting impact |
| **Calc tools** (`calc/**`) — deterministic financial + research tools | **Claude Code** | Pure functions with strict invariant tests |
| **Tests** (`tests/**`) — engine, calc, integration, proof, audit | **Claude Code** | Tests gate every commit; CC owns gate authority |
| **Scripts** (`script/**`) — seeds, automations, migrations, audits | **Claude Code** | Mostly server/data-shape work |
| **DB schema, migrations, seeds** | **Claude Code** | Schema changes ripple through engine + types + tests |
| **Package management** (`package.json`, `pnpm.overrides`, dependencies) | **Claude Code** | Affects build/runtime + security posture |
| **Config files** (`tsconfig.json`, `vitest.config.ts`, `.replit`, `replit.nix`, `.eslintrc*`) | **Claude Code** | Build/test/lint plumbing |
| Atomic execution packets (when CC needs to delegate visible UI work to Replit) | **Claude Code authors** | Decomposition is load-bearing |
| **UI components** (`client/src/components/**`) — React components, shadcn composition | **Replit Agent** | Visual; benefits from dev-server iteration |
| **Pages** (`client/src/pages/**`) — page-level UI composition + layout | **Replit Agent** | Visual; user-facing surface |
| **Styles** (`client/src/styles/**`, `client/src/index.css`, Tailwind class composition) | **Replit Agent** | Visual; needs browser to verify |
| **UI features** (`client/src/features/**` UI portions) | **Replit Agent** | Visual |
| **User-facing copy in JSX** | **Replit Agent** | Visible to users; vocabulary-test gate applies |
| **UI/UX bug fixes** | **Replit Agent** | Visual regressions; browser iteration |
| **End-to-end browser verification** (clicking through flows, checking visible state) | **Replit Agent** | Has the dev-server browser session |
| **Client hooks bridging UI to server** (`client/src/hooks/**` that wire to server APIs) | **Claude Code** unless purely UI state | Semantic source-of-truth is server-side; hooks that own server-shape are CC's |
| **Client-side type definitions mirroring server contracts** (`client/src/lib/api/**`, `client/src/lib/types/**`) | **Claude Code** | Contract drift detection needs server context |

## How handoffs work

1. Claude Code writes a packet under `.claude/replit-handoffs/<phase>-<scope>.md`
   following the [packet template](../replit-handoffs/_TEMPLATE.md). The packet
   is **atomic** (one logical task per file, ≤7 sub-steps), with mandatory
   acceptance criteria per sub-step.
2. Claude Code commits the packet to `main`.
3. The user pastes a short prompt into Replit Agent: _"read
   `.claude/replit-handoffs/<name>.md` and execute the tasks in order. Commit
   each task separately with the `Surfaces:` footer. Run verification after
   each."_
4. Replit Agent reads the file, executes, verifies, commits, pushes.
5. Claude Code picks up the next audit pass from the updated `main`.

If a packet exceeds the atomic-task budget (>7 sub-steps, >3 files, or
mixes capability domains), it must be **split** into multiple packets
before being handed off. Long monolithic packets are the failure mode this
revision is designed to prevent.

## Explicit-delegation lane

Replit Agent may ask Claude Code to write code directly when one of the
following is true:

- The change is **cross-cutting** (touches >5 files in a way that requires
  whole-codebase context — e.g., a financial-engine constant rename, a
  vocabulary sweep, a deterministic type narrowing across surfaces).
- The change is **type-only** (interface widening/narrowing with zero
  runtime behavior change) and Replit has determined static-analysis
  context is the bottleneck.
- The change is **constant substitution** where the literal value is
  exactly identical (e.g., replacing `"2026-06-01"` with
  `DEFAULT_COMPANY_OPS_START_DATE`).
- The change is **docstring-only** in a `.tsx`/`.ts` file (comments only,
  no logic).

To invoke the lane, Replit Agent writes a `DELEGATE.md` sibling next to
the active packet (or session plan) naming the request: scope, files
expected to change, why CC's context is the right tool. Claude Code reads
it on the next pass and either executes (committing with a `Delegated-by:
Replit-Agent` trailer) or declines with a written reason. Even
delegated changes are verified by Replit afterward via the
`<phase>-verification.md` packet pattern.

**The lane is not the default.** If Replit can do the work itself within
the existing rules, it should. Each delegation is a budget item; track
them in `.claude/session-memory.md`.

## Doctrine Freeze Gate

No implementation phase begins until the doctrine governing it has been
**stable for one full session** (no edits to the relevant ADR, skill, or
architecture doc).

Concretely:

1. Before opening any `.claude/replit-handoffs/<phase>-*.md` packet for a
   new phase, the active ADR for that phase must have status `Accepted`
   (not `Proposed`, not `Draft`) and must have had no content edits since
   the prior session-memory entry.
2. If the ADR is still moving, the phase work is **paused** and the
   session pivots to doctrine stabilization.
3. If a packet uncovers a doctrine gap mid-execution, Replit files a
   `BLOCKED.md` sibling on the packet, and the session pivots to ADR
   revision before resuming code work.

Why: the rewrite tax in this codebase has historically come from coding
against unstable specs (ADR-006 went v0 → v1 → v2 in <24h while P5 was
mid-build). Freezing doctrine before coding eliminates the largest
single source of rework.

The gate is **off** for: bugfixes against shipped code, gate-failure
remediation, and `BLOCKED.md` resolution. It is **on** for: any new
phase, any net-new feature, any architectural refactor.

## Why

- **Safety** — UI and DB changes have hard-to-predict runtime effects.
  Claude can't click a button or run a migration; it can only read state
  snapshots. Replit has the running environment.
- **Decomposition is load-bearing** — the value Claude Code adds is not
  the LOC it writes, it's the atomic packet it produces. A 5,000-line
  audit doc handed to Replit without sub-task slicing produces
  improvisation, not execution. Keep the packet contract; reduce the
  direct-commit surface.
- **Doctrine stability is upstream of code stability** — code written
  against a moving spec is rework waiting to happen. The Freeze Gate puts
  the cost of doctrine churn in the doctrine phase, not the code phase.
- **Auditability** — the packet MD file is the contract. Every change
  has a reviewable spec.

## Guardrails (both agents must respect)

1. **Claude never pushes UI changes to `main`.** UI is Replit's lane; if CC finds a UI change is needed mid-execution, it writes a packet handed to Replit and stops on the UI portion. (Per 2026-04-27 revision: DB migrations and other non-UI work are now CC's lane and may land directly on `main` when gates pass.)
2. **Replit never silently diverges from the packet.** If Replit sees
   a problem during execution, it must file a comment on the packet
   (or a `BLOCKED.md` sibling file) and stop — not improvise.
3. **Every commit gets a `Surfaces: S?, S?, …` footer** so the reviewer
   can confirm dependency-surface coverage.
4. **Pre-commit verification is BLOCKING, not optional.** Every commit
   (Claude or Replit) must pass all five gates in
   `.claude/rules/pre-commit-verification.md`: `tsc --noEmit`, `npm run
   lint`, vocabulary test, `npm run test:summary`, `npm run
   verify:summary` (UNQUALIFIED). No `--no-verify`. No "I'll fix the
   failing test in a follow-up." A failing gate means the commit does
   not land — either root-cause it now or file a BLOCKED.md and escalate.
5. **Before editing any file, read `cross-check-invariants.md`.** Every
   edit touches multiple surfaces. The rule lists the invariant pairs
   (change type X → also check Y) drawn from real failures we've hit.
6. **Every packet's "Verification" section is a checklist, not a
   suggestion.** Replit must run every step listed in a packet's
   verification block. If a step is skipped, it must be explicitly
   flagged in the completion report with the reason.
7. **Doctrine Freeze Gate is on by default for new phases.** See
   [§ Doctrine Freeze Gate](#doctrine-freeze-gate).
8. **Atomic packet budget.** No packet exceeds 7 sub-steps or 3 files
   without being split. If split is required, packets get suffixes
   (`-a`, `-b`, …) and a parent index file lists them in dependency
   order.

## When Replit CAN edit `.claude/` docs directly

Only when:

- Appending to `.claude/session-memory.md` with session-end notes (≤5 lines).
- Adding a `BLOCKED.md` sibling to a packet file when stuck.
- Adding a `DELEGATE.md` sibling to a packet to request the
  [explicit-delegation lane](#explicit-delegation-lane).

All other `.claude/**` content is Claude Code's authoritative domain.

## How to detect violations

- Commit author + Surfaces footer tell you who did what.
- `git log --author="Agent"` shows Replit auto-commits.
- A commit that modifies `.claude/rules/*.md` by Replit = violation.
- A commit that modifies `.replit` or `package.json` by Claude = violation.
- A commit that lands feature code while its governing ADR has changed in
  the same session = Doctrine Freeze Gate violation.
- A packet exceeding 7 sub-steps that wasn't split = atomicity violation.

## Session-start checklist (both agents)

On every session start:

1. Read `.claude/claude.md` (loaded automatically).
2. Read `.claude/session-memory.md` for recent context.
3. Read this rule (`claude-replit-split.md`) if the task spans both domains.
4. Check `.claude/replit-handoffs/` for pending work packages.
5. Check `.claude/audit-inventory.md` for the active dependency surface map.
6. Check the active ADR(s) for the current phase — if any has been edited
   this session, the [Doctrine Freeze Gate](#doctrine-freeze-gate) applies.

## Scope

Applies to every code change in this repo made by either agent. If a human
commits directly (e.g., via the GitHub UI), this rule does not bind them —
but they should still prefer the packet pattern for any UI/DB work.

---

## Revision history

### 2026-04-27 — Replit narrowed to UI/UX only

Triggered by Ricardo's directive: *"replit should only be in charge of UI coding and fixing UI and UX issues."* Spoken mid-G1.5c execution after CC was about to file BLOCKED on -b and hand the orchestrator-wrap to Replit. The directive reverses the broader workflow/DB/wiring lane Replit held in the 2026-04-22 + 2026-04-26 revisions.

The new lane boundary:

- **CC owns** every non-UI category: engine, server/ai, server/routes, server/* (non-UI), shared, calc, tests, scripts, schema, seeds, package management, config files, doctrine, packets.
- **Replit owns** UI components, pages, styles, UI features, user-facing copy in JSX, UI/UX bug fixes, end-to-end browser verification.
- **Gray zone — client hooks + client API types:** lean CC, because the semantic source-of-truth lives server-side and contract drift detection needs server context. Replit may edit pure-UI-state hooks (e.g., a hook that toggles a modal); anything that mirrors a server contract is CC's.
- **Two-track work** still applies but the meeting point shifts: CC ships engine + route + everything down to the API contract; Replit ships from the API consumer (component, page, hook-if-pure-UI-state) outward.

Side effects of the tightening:

- Packets that previously listed Replit as Owner for non-UI work were over-scoped to Replit. Going forward, packets default Owner to CC unless the work is provably UI-only.
- The "explicit-delegation lane" is no longer needed for non-UI work — CC just does it. The lane survives only for the rare cross-cutting case where Replit has UI context CC needs.
- CC may now edit DB schema, seeds, package.json, and `.replit` directly. The corresponding Guardrail #1 ("Claude never pushes UI or DB migrations to `main`") is rewritten in spirit: "CC may push DB migrations; Claude still never pushes UI changes."

Process discipline (atomic-budget, Doctrine Freeze Gate, agent-collision-hygiene, pre-commit five gates) applies equally regardless of lane.

### 2026-04-26 — Research/intelligence code is a CC lane

Triggered by Ricardo's directive ("AI should be AI… code research and intelligence stuff here. Replit should code that too but closer to UI and workflows. Code as a senior architect of AI engines"). The 2026-04-22 revision had pure refactors as a CC explicit-delegation lane and EVERYTHING ELSE as Replit's lane. That worked for plumbing but mismatched the AI-engine work that's coming with ADR-007 (Tier-1 graduation): prompt engineering, regress-loop design, cross-vendor routing, verdict reconstruction. That work benefits from CC's deep context window + multi-file synthesis far more than Replit's dev-server iteration.

The new boundary:
- **CC default lane (added):** research + intelligence code under `engine/analyst/`, `server/ai/`, `calc/research/`, plus prompt-builders, cognitive-engine extensions, verdict-reconstruction logic, prompt-engineer pre-stage, regress-loop logic, vendor-routing fallback. Code as a senior AI-engine architect; Opus tier.
- **Replit default lane (unchanged):** UI components, page wiring, admin pages, navigation, tabs, DB migrations, seed data, env vars. Plus the workflow code that ferries research output INTO the UI — route handlers that bridge the AI-engine layer to the user-visible surface.
- **Two-track ADR execution:** when an ADR's implementation has both an AI-engine slice and a UI/workflow slice, both agents work in parallel against the same packet (or two sibling packets). CC owns engine; Replit owns UI; they meet at the route handler.

Atomic-budget + Doctrine-Freeze-Gate + packet-discipline rules from the 2026-04-22 revision still apply to BOTH agents.

### 2026-04-22 — Tightened CC coding lane after rewrite-churn review

Triggered by the project owner's observation that "the current dynamic is
producing a lot of rewrites" + an architect (Opus) evaluation that
identified the root cause as **doctrine instability + packet-decomposition
gaps**, not CC code quality.

Three deltas vs. the prior version:

1. **Pure refactors moved out of CC's automatic lane** into the new
   [Explicit-delegation lane](#explicit-delegation-lane). Replit codes by
   default; CC codes by request only. The four legacy auto-categories
   (type-only, docstring-only, constant-substitution, cross-cutting) all
   still permitted, but now require a `DELEGATE.md` to invoke.
2. **Doctrine Freeze Gate added** as Guardrail #7. New phases cannot start
   until the governing ADR has been stable for one session. Direct response
   to ADR-006 going v0→v1→v2 mid-P5-build.
3. **Atomic packet budget added** as Guardrail #8 + the [How handoffs
   work](#how-handoffs-work) section. Packets capped at 7 sub-steps / 3
   files; long packets must be split. The packet template at
   `.claude/replit-handoffs/_TEMPLATE.md` codifies the mandatory fields.

The previous version's permissive "When Claude CAN edit UI/DB files
directly" section was removed — its three categories (type-only,
docstring-only, constant renaming) are now subsumed under the
explicit-delegation lane.
