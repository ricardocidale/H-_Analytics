---
domain: vocabulary
scope: global
audience: all-ai-coders
priority: high
---

# Canonical Vocabulary — H+ Analytics

This is the single source of truth for every user-facing term in the app.
Read this before writing ANY UI text, button label, tooltip, help content,
error message, toast, dialog title, or notification.

Replit, Claude, and any future AI coder must follow this file exactly.
If a term isn't listed here, check the checker-manual glossary for
financial terms, or ask before inventing new language.

---

## 0. Critical Distinction — Assumptions vs Defaults (READ FIRST)

**This confusion has cost us real time and real money. Get it right.**

| Term | What It Means | Who Touches It | Where It Lives |
|---|---|---|---|
| **Assumption** | A user-facing **working variable**. The number the user is currently modeling with. Editable on the front of the app. The Analyst validates it, flags it, and suggests ranges for it. | Every user (management role and above) | Company Assumptions page, Property assumption pages, scenario state |
| **Default** | An admin-only **seed value** loaded into the database to initialize a fresh tenant or reset a field. A starting point, not a working number. | Super admin only, in the Admin section | `defaults` tables, seed scripts, admin settings |

**Rules — non-negotiable:**

1. **"Assumption" never means "default value."** When the UI, copy, error messages, button labels, tooltips, or AI agent text says *assumption*, it refers to the **user's current working variable** — the thing they edit, save, and run scenarios on. Never a seed.
2. **"Default" never appears in user-facing copy** outside the Admin section. Users do not see, hear, or read the word *default* on Properties, Company Assumptions, Dashboard, Scenarios, Research, or anywhere else in the main app.
3. **Save a default ≠ Save an assumption.** Editing a default in Admin reseeds new tenants and provides reset values; it does **not** change any existing user's saved assumption. Editing an assumption in the front of the app writes to that user's tenant scope only.
4. **The Analyst validates assumptions, not defaults.** Watchdog, conviction floor, change log, post-save warnings — all operate on assumptions. Defaults are inert until copied into a fresh tenant.
5. **Any AI agent (Replit Agent, Claude Code, future agents) reading this file must treat the two as different DB columns, different routes, different audiences, and different business meanings.** Conflating them has caused: admin-only routing on user pages, reset buttons that wiped user work, "default" surfacing in user copy, and seed values being treated as authoritative.

**Quick test before you write code or copy:** *"Is this number something the user types and saves?"* → it's an **assumption**. *"Is this number set once by an admin to seed every new tenant?"* → it's a **default**. If both apply, you're describing the relationship between them — say so explicitly.

---

## 1. Core Entities

| Canonical Name | What It Is | Forbidden Alternatives |
|---|---|---|
| **Property** | A hotel or luxury rental in the portfolio. The core financial modeling unit. | Asset, Hotel (as a generic), Site, Location, Unit |
| **Management Company** | The hospitality brand that operates all properties. Shortened to **Management Co.** on mobile/tight spaces. | ManCo (internal only, never in UI), Company (too vague), Brand (different concept), OpCo |
| **Scenario** | A saved snapshot of all assumptions + computed results at a point in time. | Simulation, Model, Version, Snapshot (internal only) |
| **Rebecca** | The AI financial advisor chatbot. Always by name. | Marcela (dead, never use), AI Assistant, Chatbot, Bot, AI Agent |
| **Portfolio** | The collection of all properties assigned to a user. | Properties (when referring to the group as a whole) |
| **Investor** | A read-only user role. They view the portfolio but don't edit. | Viewer, Observer, Read-only user |
| **Funding Vehicle** | The instrument used to raise capital. Label comes from `global.fundingSourceLabel`. | SAFE (never hardcode), Note, Convertible |

---

## 2. Intelligence Vocabulary — The Analyst & Rebecca

Two AI Agents run the app experience. See `product-vision/the-analyst.md` for the full identity.

| Canonical Term | Replaces | Where Used | Why |
|---|---|---|---|
| **"Analyst"** (button label) | "Regenerate Intelligence", "Ask the Analyst", "Ask the Analysts" | Main research button on property edit, company assumptions, per-tab actions | Short, sharp label paired with a Sparkles icon (`IconSparkles`). The Analyst is singular — one authoritative figure, not a team. Per-tab variant: `"Analyst — {Tab Label}"`. |
| **"Consult"** | "Generate Research" / "Run Research" | Research hub, company research tabs, ICP | A verb you'd use with a colleague. |
| **"Analyst Note"** | "Research badge" / "AI suggestion" / "range tooltip" | Yellow badge next to assumption fields | The Analyst left you a note. |
| **"Conviction"** | "Confidence Score" | Research results, guidance display | Investor language. Three tiers: **High** / **Moderate** / **Developing**. Never show raw percentages. |
| **"Last reviewed"** | "Staleness: stale/fresh/missing" | Guidance timestamps | "The Analyst last reviewed 3 days ago" or "Not yet reviewed." |
| **"The Analyst's view"** | "Source agreement" / "Cross-validation score" | When sources agree on a range | "The Analyst's view on this ADR is backed by multiple sources." |

### How to describe what the AI does (help text, tooltips, onboarding):

**Good:** "The Analyst reviewed comparable properties and market data to suggest this range."
**Good:** "Rebecca can walk you through what The Analyst found."
**Good:** "Ask the Analyst for a fresh review of any assumption."

**Bad:** "The AI model generated a prediction based on training data."
**Bad:** "Machine learning algorithms computed this range."
**Bad:** "Click to run the research engine."

The AI is a team of sharp analysts who happen to work very fast. Never reference models, algorithms, engines, or pipelines in user-facing text.

---

## 3. Action Verbs (Buttons & Menu Items)

| Action | Canonical Label | Context | Forbidden |
|---|---|---|---|
| Create | **"Add [Entity]"** | "Add Property", "Add User" | "Create", "New" (except in dialog titles where "New Scenario" is acceptable) |
| Save | **"Save"** | All save buttons, everywhere | "Update", "Submit", "Apply" |
| Delete (property) | **"Delete Property"** | Soft-deletes (archives). Always with confirmation dialog. | "Remove", "Archive" (internal term, never shown to user) |
| Delete (scenario) | **"Delete Scenario"** | Soft-deletes. Confirmation dialog. | "Permanently Delete" (admin context only), "Remove" |
| Research | **"Analyst"** (with `IconSparkles`) | Primary action on property/company edit pages and per-tab actions | "Regenerate Intelligence", "Generate Research", "Run Research", "Ask the Analyst", "Ask the Analysts" |
| Research (secondary) | **"Consult"** | Research hub, dedicated research pages | "Generate", "Run", "Execute" |
| Load scenario | **"Load"** | Scenario list action | "Restore", "Open", "Apply" |
| Share | **"Share"** | Scenario sharing | "Grant Access", "Send" |
| Sign out | **"Sign Out"** | Always. | "Log Out", "Logout" |

---

## 4. Navigation Labels (Exact)

### User Sidebar
| Label | Route | Notes |
|---|---|---|
| Dashboard | `/` | |
| Properties | `/portfolio` | URL is `/portfolio` but label is "Properties" |
| Management Co. | `/company` | Shortened form. Full: "Management Company" in breadcrumbs. |
| Simulation | `/analysis` | Single canonical name. Not "Analysis" or "Sensitivity." |
| Property Finder | `/property-finder` | |
| Map View | `/map` | |
| Scenarios | `/scenarios` | Breadcrumb: "Scenarios" (not "My Scenarios"). |
| My Profile | `/profile` | |

### Admin Sidebar Groups
| Group | Tabs |
|---|---|
| Management Company | Financial Defaults, Services & Fees, Financial Statement Lines |
| Properties | Hotel Model Defaults, Luxury Rental Defaults, Required Fields Config |
| AI Research Engines | Sources & APIs, LLM Configuration, Engine Health, Scheduled Research, Hospitality Benchmarks |
| Users | User Management |
| Scenarios | All Scenarios, Default Assignments |
| Rebecca | Configuration, Knowledge Base, Conversations |
| Themes & Appearance | Brand & Appearance |
| App Settings | Notifications, Navigation, Database |
| Testing & Verification | Verification, QA Sandbox |
| Reports & Exports | Reports & Exports |

---

## 5. Financial Terms

### Always abbreviated (never spell out in labels or headings):
ADR, NOI, DSCR, IRR, GOP, AGOP, ANOI, FF&E, RevPAR, EBITDA, LTV, NPV

### Spell out on first use in help text, then abbreviate:
- Average Daily Rate (ADR)
- Net Operating Income (NOI)
- Debt Service Coverage Ratio (DSCR)
- Gross Operating Profit (GOP)
- Furniture, Fixtures & Equipment (FF&E)

### Canonical financial waterfall (code and display):
`Revenue -> GOP -> AGOP -> NOI -> ANOI -> Net Income`

### Fee terminology:
| Canonical | What It Is | Forbidden |
|---|---|---|
| **Base Management Fee** | % of total revenue paid to the management company | "Base Fee", "Service Fee" (when referring to the total) |
| **Incentive Management Fee** | % of GOP paid to the management company | "Incentive Fee", "Performance Fee" |
| **Service Categories** | The line items that compose the base management fee (Marketing & Brand, Technology & Reservations, etc.) | "Fee Categories" (code only), "Service Templates" (code only) |
| **Disposition Commission** | Broker commission on property sale | "Sales Commission" (code only — `salesCommissionRate` in schema) |

### Negative numbers in UI:
Always red, always parenthesized: `($1,234)` — never `-$1,234`.

---

## 6. Property Classification

### Business Model (financial engine — 3 types):
| Label | Value | Description |
|---|---|---|
| **Hotel** | `hotel` | USALI framework, F&B, events, management fees |
| **Luxury Rental** | `lodge` | Whole-property rental, premium amenities, no events dept |
| **Short-Term Rental** | `vrbo` | Platform fees, per-turnover cleaning, all-in management |

Note: Code value is `lodge` but user-facing label is **"Luxury Rental."**
Note: Code value is `vrbo` but user-facing label is **"Short-Term Rental"** or **"STR."**

### Hospitality Type (research context — 9 types):
Hotel, Resort, Boutique Hotel, Business Hotel, Wellness Resort, Conference Hotel, Extended Stay, Luxury Rental, Lodge

### Quality Tier (6 tiers, words not stars):
Luxury > Upper Upscale > Upscale > Upper Midscale > Midscale > Economy

---

## 7. User Roles

| Canonical | Value | What They Do |
|---|---|---|
| **Admin** | `admin` | Full access. Manages users, properties, settings, research engines. |
| **User** | `user` | Creates/edits properties and scenarios. Runs research. Core operator. |
| **Checker** | `checker` | Verification officer. Runs golden tests, audits calculations. |
| **Investor** | `investor` | Read-only portfolio viewer. Sees dashboards and exports. |

Forbidden: "viewer", "manager", "partner" (exists in code but not in valid roles), "super_admin" (never shown in UI).

---

## 8. Conviction Tiers (replaces "Confidence Score")

| Tier | Internal Score Range | Display | Color |
|---|---|---|---|
| **High** | 75-100 | "High conviction" | Green |
| **Moderate** | 50-74 | "Moderate conviction" | Amber |
| **Developing** | 0-49 | "Developing" | Gray |

Never show the numeric score to users. "Developing" instead of "Low" — it implies the system is still gathering information, not that it failed.

---

## 9. Forbidden Terms (Never Use in UI)

| Forbidden | Why | Use Instead |
|---|---|---|
| Marcela | Dead name for the AI assistant | Rebecca |
| SAFE (hardcoded) | Funding vehicle label is configurable | Use `fundingSourceLabel` value |
| VRBO (as primary label) | Trademarked, too narrow | "Luxury Rental" or "Short-Term Rental" |
| Update (button) | Convention is "Save" | Save |
| Stale / Fresh | Cache terminology, not user language | "Last reviewed [date]" / "Not yet reviewed" |
| Confidence Score (with %) | Software language | "High/Moderate/Developing conviction" |
| Run / Execute / Generate | Machine language for AI actions | "Ask the Analysts" / "Consult" |
| Algorithm / Model / Engine | Implementation details | "Analysts" / "research team" / "our analysis" |
| Viewer | Not a real role | "Investor" |
| My Scenarios | Inconsistent with sidebar | "Scenarios" |
| Analysis (page name) | Multiple names for one page | "Simulation" |
| Sensitivity Analysis | Old name | "Simulation" |
| Company (alone, in nav) | Too vague | "Management Co." |

---

## 10. Intelligence Animation Voice

When the AI is working (research running, Rebecca thinking, data loading), the user
sees animated status messages. These must feel like watching a colleague work, not
reading a progress log.

### Verbs to use in loading states
**studying**, **reviewing**, **checking**, **weighing**, **considering**,
**cross-referencing**, **pulling**, **forming a view**, **getting a second opinion**

### Verbs to NEVER use in loading states
**processing**, **generating**, **computing**, **loading**, **executing**,
**running**, **aggregating**, **synthesizing**

### Message format
- Specific to what's actually happening: "Checking recent transactions in your market..."
- Reference real data sources when possible: "Pulling current macro rates from FRED..."
- Reference the actual entity: "Reviewing how similar properties perform..."
- Short — one line, ends with "..."
- Each message appears with a premium animation (BreathingDots, ThinkingRing, StreamPulse, etc.)

### Standard rotating messages (ResearchLoadingOverlay)
1. "Studying market trends and comparable properties..."
2. "Cross-referencing industry benchmarks..."
3. "Reviewing how similar properties perform..."
4. "Checking recent transactions in your market..."
5. "Weighing multiple data sources..."
6. "Getting a second opinion from independent sources..."
7. "Pulling current macro rates from FRED..."
8. "Forming a view on your assumptions..."

### Status bar labels (IntelligenceStatusBar)
| Status | Label | Reason text |
|---|---|---|
| Current | "Up to date" | "Analyst review is current" |
| Stale | "Due for review" | "Assumptions changed since last review" or "Due for review — analyst guidance may be outdated" |
| Very stale | "Overdue" | "Last reviewed N days ago — overdue for review" |
| Missing | "Not yet reviewed" | "Your analysts haven't reviewed these assumptions yet" |
| Running | "Reviewing" | "Analysts are reviewing your assumptions" |

### Rebecca typing phases
1. "Searching portfolio data"
2. "Analyzing benchmarks"
3. "Composing response"

### Animation components available (from ai-loader.tsx)
`OrbitalDots`, `NeuralGlow`, `StreamPulse`, `BreathingDots`, `ThinkingRing`, `DataFlowDots`

Use these instead of `Loader2 animate-spin` for any AI-related loading state.

---

## 11. App Copy Voice

The app's explanations, tooltips, help text, and onboarding copy should read like
a behavioral economist explaining a concept at dinner — simple language, everyday
analogies, a gentle wit, and the quiet confidence that you're smart enough to get it.

### The Style
- **Simple over technical**: "This is what you'd pay to service the debt each year" not "Annual debt service obligation derived from amortization schedule."
- **Analogies over definitions**: "Think of the cap rate as the rental yield on the property — if you bought it outright, this is the annual return before any financing."
- **Nudge, don't lecture**: When a user enters a value outside the benchmark range, don't say "Warning: value exceeds range." Say "Most comparable properties in this market land between $220 and $310. You're at $350 — which could be right if your property offers something they don't."
- **Choice architecture**: Present defaults as the sensible starting point ("Most boutique hotels in this tier start around 55% occupancy and ramp over 9-12 months"), then let the user deviate with full information.
- **Wit in small doses**: A tooltip for FF&E Reserve might say "The furniture breaks, the fixtures age, and the equipment gets temperamental. This reserve makes sure you can replace them without raiding the operating account." Not funny-ha-ha, but human.
- **First person plural**: "We" or "Our analysts" — never "The system" or "The AI."
- **Active voice**: "Our analysts reviewed 12 comparable properties" not "12 comparable properties were analyzed."
- **Investor-grade precision**: Every number must be defensible. If uncertain, say "typically ranges from X to Y" not "approximately X."
- **No jargon leakage**: Never mention LLMs, embeddings, vectors, prompts, tokens, Pinecone, or any infrastructure in user-facing text.
- **Rebecca speaks as herself**: In the chat panel, Rebecca says "I" not "We." She's one analyst, not the team. The team is invoked by "Ask the Analysts."

### Nudging in Practice
The app should gently guide users toward better assumptions without forcing them:
- **Default anchoring**: Pre-fill fields with benchmark-derived values so the user starts from a defensible position
- **Social proof in tooltips**: "Industry standard for luxury boutiques is 8-10% base management fee" — this frames the user's choice
- **Gentle flags, not errors**: When a value is aggressive, the Analyst Note says "above range — may need justification for investors" not "ERROR: value too high"
- **The status bar is a nudge**: "Due for review" creates a gentle pull toward clicking "Ask the Analysts" without blocking the user

### Norfolk AI Branding
The technology powering the intelligence features should be attributed to Norfolk AI:
- **Research engine**: "Norfolk AI Research Engines" — used in footer badges, about pages, export watermarks
- **Badge**: "Powered by Norfolk AI" — small, tasteful badge on research result panels and exported PDFs
- **Analyst attribution**: "Norfolk AI analysts reviewed 8 comparable properties" — the analysts work for Norfolk AI
- **Technology naming**: "Norfolk AI Intelligence Pipeline", "Norfolk AI Market Data", "Norfolk AI Conviction Scoring"
- Keep it subtle — a footer badge, a small attribution line in research results, a watermark on exports. Never intrusive.

---

## How to Add New Terms

1. Check this file first. If the concept exists, use the canonical name.
2. If it's a new concept, propose the term in a PR description.
3. Financial terms: check the checker-manual glossary at `.claude/manuals/checker-manual/glossary.md`.
4. When in doubt: would a Goldman Sachs analyst use this word in a pitch book? If yes, it's probably right. If they'd raise an eyebrow, find a better word.
