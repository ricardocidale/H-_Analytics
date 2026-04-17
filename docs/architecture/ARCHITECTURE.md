# H+ Analytics — Product & System Architecture

**Version:** 3.0 — April 16, 2026
**Supersedes:** All previous ADRs and architecture documents

---

## 1. Three Entities, Never Confused

| Entity | What It Is | Who Controls It |
|--------|-----------|----------------|
| **Norfolk AI** | The company that builds H+ Analytics. Never modeled in the app. | — |
| **The HMC** | The hospitality management company being modeled. Name is admin-configured. Provides branding and management services to properties. Does NOT buy real estate. | Admin configures defaults. Users work with assumptions. |
| **Property SPVs** | Independent real estate assets. Owned by their own investors. Property owners hire the HMC. Each is a separate financial entity. | Admin seeds. Users assign to scenarios via switches. |

### 1a. Entity-Type Financial Rules (CANONICAL)

| Concern | Property SPV | The HMC (Management Company) |
|---|---|---|
| Asset class | Real estate | Operating service business |
| Depreciation | Yes (IRS basis) | None (no real estate) |
| Debt | Yes (loan, refi) | None (SAFE-funded) |
| NOI concept | Yes | **No — NOI is a real estate metric** |
| Exit valuation method | **Cap rate** (NOI ÷ exitCapRate) at terminal year | **DCF on FCF** (discount at `costOfEquity`) or EBITDA multiple — **never cap rate** |
| Sales commission on exit | Yes (`dispositionCommission`) | N/A |

**The fields `exitCapRate`, `salesCommissionRate`, `dispositionCommission` are PROPERTY DEFAULTS.** They live in the `global` bag only as a cascade source for new properties (`property.exitCapRate ?? global?.exitCapRate ?? DEFAULT_EXIT_CAP_RATE`). They are NOT Management Company exit fields. UI tabs that group them under a "Company Exit" heading are incorrect; they belong with property defaults.

**Legitimate company-level financial fields:** `costOfEquity` (WACC Re input + DCF discount rate) and `companyTaxRate`.

See `.claude/skills/finance/management-company-statements.md` for the engine-side enforcement contract.

---

## 2. Defaults vs Assumptions  *(MASTER RULE — every task must respect this)*

| | Defaults (a.k.a. Seeds) | Assumptions (a.k.a. Working Variables) |
|---|---|---|
| **Where** | Admin section only | Front of the app (every user-facing page) |
| **Who edits** | Admin only | Any management user |
| **Purpose** | Template values that **seed** new entities | Working numbers the user adjusts, endorses, and runs scenarios on |
| **Examples** | Default tax rate for Colombia, default FF&E reserve %, default service categories | This property's ADR, this company's staff salary, this scenario's exit cap rate |
| **When they matter** | At seed time only — when a new tenant/property/company is created they fill the fields | Every day — users work with assumptions to build their financial model |
| **The Analyst's role** | Validates defaults are reasonable at seed time | Validates assumptions after every save, provides ranges, flags issues |

### Seed → Assumption transition (do not forget this)
A default is **only a seed**. The instant the user clicks **Save** on any user-facing page, **every field on that page becomes a working variable — i.e. an assumption** — whether the user edited it or left the seed untouched. After Save, that page no longer holds defaults; it holds the user's assumptions. The Analyst then validates against those assumptions, not against the seeds.

### Answering "where is X stored / set / configured?"
When the user asks where a value lives, **lead with the assumption** (the user-facing page where the working variable is set and saved). Mention the Admin seed location only as a secondary note, and never imply the seed page is where the user "works with" or "stores" the value. The seed is a one-time initializer; the assumption is the live, authoritative number.

### Vocabulary discipline in code, copy, and chat
- The word **"assumption"** in any UI label, button, tooltip, error message, AI agent text, or doc **always means the user's working variable** — never a default.
- The word **"default"** must not appear in user-facing copy outside the Admin section.
- When the agent (me) talks to the user about a value, use **"assumption"** unless the conversation is explicitly about Admin seed configuration.

Conflating these has caused real production losses (admin-only routing on user pages, reset buttons wiping user work, seed values treated as authoritative, agent answers that send the user to Admin when the value actually lives on a user page).

---

## 3. The User Workflow

### First Login
1. Dashboard loads. Properties are pre-assigned by admin. Seed data is pre-populated.
2. The Analyst has ALREADY run on seed data (Tier-0 deterministic validation at seed time). Ranges are visible. Flags are set.
3. User navigates to Management Company → Assumptions. Sees 6 tabs with pre-populated data and Analyst ranges.
4. User works through tabs, adjusting what they know.

### Per-Tab Save (the core interaction)
The Analyst and Save buttons live **inside the tab strip** (`CurrentThemeTab`'s `rightContent`), scoped to the active tab — NOT in the page header. This is enforced by `script/check-no-header-analyst-save.ts`. Putting them in the header would silently flush every dirty field across every tab on Save and break per-tab gating.

When the user saves a tab:

1. **Fields are committed** — only that tab's fields are written to the database
2. **The Analyst runs immediately** — validates saved fields against benchmarks (Tier-0, instant)
3. **Context propagation** — if saved data changes context for other tabs (e.g., company country changes → labor rates, tax defaults, depreciation all shift), The Analyst flags affected fields across the app
4. **Post-save validation** — if any saved value falls outside The Analyst's range:
   - On-screen message: "The Analyst notes that [field] at [value] is outside the expected range of [low]–[high]."
   - Two options: "Adjust" (scrolls to the field) or "Keep my value" (acknowledged and logged to assumption_change_log)
   - This is not a blocking error — the user can always keep their value. The Analyst advises, never overwrites.
5. **Intelligence improves** — each save gives The Analyst more context. Saving the company address enables market-specific research. Saving the room count enables per-room benchmarking. The model gets smarter with every tab.

### Override Memory — `assumption_acknowledgments`
When the user clicks "Keep my value" on a flagged warning, a row is written to `assumption_acknowledgments` (entityType + entityId + fieldName, with a snapshot of the value and the recommended range at ack-time). The warning generator suppresses re-flagging while the live value remains inside the snapshot window. Editing the field clears the ack so the next save re-evaluates with fresh context. Acked-but-still-out-of-range fields surface a small grey "Range" pill next to the input as a passive reminder; flagged fields get an amber "Expected" pill. Tab pills carry an amber dot whenever that tab has unresolved warnings.

### Banner State Machine
The `IntelligenceStatusBar` on Company Assumptions runs through five states: `idle → saving → reviewing → (clean | flagged)`. `saving` reflects the per-tab mutation; `reviewing` covers the non-awaited Analyst kickoff fired after every successful save; `flagged` shows the count of warnings across all tabs. Falls back to freshness-based display (`current / stale / very_stale / missing`) when no banner state is active. See `client/src/components/intelligence/IntelligenceStatusBar.tsx`.

### The Analyst Button (always available, every tab)
- Pulsating AI icon on every tab that has variables/assumptions
- Pressing it triggers Tier-1 deep research (LLM-powered) for that tab's domain
- Animated visual entertains the user while research runs (60-120 seconds)
- The user is encouraged to press it — it's not a last resort, it's the core feature
- After research completes, ranges update, conviction levels sharpen, new insights appear
- The user can press it as many times as they want — each run refines the intelligence

### What The Analyst Does on Each Tab

| Tab | After Save (Tier-0) | After Button Press (Tier-1) |
|-----|---------------------|----------------------------|
| **Company** | Validates country → updates tax, depreciation, CRP defaults. Checks company name, address against known markets. Validates company tax rate against country defaults. | Researches the specific market: local labor costs, commercial rents, regulatory environment, corporate tax structure. |
| **Funding** | Validates SAFE terms against typical venture terms. Validates cost of equity against risk profile. | Researches comparable management company funding rounds, valuations, investor expectations, cost of equity for hospitality. |
| **Revenue Model** | Validates service rates against ISHC/PKF benchmarks. Checks total management fee against industry range. | Researches comparable management fee structures, cost-plus vs flat-fee models, incentive fee benchmarks. |
| **Compensation** | Validates salary against BLS/market data. Checks staffing tiers against portfolio size. | Researches hospitality executive compensation by market, staffing ratios for boutique management companies. |
| **Overhead** | Validates office lease, insurance, professional services against market. | Researches commercial lease rates in the HMC's city, hospitality-specific insurance costs, tech infrastructure benchmarks. |
| **Property Defaults** | Validates expense ratios against USALI benchmarks. Validates default exit cap rate and sales commission against market data (cascade defaults for new properties). | Researches property-level operating ratios by quality tier and market, current cap rate trends. |

> **NOTE:** There is no "Tax & Exit" tab. Tax lives in **Company**; cost of equity in **Funding**; property exit defaults in **Property Defaults**. The Management Company has no cap-rate exit — see §1a.

### Returning User
- Dashboard shows what changed since last visit
- Properties with stale intelligence show amber badges
- The Analyst runs staleness checks every 6 hours in the background — user never pays for this
- If The Analyst found new benchmark data or source health changes, relevant fields are flagged

---

## 4. The Analyst

### Identity
The Analyst is the AI persona of the Norfolk AI Engine. It's a colleague, not a tool. It studies, reviews, flags, suggests — never processes, computes, or executes.

### Four Modes

**Tier-0: Watchdog** — always on, every write, zero cost, 50ms
- Fires on every tab save, every property edit, every seed
- Checks against country_defaults, hospitality_benchmarks, pre-collected data tables
- Writes `validationStatus` and `assumption_guidance` rows
- Catches errors like 9% Colombia tax rate instantly
- Code: `server/ai/analyst-watchdog.ts`

**Tier-1: Research Engine** — on demand, user presses button, $0.05-0.10 per run
- Multi-stage: pre-collected tables → Pinecone → APIs → LLM web research → multi-model synthesis
- Writes rich guidance with source citations, data quality scores, conviction levels
- Code: `server/routes/research.ts`

**Staleness Monitor** — background, every 6 hours
- Marks properties/company data as stale when older than 30 days
- Runs portfolio consistency checks (cross-property anomalies)
- Never triggers Tier-1 automatically — just flags for the user

**Data Quality Guardian** — background, on seed/import
- Evaluates every property for research fitness
- `excluded_data`: missing critical fields or >50% flags → The Analyst won't use this property for HMC research
- Admin cannot override — only fixing the data restores fitness
- Uses ALL research-ready properties in the database for HMC context (not just the user's scenario)

### Conviction Levels

| Level | Score | Meaning |
|-------|-------|---------|
| High | 75-100 | Multiple verified sources agree. Defensible to investors. |
| Moderate | 45-74 | Some data, reasonable estimate. |
| Developing | 0-44 | Limited data. Deeper research recommended. |
| Insufficient | Below floor | The Analyst refuses to advise. "Needs research." |

### The Conviction Floor
When `qualityScore < 40` or no verified sources exist, The Analyst shows "Insufficient data — press the Analyst button for deeper research" instead of a bad range. The Analyst never guesses.

---

## 5. Property System

- Properties exist in the database whether or not any user has them in their scenario
- Admin assigns properties to users via `userDefaultProperties`
- Users toggle properties ON/OFF for their scenario
- Switch ON = property is included in financial calculations and visible in the user's portfolio
- Switch OFF = hidden from calculations, not deleted
- Properties are NEVER deleted. `archivedAt` for soft delete by admin.

### Research Fitness
Every property has a `validationStatus`:
- `pending_validation` — seeded, Analyst hasn't reviewed
- `validated` — all fields within range, research-ready
- `flagged` — some fields outside range, usable but needs attention
- `stale` — validated but older than 30 days
- `excluded_data` — Analyst excluded, data too unreliable for research
- `excluded_admin` — admin manually excluded

The Analyst uses ALL research-ready properties (not just the user's scenario) for HMC-level research. More properties = better ICP = better HMC sizing.

---

## 6. Scenario System

- Every user gets a default scenario on first login
- Scenarios snapshot: global assumptions + properties + fees + photos
- Users can create, clone, compare, share scenarios
- Admin controls default scenarios and sharing permissions
- Auto-save after 1hr idle creates visible versioned copy

---

## 7. Export Gate

| Status | Export Behavior |
|--------|----------------|
| `excluded_data` properties | HARD BLOCK |
| Company name not set | HARD BLOCK |
| `flagged` properties | SOFT BLOCK — admin can override |
| `stale` data | WATERMARK on every page |
| `validated` | Clean export |

---

## 8. Source Architecture

| Priority | Source | Speed | Cost |
|----------|--------|-------|------|
| 0 | Pre-collected DB tables (7 tables, 475+ rows) | Instant | Free |
| 1 | Pinecone vector search (7 namespaces) | Instant | Free |
| 2 | FRED, Frankfurter, Walk Score | <1 sec | Free |
| 3 | RapidAPI market data | 1-5 sec | Paid |
| 4 | LLM web research (Perplexity/Tavily) | 10-60 sec | Expensive |
| 5 | Multi-model synthesis (Gemini + Claude → Opus) | 30-120 sec | Most expensive |

---

## 9. LLM Self-Management

- Probes all vendors on startup + every 6 hours
- Scores models per function, auto-recommends
- Admin can pin models. Engine failovers + emails admin on issues.
- The user never sees model names — only "The Analyst suggests..."

---

## 10. Key Rules

1. **Norfolk AI builds the app. The HMC is what's modeled. They are separate.**
2. **Defaults are admin. Assumptions are users. Never confuse them.**
3. **Save is per tab.** Each save commits that tab's fields and triggers The Analyst.
4. **The Analyst runs after every save.** Tier-0 instant. Tier-1 on button press.
5. **The Analyst advises, never overwrites.** User always has final say.
6. **The Analyst controls its own inputs.** Excludes bad data from research pool.
7. **The Analyst refuses to guess.** Below conviction floor = "needs research."
8. **No LLM for math.** Financial engine is pure deterministic code.
9. **Every change logged.** `assumption_change_log` tracks everything.
10. **Properties are permanent.** Never deleted, only archived or switched off.
11. **The HMC does not buy properties.** Property owners hire the HMC.
