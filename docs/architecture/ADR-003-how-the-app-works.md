# ADR-003: How H+ Analytics Works — The Complete System

**Status:** Proposed
**Date:** 2026-04-16
**Author:** Claude Code + Ricardo Cidale

---

## The Actors

### The User
A person with a pre-approved email, configured by admin. Logs in, reviews assumptions, adjusts what they know, endorses what they accept, generates investor-ready financials. Cannot change their email or name (admin controls those). Can change their company name and job title.

### The Admin
Configures the system. Seeds properties, creates users, assigns properties to users, manages AI engines, sets compulsory service fees. Sees everything. Can override almost anything — except The Analyst's data quality exclusions.

### The Analyst
The AI persona that represents the Norfolk AI Engine. Always on. Validates every assumption, provides ranges with conviction levels, vets its own research inputs, refuses to advise on bad data. The Analyst is not a button — it's a colleague who watches everything and speaks up when something is wrong.

### The Management Company (HMC)
The hospitality management company being modeled. ONE per app instance. Its name is admin-configured. It provides branding, operations, and management services to properties. It does NOT buy or own real estate. It earns management fees. Its size, services, and costs are derived from the properties it manages.

### The Properties
Independent real estate assets owned by their own investors. Property owners hire the HMC to manage and brand their properties. Each property is an SPV with its own financials. Properties exist in the database whether or not any user has them in their scenario.

### Rebecca
The AI companion who answers questions. She draws on The Analyst's intelligence, the knowledge base, and property context. She's outgoing, intellectual, geeky, witty. She's who the user talks to. The Analyst is who does the research.

---

## The Data Layers

### Layer 1: Seed Data (admin responsibility)
Properties, HMC basics, country defaults, hospitality benchmarks, service categories. This is the starting point. Every field is tagged as "seeded" until a user endorses it.

### Layer 2: User-Endorsed Data (user responsibility)
When a user saves any page, every field on that page becomes "endorsed." The user has seen it and accepted it — even if they didn't change the value. Endorsement means: "I've reviewed this and it's acceptable for my model."

### Layer 3: Analyst Intelligence (The Analyst's responsibility)
Ranges, conviction levels, data quality scores, flags. The Analyst writes to `assumption_guidance` with its assessment of every field. This layer sits alongside the user's data, not on top of it. The user sees The Analyst's opinion but makes their own choice.

### Layer 4: Computed Financials (the engine's responsibility)
Income statements, balance sheets, cash flows, IRR, equity multiples. Pure math from Layers 1-2. Never uses AI. Never guesses. The engine takes whatever assumptions exist (seeded, endorsed, or Analyst-suggested) and computes deterministic results.

---

## The Admin's World

### What the admin does before any user logs in:

1. **Seeds the HMC** — company name, location, country, operations start date, funding instrument
2. **Seeds properties** — from real pipeline data. Each property gets rooms, ADR, location, purchase price, cost rates. All values tagged as "seeded."
3. **Creates users** — email, name, role. Assigns properties to each user via `userDefaultProperties`.
4. **Configures AI engines** — which LLM for which function, API keys, research schedules
5. **Sets service categories** — which services are compulsory (all properties must accept), which are optional. Fee rates and markup structure.
6. **Runs initial seed** — `npx tsx server/seeds/index.ts --force`. The Analyst's watchdog validates all properties. Properties that pass become "research-ready." Properties that fail get flagged.

### What the admin sees that users don't:

- **All properties in the database** — not just the ones assigned to any user
- **Research fitness status per property** — which ones The Analyst trusts, which are excluded, and why
- **Analyst fitness toggle** — admin can manually exclude a property from research. But admin CANNOT force-include a property that The Analyst excluded for bad data. Only fixing the data re-enables it.
- **Source health dashboard** — which external APIs are working, which are degraded
- **LLM registry** — which models are available, which are recommended, which admin has pinned
- **Assumption change log** — full audit trail of who changed what, when, and why

### The admin's ongoing responsibilities:

- Review flagged properties and fix data issues
- Monitor source health and LLM availability
- Add new properties to the database as the pipeline grows
- Assign properties to users as needed
- Update compulsory service rates when the HMC's fee structure changes

---

## The User's World

### First login:

1. **User logs in** with pre-approved email. Dashboard loads. The app detects this is their first session.

2. **"Confirm your management company"** — banner takes them to Management Company > Setup tab. The HMC basics are pre-filled from seed. The user checks: name, country, city, start date. They hit Save. This tells the app: "These basics are correct. The Analyst can now use this context."

3. **"Review your properties"** — app takes them to Properties list. They see all properties assigned to them. Each shows a tag: "Seeded defaults — not yet endorsed." The user switches ON the properties they want in their scenario. They don't need to edit details yet — just confirm which ones are theirs.

4. **The Analyst runs its first pass** — automatic, deterministic, 2-5 seconds. Checks every field on every property and the HMC against country defaults and benchmarks. Writes `assumption_guidance` rows. Flags what's wrong. Pre-fills what it can derive.

5. **"The Analyst has reviewed your portfolio"** — the user sees results. Tab badges show: Setup ✓, Funding (3 to review), Revenue (2 to review), Compensation ✓, etc. Each "to review" count means The Analyst found fields outside expected ranges.

6. **User works through tabs at their own pace** — reviewing Analyst suggestions, adjusting what they know, accepting what they don't. Every Save endorses that tab's fields. The Analyst remembers what's endorsed vs still seeded.

7. **Optional: deep research** — user clicks "Refresh Intelligence" when they want The Analyst to run LLM-powered research. This is the expensive pass — web search, comparable sets, multi-model synthesis. Gives market-specific ranges with higher conviction. User decides when to do this.

8. **Dashboard shows results** — Portfolio IRR, equity multiples, income statements. Every number traces back to an assumption that is either seeded, endorsed, or Analyst-reviewed.

### Returning user:

1. **Dashboard loads** with current state.
2. If The Analyst found changes while they were away (staleness, new benchmark data, source health changes), a banner shows: "The Analyst has 3 updates since your last visit."
3. User reviews what changed. `assumption_change_log` provides full history.
4. If admin added a new property to the database and assigned it to this user, they see: "New property available — [name]. Add to your scenario?"
5. If The Analyst excluded a property from research due to bad data, the user sees: "[Property] was excluded — data issues found. Contact admin."

---

## The Analyst's World

### The Analyst operates in four modes:

**Mode 1: Watchdog (always on, zero cost)**
- Fires on every property update (PATCH)
- Checks changed fields against country defaults and benchmarks
- 50ms per check, pure DB lookup
- If a field is outside range: writes an alert, updates property status
- If all fields are within range: marks property as "validated"
- Runs staleness check every 6 hours
- Runs portfolio consistency check every 6 hours (cross-property anomalies)

**Mode 2: Seed Validator (on seed/import, zero cost)**
- Runs after every seed or bulk import
- Validates every field on every property
- Writes `assumption_guidance` rows with deterministic ranges
- Sets property `researchFitness` status
- Catches errors like 9% Colombia tax rate in milliseconds

**Mode 3: Research Engine (on demand, LLM cost)**
- User clicks "Refresh Intelligence"
- Multi-stage pipeline:
  - Stage 1: Smart Data Router checks pre-collected tables (Priority 0)
  - Stage 2: Pinecone vector search for comparable properties
  - Stage 3: FRED, Frankfurter, Walk Score API calls
  - Stage 4: RapidAPI market data
  - Stage 5: LLM web research (Perplexity/Tavily)
  - Stage 6: N+1 Multi-Model Synthesis (Gemini + Claude parallel, Opus synthesis)
- Writes rich `assumption_guidance` with source citations, data quality scores, conviction levels
- Updates `researchRuns` with cost, duration, models used

**Mode 4: Data Quality Guardian (background, periodic)**
- Evaluates every property in the database for research fitness
- Properties that pass: `researchFitness = "research_ready"`
- Properties with missing data: excluded with reason
- Properties with data outside ranges: excluded until fixed
- Admin CANNOT override The Analyst's exclusion — only fixing the data restores fitness
- Uses the full database (all properties, not just user's scenario) for HMC research

### The Analyst's conviction system:

| Level | Score | What it means | Source |
|-------|-------|--------------|--------|
| **High** | 75-100 | Multiple verified sources agree. Defensible to investors. | DB tables + API + web research converging |
| **Moderate** | 45-74 | Some data available but gaps exist. Reasonable estimate. | Single source or older data |
| **Developing** | 0-44 | Limited data. The Analyst recommends deeper research. | LLM estimation only |
| **Insufficient** | Below conviction floor | The Analyst refuses to advise. "Needs research." | No verified sources |

### The Analyst's research pool:

For HMC-level research (ICP, fee structure, staffing, overhead):
- Uses ALL properties in the database where `researchFitness = "research_ready"`
- NOT limited to the user's scenario selection
- A user with 2 properties ON still benefits from The Analyst knowing about 8 other vetted properties

For property-level research (ADR, occupancy, cost rates):
- Uses that specific property's data + comparable properties from Pinecone
- Comparable set filtered to research-ready properties only

---

## The Intelligence Pipeline

```
                    ┌─────────────────────────┐
                    │     ADMIN SEEDS DATA     │
                    │  properties, HMC, users  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   ANALYST: SEED VALIDATOR │
                    │  deterministic, 50ms/prop │
                    │  country defaults + bench  │
                    │  → researchFitness status  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   USER LOGS IN           │
                    │  confirms HMC basics     │
                    │  selects properties ON   │
                    │  → endorsement gate      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   ANALYST: FIRST PASS    │
                    │  deterministic, 2-5 sec   │
                    │  full database analysis    │
                    │  → guidance rows written   │
                    │  → tab badge counts       │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   USER REVIEWS TABS      │
                    │  adjusts what they know   │
                    │  endorses what they accept │
                    │  saves → fields endorsed   │
                    └────────────┬────────────┘
                                 │ (optional)
                    ┌────────────▼────────────┐
                    │  ANALYST: DEEP RESEARCH   │
                    │  LLM-powered, 60-120 sec  │
                    │  web + APIs + Pinecone     │
                    │  multi-model synthesis     │
                    │  → rich guidance + sources  │
                    │  → conviction scoring      │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   FINANCIAL ENGINE        │
                    │  pure deterministic math   │
                    │  no AI, no guessing        │
                    │  → statements, IRR, exits  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   INVESTOR OUTPUT         │
                    │  PDF, Excel, PowerPoint   │
                    │  every number has a        │
                    │  conviction badge + source  │
                    └─────────────────────────┘
```

---

## The Source Architecture

### Priority 0: Pre-Collected DB Tables (instant, free)
7 tables with 475+ data points. Refreshed by ambient scheduler.
- Market ADR index
- Seasonal calendars
- Event calendars
- Labor rates
- F&B benchmarks
- Airport distances
- Hospitality benchmarks

### Priority 1: Pinecone Vector Search (instant, free after indexing)
7 namespaces with indexed property data, research history, and knowledge base.
- Comparable property matching
- Research cache (previous Analyst runs)
- Knowledge base (brand principles, industry context)

### Priority 2: Government/Authoritative APIs (<1 sec, free/cheap)
- FRED: interest rates, CPI, unemployment, GDP
- Frankfurter: exchange rates
- Walk Score: walkability, transit scores

### Priority 3: Market Data APIs (1-5 sec, paid)
- RapidAPI: weather, realty, booking, Airbnb data
- CoStar: commercial real estate analytics

### Priority 4: LLM Web Research (10-60 sec, expensive)
- Perplexity Sonar: real-time web search with citations
- Tavily: structured web search
- Fallback between them based on source health

### Priority 5: Multi-Model Synthesis (30-120 sec, most expensive)
- Gemini + Claude run in parallel with the same prompt
- Claude Opus synthesizes both responses into a single conviction-scored output
- Only runs when user explicitly requests deep research

### The Smart Data Router
Every research request goes through the router. It checks Priority 0 first. If the answer is in the pre-collected tables, it returns immediately without calling any API or LLM. Each subsequent priority level is only reached if the previous one didn't have sufficient data.

---

## The LLM Self-Management Layer

### On startup + every 6 hours:
1. Probe all vendors (OpenAI, Anthropic, Gemini, xAI, DeepSeek, Meta)
2. Score each model per function (research-deep, research-fast, chat, exports, operations)
3. Auto-recommend best model for each function
4. If admin has pinned a specific model and it's unavailable: auto-switch to fallback + email admin
5. If a new model appears that outperforms current: badge in admin panel, don't auto-switch

### Per research run:
- Log model used, tokens consumed, latency, estimated cost
- Feed performance data back into the recommender (Phase 4 — future)

---

## The Export Gate

No investor-facing document can be generated if:
- Any property in the scenario has `validationStatus = "pending_validation"` — warn in the export metadata
- The HMC basics have not been endorsed (user never saved the Setup tab) — block entirely
- More than 20% of assumption fields are still at "seeded" (never endorsed) — warn prominently on the first page of the export

Every number in the export carries a conviction badge:
- High conviction: solid, defensible
- Moderate: reasonable estimate, sources cited
- Developing: limited data, flagged for the reader
- Seeded default: explicitly marked as "not yet validated"

---

## What Makes This Different

1. **The Analyst controls its own inputs.** It vets every property before using it for research. Bad data is excluded automatically. Admin can't force bad data back in.

2. **10 minutes from login to investor-ready model.** The user confirms basics, The Analyst fills in the rest, the user reviews and adjusts. No 200-field forms.

3. **Every number has provenance.** Seeded, endorsed, Analyst-reviewed — every field's history is tracked in the assumption change log. An investor can ask "where did this 8.5% exit cap come from?" and get a real answer.

4. **The intelligence improves over time.** More properties in the database → better ICP → better HMC sizing → better benchmarks. The Analyst gets smarter as the portfolio grows.

5. **The LLM layer is invisible.** The user never sees "GPT-4" or "Claude" or "Gemini." They see "The Analyst suggests $285-$340 ADR (High conviction, 3 sources)." The AI is a colleague, not a technology.
