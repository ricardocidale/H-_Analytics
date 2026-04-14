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

## 2. Intelligence Vocabulary — AI as Colleague

These terms make the AI features feel like a team of analysts, not software.

| Canonical Term | Replaces | Where Used | Why |
|---|---|---|---|
| **"Ask the Analysts"** | "Regenerate Intelligence" | Main research button on property edit, company assumptions | Implies a team reviewed your numbers. Plural because multiple LLMs cross-validate. |
| **"Consult"** | "Generate Research" / "Run Research" | Research hub, company research tabs, ICP | A verb you'd use with a colleague. "Consult on market ADR." |
| **"Analyst Note"** | "Research badge" / "AI suggestion" / "range tooltip" | Yellow badge next to assumption fields | A colleague left you a note, not a tooltip. |
| **"Conviction"** | "Confidence Score" | Research results, guidance display | Investor language. Three tiers: **High** / **Moderate** / **Developing**. Never show a raw percentage to users. |
| **"Last reviewed"** | "Staleness: stale/fresh/missing" | Guidance timestamps | "Last reviewed 3 days ago" or "Not yet reviewed." Never say "stale." |
| **"Second opinion"** | "Cross-validation" / "Multi-source verification" | When explaining how ranges are derived | "We asked three independent sources for a second opinion on this rate." |
| **"Analyst consensus"** | "Source agreement" / "Cross-validation score" | When multiple sources agree on a range | "Strong analyst consensus on this ADR range." |

### How to describe what the AI does (help text, tooltips, onboarding):

**Good:** "Our analysts reviewed comparable properties and market data to suggest this range."
**Good:** "Rebecca can walk you through the assumptions behind these numbers."
**Good:** "Get a second opinion on any assumption by clicking Ask the Analysts."

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
| Research | **"Ask the Analysts"** | Primary action on property/company edit pages | "Regenerate Intelligence", "Generate Research", "Run Research" |
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

## 10. Help Text & Tooltip Voice

When writing tooltips, help text, info bubbles, or onboarding copy:

- **First person plural**: "We" or "Our analysts" — never "The system" or "The AI."
- **Active voice**: "Our analysts reviewed 12 comparable properties" not "12 comparable properties were analyzed."
- **Investor-grade precision**: Every number must be defensible. If uncertain, say "typically ranges from X to Y" not "approximately X."
- **No jargon leakage**: Never mention LLMs, embeddings, vectors, prompts, tokens, Pinecone, or any infrastructure in user-facing text.
- **Rebecca speaks as herself**: In the chat panel, Rebecca says "I" not "We." She's one analyst, not the team. The team is invoked by "Ask the Analysts."

---

## How to Add New Terms

1. Check this file first. If the concept exists, use the canonical name.
2. If it's a new concept, propose the term in a PR description.
3. Financial terms: check the checker-manual glossary at `.claude/manuals/checker-manual/glossary.md`.
4. When in doubt: would a Goldman Sachs analyst use this word in a pitch book? If yes, it's probably right. If they'd raise an eyebrow, find a better word.
