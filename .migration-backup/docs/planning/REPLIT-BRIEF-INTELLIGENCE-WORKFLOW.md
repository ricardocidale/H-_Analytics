# Intelligence Workflow — UI Brief for Replit Agent

> **Priority: HIGHEST.** This is the core product workflow. Everything else serves this loop.

Pull from git first: `git pull origin main`

---

## The Workflow

```
User creates/edits property
  → fills base info (address, rooms, amenities, quality tier, business model)
  → presses "Regenerate Intelligence" button
  → backend runs N+1 multi-LLM research using entity context
  → range badges appear next to EVERY assumption field
  → user adjusts assumptions based on ranges
  → user changes something structural → presses Regenerate again
  → new ranges appear → user adjusts again
  → user saves → app recalculates → presents financial statements
```

**The gold badge next to ADR showing ($219–$357) IS the product.**

---

## Task 1: "Regenerate Intelligence" Button

**Where:** Property Edit page, prominent position (top of assumptions section or in the page header).

**What it does:**
1. Calls `POST /api/research/generate` with the current property's context
2. Shows a loading state ("Researching..." with progress indicator)
3. When complete, all `RangeIndicator` badges on the page update with new ranges
4. Also triggers `POST /api/research/web-search` for supplementary web data

**Design:**
- Large, visually distinct button — not buried in a menu
- Icon: `IconSearch` or `IconSparkles` (suggest intelligence/AI)
- Label: "Regenerate Intelligence" or "Research Assumptions"
- Disabled while research is in progress
- Shows timestamp of last research run: "Last researched: 2 hours ago"

**Existing code to use:**
- `POST /api/research/generate` already exists and returns SSE stream
- `RangeIndicator` component exists at `client/src/components/research/RangeIndicator.tsx`
- `ResearchContextFieldLabel` wraps labels with badges at `client/src/components/research/ResearchContextFieldLabel.tsx`
- Research badge system is wired across all assumption sections (Revenue, Management Fees, Operating Costs, Capital Structure)

---

## Task 2: Defaults from Ranges

**When ranges come back from research, update defaults to the midpoint.**

**Rules:**
- ONLY update fields the user has NOT manually edited
- If the user has touched a field (dirty flag), keep their value — show the range badge but don't overwrite
- Default = (range.low + range.high) / 2, rounded appropriately
- This is NOT automatic. Show a confirmation: "Research suggests ADR $219–$357. Update default to $288?" with Accept/Dismiss buttons per field, or a bulk "Apply All Suggestions" button

**Existing code:**
- `ResearchBadgePopover.tsx` already has an "Apply Value" option
- The guidance decision system tracks accept/reject/pin at `POST /api/guidance/decision`

---

## Task 3: Staleness Indicators

**Show when intelligence is stale and needs regeneration.**

**New endpoint:** `GET /api/research/staleness` — returns fresh/stale/missing counts and priority list.

**UI:**
- If any critical field (ADR, occupancy, cap rate) is stale (>30 days): show a yellow banner at the top of Property Edit: "Intelligence is outdated. Press Regenerate to update ranges."
- If NO research has ever been run: show a blue banner: "Press Regenerate Intelligence to get AI-recommended ranges for all assumptions."
- Badge color: green = fresh (<30 days), amber = stale (30-90 days), red = very stale (>90 days), gray = never researched

---

## Task 4: Confidence Display

**Show how confident the research is for each field.**

**New endpoint:** `GET /api/guidance/:entityType/:entityId/confidence` — returns overall confidence score (0-100) and per-factor breakdown.

**UI:**
- Small confidence indicator on each range badge (e.g., "High confidence" / "Medium" / "Low")
- Tooltip on hover showing factors: "Based on 6 comparable properties at L1 relaxation"
- Overall confidence summary in the property header: "Research Confidence: 78/100 (High)"

---

## Task 5: Admin Intelligence Section

**The Admin panel needs a dedicated "Intelligence" or "AI" section.**

**Existing infrastructure to wire:**
- `pipeline_policies` table — configures research tiers
- `source_registry` table — tracks data sources
- Model routing — admin sets which LLM model handles which research domain
- `PipelineConfigTab`, `ModelRoutingPanel`, `QASandbox` components already exist

**What the admin should be able to do:**
1. **Model Routing** — pick which LLM model handles each domain (company research, property research, market research, chatbot, etc.). Already has `ModelRoutingPanel` component.
2. **Pipeline Configuration** — set research tiers (Tier 0 ambient, Tier 1 entity-scoped, Tier 2 deep-dive). Already has `PipelinePoliciesForm`.
3. **Source Management** — view data source health, enable/disable sources. Already has `SourceRegistryOverlay`.
4. **QA Sandbox** — test research prompts before deploying. Already has `QASandbox`.
5. **Hospitality Benchmarks** — edit benchmark values. NEW endpoint: `GET/PUT /api/admin/hospitality-benchmarks`
6. **Coverage Analytics** — see which properties/fields have research coverage. Already has `CoverageAnalyticsDashboard`.

**Most of these components already exist** — they just need to be wired into the admin navigation.

---

## Task 6: Risk Intelligence Display

**Show risk insights alongside assumptions.**

**New endpoints:**
- `GET /api/risk/property/:id/brief` — property-level risk analysis
- `GET /api/risk/portfolio-brief` — portfolio-level
- `GET /api/risk/macro-context` — current FRED macro data

**UI ideas:**
- Property Edit: collapsible "Risk Insights" section showing top 3 risks and strengths
- Dashboard: portfolio risk grade (A-F) card
- Each assumption field: if the risk engine flags it (e.g., "ADR above luxury benchmark"), show a small warning icon next to the range badge

---

## Task 7: Regulatory Context

**Show relevant regulatory info when editing properties in non-US countries.**

**New endpoint:** `GET /api/regulatory/:countryCode` — returns licensing, zoning, building codes, foreign investment, labor data.

**UI:**
- Property Edit: when country is set, show a collapsible "Regulatory Notes" panel with key investor-relevant facts
- Example for Colombia: "Tourism License (RNT) required, 3-6 month timeline. 20-year tax exemption for new hotels. Foreign ownership allowed with no restrictions."

---

## Priority Order

1. **Task 1** — Regenerate Intelligence button (the core trigger)
2. **Task 3** — Staleness indicators (tells user WHEN to press the button)
3. **Task 2** — Defaults from ranges (makes the ranges actionable)
4. **Task 5** — Admin Intelligence section (admin controls the pipeline)
5. **Task 4** — Confidence display (builds trust in the ranges)
6. **Task 6** — Risk intelligence display (investor education)
7. **Task 7** — Regulatory context (nice-to-have for international)

---

## API Summary

All endpoints are built and pushed. Here's what's available:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/research/generate` | POST | Run N+1 research (SSE stream) |
| `/api/research/web-search` | POST | Quick web research lookup |
| `/api/research/staleness` | GET | Fresh/stale/missing report |
| `/api/research/status` | GET | Research freshness overview |
| `/api/guidance/:type/:id` | GET | All guidance with confidence scores |
| `/api/guidance/:type/:id/confidence` | GET | Confidence breakdown only |
| `/api/guidance/decision` | POST | Record accept/reject/pin |
| `/api/risk/portfolio-brief` | GET | Portfolio risk brief |
| `/api/risk/property/:id/brief` | GET | Property risk brief |
| `/api/risk/macro-context` | GET | FRED macro data summary |
| `/api/regulatory/:countryCode` | GET | Country regulatory profile |
| `/api/admin/hospitality-benchmarks` | GET/PUT | Benchmark CRUD |
| `/api/hospitality-benchmarks` | GET | Public benchmark read |
| `/api/portfolio/risk-score` | GET | Portfolio risk score |
| `/api/scenarios/:id/risk-score` | GET | Scenario risk score |
| `/api/scenarios/compare-batch` | POST | Batch scenario comparison |
| `/api/scenarios/:id/tags` | PATCH | Set scenario tags |
