# Skill: The Analyst

**Purpose:** Authoritative reference for any work touching The Analyst. Load this skill before editing anything in `engine/analyst/` (once Phase 2 lands), `engine/watchdog/`, `server/ai/`, `shared/analyst-conviction.ts`, or any UI file that renders Analyst output.

**Status:** Phase 1b landing — directive companions to the Phase 1a architecture docs under `docs/architecture/analyst/`.

---

## What The Analyst is (in one sentence)

The singular AI agent that delivers ranges, verdicts, and intelligence on every assumption surface in H+ Analytics — one voice to the user, a two-tier system in code.

## Two tiers — always keep these separate in your head

- **Surface tier** — a Specialist per UI surface (one Mgmt-Co tab, one Property tab, Admin Defaults, ICP, Cross-Portfolio, Staleness). Each returns a unified `AnalystVerdict`. This is what Phase 4 builds out.
- **Cognitive tier** — the existing three-model parallel synthesis pipeline (`server/ai/research-orchestrator.ts` + ~25 supporting files). Treated as stable foundation. Specialists call it via a typed façade when Tier-1 evaluation is warranted.

Between them sit the **Surface Router** (pure dispatch, no LLM) and the **Voice Renderer** (persona enforcement chokepoint). The user sees only The Analyst.

---

## Specialist governance (LOCKED 2026-04-21) — read this before touching anything Specialist-shaped

The Specialist concept evolved through three doctrines in <24 hours. Current state:

- **Catalog is code.** The list of Specialists, their subjects, their capability flags, and their `assignmentRefs` (links to canonical Resources) live in `engine/analyst/registry/specialist-catalog.ts`. **Adding or removing a Specialist↔Resource link is a code edit + PR + deploy.** There is intentionally no admin-runtime affordance to relink.
- **Per-Specialist tunable config is DB.** Prompt template, model resource id, required fields, runtime knobs live in `specialist_configs` (one row per Specialist) with append-only history in `specialist_config_versions`. Edited via the Specialist's own page (capability-gated PUT routes in `server/routes/admin/specialists.ts`).
- **Resources are canonical.** APIs / Sources / Tables / Benchmarks / Models live in `admin_resources` with versioning. Specialist pages render Resource Assignments **read-only** with a health dot — the only edit affordance is "Edit in Resources →" or the audited time-boxed super-admin break-glass override.
- **Health-dot freshness band is enforced.** Green = OK + within TTL, amber = OK + past TTL (stale-green forbidden), red = failed, gray = unknown.
- **The mgmt-co router reads config at dispatch.** `createMgmtCoRouter({ configs })` threads each Specialist's per-row config into the factory. Save-tab handler loads the config before constructing the router. Don't bypass.

For the full architecture rationale + the two rejected predecessors (v0 flat registry, v1 hub-and-spoke), see ADR-006 (`docs/architecture/decisions/ADR-006-resources-control-plane.md`) and the doctrine block in `replit.md` "LOCKED 2026-04-21".

---

## Files in this skill

| File | What it covers |
|---|---|
| `_index.md` | This file — landing page + reading order |
| `orchestrator.md` | Surface Router — dispatch rules, event-to-Specialist table, what lives here vs elsewhere |
| `surface-mgmt-co.md` | The 6 Mgmt-Co-tab Specialists (Funding, Revenue, Compensation, Overhead, Company, Property-Defaults) |
| `surface-property.md` | The per-tab Property Specialists + cross-portfolio implication channel |
| `surface-admin-defaults.md` | Admin Defaults Specialist — governs curated benchmark tables |
| `surface-icp.md` | ICP Specialist — portfolio definition reconciling stated vs revealed preference |
| `surface-cross-portfolio.md` | Cross-Portfolio Specialist — outliers, inconsistencies, drift, coverage gaps |
| `surface-staleness.md` | Staleness Specialist — lifecycle of guidance freshness, re-run policy |
| `cognitive-engine.md` | Pointer + directive rules for working with the Cognitive Engine façade |
| `voice.md` | Voice Renderer — forbidden patterns, severity-tone and quality-conviction maps |
| `quality-scoring.md` | Quality Scorer — 6-component weighted score, conviction-floor enforcement |
| `steward.md` | The change-control checklist every analyst-shaped PR must pass |

---

## Authoritative references (outside this skill)

| Reference | Role |
|---|---|
| `.claude/rules/the-analyst-persona.md` | **Non-negotiable.** The user-facing voice contract. Singular, capitalized, range-first, conviction-led. |
| `.claude/rules/analyst-team.md` | Internal vocabulary rule (Phase 1b). Resolves singular-voice vs team-naming tension. |
| `.claude/rules/analyst-verdict-contract.md` | Placeholder pointing forward to Phase 3 when `AnalystVerdict` lands. |
| `.claude/rules/specialist-intelligence-bar.md` | **Binding for every assumption-tab Specialist.** Nine requirements: N+1 cognitive call, citation-rich evidence, comparables table, live API, range-first, vendor-breadth, LLM-driven Prompt Engineer pre-stage, quality regress + honest-fail. The product floor for "intelligence-first" Specialists. |
| `.claude/rules/llm-vendor-roster.md` | **Binding for every LLM call site.** Vendor roster (Anthropic / Google / OpenAI / Grok / DeepSeek / Mistral / etc.) + per-role recommendation matrix + quarterly refresh discipline. |
| `docs/architecture/decisions/ADR-007-specialist-tier1-graduation.md` | **Tier-0 → Tier-1 graduation pattern + ordering.** Tier-1 Specialist Pattern (10-step skeleton with Prompt Engineer + regress + honest-fail) + six phases G1–G6 + Specialist consolidation permission. Status: **Accepted (2026-04-26)**. G1 = Funding graduation, blocked-by ADR-004 P5B v2 ✅ shipped `24853904`. |
| `.claude/notes/analyst-architecture.md` | Claude Code's deep-dive on the Cognitive Engine. **The authority on the brain.** |
| `docs/architecture/ANALYST.md` | The architecture spine. Descriptive complement to this directive skill. |
| `docs/architecture/analyst/*.md` | Per-component specs — every skill file here has a sibling spec doc. |
| `docs/architecture/decisions/ADR-001-analyst-two-tier.md` | Why two tiers. |

---

## Reading order — new contributor to The Analyst

1. **`.claude/rules/the-analyst-persona.md`** — what The Analyst *is* to the user.
2. **`docs/architecture/ANALYST.md`** — the system shape (read the ASCII diagram).
3. **This `_index.md`** — the directive map.
4. **`.claude/rules/analyst-team.md`** — internal vocabulary.
5. **`steward.md`** (this dir) — the checklist you'll run every PR.
6. **`.claude/notes/analyst-architecture.md`** — the Cognitive Engine in depth.
7. **`orchestrator.md`** — how routing will work.
8. **The per-component spec for the surface you're about to touch** (`docs/architecture/analyst/<surface>.md` + this dir's matching skill file).
9. **`docs/architecture/decisions/ADR-001-analyst-two-tier.md`** — why the split exists.

Budget: ~2 hours the first time. 15 minutes to refresh on subsequent sessions.

---

## Invariants that bind everything in this skill

- **User-facing voice is always singular.** Never `"the analysts"`, `"our analysts"`, `"your analysts"`, or any other pluralization. Enforced by `tests/audit/vocabulary-compliance.test.ts`; Phase 3 adds runtime enforcement via Voice Renderer.
- **Specialists never craft user-facing strings.** They populate structured verdict fields; Voice Renderer produces the strings.
- **Specialists never import `research-orchestrator.ts` directly.** Go through the Cognitive Engine façade (`engine/analyst/cognitive/engine-client.ts` — Phase 2 stub, Phase 3 implementation).
- **Every Specialist returns `AnalystVerdict`** (once Phase 3 lands). Until then, `analyst-verdict-contract.md` defines the transition policy.
- **Every numeric verdict has a range.** Every range has a conviction level. No exceptions.
- **Every PR touching anything analyst-shaped runs the steward checklist** (`steward.md`).

---

## How this skill relates to other skills

| If your task involves… | Also load |
|---|---|
| Financial math in a Specialist | `.claude/skills/finance/SKILL.md` + `.claude/rules/deterministic-tools.md` |
| UI that displays Analyst output | `.claude/skills/design-system/SKILL.md` + `.claude/skills/vocabulary/SKILL.md` |
| Research pipeline work | `.claude/skills/research/SKILL.md` (the Cognitive tier overview) |
| Chat/Rebecca touching Analyst output | `.claude/skills/rebecca-chatbot/SKILL.md` (Rebecca explains The Analyst; she is NOT The Analyst) |
| Tests | `.claude/skills/testing/SKILL.md` + the persona-keyed L+B bench (Phase 3) |
