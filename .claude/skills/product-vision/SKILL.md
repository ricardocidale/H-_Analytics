---
name: product-vision
description: Comprehensive product vision for HBG Portal. Covers product identity, core workflows, two-entity financial model, settings architecture, research engine, AI assistant, verification system, market intelligence, admin capabilities, and multi-tenancy. Use when planning features or understanding the app.
---

# HBG Product Vision

Where the HBG Portal product is, what it does, and the design principles that govern all work. Covers product identity, purpose, core workflows, two-entity financial model, settings architecture, research engine, AI assistant, verification system, market intelligence, notifications, admin capabilities, multi-tenancy, user roles, and the cross-skill reference map. Use this skill when planning new features, making architectural decisions, evaluating whether proposed work aligns with product direction, or when any agent needs to understand what the app is and why it exists.

**Related skills:** `business-model/` (domain model), `finance/` (calculation contracts), `proof-system/` (audit system), `design-system/` (visual identity), `integrations/` (services), `rebecca-chatbot/` (AI assistant), `architecture/` (server architecture), `settings/` (configuration tiers), `server-finance/` (server-authoritative engine), `market-intelligence/` (external data)

---

## What This App Is

**HBG Portal is a "Bloomberg Terminal for boutique hospitality."**

It is a comprehensive financial simulation and analysis platform that gives hospitality investment professionals a single tool to:

1. **Model portfolio performance** — run forward-looking pro-formas for a portfolio of hotel properties and the management company that serves them
2. **Analyze consolidated financials** — view standard authority-compliant financial statements (Income Statement, Cash Flow Statement, Balance Sheet, Investment Analysis) at the property level, portfolio level, and management company level
3. **Export institutional-quality reports** — produce PDF, Excel, CSV, PowerPoint, PNG, and DOCX exports suitable for investment committee presentations
4. **Research assumptions** — AI-powered research engines provide guided ranges and benchmarks for nearly every working variable so users can make well-informed assumption choices
5. **Save and compare scenarios** — capture snapshots of all assumptions as named scenarios; restore them instantly to reproduce identical results

The platform must feel like an indispensable institutional tool. Every screen, interaction, and data point should convey:
- **Precision** — numbers are exact, formulas are transparent
- **Authority** — the tool knows hospitality finance deeply
- **Professional elegance** — it belongs in an investment committee presentation
- **Trustworthiness** — verification and audit opinions build institutional confidence

---

## User Journey — Getting Started

This is the **intended onboarding workflow** for every new user. It governs how help content, Rebecca's guidance, the guided tour, and any onboarding prompts should be written. It also defines the logical sequence Rebecca should recommend when a user asks "what do I do first?" or "how do I get started?"

### What the User Finds on First Login

The app is pre-loaded with **seeded default properties and assumptions** — a realistic starting portfolio that represents a plausible boutique hospitality investment scenario. This is the **default scenario**. Users do not start from a blank slate; they start from a sensible baseline they can customize.

There are always **two major entities** visible immediately:
1. **The Hospitality Management Company** — the OpCo that manages all properties
2. **The Property Portfolio** — a set of seeded hotel properties

---

### Step-by-Step Onboarding Workflow

#### Step 1 — Review the Property Portfolio
Navigate to **Properties**. The user will see property cards for all seeded properties. For each property, the user should decide:
- **Keep it** — leave the active switch ON
- **Turn it off** — use the toggle switch on the property card to exclude it from calculations without deleting it
- **Delete it** — remove the property entirely
- **Add a new property** — create a property from scratch or import from Property Finder

The goal: arrive at the set of properties that match the user's investment thesis.

#### Step 2 — Review and Adjust Property Assumptions
For each active property, open the property detail and review all assumption pages:
- **Property Details** — name, type, location, room count, acquisition date, operations start date
- **Revenue Assumptions** — ADR, occupancy ramp (start → max), ancillary revenue rates (F&B, Events, Other)
- **Expense Assumptions** — departmental costs, undistributed operating expenses, fixed cost escalation
- **Acquisition & Financing** — purchase price, LTV, interest rate, loan term, renovation budget
- **Exit Assumptions** — hold period, cap rate at exit, commission rate

**On every assumption page**, there is an **AI Research button**. Clicking it runs the multi-LLM research engine for that page's fields and refreshes the **yellow badge suggestions** next to each input. Users should run research before finalizing any assumption group — the badges show market-validated ranges sourced from FRED, hospitality benchmarks, and LLM market knowledge.

Users can accept a badge suggestion (click to apply), modify it, or ignore it and keep their own value.

#### Step 3 — Review and Adjust Management Company Assumptions
Navigate to **Management Company**. The same review-and-adjust process applies:
- **Company Details** — company name, ops start date, SAFE funding tranches
- **Fee Structure** — base fee rate, incentive fee rate, or granular service fee categories
- **Overhead & Staffing** — staffing tiers, salaries, fixed costs, variable costs per property
- **Make-vs-Buy** — review which services ManCo delivers directly vs. passes through with a markup

Again, each page has an **AI Research button** for refreshing benchmarks.

#### Step 4 — Review the Financial Results
With assumptions set, the full financial model has already been computed. Navigate to:
- **Dashboard** — consolidated portfolio KPIs, statements, IRR and equity multiple at the portfolio level
- **Each Property** — income statement, cash flow, balance sheet, investment analysis for that SPV
- **Management Company** — ManCo's own income statement, cash flow, balance sheet

All financial statements are live — any assumption change triggers immediate recalculation across the entire model.

#### Step 5 — Save the Scenario
Once satisfied with the results, **save the scenario** under a unique name. This captures a complete snapshot of all property assumptions, ManCo assumptions, and the computed financial outputs.

> **Important:** The app will prompt the user to save if they attempt to log out with unsaved changes. Never lose work.

#### Step 6 — Iterate with Multiple Scenarios
The user can repeat the entire process as many times as desired:
- Change any assumptions → results update instantly
- Save under a different name → creates a new independent scenario
- Load any saved scenario → instantly restores all assumptions and recalculates
- Compare scenarios side-by-side

There is **no limit** on the number of scenarios a user can have.

---

### Help & Guidance — Always Available

The app provides an almost overwhelming set of help features. Users are never alone:

| Help Feature | What It Does |
|-------------|-------------|
| **Rebecca (AI Chatbot)** | Always available in the sidebar. Answers any question about the app, its methodology, specific calculations, what a number means, what to do next, GAAP rules, research sourcing. Injected with the user's full financial context. |
| **Yellow Research Badges** | Appear next to assumption fields after running AI research. Show suggested ranges with confidence levels. |
| **Infotips** | Contextual tooltips on every field explaining what it means, how it affects calculations, and relevant industry standards. |
| **Formula Accordions** | Expand any financial metric to see the exact formula and inputs that produced it. |
| **GAAP Badges** | Indicate which accounting standard governs each line item. |
| **Guided Tour** | 9-step interactive walkthrough of the entire portal. Available from the sidebar footer. |
| **Help Page** | Comprehensive reference manual at `/help` with tabbed sections: User Manual, Checker Manual, and the Guided Tour. |
| **Audit Opinion** | Run `Verify` to get a formal UNQUALIFIED/QUALIFIED/ADVERSE opinion on the financial model's integrity. |

### Rebecca's Role in Onboarding
Rebecca is the most powerful help resource. She knows:
- The complete HBG methodology and business model
- GAAP accounting standards (ASC 230, 360, 470, 606, 810)
- USALI (Uniform System of Accounts for the Lodging Industry)
- How every calculation in the app works
- Where every research number came from
- What each assumption field does and what a good value looks like for the user's market

Ask Rebecca anything at any point in the workflow.

---

### Additional Features (Beyond Core Workflow)

Once the core scenario workflow is mastered, users have access to a growing set of additional tools:

| Feature | Purpose |
|---------|---------|
| **Property Finder** | Search the live real estate market for acquisition targets matching the ICP. Save favorites. Import into the portfolio. |
| **Map View** | Interactive geographic map of the portfolio with property clustering, performance pop-ups, and market context. |
| **Investment Analysis** | Deep-dive IRR sensitivity analysis, DCF valuation, FCFE waterfall, equity multiple breakdowns. |
| **Document Intelligence** | Upload appraisals, financial statements, and leases — OCR pipeline extracts data automatically. |
| **Exports** | Any financial statement at any level can be exported: PDF, Excel, CSV, PowerPoint, PNG, DOCX. |
| **Notifications** | Configure metric-based alerts (e.g., "notify me if portfolio IRR drops below 15%"). |
| **Themes** | Customize the visual appearance of the entire portal (Admin only). |

New features are added continuously. Rebecca will always know about them.

---

### The Core Structure

HBG models two distinct but interlinked types of entity:

#### 1. Property SPVs (Special Purpose Vehicles)
Each hotel property is held in its own independent legal entity. Properties are the revenue-generating assets of the portfolio:
- Each property carries its own assumptions: room count, ADR, occupancy ramp, acquisition cost, debt terms, renovation budget, capex schedule
- Revenue is generated by guests: room revenue is the primary driver (ADR × Occupancy × Rooms × 30.5 days/month)
- Ancillary revenue streams include Food & Beverage, Events & Functions, and Other (spa, parking, gift shop)
- Expenses follow the USALI (Uniform System of Accounts for the Lodging Industry) waterfall, including management fees paid to the Hospitality Management Company
- Each property has its own debt, depreciation schedule, and income tax calculation
- Properties are activated by `acquisitionDate` and `operationsStartDate` — no revenue or expenses before operations begin

**Property Type Spectrum:** The portfolio is not limited to full-service boutique hotels. Properties span a spectrum from traditional boutique hotels to short-term rental (STR) models:

| Type | Examples | Key Characteristics |
|------|----------|-------------------|
| **Boutique Hotel** | Independent lifestyle hotels, design hotels | Full service: front desk, F&B, events, staff-intensive |
| **Boutique Resort** | Wellness retreats, destination resorts | High ADR, strong events/spa revenue, seasonal |
| **Bed & Breakfast** | Inn-style properties | Owner-operated, fewer rooms, high personalization |
| **Short-Term Rental (STR)** | Airbnb, VRBO-style properties | Platform-distributed, self-service, lower staffing |
| **Hybrid / Serviced Apartment** | Extended stay with hotel-like services | Mix of STR flexibility and hotel amenity depth |

**STR vs. Hotel model differences the engine must respect:**
- STR properties typically have **lower or zero F&B and Events revenue** — those ancillary percentage assumptions should be set near 0
- STR properties have **platform distribution fees** (Airbnb/VRBO fees, typically 3–5% of total revenue) that appear as an operating expense — modeled under Other Operating Expenses
- STR properties have **lower departmental labor costs** — no front desk, no restaurant staff; housekeeping is often contracted per-turn
- STR properties may have **higher cleaning fee revenue** offset by cleaning cost expenses
- STR properties rely on **dynamic pricing tools** (e.g., PriceLabs, Wheelhouse) rather than traditional RevPAR management — ADR volatility is higher and seasonal variation more pronounced
- STR properties in some markets face **regulatory and licensing costs** (short-term rental permits, STR taxes) that appear as fixed operating expenses
- The ManCo management model still applies to STR properties — ManCo earns fees for platform management, cleaning coordination, guest communications, and revenue optimization

#### 2. Hospitality Management Company (ManCo / OpCo)
A single management company provides branded services to all active properties. It **never owns property** — it is a pure services and brand business:
- Revenue comes exclusively from fees charged to properties (Base Fee + Incentive Fee, or granular Service Fee Categories)
- Overhead includes staffing (scales by portfolio size in tiers), office lease, professional services, technology, and travel
- Funded during pre-profitability by a SAFE instrument (two tranches, configurable dates and amounts) — see Funding section below for all funding types
- Has its own income statement, cash flow statement, and balance sheet

#### Intercompany Relationship
Management fees paid by each property = management fee revenue received by ManCo. In consolidation, these eliminate to zero (ASC 810). The system validates that **Fees Paid = Fees Received** at all times.

---

## Property Revenue Streams

Revenue is modeled using industry-standard hospitality metrics:

| Stream | Driver | Default |
|--------|--------|---------|
| **Room Revenue** | ADR × Occupancy × Rooms × 30.5 | Primary revenue source |
| **Food & Beverage** | % of Total Revenue | ~30% of total rev |
| **Events & Functions** | % of Total Revenue | ~18% of total rev |
| **Other / Ancillary** | % of Total Revenue | ~3% of total rev |

**ICP Variables** (Ideal Customer Profile) define the target profile for property acquisition: ADR range, occupancy range, RevPAR range, room count, property type (boutique hotel, resort, B&B), amenity priorities (must-have, major plus, nice-to-have, exclude), and financial targets (IRR, equity multiple, purchase price range).

---

## Management Company Revenue & Expenses

### How ManCo Earns Revenue
ManCo earns from two fee structures for each property it manages:

1. **Base Fee** — default 8.5% of Total Revenue — compensates for day-to-day property management
2. **Incentive Fee** — default 12% of GOP — rewards ManCo for strong property operational performance

Alternatively, the base fee is broken into **granular Service Fee Categories**:
| Category | Default Rate | Notes |
|----------|-------------|-------|
| Marketing | 2.0% of Rev | Brand, digital, channel |
| Technology & Reservations | 2.5% of Rev | PMS, booking engine, CRS |
| Accounting | 1.5% of Rev | Bookkeeping, reporting |
| Revenue Management | 1.0% of Rev | Dynamic pricing, demand forecasting |
| General Management | 1.5% of Rev | Executive oversight, HR |

### Pass-Through Services with Markup
Many ManCo services are **pass-through**: ManCo hires third-party vendors to deliver the service to properties, then applies a markup to generate surplus. The app defines which services ManCo performs directly vs. which are pass-through:

- **Direct** — ManCo delivers in-house (e.g., executive oversight, direct HR)
- **Pass-Through / Centralized** — ManCo hires a vendor and marks up the cost (e.g., a marketing agency, a cloud PMS provider)

The **Make-vs-Buy analysis** (calc/research/make-vs-buy.ts) computes whether in-house or outsourced delivery is more economical for each category, and what markup is required to generate surplus.

### Staffing Levels & Compensation
The app recommends staffing levels that scale with portfolio size and provides default/suggested compensation for FTEs:

| Tier | Max Properties | FTE | Default Annual Salary |
|------|---------------|-----|-----------------------|
| Tier 1 | ≤ 3 | 2.5 | $75,000 |
| Tier 2 | ≤ 6 | 4.5 | $75,000 |
| Tier 3 | 7+ | 7.0 | $75,000 |

Partner compensation follows a 10-year schedule: $540K (Y1–Y3) → $600K (Y4–Y5) → $700K (Y6–Y7) → $800K (Y8–Y9) → $900K (Y10).

---

## Financial Statements & Reports

For every entity (each property, portfolio rollup, management company), the app produces authority-compliant financial statements:

| Statement | Standard | Scope |
|-----------|----------|-------|
| **Income Statement** | GAAP / USALI | Revenues → GOP → AGOP → NOI → ANOI → Net Income |
| **Statement of Cash Flows** | ASC 230 | Operating / Investing / Financing activities |
| **Balance Sheet** | GAAP | Assets = Liabilities + Equity, must balance within $1 |
| **Investment Analysis** | Industry | IRR, Equity Multiple, FCFE, DCF valuation, Cap Rate |
| **Financial Analysis** | Industry | FCF waterfall, debt coverage, ROE, ROA |

Statements roll up from:
- **Property level** — each SPV has its own full set of statements
- **Portfolio level** — aggregate of all properties (IRR from consolidated cash flows, not averaged)
- **Management Company level** — ManCo has its own full set of statements
- **Consolidated level** — portfolio + ManCo with intercompany eliminations

### Exports at Any Level
All statements are exportable at any level in six formats: PDF, Excel (XLSX), CSV, PowerPoint (PPTX), PNG (ZIP), DOCX. Exports are full-scope — clicking Export on any page produces ALL financial statements for that entity.

---

## Scenarios

Each user can have **one or more scenarios**, each containing a complete snapshot of all assumptions:
- Same or different properties across scenarios
- Same or different ManCo assumptions
- Restoring a scenario replaces all assumptions and recalculates instantly — identical inputs always produce identical outputs

### Scenario Privacy — Two Distinct Layers

There are two separate layers to understand:

**Layer 1 — Saved Scenario Records (user-private)**
The scenario list (the saved snapshots) is **user-private by default**. A user sees only their own saved scenarios. Other users cannot browse, load, or modify another user's saved scenarios unless that scenario has been explicitly shared with them.

**Layer 2 — Active Workspace (shared)**
The **currently loaded/active portfolio** — the properties and assumptions currently in the app — is a shared workspace. All authenticated users see the same active state. When any user loads a scenario, it replaces this shared workspace and affects what every other logged-in user sees. This is an intentional design: the app models a single real investment portfolio that the whole team works on together. Loading a scenario is a deliberate, consequential action.

> **Rebecca should warn users** before they load a scenario: "Loading this scenario will replace the current portfolio for all users. Make sure to save the current state first if you want to preserve it."

### Scenario Sharing
A user can share their private scenario with specific other users in two ways:
1. **Via the Scenarios page** — select a scenario and share it with named users within the portal; recipients gain access to load or view that scenario
2. **Via email** — send a formatted scenario summary to any email address via the notifications system; the email includes key financial metrics and an invitation to open the scenario in the portal

### Admin Visibility
Admins can see and load all scenarios across all users for support and audit purposes.

---

## Multi-LLM AI Research Engine

The research engine is one of HBG's most powerful features. It provides **guided ranges and benchmark information** for nearly every working variable in property and ManCo assumption screens.

### How Research Works

When a user is on any assumption input screen, they can activate the AI research engine for any field (or all fields). Research results appear as **yellow badges** showing:
- Suggested range (e.g., "$180–$240 ADR for boutique hotels in this market")
- Confidence level
- Source context (what data sources and methods were used)

Research numbers are **informational only** — they never auto-apply. The user explicitly chooses to:
- **Accept** — apply the researched value
- **Modify** — use it as a starting point and adjust
- **Ignore** — keep current value

### Research Tiers
Research runs at multiple levels:
1. **Property research** — ADR, occupancy, RevPAR, capex, operating costs for the specific property type and location
2. **Company research** — ManCo overhead benchmarks, staffing norms, pass-through markup rates
3. **Global/market research** — macro rates, cap rates, interest rates (from FRED and hospitality industry databases)

### Multi-LLM Architecture
Research uses a combination of:
- **Primary LLM** (Gemini 2.5 Flash) — market knowledge, narrative interpretation
- **Anthropic Claude** — verification, cross-checking research outputs
- **Deterministic tools** — 10 calc tools in `calc/research/` handle all arithmetic (ADR projections, cap rate valuation, debt capacity, cost benchmarks, etc.) so LLMs never compute numbers
- **Online APIs** — FRED for interest rates, hospitality benchmarking APIs
- **RAG files** — uploaded reference documents for custom market data

### Research Refresh
Both users and admins can **refresh research** at any time, especially after changing assumptions that would influence the research results (e.g., changing the property location, room count, or target market).

### Admin-Configurable Research Behavior
Admins can configure per-event research behavior via Admin → Research tab:
- Enable/disable each research type
- Inject focus areas, regions, time horizon, custom instructions
- Restrict which of the 10 deterministic tools are active per event type
- Config stored in `global_assumptions.researchConfig` (JSONB)

---

## Rebecca — AI Chatbot

Rebecca is the sole AI assistant embedded in the portal. She can answer anything about:
- The app itself — features, workflows, how to do things, what to do next
- Financial calculations — how a specific number was calculated, what formula was applied
- Assumptions — where research numbers come from, what was assumed and why
- Navigation — where to find things, how to use specific screens
- Research sourcing — which LLMs, APIs, and datasets produced specific benchmarks

Rebecca uses **Super Conversations** — she is injected with the full financial context (current property assumptions, pro-forma output, global assumptions) so her answers are specific to the user's actual scenario, not generic.

**Key file:** `server/routes/ai.ts`, `server/ai/rebeccaPromptBuilder.ts`

---

## Property Photography & Visual Rendering

The app presents properties using **photorealistic renderings** — often based on actual photos of properties being scouted by users. This makes scenario modeling viscerally real: users see what they're investing in, not just numbers.

- Property photos can be uploaded from file, URL, or generated by AI (Gemini / DALL-E based on property description)
- Hero images are displayed prominently on property cards and throughout the portal
- Logo creation — the app can generate property and company logos via AI image generation

---

## Report & Document Generation

Beyond financial exports, the app can:
- **Write investment reports** — narrative summaries of portfolio performance, property performance, and research findings
- **Generate logos** — AI-generated logos for properties and the management company
- **Document Intelligence** — OCR pipeline (Google Document AI) to extract financial data from uploaded property documents (appraisals, financials, leases)

---

## Admin Capabilities

The Admin section (accessible only by `role=admin` users) provides full control over every configurable aspect of the portal:

| Admin Tab | What It Controls |
|-----------|-----------------|
| **User Management** | Create/edit/delete users, assign roles, assign to user groups |
| **User Groups** | Multi-tenant groups with custom branding and theme assignment |
| **Themes** | Color palettes, icons, design variants — full white-labeling support |
| **Logos** | Upload/generate logos for company and properties |
| **Model Defaults** | Default LLM model routing (Gemini, Claude, OpenAI) for each AI task |
| **AI Agents** | Configure Rebecca (chatbot), voice settings, knowledge base management |
| **Research Config** | Per-event research behavior, active tools, focus areas, custom instructions |
| **ICP Management** | Define ideal customer profiles for property search and research targeting |
| **Asset Definitions** | Property type labels, amenity options, service categories |
| **Database Tools** | Production seeding, data integrity checks |
| **Integration Status** | API key health, service connectivity |
| **Logs** | Application logs, error tracking |

### Theme System
Each user group can have fully custom branding:
- Color palette (primary, secondary, accent, neutrals)
- Logo (displayed in sidebar and exports)
- Asset descriptions (used as AI research context)

**Theme resolution cascade:** `User's selected theme → Group's assigned theme → System default`

---

## User Roles

| Role | Access | Key Capabilities |
|------|--------|-----------------|
| **Admin** | Everything + admin panel | Full CRUD, user management, system configuration |
| **Partner** | Full investment toolkit | Edit assumptions, create scenarios, run research |
| **Checker** | Read-only + verification | Run verification, view audit opinions, export reports |
| **Investor** | Dashboard + filtered properties | View-only dashboard, properties filtered by user group |

---

## Help, Onboarding & Education

The portal has layered help built into every screen:
- **Infotips** — contextual tooltips on every assumption field explaining what it means and how it affects calculations
- **Formula accordions** — expand to see exactly how any number was derived
- **GAAP badges** — indicate which accounting standard applies to each line item
- **Guided tour** — step-by-step walkthrough of the portal for new users
- **Help page** — comprehensive reference manual organized by workflow
- **Rebecca** — answers any question in real time with full context

---

## Settings Architecture — Three-Tier Configuration

This is a critical methodology that governs how every configurable value flows through the app.

### The Three Tiers

| Tier | What It Is | Where It Lives | When It's Used |
|------|-----------|---------------|----------------|
| **Seed defaults** | Templates copied into new properties at creation | `globalAssumptions.*Default` fields | New property setup only — never affect existing properties |
| **Live assumptions** | Active financial variables read directly by the engines | `globalAssumptions.*` + `property.*` | Every calculation, every recalculation |
| **Config switches** | UI/behavioral toggles that control behavior without affecting financials | `globalAssumptions.*Enabled`, `uiConfig.*` | Feature flags, display settings, research config |

### Dual-Residence Principle
Many financial parameters live **simultaneously** as both seed defaults and live assumptions in `globalAssumptions`. For example, `defaultADR` is the seed template for new properties AND `adrGrowthRate` is the live rate used by the engine. Changing `defaultADR` only affects the next new property created — it does NOT change any existing property's ADR.

### Resolution Order (3-tier fallback)
```
Property-level value → Global assumption value → Hardcoded named constant (shared/constants.ts)
```
This chain must be respected everywhere. No step may be skipped. No raw literals — always the named constant as the final fallback.

### Model Defaults Page
The Admin → Model Defaults tab exposes two sub-tabs:
- **Market & Macro** — inflation rates, cap rates, interest rate defaults, tax rates
- **Property Underwriting** — ADR ranges, occupancy ramp, capex ratios, debt terms, depreciation

Changes here update `globalAssumptions` and are used as seeds for all new properties.

---

## Ledger-Based Accounting Engine

The financial engine uses a **double-entry posting architecture** — not just calculation outputs, but a full general ledger:

### Chart of Accounts (13 GL Accounts)
Cash, Accounts Receivable, Fixed Assets, Accumulated Depreciation, Accounts Payable, Notes Payable, Common Equity, Retained Earnings, Revenue, Operating Expenses, Management Fees, Interest Expense, Income Tax Expense.

### How It Works
1. Monthly `StatementEvent` postings are generated from the pro-forma engine
2. Each event produces debit/credit journal entries
3. Trial balance is produced from accumulated postings
4. Financial statements are derived from the trial balance (not computed independently)
5. Balance sheet identity (A = L + E) is a mathematical consequence of double-entry, not a post-hoc check

### GAAP Compliance
- ASC 230 (Cash Flow Classification)
- ASC 360 (Fixed Assets / Depreciation — 27.5 years straight-line)
- ASC 470 (Debt — principal is financing, never income)
- ASC 606 (Revenue Recognition)
- ASC 810 (Consolidation / Intercompany Elimination)
- IRC §172 (NOL Carryforward — 80% cap)

---

## Server-Authoritative Finance & Scenario Persistence

### Re-Export Pattern
The server imports the client's pure financial functions (zero duplication, automatic parity). The calculation checker (`server/calculationChecker.ts`) independently re-runs the same logic server-side to verify client outputs — it must never import from the client engine directly.

### Scenario Computed Snapshots
When a scenario is saved, the server persists a **computed snapshot** in the `scenario_results` table — an immutable artifact of the full financial output at that point in time. This enables:
- **Drift detection** — compare current recomputation against stored baseline; outcomes: `match`, `input_changed`, `engine_changed`
- **Export reproducibility** — the `computeRef` parameter in `/api/exports/premium` guarantees server-side recomputation from the same inputs
- **Engine version tracking** — `ENGINE_VERSION` header on all calculation responses

---

## Market Intelligence Aggregator

Three external data services are aggregated into a unified market intelligence layer:

| Service | Data | Cache TTL |
|---------|------|-----------|
| **FRED** (Federal Reserve) | Treasury rates, CPI, macro indicators | 24 hours |
| **Hospitality Benchmarks** | ADR comps, RevPAR, occupancy norms by market | 7 days |
| **Grounded Research** (Perplexity/Tavily) | Real-time market narratives, comparable properties | Fresh per request |

### Circuit Breaker Pattern
Each service runs through a **circuit breaker** (Closed → Open → Half-Open) with exponential backoff retry. 5 failures within 60 seconds trips the breaker open. This ensures graceful degradation — if one service is unavailable, the others continue.

### Service Health
Admin → Integrations tab shows live health status for all external services. The `/api/admin/integrations/health` endpoint powers this.

---

## Funding — Properties and Management Company

Funding is modeled differently for properties vs. the management company, and supports multiple capital structures.

---

### Property Funding — Four Modes

Each property can be funded through one or more of these structures, individually configured per scenario:

| Mode | Description | When Used |
|------|-------------|-----------|
| **Full Equity (Cash)** | 100% equity purchase — no debt | All-cash acquisitions, debt-free scenarios |
| **Conventional Loan** | Acquisition loan with LTV, interest rate, and amortization term | Standard leveraged acquisition |
| **Refinance** | Replaces acquisition debt at stabilization — new loan based on NOI / cap rate × refi LTV | Value-add strategy: acquire → stabilize → refinance to pull equity |
| **Special Arrangements** | Bridge loans, seller financing, preferred equity, JV structures | Non-standard capital structures; modeled via configurable term overrides |

**Capital structure is always shown as separate line items.** Equity, loan proceeds, and refinancing proceeds are never combined on any report, statement, or export. This is a hard rule — mixing them produces misleading investment analysis.

**Debt-free at exit is mandatory.** The exit waterfall always deducts outstanding debt: `Gross Exit Value − Commission − Outstanding Debt = Net Proceeds to Equity`.

### Refinance Path
When a refinance is modeled:
1. Stabilized NOI is computed at the refinance date
2. New loan amount = `Stabilized NOI / Refi Cap Rate × Refi LTV`
3. Acquisition loan is paid off from refi proceeds
4. Excess proceeds flow to equity (cash-out refi)
5. New debt service schedule replaces old schedule from that month forward
6. Operating reserve is re-seeded at the refinance month

---

### Management Company Funding — SAFE Instrument

The management company (ManCo) is funded during its pre-profitability phase through a **SAFE (Simple Agreement for Future Equity)** instrument. This is the appropriate vehicle for an early-stage operating company that does not own physical assets.

**Why SAFE for ManCo:** ManCo has no hard assets to pledge as collateral, so conventional debt is not appropriate. SAFE lets early investors fund operations in exchange for future equity rights once the company matures.

#### SAFE Structure
- **Two configurable tranches** with independent dates, amounts, valuation cap, and discount rate
- Optional interest rate with configurable payment frequency (accrues only, quarterly, or annually)
- **Operational gate:** ManCo revenue and expenses do not accrue until BOTH `companyOpsStartDate` AND `safeTranche1Date` are reached — funding must land before operations begin

#### Dynamic Tranche Sizing
The funding strategy engine computes 1–3 tranches dynamically based on:
- Pre-profitability period length
- Target raise amount
- Portfolio growth schedule

#### Market-Rate Calibration
FRED 10Y Treasury rate is fetched at research time to:
- Contextualize SAFE discount rates relative to opportunity cost
- Auto-adjust suggested valuation caps
- Generate investor thesis narratives referencing current macro conditions

**Staged SAFE Terms:**
| Stage | Timing | Valuation Cap | Discount |
|-------|--------|--------------|---------|
| Early (T1) | Pre-launch | Lower cap | Higher discount |
| Standard (T2) | Launch | Mid cap | Standard discount |
| Late (T3) | Post-traction | Higher cap | Lower discount |

#### Cash Runway Projection
Month-by-month cumulative cash forecast showing:
- Breakeven month (first month with positive net income)
- Months of runway remaining at current burn rate
- With-funding vs. without-funding curves

---

## Automated Proof & Verification System

HBG has an institutional-grade automated verification system that runs as a complete quality gate:

### Scale
- **3,547 automated tests** across 153 files
- **5 structural golden scenarios** — cash purchase, financed acquisition, refinance, portfolio aggregate, consolidated with eliminations
- **761 hand-calculated golden tests** — each value derived by hand and encoded as a test expectation

### 8-Phase Verification Suite
| Phase | What It Checks |
|-------|---------------|
| 1. Proof scenarios | Full financial statement outputs match hand-calculated golden values |
| 2. Hardcoded detection | No raw financial literals in calculation paths |
| 3. Golden value tests | 761 individual expected values |
| 4. Reconciliation | Cash flow ties to balance sheet, debt roll-forward ties |
| 5. Data integrity | Shared ownership, singleton tables, userId=null |
| 6. Portfolio dynamics | Property count dynamic, fee zero-sum, management gate |
| 7. Recalc enforcement | Every financial mutation calls invalidateAllFinancialQueries |
| 8. Rule compliance | Domain boundaries, no direct db imports, calc purity |

### Audit Opinions
`npm run verify:summary` produces one of three formal opinions:
- **UNQUALIFIED** — all checks pass, financials are verified
- **QUALIFIED** — minor issues, financials likely correct but flagged concerns
- **ADVERSE** — critical failures, financials cannot be trusted

The **Financial Auditor** runs 103 individual checks (1,294-line checker) validating income statement, cash flow, balance sheet integrity, and intercompany eliminations.

### Key Commands
```bash
npm run test:summary       # All 3,547 tests
npm run verify:summary     # 8-phase proof suite → UNQUALIFIED/ADVERSE
npm run health             # Doc harmony + rule compliance + service health
npm run lint               # TypeScript + ESLint
npm run audit:deep         # Deep financial code audit (no magic numbers, no safeNum)
```

---

## Notifications & Alert Rules Engine

Users can configure **metric-based alert rules** that trigger when portfolio or property metrics cross thresholds:

- **Rule types** — Above threshold, Below threshold
- **Metrics** — Revenue, NOI, IRR, Occupancy, ADR, any tracked KPI
- **Cooldowns** — Prevent alert spam for sustained threshold violations
- **Channels** — Email (via Resend) + in-app notification log
- **Audit trail** — Full notification log with event type, channel, recipient, status, timestamp

### Report Sharing
- `/api/notifications/share-report` — share financial reports with metrics and optional attachment
- `/api/notifications/share-scenario` — email a formatted scenario analysis summary

### User Preferences
Each user can opt in/out of specific event types and channels. Admins configure system-wide notification keys.

---

## Property Finder — External Market Search

The Property Finder enables users to search the **external real estate market** for acquisition targets:

- **Live search** — RapidAPI "Realty in US" integration for real listing data
- **ICP matching** — search filters pre-populated from the ICP definition (room count, property type, price range, location)
- **Saved favorites** — bookmark properties from the search into a `prospective_properties` table
- **Saved searches** — store reusable filter sets in `saved_searches` table
- **Rate limiting** — 30 requests per minute per user
- **URL validation** — format-based regex validation for realtor.com listing URLs (not HEAD request)

This bridges the gap between analyzing an existing portfolio and scouting new acquisitions: users find a real property on the market, then model it in HBG to evaluate the investment.

---

## Research Refresh Overlay

When users log in or when market conditions change significantly, the app can surface a **3D animated ResearchRefreshOverlay** that:
- Alerts users that market research may be stale
- Allows one-click refresh of all research benchmarks
- Uses a premium animated 3D visual to make the process feel substantive rather than a background task

---

### 1. Deterministic Integrity
Every number must be traceable to a formula. The financial engine is the sole source of truth for calculations. AI agents assist with research and narration but **never compute financial values**.

### 2. Transparency
Users can always see how any number was derived:
- Formula accordions, GAAP badges, audit opinions, research sourcing

### 3. Professional Elegance
Every screen should look like it belongs in an investment committee presentation:
- Swiss Modernist design language, high data density without clutter, monospaced financial figures, earth-tone warmth

### 4. Hospitality-Native Vocabulary
Use the language of hotel operators and investors:
- "Properties" not "items", "ADR" not "average price", "GOP" not "gross margin"

### 5. Progressive Disclosure
Show summary first, let users drill into detail on demand:
- KPI cards → expandable sections → full financial tables

---

## Navigation & Information Architecture

### Main Navigation
| Group | Items | Description |
|-------|-------|-------------|
| **Home** | Dashboard, Properties, Management Company | Core portfolio views |
| **Tools** | Simulation, Property Finder, Map View | Analysis and acquisition tools |
| **Settings** | Profile, Scenarios, General Settings | User configuration |
| **Footer** | Tour, Help, Admin, Sign Out | Utility actions |

### Dashboard
The main Dashboard shows consolidated portfolio performance:
- Portfolio-level KPI cards (Total Revenue, GOP, NOI, IRR, Equity Multiple)
- Income Statement, Cash Flow, Balance Sheet, Investment Analysis at portfolio + ManCo level
- Charts with animated values, gradient fills, custom tooltips
- All export formats available from the tab bar

---

## Quality Bar

Every new page or feature must follow these established patterns:

| Requirement | Reference Skill |
|------------|----------------|
| Financial accuracy | `finance/` |
| Design system components | `design-system/` |
| Export patterns | `exports/` |
| Save button patterns | `ui-patterns` rule |
| Business vocabulary | `business-model/` |
| Verification compatibility | `proof-system/` |
| Research integration | `research/` |
| AI assistant | `rebecca-chatbot/` |

---

## Cross-Skill Reference Map

```
                    ┌─────────────────────┐
                    │  product-vision     │
                    │   (this skill)      │
                    └─────────┬───────────┘
                              │ governs all
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    ┌─────┴──────┐   ┌───────┴────────┐   ┌──────┴───────┐
    │  business- │   │  design-       │   │  architecture│
    │  model     │   │  system        │   │              │
    └─────┬──────┘   └───────┬────────┘   └──────┬───────┘
          │ defines          │ styles            │ serves
    ┌─────┴──────┐   ┌───────┴────────┐   ┌──────┴───────┐
    │  finance   │   │  ui/           │   │ integrations │
    │            │   │  card-widths   │   │              │
    └─────┬──────┘   │  save-buttons  │   └──────┬───────┘
          │          │  design-export │          │
          │ verified │  exports       │          │ powers
          │ by       └───────────────┘          │
    ┌─────┴──────┐                        ┌──────┴───────┐
    │  proof-    │                        │  rebecca-    │
    │  system    │                        │  chatbot     │
    └────────────┘                        └──────────────┘
```

| Skill | Connects To | Relationship |
|-------|------------|-------------|
| `business-model` | `finance` | Business rules → engine contracts |
| `business-model` | `design-system` | Vocabulary → UI labels |
| `finance` | `proof-system` | Engine output → verification input |
| `finance` | `architecture` | Dual-engine architecture |
| `proof-system` | `rebecca-chatbot` | Verification results → AI narration |
| `integrations` | `rebecca-chatbot` | AI providers → Rebecca |
| `integrations` | `architecture` | Services → route handlers |
| `design-system` | `exports` | Chart → export styling |
| `research` | `business-model` | Benchmarks inform assumption defaults |
| `product-vision` | All skills | Strategic alignment |
