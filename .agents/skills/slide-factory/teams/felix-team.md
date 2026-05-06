---
name: felix-team
description: >
  Felix team (Felix-01..05) builds Slide 6 — the 10-Year Consolidated
  Income Statement. The most complex slide in the deck: Felix-03 validates
  financial arithmetic, Felix-04 formats the table, five members total.
---

# Felix Team — Slide 6: Income Statement

**Team name:** Felix
**Format:** Felix-01..05 (swarm — Slide 6 only, 5 members for expanded pipeline)
**Slide:** Slide 6 — 10-Year Consolidated Pro Forma Income Statement (sage background, dense financial table)

**Why five members:** Slide 6 requires a financial calculation validation step
(Felix-03) and a presentation formatting step (Felix-04) that other slides do
not. The income statement has strict arithmetic invariants that must be
verified before the table is formatted, and formatting rules for a dense
10-column financial table require their own dedicated pass.

---

## Felix-01 — Reader

**Role:** Slide 6 Reader | **Model:** None (deterministic)

**Short:** Felix-01 runs `aggregateUnifiedByYear` across all portfolio properties at 10 projection years and validates the aggregated financial data is complete.

**Long:** Felix-01 calls `aggregateUnifiedByYear` across all active portfolio properties, reads the resulting `yearlyIS` and `yearlyCF` arrays, and validates completeness: no year with null top-line revenue, no property with missing projection data, no structural gaps in the 10-year array. He also reads the `slide6Disclaimer` from the config table if present. If the aggregation returns fewer than 10 years or contains structural gaps, Felix-01 writes a gap report identifying the specific property and year causing the issue. The financial data produced here is the most sensitive in the deck — investor pro forma numbers must be auditable back to individual property assumptions.

**Inputs:** All active portfolio properties (from DB via storage layer)
**Outputs:** `slide6_financial_data` — `yearlyIS[]`, `yearlyCF[]`, disclaimer
**Model:** None (deterministic calculation)

---

## Felix-02 — Builder

**Role:** Slide 6 Builder | **Model:** Sonnet 4.6

**Short:** Felix-02 maps the validated 10-year financial data to the USALI row structure and hands the assembled table to Felix-03 for arithmetic validation before any formatting.

**Long:** Felix-02 receives Felix-01's financial data and maps it to the USALI row structure required by the LB deck: Revenue, Departmental Expenses, Undistributed Expenses, GOP, Management Fees, Fixed Charges, NOI, FF&E Reserve, ANOI, Debt Service, Net Cash Flow, Cumulative CF. He assigns each row variant class (section/subtotal/normal/footer) and assembles the 10-column year structure. He does not calculate subtotals or format numbers — those are Felix-03 and Felix-04's responsibilities. If any row label is missing from the aggregation output, Felix-02 flags it as a gap rather than omitting the row silently.

**Inputs:** `slide6_financial_data` (Felix-01)
**Outputs:** `slide6_table_structure` — row definitions, year data, variant classes
**Model:** Sonnet 4.6

---

## Felix-03 — IS Calculator

**Role:** Income Statement Calculator | **Model:** None (deterministic)

**Short:** Felix-03 validates every subtotal and total in the assembled income statement. No ######, no arithmetic drift. Every figure must be mathematically consistent before formatting begins.

**Long:** Felix-03 receives Felix-02's assembled table structure and runs deterministic arithmetic checks: departmental expense subtotals sum to Total Departmental Expenses, GOP equals Revenue minus Total Departmental and Undistributed Expenses, NOI equals GOP minus Fixed Charges, Net Cash Flow equals ANOI minus Debt Service. He also verifies that no cell contains a zero where a non-zero figure is expected given the underlying property data, and flags any `######` artifacts that indicate a number too large for its column width. Felix-03 produces a pass/fail report with specific row and year coordinates for any violation. A pass does not mean the numbers look right to an investor — that is Felix-05's concern. Felix-03 only validates mathematical consistency.

**Inputs:** `slide6_table_structure` (Felix-02)
**Outputs:** `arithmetic_validation_result` — pass/fail with row/year coordinates
**Model:** None (deterministic arithmetic)

---

## Felix-04 — IS Formatter

**Role:** Income Statement Formatter | **Model:** Sonnet 4.6

**Short:** Felix-04 applies the Slide 6 visual formatting rules to the validated table: compact Poppins typography, column widths, row variant styling, sage background color treatment. No ######, no truncation.

**Long:** Felix-04 receives Felix-03's arithmetically validated table and applies the Slide 6 presentation rules from the canonical spec: header row 9pt Poppins, data rows 10pt Poppins ExtraLight, 10 year-columns at equal width, row variant classes (section headers in deep green, subtotals in forest green italic, normal rows in cream, footer in sage), negative numbers in parentheses, dollar figures with comma separators. If a value is too wide for its column, Felix-04 reduces the font size for that column rather than clipping or truncating — ######  is a hard failure. He produces a render-ready `SlidePayload` that the Playwright renderer can consume without further transformation.

**Inputs:** `arithmetic_validation_result` + `slide6_table_structure`
**Outputs:** `SlidePayload` for Slide 6, validated by Carlo
**Model:** Sonnet 4.6
**Defenses:** B (Carlo schema), F (Enzo cache)

---

## Felix-05 — Inspector

**Role:** Slide 6 Inspector | **Model:** Calls Dino then Maya

**Short:** Pass 1 (Dino pixel-diff) + Pass 2 (Maya). Maya's focus for Slide 6: do the financial numbers look authoritative and readable? No ######, no truncated values, no spreadsheet aesthetic.

**Long:** Felix-05 runs Pass 1 (Dino pixel-diff) and Pass 2 (Maya). Maya's holistic judgment for Slide 6 has a specific financial presentation focus: are all numbers readable at the slide's resolution, are negative figures correctly parenthesized, does the 10-year span feel authoritative rather than cramped, are section and subtotal rows visually distinct? Maya also checks that the slide does not look like a spreadsheet export — it must read as a designed financial table in the editorial style of the canonical deck. Any ######, any truncated value, or any row indistinguishable from adjacent rows is a hard rejection regardless of pixel-diff result.
