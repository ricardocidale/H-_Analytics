# Research Intelligence System Redesign — Complete Specification

## Overview

Complete redesign of the research intelligence system from a thin 7-field prompt system into a 3-tier architecture with Entity Context Packs, progressive relaxation, scenario-awareness, full assumption coverage, star rating classification, and Rebecca as the conversational intelligence layer.

## Property Classification System

### Star Rating (1-5 Stars, User-Defined)

The star rating is the PRIMARY driver for comparable property matching. Users set it explicitly; the system auto-suggests based on ADR + amenities + room count.

| Stars | Examples | Characteristics |
|-------|----------|----------------|
| ★★★★★ | Four Seasons, Delano, Aman, Rosewood | Ultra-luxury, exceptional service, world-class amenities, iconic design |
| ★★★★ | Kimpton, Auberge, boutique luxury independents | High-end, distinctive character, premium service, curated experiences |
| ★★★ | Holiday Inn, Marriott Courtyard, Hilton Garden Inn | Reliable, standard service, business/family-oriented, consistent quality |
| ★★ | Budget brands, La Quinta, Motel 6 | Limited service, functional, value-oriented |
| ★ | Economy, basic accommodation | Basic rooms, minimal amenities |

Star auto-suggestion heuristic:
- ADR $700+ AND wellness AND events → suggest 5★
- ADR $250-$700 AND (wellness OR events) → suggest 4★
- ADR $150-$250 → suggest 3★
- ADR $80-$150 → suggest 2★
- ADR <$80 → suggest 1★
- Override: room count <15 AND ADR >$400 → suggest 4★ minimum (intimate luxury)

UX: 5 clickable star icons (filled gold = selected, unfilled gray = remaining), "Suggested: ★★★★" chip with "Why?" tooltip, helper accordion defining each level, Rebecca deep-link.

### Property Type (Hotel vs Resort, User-Defined)

| Type | Characteristics |
|------|----------------|
| Hotel | Urban/suburban, compact footprint, room-centric |
| Resort | Larger acreage, amenity-rich (pools, spa, tennis, possibly golf), destination-oriented |
| Boutique Hotel | Small (under 50 rooms), distinctive character, urban or rural |
| Business Hotel | Conference facilities, business center, urban location |
| Wellness Resort | Spa-centric, health-focused amenities, retreat atmosphere |
| Conference Hotel | Large meeting/event spaces, group business focus |
| Extended Stay | Suite-style, kitchen facilities, weekly+ stays |

### Composite Classification Label

Combines star rating + property type + ADR tier + size bucket + amenity density + location type:
```
"4★ Boutique Resort · Luxury · Intimate · Full Experience · Rural"
"3★ Business Hotel · Upper Upscale · Mid-Scale · Room-Centric · Urban"
```

### Database Fields (on properties table)

```
starRating: integer (1-5, nullable, user-set)
starRatingSource: text ('manual' | 'suggested')
starRatingSuggested: integer (1-5, nullable, auto-computed)
hospitalityType: text ('hotel' | 'resort' | 'boutique_hotel' | 'business_hotel' | 'wellness_resort' | 'conference_hotel' | 'extended_stay')
```

Existing `properties.type` remains for financing type (Full Equity / Financed).

## Entity Context Packs

### PropertyContextPack Interface

Auto-assembled from database — no admin configuration needed:

```typescript
interface PropertyContextPack {
  identity: { propertyId: number; name: string; type: string; description: string | null; }
  location: { fullAddress: string; city: string | null; stateProvince: string | null; zipPostalCode: string | null; country: string | null; lat: number | null; lng: number | null; market: string | null; locationType: 'rural' | 'suburban' | 'urban' | 'unknown'; }
  classification: { starRating: number | null; hospitalityType: string; adrTier: string; sizeBucket: string; amenityDensity: number; experienceTier: string; compositeLabel: string; }
  physicalCharacter: { roomCount: number; acreage: number | null; parkingSpaces: number | null; privacyLevel: string | null; eventLocations: number | null; maxEventCapacity: number | null; }
  amenityProfile: { hasFB: boolean; hasEvents: boolean; hasWellness: boolean; narrative: string; }
  revenueProfile: { startAdr: number; adrGrowthRate: number; startOccupancy: number; maxOccupancy: number; occupancyRampMonths: number; revShareFB: number; revShareEvents: number; revShareOther: number; cateringBoostPercent: number; revparStabilized: number; }
  costProfile: { rates: Record<string, number>; totalCostRate: number; highestCostDriver: string; }
  capitalStructure: { purchasePrice: number; acquisitionLTV: number | null; interestRate: number | null; amortizationYears: number | null; exitCapRate: number; landValuePercent: number; }
  icpAlignment: { matchPct: number; met: number; total: number; breakdown: IcpCriterionResult[]; }
  currentAssumptionsSummary: string;
}
```

Narrative example: "Mountain Lodge is a 4★ boutique resort located at 123 Main St, Asheville, NC 28801. Situated on 8 acres in a rural setting, it features full-service F&B, 2 event venues with capacity for 150 guests, and a wellness center with spa services. The property targets an ADR of $285 with 65% stabilized occupancy."

### CompanyContextPack Interface

```typescript
interface CompanyContextPack {
  companyProfile: { name: string; foundingYear: number | null; ein: string | null; address: string | null; }
  portfolioFootprint: { propertyCount: number; totalRooms: number; adrMin: number | null; adrMax: number | null; avgRooms: number | null; geographicSpread: { cities: number; states: number; countries: number; }; averageStarRating: number | null; }
  serviceMenu: { templates: Array<{ id: number; name: string; category: string; defaultRate: number; markup: number; active: boolean; }>; }
  feeStructure: { baseManagementFee: number; incentiveManagementFee: number; acquisitionCommission: number; dispositionCommission: number; }
  staffingOverhead: { staffSalary: number; tiering: any; partnerComp10y: number[]; fixedOverhead: any; variableOverhead: any; }
  icpPositioning: { narrative: string; mustCount: number; majorCount: number; niceCount: number; }
  financialScale: { estimatedAnnualFeeRevenue: number | null; geographicDiversificationIndex: number | null; averagePropertyLuxuryTier: string | null; }
}
```

### Auto-Prompt Assembly

Function: `assembleResearchPrompt(contextPack, tier, assumptionKeys?)`

- Tier 1 (full entity): comprehensive prompt covering ALL assumption categories using context pack to define exact comparable set
- Tier 2 (single field): focused prompt for ONE assumption key using full context for positioning
- Prompts are AUTO-GENERATED — admins never write prompts
- Admin can optionally add "supplementary instructions" (append-only, not required)
- Context pack defines comparable set: "4★ boutique resorts with 20-30 rooms in the Southeast with ADR $250-$400"
- Tier 0 ambient data injected as "VERIFIED GROUND TRUTH" section

## Progressive Relaxation Algorithm

### Relaxation Levels (L0-L5)

| Level | Criteria | What's Active |
|-------|----------|---------------|
| L0 | Full context | Star ± 0, exact type, city, size ± 20%, all must+major+nice amenities |
| L1 | Drop nice amenities | Star ± 0, exact type, city, size ± 20%, must+major only |
| L2 | Soften constraints | Star ± 1, type family (resort↔hotel), MSA, size ± 40%, ADR range expanded |
| L3 | Must-only + MSA | Star ± 1, any type, MSA, must amenities only |
| L4 | Must-only + region | Star ± 1, any type, state/region, must amenities only |
| L5 | Archetype floor | Star bucket, size bucket, country (NEVER cross archetype boundary) |

Stop rule: evidenceScore ≥ threshold AND compsCount ≥ minimum (configurable in Pipeline Policies)
Hard floor: NEVER compare 5★ resort to 2★ budget hotel. Star rating constraint ± 1 max at all levels.

### Relaxation Transparency UX

- Vertical stepper/timeline component in Guidance Side-Sheet Provenance tab
- Each level shows: criteria active, comps found, evidence score
- Retained constraints highlighted in green, relaxed in amber with strikethrough
- Hard floor indicator: red line at L5
- Rebecca explains relaxation conversationally

## 3-Tier Intelligence Architecture

### Tier 0: Ambient Intelligence

- Background scheduler refreshing macro benchmarks (FRED rates, CPI, treasury yields, REIT indices, hospitality KPIs)
- Cadence: daily for rates, weekly for sector, monthly for structural
- No LLM needed — deterministic API fetching
- Results stored in `benchmark_snapshots` table
- Stale-while-revalidate semantics

### Tier 1: Entity-Scoped Research

- Triggered by "Run Research" button on property or company
- Pipeline: build Entity Context Pack → retrieve Tier 0 ambient → retrieve Pinecone similar → run N+1 pipeline (Gemini + Sonnet → Opus) → extract guidance → store to `assumption_guidance`
- Uses star rating + property type as PRIMARY comparable filters
- Scenario-scoped: keyed to (scenario_id, entity_type, entity_id, assumption_key)

### Tier 2: Assumption Deep-Dive

- Triggered by badge click when guidance is stale/missing
- Fast single-model prompt (~5 seconds)
- Focused on ONE assumption key with full entity context
- Updates single `assumption_guidance` record

## Research Badge & Guidance Side-Sheet

### ResearchBadge Click Flow (NEW)

Old: click → auto-fill field with midpoint
New: click → micro-popover with 3 options:
1. "Ask Rebecca" → opens Rebecca panel with full field context
2. "Apply Value" → applies midpoint (quick action)
3. "View Details" → opens Guidance Side-Sheet

### Guidance Side-Sheet (480px right slide-over)

4 tabs (CurrentThemeTab):

1. **Recommendation**: range [low, mid, high], star/type classification, comparable set description, confidence level, AI reasoning
2. **Peer Comparisons**: 5-8 comparable properties with rates, scatter/bar visualization
3. **Provenance**: progressive relaxation trail (stepper), model used, run timestamp, source chain
4. **Impact**: mini what-if showing NOI/GOP delta if value changes

Actions (sticky footer): Apply P25 / Apply P50 / Apply P75 / Pin Manual Value / Dismiss / Refresh (Tier 2)

### ResearchContextFieldLabel (wrapper component)

Every researchable field renders:
- Field label (left-aligned)
- ResearchBadge (amber pill with range)
- ConfidenceBadge (small colored dot)
- Freshness indicator (green/yellow/red dot, 6px)
- Input control

States: No guidance (gray "No research yet"), Stale (yellow ring + "Stale"), Pinned (lock icon + "Pinned")

## Rebecca as Conversational Intelligence Layer

### Core Concept

Rebecca replaces complex tooltips for research explanations. She IS the explainer. "Super Conversations" are a trademark Norfolk AI feature.

### Rebecca Chat Panel (520px right slide-over)

- Header: Rebecca avatar, name, property/field context breadcrumb, close
- Context card (collapsed): current value, research range, star rating, comparable set, confidence
- Chat area: markdown + inline charts/tables + source citations
- Input: text input + suggested follow-up chips
- Action bar: "Send Email Summary", "Report to Norfolk AI", "Apply Recommendation"

### Auto First Message (when triggered from badge)

"I see you're looking at the [field] for [property]. The current research suggests a range of [low]-[high] based on [N] comparable [star]★ [type] properties in [market]. Your current value of [current] is [above/within/below] this range. Would you like me to explain the reasoning, show comparable properties, or discuss the impact on your projections?"

### Email + Feedback

- "Send Email Summary": preview modal → styled email with conversation summary + sources → send via Resend
- "Report to Norfolk AI": feedback form (category + notes) → auto-includes conversation context → logged in admin

### Rebecca RAG Knowledge

Rebecca accesses EVERYTHING:
- Pinecone: research-history, market-reports, knowledge-base, assumption-guidance (NEW namespace)
- SQL live: benchmark_snapshots, entity context packs (computed on demand), property financials
- Documents: methodology, checker manual, ICP definitions, GAAP rules
- Always cites sources: "[CBRE 2024 Cap Rate Survey]", "[STR Market Report Q3]"

### Rebecca Admin Section (6 sub-tabs)

1. Configuration: enable/disable, system prompt, model, personality
2. RAG Knowledge: connected sources, sync status, document counts, "Rebuild Index"
3. Email Templates: explanatory email template, feedback template, variables
4. Conversation Logs: searchable history, filter by user/property/topic
5. Feedback Reports: user feedback routed to Norfolk AI, status tracking
6. Analytics: usage metrics, popular topics, satisfaction scores

## Benchmark Comparison Visualization

### BenchmarkVariancePanel

Location: collapsible section above financial statement tables on PropertyDetail + CompanyResearch

Metrics:
- Income Statement: NOI Margin, GOP Margin, RevPAR, RevPAR Index
- Cash Flows: DSCR, FCF Yield, Equity Multiple, Cash-on-Cash Return
- Company: Fee Revenue per Room, Overhead Ratio, EBITDA Margin

Visualization: horizontal bar with P10-P90 gradient, P25/P50/P75 tick marks, property diamond marker
Color: green (>P50), amber (P25-P50), red (<P25)
AI commentary: "Your NOI margin of 42% ranks at the 78th percentile among 4★ boutique resorts in the Southeast."

## Navigation Redesign

### App Sidebar (User-Facing)

```
Home
  Dashboard
  Portfolio (Properties)
  Management Company

Intelligence
  Market Research
  Property Finder
  Map View

Settings
  My Profile
  Scenarios
  Google Drive

Footer: Tour, Help, Admin, Sign Out
Rebecca: header icon (global, with unread badge)
```

### Admin Sidebar

```
Business
  Users, Companies, Groups, Scenarios

Intelligence
  Research Center (Overview / By Entity / Run History / Sources)
  Coverage Analytics
  Pipeline Policies
  QA Sandbox
  Source Registry

AI
  Model Routing (Tier 0/1/2/Rebecca/Operations/Exports)
  Rebecca (6 sub-tabs)
  Cost Guardrails

Design
  Logos, Themes, Exports

System
  App Defaults
  API Dashboard (merged Integrations + Health, key rotation)
  Notifications, Navigation, Verification, Database
```

### Role-Based Navigation

| Item | Admin | Management | Checker | Investor |
|------|-------|------------|---------|----------|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Portfolio | ✓ | ✓ | ✓ | ✓ (read-only) |
| Company | ✓ | ✓ | — | — |
| Company Assumptions | ✓ | — | — | — |
| Analysis | ✓ | ✓ | ✓ | — |
| Intelligence items | ✓ | ✓ | — | — |
| Scenarios | ✓ | ✓ | — | — |
| Admin | ✓ | — | — | — |
| Rebecca | ✓ | ✓ | ✓ | ✓ (read-only explanations) |

## Unified API Dashboard (Admin → System)

Replaces IntegrationsTab + IntegrationHealthTab:
- 3-column card grid (xl:3, md:2, sm:1)
- Card: service name, source type badge (RapidAPI/Direct/Apify/Internal), status dot (green/yellow/red), description, host (mono), key slot, latency/uptime/error rate, circuit breaker badge, toggle switch, "Test Now", key rotation (write-only)
- NO add/delete from UI — services defined in code only
- Key rotation: write-only input, "Rotate" button, last rotation date, audit log

## Scenario-Scoped Guidance

- Guidance keyed to (scenario_id, entity_type, entity_id, assumption_key)
- Switching scenario → badges show freshness for THAT scenario
- No guidance for scenario → gray "No guidance" state
- "Run Research" runs for active scenario only
- Scenario selector banner on research pages: "Viewing research for: [Base Case] ▼"

## Complete Badge Coverage Map

### Property (40+ fields)

**Revenue (10):** startAdr, adrGrowthRate, startOccupancy, maxOccupancy, occupancyRampMonths, occupancyGrowthStep, revShareFB, revShareEvents, revShareOther, cateringBoostPercent

**Operating Costs (12):** costRateRooms, costRateFB, costRateAdmin, costRateMarketing, costRatePropertyOps, costRateUtilities, utilitiesVariableSplit, costRateTaxes, costRateInsurance, costRateIT, costRateFFE, costRateOther

**Capital (10):** exitCapRate, acquisitionLTV, acquisitionInterestRate, acquisitionTermYears, acquisitionClosingCostRate, refinanceLTV, refinanceInterestRate, refinanceTermYears, refinanceClosingCostRate, landValuePercent

**Management Fees (6+):** each fee category + incentiveManagementFeeRate

**Other (3):** taxRate, dispositionCommission, inflationRate

### Company (30+ fields)

**Fees (4):** baseManagementFee, incentiveManagementFee, acquisitionCommission, dispositionCommission

**Compensation (5+):** staffSalary, staffTier FTEs, partnerCompYear1-10

**Fixed Overhead (5):** fixedCostEscalationRate, office/professional/tech/insurance start costs

**Variable Costs (4):** travelCostPerClient, itLicensePerClient, marketingRate, miscOpsRate

**Tax/Exit (3):** companyTaxRate, costOfEquity, salesCommissionRate

**Service Markups:** per-service template rates

## Data Model (New Tables)

1. `assumption_guidance` — core guidance store, unique (scenario_id, entity_type, entity_id, assumption_key)
2. `research_runs` — audit log with status, duration, model, tokens, cost
3. `benchmark_snapshots` — Tier 0 ambient data with staleness
4. `relaxation_traces` — progressive relaxation audit per run
5. `guidance_decisions` — user accept/reject/pin/dismiss trail
6. `rebecca_conversations` — chat session logs
7. `rebecca_messages` — individual messages within conversations
8. `rebecca_emails` — email send log
9. `rebecca_feedback` — feedback to Norfolk AI
10. `coverage_snapshots` — daily coverage metrics for analytics
11. `source_registry` — unified source catalog
12. `integration_key_rotations` — key rotation audit

## Implementation Phases

### Phase 1: Data Foundation
- New database tables + migrations
- PropertyContextPack + CompanyContextPack builders
- Star rating + hospitalityType fields on properties
- Backfill existing properties (hospitalityType='hotel', starRating=null)
- Dual-read from old market_research + new assumption_guidance

### Phase 2: Research Pipeline
- Auto-prompt assembly engine (replaces manual prompts)
- Progressive relaxation engine (ComparableQueryBuilder L0-L5)
- GuidanceExtractor (structured per-assumption records)
- Scenario-scoped guidance storage
- Tier 0 ambient scheduler

### Phase 3: UX Integration
- Star rating + property type selector on PropertyEdit
- ResearchBadgePopover (3-option micro-popover)
- GuidanceSideSheet (4 tabs)
- ResearchContextFieldLabel wrapper
- BenchmarkVariancePanel on financial statements
- Entity Research Status Card
- Navigation sidebar redesign

### Phase 4: Rebecca Intelligence Layer
- Rebecca chat panel (520px, context-aware from badges)
- RAG knowledge connections (Pinecone + SQL live)
- Super Conversations with contextual follow-ups
- Email summary + Norfolk AI feedback flows
- Rebecca admin section (6 sub-tabs)

### Phase 5: Admin Console
- Coverage Analytics dashboard
- QA Sandbox (context pack preview, prompt preview, test runs, golden tests)
- Pipeline Policies (tier toggles, staleness, concurrency, cost guardrails)
- Unified API Dashboard (merged integrations + health + key rotation)
- Source Registry
- Model Routing (per-tier model assignment)
- Cost Guardrails (token budgets, usage tracking)

## Top 3 Highest-Impact Deliverables (if constrained)

1. **Entity Context Packs + Star Rating** — transforms prompt quality from 7 fields to 60+, with user-defined star rating for precise comparable matching
2. **ResearchBadge → Side-Sheet + Rebecca bridge** — replaces one-click auto-fill with informed decision-making and conversational explanations
3. **Coverage Analytics + Scenario-Scoped Guidance** — makes research actionable at portfolio scale with per-scenario freshness tracking

## Key Gaps Addressed

- Side-Sheet (480px) vs Rebecca Panel (520px): mutual exclusion via global panel manager + z-index orchestration
- Data consolidation: market_research.content = narrative, properties.researchValues = latest applied cache, assumption_guidance = canonical structured guidance
- Migration: dual-read fallback, feature flags per surface
- Error states: Rebecca offline, LLM failure, empty comp set — explicit UI with fallback messaging
- Performance: batch guidance fetch (one query per entity+scenario), client-side distribute
- Accessibility: star rating keyboard navigation (arrow keys + Enter/Space), screen reader labels
- Security: server-side context pack rebuild (ignore client payloads), write-only key rotation, RBAC on all admin endpoints
