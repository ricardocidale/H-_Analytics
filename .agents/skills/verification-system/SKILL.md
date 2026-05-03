---
name: verification-system
description: "H+ three-tier financial verification and audit opinion system: independent server-side checker, tier 1/2/3 verification pipeline, audit opinions (unqualified/qualified/adverse/disclaimer), GAAP standard references, workpaper generation. Load when touching verification routes, checker code, or audit UI."
---

# Verification System

## Architecture

The verification system is an independent "second-look" engine that runs entirely on the server. It recalculates the entire financial model from raw assumptions and compares those results against the output produced by the client-side calculation engine.

**Key invariant**: the server checker and the client engine never share calculation code. Independence is the entire basis of the verification — if they shared code, a shared bug would go undetected.

- Server checker location: `artifacts/api-server/src/` (server-side only; never imported by the client)
- Client engine location: `lib/engine/` (never imported by the server checker)
- The checker receives raw assumptions as inputs and produces an independent set of line-item results
- Discrepancies between checker output and engine output are flagged as verification findings

---

## Three-Tier Verification Pipeline

### Tier 1 — Property-Level

Scope: a single property's monthly and annual financials.

- Independently calculates every monthly line item: Revenue, GOP, NOI, Net Income
- Verifies room revenue formulas (ADR × occupancy × available rooms)
- Verifies PMT debt service calculations (principal + interest split)
- Verifies depreciation basis: cost basis excluding land value, straight-line over useful life
- Cash flow reconciliation: operating cash flow ties to net income adjusted for non-cash items and working capital

### Tier 2 — Company-Level

Scope: the management company (ManCo) and its relationship to the portfolio.

- Verifies management fee calculations across all properties in the portfolio
- Models ManCo cash flow including SAFE tranche disbursements and overhead expenses
- Confirms fee income recognized by ManCo equals fees charged to properties

### Tier 3 — Consolidated

Scope: the full consolidated entity view.

- Intercompany elimination checks: fees paid by properties must equal fees received by ManCo (ASC 810)
- Verifies aggregated portfolio totals: portfolio revenue = sum of individual property revenues
- Confirms consolidated statements are free of double-counting

---

## Verification Pipeline Stages

Each verification run executes four ordered stages:

1. **Formula Checker** — validates mathematical identities (e.g., NOI = Revenue − Operating Expenses; Net Income = NOI − Debt Service − Depreciation)
2. **GAAP Compliance** — checks accounting rule adherence (e.g., principal repayment excluded from Net Income; revenue recognized per ASC 606)
3. **Full Auditor** — independent recalculation of every line item with workpaper references to specific GAAP standards
4. **Cross-Calculator Validation** — compares checker output against authoritative IRS and GAAP formulas for depreciation, amortization, and debt service

Each stage produces a structured result: pass/fail per check, variance amounts where applicable, and a citation to the relevant standard.

---

## Audit Opinions

The verification run concludes with one of four standard audit opinions:

| Opinion | Meaning |
|---------|---------|
| **UNQUALIFIED** | Clean opinion. Projections present fairly in all material respects. No significant findings. |
| **QUALIFIED** | Minor issues found but projections are mostly reliable. Specific items noted in the report. |
| **ADVERSE** | Significant critical issues. Projections cannot be relied upon. Material misstatements present. |
| **DISCLAIMER** | Unable to complete the audit. Missing data, computation failure, or insufficient information to form an opinion. |

---

## GAAP Standards Referenced

| Standard | Topic |
|----------|-------|
| ASC 230 | Cash Flow Statements — classification of operating, investing, and financing activities |
| ASC 360 | PP&E and Depreciation — cost basis, useful life, straight-line method, land exclusion |
| ASC 470 | Debt — principal vs. interest classification, amortization of financing costs |
| ASC 606 | Revenue Recognition — performance obligations, timing of revenue |
| ASC 810 | Consolidation and Intercompany Elimination — elimination of intercompany fees and transactions |

---

## AI Commentary

Verification results are narrated with professional audit-style commentary:

- Each finding is described in plain language with the relevant standard cited
- Pass results are acknowledged concisely; failures receive fuller explanation
- Commentary is calibrated to the audit opinion level (a Disclaimer opinion produces a different narrative tone than a Qualified opinion)

---

## Workpaper Generation

The system generates a formatted **Independent Auditor's Report** document containing:

- Header identifying the engagement, property or portfolio, and period under review
- Summary: total checks run, pass count, fail count, warning count
- Per-tier findings with line-item detail and variance amounts
- Applicable GAAP citations for each finding
- Concluding audit opinion with supporting rationale
- Variance analysis table comparing checker output to engine output for material line items

---

## Related Skills

- `financial-engine` — client-side calculation engine (independent; do not share code with checker)
- `hbg-business-model` — business logic context for management fees, SAFE tranches, and portfolio structure
- `api-backend-contract` — route structure and storage patterns for verification endpoints
