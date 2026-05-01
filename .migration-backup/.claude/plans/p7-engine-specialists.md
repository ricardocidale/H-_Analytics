# P7 — Revenue N+1 Graduation + Remaining mgmt-co Specialists

**Created:** 2026-04-30  
**Status:** Pending — P6 ✅ at `18077f4e` (all sub-phases closed)  
**Owner:** Claude Code (engine/AI/server lane); Replit (admin UI per separate handoff packets)  
**ADR:** ADR-007 (accepted 2026-04-26) covers the Tier-1 graduation pattern. Revenue follows G2.

---

## What P7 covers

P7 is two sequential engine workstreams that share the Funding N+1 pattern:

| Track | Scope | Why together |
|---|---|---|
| **P7-A** | Revenue Specialist N+1 graduation (`mgmt-co.revenue` G2-v1 → Tier-1) | Same N+1 pattern as Funding; Revenue runner has 3 explicit TODO scaffolds |
| **P7-B** | Remaining mgmt-co Specialists: Compensation, Overhead, Company, Property-Defaults (Analyst Architecture Phase 4) | All follow the Revenue N+1 pattern as template; now unblocked (P6 Required Fields enforcement shipped) |

> **Not in P7:** Constants H–K admin pages (`status: "needs-page"`) — UI/Replit lane, separate handoff packet.

---

## P7-A: Revenue N+1 Graduation

### Graduation letter

G2 (per ADR-007 naming convention; Funding was G1).

### Current state

`mgmt-co.revenue` (letter B, `specialist-catalog.ts`) is `status: "built"` but Tier-0 only:
- Runner: `server/ai/specialists/mgmt-co-revenue-runner.ts` (369 LOC) — single-shot Opus call
- 3 TODO markers in runner:
  - `// TODO (Revenue N+1 graduation — phase TBD, see phases.md; G6-P2 was Funding-only)`
  - `// TODO (Revenue N+1 graduation — phase TBD) replace with real orchestrator cognitiveRunId`
  - `// TODO (Revenue N+1 graduation — phase TBD) populate vendorsUsed once N+1 panels land`
- `meta.cognitiveRunId` is synthetic (violates ADR-003 invariant 6)
- No `api` assignmentRef (violates specialist-intelligence-bar.md requirement 5)
- `engine/analyst/surface/mgmt-co/revenue-specialist.ts` — Tier-0 only; `deps` struct absent (contrast with Funding which takes `FundingSpecialistDeps`)

### Files that already exist for Revenue

```
server/ai/specialists/
  mgmt-co-revenue-runner.ts            ← update (wire N+1, resolve 3 TODOs)
  mgmt-co-revenue-output-schema.ts     ← keep
  mgmt-co-revenue-prompt.ts            ← keep (system+user prompt, reuse as synthesis base)
  mgmt-co-revenue-prompt-input-builder.ts  ← keep
  mgmt-co-revenue-orchestrator-adapter.ts  ← keep (RevenueComparableRow, revenueComparableToEvidence)
```

### Files to create for Revenue N+1 (mirrors Funding pattern exactly)

```
server/ai/specialists/
  mgmt-co-revenue-prompt-engineer.ts        ← LLM pre-stage (Sonnet 4.6 / Gemini Flash)
  mgmt-co-revenue-quant-panel-prompt.ts     ← Gemini 2.5 Flash (quantitative)
  mgmt-co-revenue-quant-panel-schema.ts     ← Zod schema for quant panel output
  mgmt-co-revenue-market-panel-prompt.ts    ← Claude Sonnet 4.6 (market/qualitative)
  mgmt-co-revenue-market-panel-schema.ts    ← Zod schema for market panel output
  mgmt-co-revenue-synthesis-validator.ts   ← synthesis convergence + regress logic
```

### Files to update for Revenue N+1

```
engine/analyst/surface/mgmt-co/
  revenue-specialist.ts    ← add RevenueSpecialistDeps (like FundingSpecialistDeps)
  index.ts                 ← add deps to revenue config in MgmtCoSpecialistConfigs

engine/analyst/registry/
  specialist-catalog.ts    ← add { kind: "api", slug: "web-search", required: false } to revenue assignmentRefs
                             (or "market-data-api"; revenue needs ≥1 api assignmentRef per IB req #5)
```

### IB bar checklist for Revenue graduation

Per `specialist-intelligence-bar.md` (all 9 requirements must pass):

| # | Requirement | Revenue G2 target |
|---|---|---|
| 1 | Tier-1 cognitive evaluation | `verdict.meta.cognitiveRunId` non-null (real orchestrator run) |
| 2 | Context-rich prompt | Property + portfolio + market context injected via `buildRevenueSystemPrompt` / `buildRevenueUserPrompt` |
| 3 | Citation-backed evidence | Each dimension ≥3 evidence items with `url` or `documentRef` |
| 4 | Tabular comparables (numeric) | `comparables: RevenueComparableRow[]` per numeric dimension (already has orchestrator-adapter infrastructure) |
| 5 | Live API resource | ≥1 `kind: "api"` in `assignmentRefs` (add to catalog + resolver) |
| 6 | Range-first delivery | `range = { low, mid, high }` with `qualityScore >= CONVICTION_FLOOR` |
| 7 | Vendor breadth N+1 | ≥2 distinct vendors (Gemini Flash quant + Anthropic market/synthesis) |
| 8 | LLM-driven Prompt Engineer | `verdict.meta.promptEngineerRunId` non-null |
| 9 | Regress + honest-fail | `verdict.meta.regressCount` tracked; honest-fail path in golden-test bench |

### Test file

`tests/analyst/golden/mgmt-co-revenue.test.ts` — mirrors `mgmt-co-funding.test.ts` structure with 9 IB bar assertions.

---

## P7-B: Remaining mgmt-co Specialists (Analyst Architecture Phase 4)

### Context

These 4 Specialists are the Analyst Architecture Phase 4 scope (status `⏳ Pending` in `phases.md`). They were blocked on P6 Required Fields enforcement, which shipped at `7a4efea2`. They are now unblocked.

None of these Specialists exist yet in:
- `engine/analyst/registry/specialist-catalog.ts`
- `engine/analyst/surface/mgmt-co/`
- `server/ai/specialists/`

### Build order (dependency-safe sequence)

1. **Compensation** — mgmt-co.compensation. Tab: Company Assumptions → Partner Comp / Salaries
2. **Overhead** — mgmt-co.overhead. Tab: Company Assumptions → Overhead / Fixed Costs
3. **Company** — mgmt-co.company. Tab: Company Assumptions → Company Profile
4. **Property-Defaults** — mgmt-co.property-defaults. Tab: Admin Defaults → Property Underwriting

No hard sequencing dependency between them; 1→4 is conceptually cleanest (simpler tabs first).

### For each new Specialist: files to create

```
engine/analyst/registry/specialist-catalog.ts
  + one new entry (letter M, N, O, P or next available)

engine/analyst/surface/mgmt-co/
  + <name>-specialist.ts          ← createXxxSpecialist() returning AnalystVerdict, Tier-1
  (update index.ts to export + register in createMgmtCoRouter)

server/ai/specialists/
  + mgmt-co-<name>-runner.ts              ← N+1 pipeline orchestration
  + mgmt-co-<name>-prompt-engineer.ts
  + mgmt-co-<name>-quant-panel-prompt.ts
  + mgmt-co-<name>-quant-panel-schema.ts
  + mgmt-co-<name>-market-panel-prompt.ts
  + mgmt-co-<name>-market-panel-schema.ts
  + mgmt-co-<name>-synthesis-validator.ts
  + mgmt-co-<name>-output-schema.ts
  + mgmt-co-<name>-prompt-input-builder.ts
  + mgmt-co-<name>-prompt.ts
  + mgmt-co-<name>-orchestrator-adapter.ts
```

### Replit lane (P7-B UI — separate handoff packet)

For each new Specialist, Replit builds:
- Admin page tab (Specialists → [Name] tab)
- Required Fields tab
- Runtime/Audit tabs (using existing pattern from Funding/Revenue pages)

CC writes the handoff packet after each Specialist's engine code is complete and gate-verified.

---

## Sequence and commit structure

```
P7-A:
  G2-P1: Revenue prompt-engineer + quant-panel files (new)
  G2-P2: Revenue market-panel + synthesis-validator files (new)
  G2-P3: Revenue runner N+1 wiring (TODO markers resolved)
  G2-P4: Revenue IB bar tests (golden bench, 9 assertions)
  G2-P5: Revenue catalog + assignmentRef update; phases.md

P7-B (one Specialist per commit cluster):
  Phase4-C: Compensation Specialist (engine only; Replit packet follows)
  Phase4-O: Overhead Specialist
  Phase4-Co: Company Specialist
  Phase4-PD: Property-Defaults Specialist
```

Each commit cluster passes all 5 gates: `tsc --noEmit`, `npm run lint`, vocabulary test, `npm run test:summary`, `npm run verify:summary` (UNQUALIFIED).

---

## Before starting P7-A

1. Confirm Revenue runner 3 TODOs are the only scaffolding anchors (`grep -n "TODO.*Revenue N+1" server/ai/specialists/mgmt-co-revenue-runner.ts`)
2. Read `server/ai/specialists/mgmt-co-funding-runner.ts` + `mgmt-co-funding-prompt-engineer.ts` — these are the authoritative pattern templates
3. Read `engine/analyst/surface/mgmt-co/funding-specialist.ts` — FundingSpecialistDeps is the deps interface Revenue should mirror

---

## What P7 does NOT cover

- Constants H–K admin pages — Replit UI lane, separate handoff packet (`p7-constants-pages.md`)
- ADR-005 (workspace reorganization) — still paused (Doctrine Freeze Gate)
- Analyst Architecture Phase 5 (Cognitive Engine reorg) — still paused (ADR-005 dependency)
- Revenue Tier-1 for property-level tabs — out of scope for now; Revenue Specialist covers mgmt-co tabs only
