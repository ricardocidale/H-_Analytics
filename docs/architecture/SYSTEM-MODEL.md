# H+ Analytics — System Model

**Status:** Living document. Last audit: April 20, 2026.
**Authority:** Canonical business-model + technical mental model. If a skill file or rule contradicts this doc, reconcile in a PR — do not silently diverge.
**Audience:** Every new contributor (human or agent) on day one. Read before touching code.

---

## TL;DR

H+ Analytics is a **fundraising tool**, not an operations platform. It builds investor-grade financial models for a hospitality company with two entities (a brand/Management Company and a portfolio of Special Purpose Vehicles) and surfaces AI-generated intelligence ("The Analyst") at every assumption field so the numbers defend themselves under LP scrutiny.

Three truths compress the whole stack:

1. **Two entities, one consolidation.** The Management Company (ManCo) earns fees from Property SPVs. Each SPV pays those fees as expenses. On consolidation, intercompany fees eliminate under ASC 810. Forgetting which entity owns what is the #1 modeling bug.
2. **Deterministic engine + LLM advisor, never the inverse.** Numbers come from pure TypeScript calculators in `engine/` and `calc/`. LLMs generate *ranges, verdicts, and voice* — never arithmetic. 37 deterministic tools dispatch from `calc/dispatch.ts`.
3. **The Analyst is an N+1 pipeline.** Two panels (Gemini Flash = quantitative, Claude Sonnet 4.5 = market) run in parallel, then Opus 4.6 synthesizes. Output is a structured `AnalystVerdict` bound to one of 41 canonical field keys. All output flows through a single verdict contract.

---

## 1. Business Model

### 1.1 The dual-entity architecture

**ManCo (Management Company / Brand).** A service business. Owns the hospitality brand, markets to vertical communities (wellness, corporate retreats, sexual wellness, health/healing), provides centralized services to each property. Revenue is *entirely* fee income from properties. Capitalized via SAFE / convertible notes / equity / revenue-based financing — the UI label is admin-controlled (`fundingSourceLabel`). **Never** hardcode "SAFE."

**Property SPVs.** Each property is its own Special Purpose Vehicle. Each SPV has its own investors, its own debt, its own pro forma, its own exit. SPVs pay fees to ManCo and keep the residual. A single investor may hold positions in multiple SPVs — the app does not track cross-SPV overlap.

This split matters because LP due diligence always asks: "Am I investing in the brand, or in the real estate?" The model must answer that cleanly. Treating ManCo and a property as the same entity — or lumping their cash flows — is disqualifying.

### 1.2 ManCo mechanics

**Revenue (fee income):**

- **Service fees** (base management): charged as a % of each property's *total revenue*, broken into 6 categories that sum to ~8.5% default:
  - Marketing & Brand 2.0% (mandatory)
  - Technology & Reservations 2.5%
  - Accounting 1.5%
  - Revenue Management 1.0%
  - General Management 1.5%
  - Procurement 1.0%
- **Incentive fee** (performance management): charged as a % of each property's **GOP** (Gross Operating Profit), *not* total revenue. Default 12%. Gated by **owner's priority return hurdle** (if `ownerPriorityReturn > 0` and cumulative owner cash flow < hurdle, incentive fee = 0 that month). **Subject to fee subordination** (if cash < debt service and subordination is `partial`, incentive fee is deferred; if `full`, both fees defer). Deferrals accumulate in `cumulativeDeferredFees`.

Engine anchor: `engine/property/property-engine.ts:170-195`. Industry practice: boutique operators earn 5–12% of GOP. Textbook finance sometimes describes this as "% of total revenue" — that's wrong for this codebase. The definition was tightened in OT-A.3 v3 (FIELD_DEFINITIONS) after A/B drift.

**Expenses (ManCo costs):**

- Staff compensation (FTE by role) — scales by property count via configurable staffing tiers (`staffTier1MaxProperties`, `staffTier2MaxProperties`).
- Overhead (rent, tech, insurance, travel) — fixed + variable components escalated annually.
- Vendor costs for centralized services — the buy-side of the make-vs-buy decision for each service category.

ManCo fee revenue aggregated in `engine/company/company-engine.ts:168-221`. Per-property incentive attribution preserved in `incentiveFeeByPropertyId` for consolidated statements.

### 1.3 Property SPV mechanics — two business models

**Model 1: Boutique Hotel.** Converted residential estates on acreage. Main house → common areas. Rooms added via A-frames, glamping, outbuildings. Revenue = ADR × rooms × occupancy + F&B + events + other. **Target split: 50% rooms / 35–50% F&B / 5–15% other.** Tiers (NOT star ratings): Luxury, Upper Upscale, Upscale, Upper Midscale, Midscale, Economy.

**Model 2: Luxury Rental.** Whole-property per-night (~$2,500/day Medellín duplex). Capacity in beds/guests, not rooms. F&B from events/catering/experiences, not just in-house dining. Simpler cost structure, fewer ManCo services consumed. **F&B revenue is NOT zero — the VRBO-style default with `costRateFB=0` is wrong and is a known seed-data debt item.**

**Cost categories (conversion):** acquisition + renovation + room additions + event venue + commercial kitchen + fire/ADA + zoning/permitting + FF&E + pre-opening + operating deficit reserve + liquor licensing (varies $2K–$40K by jurisdiction).

**Lifecycle gates:** Revenue only flows after `acquisitionDate` AND `operationsStartDate`. Debt service begins at acquisition; there's a pre-ops gap funded by the operating reserve (see `tests/engine/operating-reserve-cash.test.ts`).

### 1.4 The consolidation

**Per-property income statement** (engine chain, month-by-month):

```
Revenue  (rooms + F&B + events + other)
  − OpEx (by department)
  = GOP
  − Effective Base Fee (service fees, after subordination)
  − Effective Incentive Fee (after hurdle + subordination)
  = AGOP (Adjusted Gross Operating Profit)
  − Property Taxes
  = NOI
  − FF&E Reserve
  = ANOI (Adjusted NOI — this is the cash metric)
```

Then: `cashFlow = ANOI − debtPayment − incomeTax`. The cash formula must use **ANOI, never NOI** — using NOI overstates balance-sheet cash by the cumulative FF&E reserve. This is the #1 balance-sheet-imbalance bug (see `.claude/rules/balance-sheet-identity.md`).

**Portfolio consolidation:**

- Sum property revenues, GOPs, NOIs, ANOIs.
- ManCo fee revenue = Σ (per-property base fees + incentive fees).
- **Intercompany elimination (ASC 810):** in the consolidated view, ManCo fee revenue ↔ property fee expenses zero-sum to net $0. The engine computes both sides; UI/export layers surface elimination for audit traceability.
- Portfolio IRR computed from consolidated cash flows — *not* averaged across properties.
- Weighted ADR / Occupancy / RevPAR weighted by room-nights-available, not simple average.
- Property count **derived dynamically** from the array — never hardcoded. Adding a property scales staffing tiers automatically.

---

## 2. The Analyst — Full Architecture

### 2.1 What the user sees

Two AI Agents, never named plurally:

- **The Analyst** — the intelligence. Generates ranges + conviction + risk flags next to every assumption field. Written voice only (no conversation). Always capitalized, always singular.
- **Rebecca** — the companion. Conversational. Answers questions, conducts tours, explains what The Analyst found. Omnipresent.

Internal vocabulary (never user-facing): "Cognitive Engine," "Specialist," "Surface," "Verdict," "Panel."

### 2.2 Two-tier internal architecture (ADR-001)

**Tier 1 — Surface Specialists.** Six thin, owned specialists, one per surface (= one UI area with its own semantics):

1. `surface-property` — assumption fields on a property edit page.
2. `surface-mgmt-co` — ManCo assumption fields (fees, staffing, overhead).
3. `surface-icp` — ideal-customer-profile characterization.
4. `surface-admin-defaults` — admin-configurable defaults table.
5. `surface-cross-portfolio` — portfolio-wide guidance.
6. `surface-staleness` — "due for review" nudging.

Each Specialist decides: what context to assemble, whether to consult the Cognitive Engine, and how to render a `AnalystVerdict`. Specialists **never** import `research-orchestrator.ts` directly — they go through the façade `engine/analyst/cognitive/engine-client.ts` (Phase 2 stub → Phase 3 typed).

**Tier 2 — The Cognitive Engine (N+1 pipeline).** The shared heavyweight research brain. One orchestrator at `server/ai/research-orchestrator.ts`. Pipeline phases:

1. **Comparables Relaxation** — progressively widens filters (`server/ai/comparables/relaxation-engine.ts`) until ≥3 peers match the property's tier/market/model.
2. **Two Panels in Parallel:**
   - **Panel A — Quantitative (Gemini 2.5 Flash):** fast, structured numerical reasoning. Cheaper. Produces base ranges.
   - **Panel B — Market (Claude Sonnet 4.5):** slower, context-rich narrative + comp-validated ranges.
3. **Synthesis (+1) — Claude Opus 4.6:** the "N+1" that reads both panel outputs, reconciles disagreements, and emits a single structured `SynthesisOutputSchema` JSON keyed on `CANONICAL_RESEARCH_FIELDS` (41 keys).
4. **Value Extraction → `assumption_guidance`** rows persisted for audit trail, keyed by `cognitiveRunId`.

**Graceful degradation:** if one panel fails, synthesis receives a `[FAILED]` marker and still produces output. Zero-panel failure returns no verdict; the Specialist downgrades UX to "not yet reviewed."

### 2.3 The contracts (frozen Phase 3a)

Everything the Analyst emits is one of these shapes. See `.claude/skills/analyst/contracts.md` for the full atlas.

- **`AnalystVerdict`** — the user-facing artifact. Zod-validated, with 7 invariants (e.g., dimensions non-empty; all `voiceRendered` strings pass the vocabulary gate; `meta.surface` matches router).
- **`VerdictDimension`** — one dimension (a field or group of fields). Contains a `VerdictRange` (low/mid/high + conviction) and optional `action`.
- **`VerdictAction`** — 6-kind discriminated union: `accept_range`, `edit_assumption`, `request_deep_dive`, `flag_outlier`, `schedule_review`, `dismiss`. **Not in the union: `save_anyway`** — that's a UI-only escape hatch rendered as a ghost button via `onProceedAnyway`.
- **`VoiceRenderedString`** — branded type that guarantees the string passed the vocabulary compliance check at build time.
- **`SynthesisOutputSchema` / `FIELD_DEFINITIONS`** — the 41 canonical field keys with unit + denominator + scope triples. Injected into Opus's system prompt via `formatFieldDefinitionsForPrompt()`. The acceptance gate is **categorical (zero unit/denominator/scope errors)**, not aggregate bucket-match — a durable lesson from OT-A.3 A/B iteration.

### 2.4 When to consult the Engine (decision rule)

Not every field needs a heavyweight research call. **Tier-0** (the default) is sub-second: constants + benchmark lookup from `assumption_guidance`. **Tier-1** invokes the Cognitive Engine. Consult Tier-1 only when:

1. The user explicitly clicked "Ask the Analyst."
2. Guidance is Due or Overdue (staleness specialist).
3. The market is thinly covered by benchmarks for this tier/market.
4. A user value moves outside the benchmark range.
5. ICP characterization (always Tier-1).
6. Admin Defaults table refresh (always Tier-1).

**N+1 evidence rule** (non-negotiable for Tier-1): result must include ≥3 sources. Fewer → Specialist downgrades severity to "ok" + "developing data" voice note. No Tier-1 verdict ever ships with < 3 sources.

### 2.5 Cost economics of a research call

Per single Tier-1 consult with current (April 2026) pricing via Vercel AI Gateway + BYOK (zero markup):

- Gemini 2.5 Flash (Panel A) — ~$0.05
- Claude Sonnet 4.5 (Panel B) — ~$0.15
- Claude Opus 4.6 (Synthesis) — ~$0.50
- Embeddings (pgvector retrieval for comps) — < $0.01
- **Per-call total: ~$0.70.** Native prompt caching (OT-A.1) reduces repeat-call cost by 40–60% for same-context hits.

That budget is why Tier-0 must be the default. A dashboard with 50 fields × 10 users × 3 clicks/day = 1,500 Tier-1 calls = ~$1,050/day **if** we didn't gate. Gated, it's typically <$20/day.

---

## 3. Data Flow End-to-End

**Assumption write path:**

```
User edits field in UI
  → mutation hits /api/... route
  → zod validation at boundary
  → IStorage facade writes to Neon Postgres
  → onSuccess: invalidateAllFinancialQueries()
  → TanStack Query refetches dependent financial queries
  → property-engine.ts recomputes monthly pro forma
  → company-engine.ts aggregates ManCo view
  → calculationChecker.ts independently recomputes (audit independence)
  → UI re-renders with animated numbers + skeletons
```

Recalculation is triggered by a single helper — `invalidateAllFinancialQueries(queryClient)` — defined in `client/src/lib/api.ts`. Hand-picking individual query keys is forbidden (enforced by `tests/proof/recalculation-enforcement.test.ts`).

**Analyst consult path:**

```
User clicks "Ask the Analyst" on a surface
  → Surface Specialist (e.g., surface-property)
    → Assembles context (property ID, persona, field keys, current values)
    → engineClient.consult(request) [façade]
      → research-orchestrator.orchestrate()
        → Comparables Relaxation (pgvector namespace: comparables)
        → Panel A (Gemini Flash)  ┐
        → Panel B (Sonnet 4.5)    ┴── parallel
        → Synthesis (Opus 4.6, typed via SynthesisOutputSchema)
        → Value Extraction → assumption_guidance rows persisted
      → yields CognitiveResult stream (SSE) with phase narration
    → Specialist wraps result in AnalystVerdict
      → QualityScorer attaches conviction
      → VoiceRenderer produces VoiceRenderedString
      → buildAnalystVerdict() validates 7 invariants
    → API returns AnalystVerdict | null
  → UI consumes verdict
    → AnalystCheckDialog for blocking verdicts
    → Inline range badges for passive verdicts
    → Toast + voice text otherwise
```

**pgvector namespaces (inside Neon):** `research-history`, `comparables`, `benchmarks`, `icp-signals`, `property-archetypes`, `vertical-communities`, `market-context`. 1536-dim embeddings via OpenAI `text-embedding-3-small`. HNSW index. **Not Pinecone** — that's a stale reference in some older skill files.

---

## 4. The Deterministic Calculation Spine

37 pure-function tools across 6 categories dispatch from `calc/dispatch.ts`:

| Category | Count | Role |
|---|---|---|
| Research | 10 | `compute_property_metrics`, `compute_cap_rate_valuation`, `compute_adr_projection`, `compute_occupancy_ramp`, `compute_cost_benchmarks`, `compute_service_fee`, `compute_markup_waterfall`, `compute_make_vs_buy`, `compute_depreciation_basis`, `compute_debt_capacity` |
| Returns | 6 | IRR, MOIC, NPV, payback period, equity multiple, yield-on-cost |
| Validation | 5 | bounds checks, cross-field consistency |
| Analysis | 8 | sensitivity, breakeven, scenario comparison |
| Financing | 5 | PMT, amortization, refi math, LTV/LTC, DSCR |
| Services | 2 | make-vs-buy waterfall, vendor mark-up |

Rule: **LLM arithmetic is a bug.** Any prompt that asks the model to compute instead of interpret is a review-reject. The model picks the tool, feeds inputs, reads outputs. This is what makes Analyst ranges defensible in an LP meeting — the math is traceable to a registered tool with schema + tests.

---

## 5. Verification — The Five Gates

Every commit, every agent, no exceptions (`.claude/rules/pre-commit-verification.md`):

```
npx tsc --noEmit --skipLibCheck           # TS 0 errors
npm run lint                              # 0 errors
npm run test:file -- tests/audit/vocabulary-compliance.test.ts  # 11/11
npm run test:summary                      # PASS (~4,391 tests)
npm run verify:summary                    # UNQUALIFIED
```

Plus: 66 fast-check property tests across the 10 research tools (13,200 generated inputs per run) catching rounding-boundary and unit-confusion bugs like the markup-waterfall case at `effectiveMargin = 0.001` exactly.

The `tests/proof/` directory is the final gate — ADVERSE opinions are release blockers. Proof tests enforce: domain boundaries, balance sheet identity, portfolio dynamics, rule compliance, tool registry integrity, and recalculation enforcement.

---

## 6. Failure Modes + Graceful Degradation

| Failure | Behavior |
|---|---|
| One Cognitive panel fails | Opus synthesizes with `[FAILED]` marker; verdict still emitted |
| Both panels fail | No verdict; Specialist renders "not yet reviewed" state |
| < 3 sources returned | Specialist downgrades severity to "ok" + "developing data" note |
| Comparable relaxation finds 0 peers | Specialist emits empty-state verdict; UI shows "market thinly covered" |
| AI Gateway 402 (credit exhausted) | Current: error surfaced. Future: fallback to direct provider (handoff pending) |
| pgvector namespace empty | Specialist skips peer-validation step; conviction caps at "developing" |
| FF&E reserve miscalculated | Balance sheet identity violated > $1 → ADVERSE verdict in verify:summary |
| User saves despite blocking verdict | `onProceedAnyway` ghost button writes assumption + logs override to `assumption_guidance` |

---

## 7. Lifecycle Mechanics (for readers new to hotel finance)

One property's life, as modeled:

1. **Sourcing** (not modeled in engine, tracked in UI).
2. **Acquisition** — SPV closes on the property. Equity + debt hit balance sheet; operating reserve seeded at acquisition month index.
3. **Pre-ops gap** — debt service begins, zero revenue, operating reserve covers the hole.
4. **Operations start** — `operationsStartDate`. Revenue flows. Ramp curve (configurable months) brings occupancy from opening-day to stabilized.
5. **Stabilization** — ADR × Occupancy × Rooms produces room revenue; F&B ratio + other revenue follow. GOP, fees, NOI, ANOI all stream from this.
6. **Refinance** (optional) — Pass-2 engine re-runs with new debt terms, re-seeds operating reserve. Legacy `debtAssumptions.*` fields are **deprecated** — engine uses `acquisitionInterestRate` / `acquisitionTermYears` per property.
7. **Exit** — terminal cap rate applied to stabilized NOI. Waterfall: Gross Value − Commission − Outstanding Debt = Net Proceeds to Equity. **No property may carry debt beyond projection.**

---

## 8. Open Architectural Questions

Tracked here so new contributors see them on day one:

1. **Multi-tenant persona resolution.** Persona is currently hardcoded `{L+B, luxury, US}` in the router (single-tenant MVP). Phase 5 needs: user → org → brand → persona resolution chain with caching.
2. **Verdict cache.** Ten clicks on the same property = ten full pipeline runs at ~$0.70 each. ADR candidate: `(propertyId, fieldGroup, contextHash)` memo with staleness-detector TTL.
3. **`research-history` namespace in admin reindex menu.** Unconfirmed coverage — flagged for audit.
4. **Fallback prompt quality with `[FAILED]` markers.** Empirically untested; needs a regression harness.
5. **Staleness re-run audit trail.** Are old `assumption_guidance` rows superseded, deleted, or archived? Policy decision pending.
6. **Guidance ↔ engine seam.** Is `assumption_guidance` read-only metadata, with explicit user-accept as the only write path to assumption columns? Current code assumes yes; not formally contracted.
7. **Luxury-rental F&B seed.** `costRateFB=0` / `revShareFB=0` in `shared/constants-business-models.ts` is modeling debt — needs a product decision before deep-cleaning seed data.

---

## 9. Next Steps — Ranked by Leverage

This section replaces ad-hoc TODO scattering. Each item has a size estimate (S/M/L), a leverage score (1–5), and a gate that must pass for it to count as done.

### Top 3 — Do these next, in this order

**N1. Finish OT-A.3 Path 3 re-spec and unblock OT-A.4. (S, leverage 5.)**
**Path 3 failed by structural margin, not tunable noise** (severity 13.6%, action 13.6%, range overlap 6.0% — mathematical floors caused by representational mismatch between legacy point estimates and new-path ranges). Replit built the verdict-parity harness as offline analysis on v4 raw data and found the issue without spending $22 on a rerun. Three mechanism bugs have now been discovered + resolved: (1) definition drift, (2) mode collapse, (3) representational mismatch — the last codified as `.claude/rules/llm-contract-migration-parity.md`. **Current state:** Replit re-speccing the gate around tiered midpoint-agreement + per-tier bucket-match (Tier 1: 8 foundational fields at ≥55% bucket-match + ±10% midpoint; Tier 2: structural fields at ±20% midpoint; Tier 3: technical fields at "legacy point within new range"). Computed offline over v4 data. **Unblock criterion:** categorical gate clean ✓ + per-field T1 pass ≥ 90% + T2 pass ≥ 85% + T3 pass ≥ 80% + no mode collapse (unique-range count ≥ 3/field across 20 markets). OT-A.4 retires the legacy extractor when these land.

**N2. Ship the verdict cache. (M, leverage 5.)**
**ADR-004 drafted** at `docs/architecture/decisions/ADR-004-verdict-cache.md` (status: Proposed, April 20, 2026). Decision: content-addressed cache layered over existing `research_runs` + `assumption_guidance` (no new tables). Two-axis TTL (time + `inputContextHash`); automatic invalidation on property/global mutation and pgvector reindex; miss path is stream-through with write-after. Phased implementation: 5A migrations (Replit) → 5B façade read path (Claude Code) → 5C write-after + invalidation (Replit) → 5D observability (Replit, pairs with PostHog handoff). Why top: turns ~$125/day into ~$25/day at current volume and unlocks ambient/cross-portfolio UX patterns that are cost-prohibitive today.

**N3. Multi-tenant persona resolution. (L, leverage 4.)**
Follow-up to ADR-001. Replaces hardcoded persona with `resolvePersona(userId, orgId, propertyId)` returning a typed `AnalystPersona`. Gate: all existing verdict tests pass with a resolved persona path; new test suite covers 4+ persona combinations.

### Tier 2 — Observability + hygiene (next two weeks)

**N4. Execute Sentry financial-contexts handoff. (S, leverage 3.)** `SENTRY_DSN` is set; handoff is queued. Adds rich tagging (propertyId, cognitiveRunId, surface) to every error. Gate: errors from a forced `npm run verify:summary` failure appear in Sentry with all tags.

**N5. Execute PostHog wiring handoff. (S, leverage 3.)** `VITE_POSTHOG_KEY` is set. Event schema draft: `analyst.consulted`, `verdict.accepted`, `verdict.overridden_with_save_anyway`, `panel.failed`, `source_count.below_minimum`. Gate: dashboard shows events within 5 minutes of real user clicks.

**N6. Luxury-rental F&B seed fix. (M, leverage 3.)** Product + finance decision on what the F&B ratio should be for Model 2 properties (Medellín duplex style). Update `shared/constants-business-models.ts`, migrate existing rows via SQL, re-run engine tests. Gate: golden scenario for Medellín duplex shows F&B revenue > 0 and balance sheet balances.

### Tier 3 — Documentation hygiene (parallelizable)

**N7. Pinecone → pgvector cleanup in remaining skill files.** `rebecca-chatbot`, `research`, `product-vision` skills still reference Pinecone. Batch edit. Gate: `grep -r "pinecone" .claude/` returns only the "NOT Pinecone" disclaimers in this doc and DEPENDENCIES.md.

**N8. Owner-priority-return + fee-subordination UX.** The engine supports both (lines 170 + 185-195), but the UI doesn't expose them cleanly. Investor-facing wins — LPs love fee subordination. Handoff to Replit.

**N9. Fallback prompt regression harness.** Prove Opus handles `[FAILED]` markers gracefully under a deliberately-killed-panel test.

### Tier 4 — Research + product (quarter horizon)

**N10. Property archetype learning loop.** Every accepted verdict is feedback data. Pipeline: `(propertyId, fieldKey, Analyst range, user accepted value, post-hoc actual)` → monthly job that re-computes archetype prototypes in pgvector. Incremental: start by just logging the tuple.

**N11. Multi-brand support.** Architecture allows it (`business_brand` entity). No product pressure yet but the code shape should stay ready — review quarterly.

---

## 10. Reading Order for New Contributors

If you just joined and have 2 hours:

1. This doc (top-to-bottom, ~25 min).
2. `.claude/claude.md` (the master doc, ~15 min).
3. `.claude/skills/business-model/SKILL.md` (~10 min).
4. `.claude/skills/analyst/_index.md` + `orchestrator.md` + `cognitive-engine.md` + `contracts.md` (~30 min).
5. `docs/architecture/DEPENDENCIES.md` — skim the category headers (~10 min).
6. `engine/property/property-engine.ts` — read the per-month loop top to bottom (~20 min).
7. `engine/company/company-engine.ts` — read the aggregation loop (~10 min).

Then pick a skill directory relevant to your assigned surface and go deep.

---

## 11. Related Documents

| Document | Role |
|---|---|
| `.claude/claude.md` | Master doc — rules + counts + active phases |
| `.claude/skills/business-model/SKILL.md` | Business model skill — ManCo + property model details |
| `.claude/skills/analyst/_index.md` | Analyst skill index — routes to all analyst skills |
| `.claude/skills/analyst/contracts.md` | SDK contracts atlas — every Analyst contract in one place |
| `.claude/notes/analyst-architecture.md` | Authoritative mental model for the Cognitive Engine |
| `docs/architecture/ANALYST.md` | Architecture spine |
| `docs/architecture/DEPENDENCIES.md` | Full dependency atlas (150+ deps) |
| `docs/architecture/analyst/cognitive-engine.md` | Descriptive Engine spec |
| `docs/architecture/decisions/ADR-001-*.md` | Two-tier Analyst architecture |
| `docs/architecture/decisions/ADR-003-*.md` | AnalystVerdict contract |
| `.claude/rules/*.md` | 30 binding rules |
| `.claude/rules/financial-engine.md` | Engine invariants |
| `.claude/rules/balance-sheet-identity.md` | A = L + E rule (NOI vs ANOI) |
| `.claude/rules/deterministic-tools.md` | No LLM arithmetic |
| `.claude/rules/portfolio-dynamics.md` | Property count derivation + shared ownership |
| `.claude/rules/analyst-verdict-contract.md` | AnalystVerdict binding rule |
| `.claude/rules/claude-replit-split.md` | Division of labor between agents |
