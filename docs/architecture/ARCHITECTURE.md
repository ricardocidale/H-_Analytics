# H+ Analytics — Product & System Architecture

**Version:** 2.0 — April 16, 2026
**Supersedes:** ADR-001, ADR-002, ADR-003, ADR-004 (consolidated here)

---

## 1. What This App Is

H+ Analytics by Norfolk AI is a financial simulation platform for boutique hospitality management companies. It models a management company (the HMC) alongside independent property SPVs, producing GAAP-compliant financial projections with The Analyst — an always-on AI research engine that validates every assumption.

**Norfolk AI** builds the app. The HMC is the company being modeled. They are separate entities.

---

## 2. The Actors

| Actor | Role | Controls |
|-------|------|----------|
| **Admin** | Configures system. Seeds properties, creates users, manages AI engines. | Everything except The Analyst's data quality exclusions |
| **User** | Reviews assumptions, adjusts what they know, endorses what they accept. | Their scenario, their property switches, their saves |
| **The Analyst** | Always-on AI that validates every assumption, provides ranges, vets its own research inputs. | Data quality exclusions — admin cannot override |
| **Rebecca** | AI companion who answers questions, drawing on The Analyst's intelligence. | Nothing — she advises, never changes data |
| **The HMC** | The hospitality management company being modeled. Name is admin-configured. | N/A — it's the subject, not an actor |
| **Properties** | Independent SPVs owned by their own investors. Property owners hire the HMC. | N/A — they're data, not actors |

---

## 3. The Business Model

The HMC is a management company and brand. It does NOT buy properties.

- Property owners independently acquire large estates
- They hire the HMC for branding, operations, and management services
- The HMC charges management fees (the service categories: Marketing, IT, Accounting, etc.)
- The HMC raises capital (via SAFE or similar) to fund its own operations — NOT to buy real estate
- Properties with switch ON = agreed to use the HMC for services
- The ICP defines what properties the HMC prospects for as management clients

---

## 4. Data Layers

| Layer | What | Who Sets It | Tracked By |
|-------|------|------------|-----------|
| **Seed** | Initial values from seed data or import | Admin/system | `assumption_change_log.changeSource = "seed"` |
| **Endorsed** | User has saved the page containing this field | User (via Save) | `user_page_visits.endorsed = true` |
| **Analyst-reviewed** | The Analyst has validated against benchmarks/research | The Analyst | `assumption_guidance` rows + `validationStatus` |
| **Computed** | Financial engine output (statements, IRR, exits) | Engine (deterministic) | Never stored as assumptions |

---

## 5. The User Workflow

### First Login
1. Dashboard → banner: "Confirm your management company information"
2. User goes to Management Company > Setup tab
3. Checks name, country, city, start date → hits Save
4. Save = endorsement gate. The Analyst can now run.

### After Endorsement
5. The Analyst runs Tier-0 automatically (free, 2 seconds) — validates all properties
6. User sees: "Analyst reviewed your portfolio — N properties need attention"
7. Tabs show badge counts: Setup ✓, Funding (3 to review), Revenue (2 to review)
8. User works through tabs, adjusting and endorsing

### Deep Research (Optional)
9. User clicks "Refresh Intelligence" when ready
10. Tier-1 runs: LLM web research, comparable sets, multi-model synthesis
11. Richer ranges with source citations and conviction scores
12. User reviews and accepts/overrides

### Returning User
13. Dashboard shows: "The Analyst has N updates since your last visit"
14. Staleness badges on properties that need refresh
15. Change log shows what moved and why

---

## 6. The Analyst — Four Modes

### Mode 1: Watchdog (always on, zero cost)
- Fires on every property PATCH and HMC save
- Checks against country_defaults + hospitality_benchmarks
- 50ms per property, pure DB lookup
- Writes `validationStatus` and `assumption_guidance` rows
- Code: `server/ai/analyst-watchdog.ts`

### Mode 2: Seed Validator (on seed/import, zero cost)
- Runs after every seed or bulk import
- Validates every field on every property
- Sets research fitness: `validated`, `flagged`, or `excluded_data`
- Code: `analyst-watchdog.ts → validateAllProperties()`

### Mode 3: Research Engine (on demand, LLM cost)
- User clicks "Refresh Intelligence"
- Multi-stage: pre-collected tables → Pinecone → APIs → LLM web research → multi-model synthesis
- Writes rich `assumption_guidance` with citations, data quality, conviction
- Code: `server/routes/research.ts → /api/research/generate`

### Mode 4: Data Quality Guardian (background, periodic)
- Evaluates every property for research fitness
- Properties with missing critical data or >50% flags → `excluded_data`
- Admin cannot override — only fixing the data restores fitness
- Uses full database (all properties, not just user's scenario) for HMC research
- Code: `analyst-watchdog.ts → validatePropertyAssumptions()`

---

## 7. The Triggering Policy

| Trigger | Tier | Precondition | Timing | Outcome |
|---------|------|-------------|--------|---------|
| Seed / import | 0 | Property exists | Blocking | Set validationStatus |
| Property save | 0 | PATCH accepted | Fire-and-forget | Recompute status |
| Company save (basics) | 0 | GA save accepted | Fire-and-forget | Re-validate ALL properties |
| First eligible visit | 1 | Context checklist GREEN | User waits | Full research |
| Manual "Refresh Intelligence" | 1 | Context checklist GREEN | User waits | Streamed research |
| Stale (>30 days) | 1 | Context checklist GREEN | Background (scheduler) | User never pays |
| Export request | Gate | — | Blocking | Block or watermark |
| Dashboard open | — | — | NEVER | Read only |

### Context Checklist (Tier-1)
**Company:** companyName, companyCountry, opsStartDate, at least 1 research-ready property, Setup page endorsed.
**Property:** roomCount > 0, startAdr > 0, country set, purchasePrice > 0, type set, not excluded.

### Conviction Floor
The Analyst refuses to advise when `qualityScore < 40` or no verified sources. Shows "Insufficient data — needs research" instead of a bad range.

---

## 8. The Export Gate

| Status | Export Behavior |
|--------|----------------|
| `excluded_data` | HARD BLOCK |
| `pending_validation` | HARD BLOCK |
| `flagged` | SOFT BLOCK — admin can override |
| `stale` | WATERMARK — proceeds with warning |
| `validated` | Clean |
| HMC not endorsed | HARD BLOCK |

---

## 9. The Source Architecture

| Priority | Source | Speed | Cost |
|----------|--------|-------|------|
| 0 | Pre-collected DB tables (7 tables, 475+ rows) | Instant | Free |
| 1 | Pinecone vector search (7 namespaces) | Instant | Free |
| 2 | FRED, Frankfurter, Walk Score | <1 sec | Free/cheap |
| 3 | RapidAPI market data | 1-5 sec | Paid |
| 4 | LLM web research (Perplexity/Tavily) | 10-60 sec | Expensive |
| 5 | Multi-model synthesis (Gemini + Claude → Opus) | 30-120 sec | Most expensive |

Smart Data Router checks Priority 0 first. Each level only reached if previous didn't have sufficient data.

---

## 10. The LLM Self-Management Layer

- Probes all vendors on startup + every 6 hours
- Scores each model per function (research-deep, research-fast, chat, exports, operations)
- Auto-recommends best model. Admin can pin. Engine auto-failovers + emails admin.
- Code: `server/ai/llm-health-probe.ts`, `llm-recommender.ts`, `llm-registry-manager.ts`

---

## 11. Key Architectural Rules

1. **The HMC manages, does NOT buy** — properties are clients, not investments
2. **The Analyst validates everything** — no assumption reaches financials without review
3. **The Analyst controls its own inputs** — excludes bad data, admin can't override
4. **User endorses, never auto-overwritten** — Save = "I've reviewed this"
5. **Conviction floor** — refuses to advise on low-quality data
6. **No LLM for math** — financial engine is pure deterministic code
7. **No magic numbers** — all defaults DB-backed, admin-editable
8. **Every change logged** — `assumption_change_log` tracks who, what, old, new, why
9. **LLM layer invisible** — user sees "The Analyst suggests" not "GPT-4 says"
10. **10 minutes from login to model** — Analyst fills 80%, user reviews 20%
