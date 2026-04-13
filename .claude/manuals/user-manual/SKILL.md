# Hospitality Business Group — User Manual

## About This Manual

The User Manual provides end-user documentation for the Hospitality Business Group portal. It covers navigation, property management, financial analysis tools, exports, and AI assistant usage. The manual is accessible to all user roles via the Help page.

## File Structure

The in-app User Manual is split into lazy-loaded per-section files for performance and maintainability.

| File | Purpose |
|------|---------|
| `client/src/pages/user-manual/index.tsx` | Page wrapper, layout, TOC |
| `client/src/pages/user-manual/UserManualContent.tsx` | Thin orchestrator — lazy-loads all 17 sections |
| `client/src/pages/user-manual/constants.ts` | Section metadata (IDs, titles, icons) |
| `client/src/pages/user-manual/UserManualTOC.tsx` | Table of Contents sidebar |

### Section Files (`client/src/pages/user-manual/sections/`)

| # | File | Section ID | Title |
|---|------|-----------|-------|
| 1 | `Section01GettingStarted.tsx` | `getting-started` | Getting Started |
| 2 | `Section02Navigation.tsx` | `navigation` | Navigating the Portal |
| 3 | `Section03Dashboard.tsx` | `dashboard` | Dashboard |
| 4 | `Section04Properties.tsx` | `properties` | Properties |
| 5 | `Section05PropertyDetails.tsx` | `property-details` | Property Details & Financials |
| 6 | `Section06PropertyImages.tsx` | `property-images` | Property Images |
| 7 | `Section07ManagementCompany.tsx` | `management-company` | Management Company |
| 8 | `Section08Assumptions.tsx` | `assumptions` | Systemwide Assumptions |
| 9 | `Section09Scenarios.tsx` | `scenarios` | Scenarios |
| 10 | `Section10Analysis.tsx` | `analysis` | Analysis Tools |
| 11 | `Section11PropertyFinder.tsx` | `property-finder` | Property Finder |
| 12 | `Section12Exports.tsx` | `exports` | Exports & Reports |
| 13 | `Section13AIResearch.tsx` | `ai-research` | AI Research |
| 14 | `Section14Profile.tsx` | `profile` | My Profile |
| 15 | `Section15Branding.tsx` | `branding` | Branding & Themes |
| 16 | `Section16Admin.tsx` | `admin` | Admin Settings |
| 17 | `Section17BusinessRules.tsx` | `business-constraints` | Business Rules & Constraints |

## How to Edit

To edit a specific section, open the corresponding file in `sections/`. Each file is a self-contained React component that exports a default function with `SectionProps` interface (`expanded`, `onToggle`, `sectionRef`). The component wraps its content in a `SectionCard` (with `variant="light"`) and uses `ManualTable` and `Callout` for structured content.

To add a new section:
1. Create `SectionNN<Name>.tsx` in `sections/`
2. Add entry to `constants.ts`
3. Add lazy import to `UserManualContent.tsx`

## LLM Context Files

Additional documentation for LLM context is in `.claude/manuals/user-manual/skills/`:
- `01-business-model.md` — Business model overview
- `02-business-rules.md` — Business rules and constraints
- `03-capital-structure.md` — Capital structure details
- `04-dynamic-behavior.md` — Dynamic behavior documentation

## Content Overview (16 chapters in LLM handbook)

1. Business Model Overview — Two-entity structure
2. Business Rules and Constraints — Seven mandatory financial rules
3. Capital Structure and Investor Returns — Sources of capital, how investors earn returns
4. Dynamic Behavior and System Goals — Real-time recalculation, multi-level analysis
5. Property Lifecycle — Acquisition, operations, refinancing, exit
6. Default Values and Assumptions — How defaults work, complete reference
7. Revenue Calculations — Room revenue and three ancillary streams
8. Operating Expenses — Direct costs, overhead, escalation mechanics
9. GOP and NOI — Two key profitability metrics
10. Debt and Financing — Loan mechanics, amortization, refinancing
11. Free Cash Flow — CF statement structure and FCF calculations
12. Balance Sheet — Assets, liabilities, equity, depreciation
13. Investment Returns — Exit valuation, IRR, equity multiple, cash-on-cash
14. Management Company Financials — Revenue, expenses, staffing, funding
15. Fixed Assumptions — Constants and configurables
16. Cross-Verification and Audit Trail — Independent verification system
