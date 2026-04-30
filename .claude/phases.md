# Phase Status — Single Source of Truth

> **This file is the canonical live-status tracker** for every active workstream in the H+ Analytics codebase. Other docs (`replit.md`, ADRs, architecture docs, skill files) carry historical narrative and decisions but **do not** carry live phase-status tables. They point here.
>
> **Update rule:** When a phase status changes (Pending → In progress, In progress → Shipped, etc.), update this file in the same commit as the change. The CI guard at `npm run phases:check` fails if a duplicate status table appears outside this file.
>
> **Edit authority:** `.claude/**` is Claude Code's domain per `.claude/rules/claude-replit-split.md`. Replit Agent may update this file when shipping a phase, with a `Surfaces: phases-md` footer on the commit.

**Last reviewed:** 2026-04-27

---

## Status legend

- ✅ **Shipped** — code merged to main, gates green, in production behavior.
- 🟢 **In progress** — packet open, work actively landing.
- ⏸ **Paused** — blocked on dependency or doctrine; not currently being worked.
- ⏳ **Pending** — next up, not yet started.
- 🟡 **Partial** — split phase; some sub-steps shipped, others pending (see notes).
- ❌ **Rejected** — was scoped, then dropped; kept for audit trail.

---

## Resources Control Plane (governed by ADR-006, doctrine LOCKED 2026-04-21)

| Phase | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| P1 | Specialist catalog + capability matrix; `resourceRefs` → `assignmentRefs`; read-only contract | ✅ Shipped | — | — | — | — |
| P2 | `admin_resources` + `admin_resource_versions` + `audit_break_glass_overrides` + `specialist_assignments` materialization | ✅ Shipped | — | — | — | — |
| P3 | Resource health checker + `resource_health_checks` + freshness-band derivation + safe-probe profiles | ✅ Shipped | — | — | — | — |
| P4 | Resources sub-page UIs (APIs, Sources, Tables, Benchmarks, Models) + dialogs + version history | ✅ Shipped | — | — | — | — |
| P5 | Specialist read-only surfaces (Funding + Revenue first): 6 REST routes, 5 capability tabs, 11 contract tests, mgmt-co router wiring | ✅ Shipped | Replit | `2346de7`, `a6c78b54` | — | — |
| P6 | Resources adapters for legacy `data_sources` / `LlmDefaultsTab`; centralize `SPECIALIST_SECTION_TO_ID`; Required Fields enforcement; audit user-name resolution; runtimeConfig schema narrowing | ✅ Shipped | Replit/CC | P6a `engine/analyst/surface/mgmt-co/index.ts`, P6b `a6c7ac81`, P6c-a `ae422cff`, P6d `AdminSidebar.tsx`, P6e-a `5524c70a` (CC), P6e-c+P6g `7a4efea2` (Replit), schema fixes `9dc6b2a3` (CC), P6f `a8248c21` (CC). P6c-b/P6c-c deferred — server-side gate is enforced; deferred work folded into P7 prep. | P5 ✅ | P7 ⏳ |
| P7-A | Revenue Specialist N+1 graduation (G2): prompt-engineer + quant/market panels + synthesis-validator + runner N+1 wiring + IB bar tests | ✅ Shipped | CC | G2 N+1 `2f1a649c`, IB tests + api assignmentRef `<this commit>` | P6 ✅ | — |
| P7-B | Remaining mgmt-co Specialists — Compensation, Overhead, Company, Property-Defaults (Analyst Architecture Phase 4) | 🟢 In progress | CC + Replit | Compensation (Mariana / M) shipped: Phase 1 `889dcd59`, Phase 2 G3 N+1 `36db0f45`, Phase 3 IB bench + api assignmentRef `05789a2a`, Voice unit hardening `f202b146`. Overhead / Company / Property-Defaults still pending. | P7-A ✅ | Same plan file |
| P7-C | Constants Specialists H–K admin pages (`status: "needs-page"` → built) | ⏳ Pending | Replit | — | P6 ✅ | Separate handoff packet |

---

## Analyst Architecture (governed by ADR-001 / ADR-002 / ADR-003)

| Phase | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| 1a | Docs spine + 9 per-component specs + ADR-001 | ✅ Shipped | Replit | `68f983fc`, `a230d968` | — | — |
| 1b | `.claude/skills/analyst/` (12 files) + `analyst-team.md` + `analyst-verdict-contract.md` | ✅ Shipped | Claude Code | `14dc1f4b`, `c9a7d12b` | — | — |
| 2 | `engine/analyst/{contracts,router,voice,quality,surface}/` skeleton + CODEOWNERS + naming-lint + ADR-002 | ✅ Shipped | Replit | `5ba18f29` | — | — |
| 3a | `AnalystVerdict` contract + Surface Router + Voice Renderer + Quality Scorer + persona test bench + ADR-003 + 53 tests; **contract frozen** | ✅ Shipped | Claude Code | `d220f4b1`, `cc6d5a0e` | — | — |
| 3b | Funding + Revenue Surface Specialists; `createMgmtCoRouter`; `/save-tab` returns `AnalystVerdict | null`; `AnalystCheckDialog` rewritten on the contract | ✅ Shipped | Replit | `ee0c6573` | — | — |
| 4 | Remaining mgmt-co Specialists (Compensation, Overhead, Company, Property-Defaults). Persona resolution + verdict-cache table deferred. | ⏳ Pending | CC + Replit | — | P6 ✅ (unblocked) | Folded into P7-B — see `.claude/plans/p7-engine-specialists.md` |
| 5 | Cognitive Engine reorg (`server/ai/` 41 flat files → 6 capability folders) | ⏸ Paused | — | — | ADR-005 doctrine freeze | Wait for ADR-005 to clear Doctrine Freeze Gate |

---

## ADR-004 — Verdict Cache (Status: Accepted 2026-04-20)

| Phase | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| 5A — Claude side | Cache-key utilities + 21 tests | ✅ Shipped | Claude Code | `38a468b3` | — | — |
| 5A — Migrations | `research_runs.cache_key` (indexed) + `research_runs.cache_inputs_hash` + `assumption_guidance.superseded_at` columns | ✅ Shipped | Replit | `4ebe71ae` | — | — |
| 5B | engine-client.ts read path | ✅ Shipped | Claude Code | `24853904` | 5A ✅ | `engine/analyst/cognitive/engine-client.ts` with `tryCacheRead()` + `consultCognitive()` + 501-line test file. Shipped earlier; phases.md entry was stale. |
| 5C | write-after hook populates new columns | ✅ Shipped | CC | `9fb9083e` (task-1, collision) + `6302e621` (task-2/3) | 5B | task-4 (pgvector bulk-supersede) deferred — low-priority admin utility |

---

## ADR-005 — Workspace Reorganization (Status: Proposed)

| Phase | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| Phase 1 | Tooling-only PNPM Workspaces + Turborepo bootstrap (zero file moves) | ⏸ Paused | Replit (planned) | — | Doctrine Freeze Gate (ADR still `Proposed`) | Per architect 2026-04-22 working-model review: pause until new operating model proves stable for 1–2 phases. |
| Phase 2+ | File moves into workspace packages | ⏸ Paused | — | — | Phase 1 + ADR `Accepted` | — |

---

## ADR-006 — Resources Control Plane (Status: Accepted 2026-04-21)

Maps 1:1 to the **Resources Control Plane** workstream above. P1–P5 shipped; P6/P7 pending.

---

## Audit Inventory Sweep (governed by `.claude/audit-inventory.md`)

| Phase | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| 1 | Inventory of all duplicated/derived constants | ✅ Shipped | Claude Code | — | — | — |
| 2 | Drift repair (D-1 / D-3 / D-4) | ✅ Shipped | Claude Code | — | — | — |
| 3 | Audit sweep (16 files) | ✅ Shipped | Claude Code | — | — | — |
| 4 | Findings #9–#16 | ✅ Shipped | Replit | — | — | — |
| 5A | Citations promotion | ✅ Shipped | Replit | — | — | — |
| 5B | KB orphan cleanup (re-index pending user action) | ✅ Shipped | Replit | — | — | User-action: re-index |
| 5C | Capital-raise-date drift | ✅ Shipped | Replit | — | — | — |
| 6 | DB migration (service description column) | ⏸ Paused | Replit (future) | — | — | Out of priority |
| 7–8 | (Not scoped yet) | ⏳ Pending | TBD | — | — | — |

---

## Specialist Tier-1 Graduation (governed by ADR-007, Status: Accepted 2026-04-26)

> Path from current Tier-0 watchdog wrappers / unimplemented Specialists → Tier-1 N+1-driven Specialists meeting `.claude/rules/specialist-intelligence-bar.md`. Six phases, one Specialist per phase, sequential learning. Photos (F) and Resource Builder (L) are exempt; Constants Specialists (H–K) are a separate track. Owner = **CC** per `claude-replit-split.md` 2026-04-26 research/intelligence lane (engine code is CC; the route handler + UI surfacing slice is Replit's via two-track execution when applicable).

| Phase | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| G1 | Funding (A) graduation | ⏸ Paused | CC | `6f4696ba`, `71061c1d`, `8ba81dfd`, `9a461f92`, `ae2a16e7`, `e6f6059a` | ADR-004 Phase 5B v2 ✅ (24853904) | Engine code shipped; behavioral verification BLOCKED by Replit (`64701f7b`) — `verdict.meta` contract too thin. G1.5a ✅ + G1.5b-pre ✅ + G1.5b ✅ all closed; only G1.5c (Tier-1 deps wiring) remains before G1 closes. |
| G1.5a | ADR-008 verdict-meta extension (`fallbackReason`, `vendorsUsed`, `cacheState`) + Tier-0 fallback emission | ✅ Shipped | CC | `71ebbb9e` (S1) → `9e9036de` (S2) → `4ed92eb0` (S3) → `0ea2998f` (S4) → `da3f0afa`+`508b282d` (S5 collision) → `1f3a5323` (S6) → `fe15892f` (S7) | ADR-008 ✅ Accepted 2026-04-26 | All five gates green per S-step. Behavioral verification (Tier-0 half) testable in dev server now; Tier-1 half deferred to G1.5c. |
| G1.5b-pre | Trigger discipline remediation — drop save-tab Specialist dispatch + remove client auto-trigger hooks + new `tests/proof/analyst-trigger-discipline.test.ts` (16 tests) + Property page Analyst auto-trigger fix | ✅ Shipped | Replit | `c65d3ae0` (server-a) → `82a23cb8`+`d8a5183e`+`008612d4`+`cb82dc3c` (client-b, 4 commits) → `2267de88` (Task #739 Property page bonus) | G1.5a ✅ + analyst-trigger-discipline rule ✅ | All 5 gates green; proof test asserts no Specialist dispatch in save-tab + no auto-trigger in useEffect. Behavioral verification: Save returns data only; AnalystButton click is the only Analyst trigger. |
| G1.5b | Defaults & Assumptions cascade for 5 Funding fields (4 stored cols + `trancheGapMonths` derived from `capitalRaise1Date`/`capitalRaise2Date`) — schema columns + DEFAULT_* constants + model_defaults seed + Admin Steady-State UI + Funding-tab Assumption inputs + form-hook wiring + server-side Defaults overlay | ✅ Shipped | Replit | `c8881d38`+`6d00d805` (Packet A: schema + DEFAULT_* + Admin UI), `1bb965e2` (Packet B: 4 Funding inputs + form hook), `6e3f7bed` (Task #742: server overlay so user form inherits admin Defaults instead of falling through to hardcoded constants) | G1.5b-pre ✅ Shipped | Per `inflation-cascade.md` three-tier rule. Cascade: user assumption (formData) → admin Default (model_defaults via overlay) → hardcoded `DEFAULT_*` floor. `trancheGapMonths` is derived (no schema column) so the two date fields stay the single source of truth. |
| G1.5c | Tier-1 deps wiring — engine slice (a) + v1 cognitive ship (replaces b/c) | ✅ Shipped | CC | -a ✅ `58b03e88`+`f40e0d07`+`9d7fce86`; v1 S1-S5 ✅ `9c3da43a`→`7d8a0be3`; Gaspar fix `9505c619`; cleanup `2f94ee36`; S6 ✅ `1addc5bf` (3 fixes); audit findings fixed `2d46c186` | G1.5b-pre ✅ + G1.5a ✅ | S6 (manual prompt review — 5+ investor-grade verdicts) passed 2026-04-28. All 5 gates green. G1.5c fully closed. |
| G1.6-v1 | Property Risk Intelligence (Daniela / D) v1 route handler wiring — extends `POST /api/analyst/refresh` with `scope:"property"` + `propertyId` + `property.risk-intelligence` branch | ✅ Shipped | CC | `5c4fcc5a` | Daniela runner ✅ (UNWIRED removed), G1.5c ✅ | Route handler + UI fully wired. `useAnalystRefresh` extended with `propertyId` + `"property"` scope; PropertyEdit hook updated to `property.risk-intelligence`. All 5 gates green 2026-04-28. |
| G2-v1 | Revenue (B) v1 — single-shot Opus + careful prompt + rich context | ✅ Shipped | CC+Replit | `80df7bbc` (server) + `62a664fc` (UI) | G1.5c ✅ (1 session soak done 2026-04-28) | 6 server files (1342 ins) + UI wiring: `<AnalystButton>` on PropertyUnderwritingTab routing to `specialistId:"mgmt-co.revenue"`. All 5 gates green 2026-04-28. |
| G6-P2 | Funding Specialist N+1 panels — Gemini Flash quant + Sonnet market + Opus synthesis with convergence-score + vendor breadth ≥2 | ✅ Shipped | CC | `a36b82a8` | G1.5c ✅ (v1) | IB#7 (vendor breadth) closed. |
| G6-P3 | Funding Specialist PE pre-stage + bounded regress quality loop (IB#8 + IB#9); canned LP comparables (IB#4 partial; IB#5 live API deferred — canned set sufficient for graduation) | ✅ Shipped | CC | `467d9506` (P3a) + `aa2d6221` (P3b) | G6-P2 ✅ | IB#8 + IB#9 closed; 70 tests green. |
| G6-P4 | Funding Specialist Tier-1 fully graduated — IB#3 #4 #6 #7 bar assertions added to production runner tests | ✅ Shipped | CC | `519d1c54` | G6-P3 ✅ | All 9 Intelligence Bar requirements now exercised by tests. |
| G3 | Risk Intelligence (D) graduation — full N+1 pipeline (PE Gemini Flash + quant Gemini Flash + market Sonnet + Opus synthesis), honest-fail path, bounded regress, 12 bar tests (IB#7 #8 #9 + IB#3 #4 #6) | ✅ Shipped | CC | `1dbd38ac` | G2 ✅ | 12 bar tests green; all 9 IB requirements exercised. Single-dimension (`propertyInflationRate`) evidence-padding handles TIER_1_MIN_TOTAL_EVIDENCE invariant. |
| G4 | Executive Summary (E) graduation — Opus 4.6 model upgrade + catalog `built` + parity-test opt-out (narrative report, not per-field verdicts) + 10 bar tests (shape/fallback/model-tier) | ✅ Shipped | CC | `bfb989f3` (GET trigger fix) + `8feabdfc` (G4-b graduation) | G3 ✅ | Eloá tab live (Replit G4-a); trigger-discipline GET fix closes the IB compliance gap; G4-b closes here. |
| G5 | ICP Intelligence (C) graduation — Opus 4.6 model upgrade + empty candidateFields (narrative generator, not per-field evaluator) + catalog `built` + parity-test opt-out + 10 bar tests (shape/fallback/model-tier) + research-quality fixture migration to mgmt-co.revenue | ✅ Shipped | CC | `447d3fd8` | G4 ✅ | — |
| G6 | Watchdog (G) graduation — catalog `built` + BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS opt-out + 10 bar tests (consistency/staleness/alerts/catalog) | ✅ Shipped | CC | `40f72a7c` | G5 ✅ | — |
| G7 | Photo Enhancer (F) graduation — catalog `built` + BUILT_SPECIALISTS_WITHOUT_VERDICT_DIMENSIONS opt-out + 10 bar tests (batch logic/style/config/catalog) | ✅ Shipped | CC | — | G6 ✅ | — |

---

## Strategic Roadmap (governed by `docs/planning/MASTER-PLAN-V2.md`)

| Phase | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| 8 | Platform Independence (4–6 wk est.) | 🟢 In progress | Replit | — | — | Sub-phase 8.1 done; remainder open |
| 9 | Research Excellence (backend ✅; UI in T001–T007) | 🟡 Partial | Replit | — | — | UI tasks T001–T007 |
| 10 | Scenario Intelligence (backend ✅; UI in T006) | 🟡 Partial | Replit | — | — | UI task T006 |
| 11 | Export Excellence (3–5 wk est.) | ⏳ Pending | Replit | — | Phase 8 deploy | — |
| 12 | Knowledge & Onboarding (4–6 wk est.) | ⏳ Pending | Replit | — | Phase 8 deploy | Video content is separate workstream |
| 13 | Scale & Performance (6–8 wk est.) | ⏳ Pending | Replit | — | Phase 8 deploy | Multi-org migration = riskiest schema change |

---

## Open Tracks (cross-cutting)

| Track | Scope | Status | Owner | Commit/PR | Blocked-by | Next |
|---|---|---|---|---|---|---|
| OT-A | streamObject migration windows (T+72h soak per phase) | ⏳ Pending | Replit | — | — | Author packet per `_TEMPLATE.md` when starting next phase |
| OT-B | Braintrust evaluator integration | ⏳ Pending | Replit | — | — | Author packet per `_TEMPLATE.md` when starting |

---

## Working-model state (governed by `.claude/rules/claude-replit-split.md`)

| Item | Status | Notes |
|---|---|---|
| Rule revision (CC advisor / Replit executor) | ✅ Shipped 2026-04-22 | Three deltas: Pure refactors → explicit-delegation lane; Doctrine Freeze Gate (Guardrail #7); Atomic packet budget (Guardrail #8) |
| Packet template (`.claude/replit-handoffs/_TEMPLATE.md`) | ✅ Shipped 2026-04-22 | 9 mandatory sections; binding for new packets |
| Resources skill (`.claude/skills/resources/SKILL.md`) | ✅ Shipped 2026-04-22 | Directive companion to ADR-006 + resources-control-plane.md |
| Phase status SoT (this file) | ✅ Shipped 2026-04-22 | Migration steps 1–3 complete; CI guard (step 4) shipped via `script/check-phase-status-uniqueness.ts` |
| `documentation.md` rule update (point new status edits to this file) | ✅ Shipped 2026-04-22 | See § "Phase status changes" in that rule |
