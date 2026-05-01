# Phase 6: Resources Adapters + P5 Architect Follow-ups — Parent Index

> **This is a parent index, not an atomic packet.** P6 scope, as named in ADR-006 § Implementation Notes + the architect's P5 review (`replit.md:605`), exceeds the atomic-packet budget defined in `.claude/rules/claude-replit-split.md` § Guardrail #8 (≤7 sub-steps / ≤3 files / ≤2 capability domains). It is split into six atomic sub-packets, listed in dependency order. Replit Agent executes them sequentially (or parallel where dependencies allow), one commit per sub-step within each packet.

---

## Doctrine Freeze Gate Check

- **Governing ADR:** [`docs/architecture/decisions/ADR-006-resources-control-plane.md`](../../docs/architecture/decisions/ADR-006-resources-control-plane.md)
- **ADR status:** `Accepted` (2026-04-21)
- **Last ADR edit:** 2026-04-22 (commit `bb44ef70`, removed live status tokens to point at `phases.md` per new SoT rule — semantic doctrine unchanged)
- **Sessions stable since acceptance:** 1 (P5 shipped clean against the v2 doctrine; 2026-04-22 doc-edits did not change behavior)
- **Gate decision:** ✅ **Cleared to execute.**

---

## Scope decomposition

P6 = 6 atomic packets. Architect's 4 P5-medium follow-ups (`replit.md:605`) + 2 ADR-006 original P6 items.

| # | Packet file | Source | Sub-steps | Files | Domains | Blocked by |
|---|---|---|---|---|---|---|
| **P6a** | `phase-6a-required-fields-enforcement.md` | Architect medium #1 | 4 | 3 | route + verification | — |
| **P6b** | `phase-6b-audit-user-name-resolution.md` | Architect medium #2 | 3 | 3 | storage + UI | — |
| **P6c** | `phase-6c-runtime-config-per-specialist-schema.md` | Architect medium #3 | 4 | 3 | schema + UI | — |
| **P6d** | `phase-6d-specialist-section-to-id-centralization.md` | Architect medium #4 | 3 | 3 | shared types + UI | — |
| **P6e** | `phase-6e-llm-defaults-to-admin-resources-adapter.md` | ADR-006 P6 original | 5 | 3 | storage + UI | P6c (runtimeConfig must accept `modelResourceId` overrides cleanly) |
| **P6f** | `phase-6f-legacy-data-sources-adapter.md` | ADR-006 P6 original | 6 | 3 | storage + verification | P6e (precedent for adapter pattern) |

**Recommended execution order:** P6d (mechanical, lowest risk — proves the template) → P6a (most user-blocking) → P6b → P6c → P6e → P6f.

P6a–P6d may execute in parallel after P6d lands if Replit prefers; P6e and P6f are sequential.

---

## Cross-packet invariants

Every P6 sub-packet must respect these (added to each sub-packet's "Cross-check invariants" section):

1. **Read-only Resource Assignments** — no sub-packet may add a route or UI affordance that mutates the Specialist↔Resource graph. Wiring stays in `engine/analyst/registry/specialist-catalog.ts`. (Per `.claude/skills/resources/SKILL.md` invariant #3.)
2. **No new live phase|status tables** — every doc edit must respect `.claude/rules/documentation.md` § "Phase status changes". The CI guard `tsx script/check-phase-status-uniqueness.ts` must pass post-merge.
3. **Audit trail preserved** — every write to `specialist_configs` must continue to land an `specialist_config_versions` row before applying the patch. (Per `.claude/skills/resources/SKILL.md` invariant; tested by `tests/server/admin-specialists.test.ts`.)
4. **Surfaces footer** — every commit ends with `Surfaces: <S-tags>` + `Packet: .claude/replit-handoffs/phase-6X-...md`. Pull S-tags from `.claude/audit-inventory.md` for the touched files.

---

## Out of scope for all of P6

- New Specialists (P7).
- Real LLM evaluators replacing the deterministic stubs (P7).
- ADR-005 workspace reorg (paused per Doctrine Freeze Gate).
- ADR-004 verdict cache 5B/5C (separate workstream — handled via DELEGATE.md to Claude Code per `.claude/rules/claude-replit-split.md` § Explicit-delegation lane).

---

## Parent-index completion criteria

This parent index is "complete" when all six sub-packets:

- Have landed (every commit visible on main).
- Each sub-packet's own Completion Report is filled.
- The phase tracker `.claude/phases.md` shows Resources P6 as ✅ Shipped.
- The next packet `phase-7-...` (Specialists C–G) is ready to start.

---

## Sub-packet index status

Only **P6a is drafted in this turn** (`phase-6a-required-fields-enforcement.md`) as the first test of `_TEMPLATE.md`. P6b–f will be drafted just-in-time, each in its own session, immediately before execution. This avoids stale packets churning while the new operating model proves itself.
