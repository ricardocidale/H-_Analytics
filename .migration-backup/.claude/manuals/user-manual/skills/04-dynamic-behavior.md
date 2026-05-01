# Chapter 4: Dynamic Behavior and System Goals

The platform is designed as a living financial model — one that responds instantly to changes in assumptions and provides analysis at multiple levels of the business. This chapter explains how the recalculation engine works and the principles that guide the system's design.

## Real-Time Recalculation

Every time you change an assumption — whether it is a property's average daily rate, the occupancy growth trajectory, or the interest rate on a loan — the entire financial model recalculates immediately. There is no "run" button to press and no waiting for batch processing. Projections update on every input change, giving you an instant view of how each assumption affects the bottom line.

The engine operates at monthly granularity, using 30.5-day months (the industry standard of 365 days divided by 12). Monthly results are then rolled up to yearly figures for presentation in the financial statements and reports you see on screen.

## Multi-Level Analysis

The platform provides financial analysis at four levels, each offering a progressively broader view of the business:

**Property Level** presents the individual financial statements for a single hotel — its income statement, balance sheet, and cash flow statement. This is where you evaluate the performance of each asset in isolation.

**Company Level** focuses on the management company's own financials, including overhead costs, staffing expenses, and partner compensation. This view shows whether the management business itself is profitable and sustainable.

**Portfolio Level** aggregates results across all properties and the management company, providing a comprehensive view of the entire business. This is the level most useful for assessing overall investment performance.

**Consolidated Level** presents a full consolidation that includes intercompany eliminations — removing the management fees that flow between entities to avoid double-counting revenue. This view conforms to standard consolidation accounting practices.

## Design Principles

Three principles guide the platform's design:

**Transparency.** Every number in the model can be traced back to the assumptions that produced it. There are no hidden calculations or opaque adjustments.

**Auditability.** An independent verification system validates all calculations against the same inputs, ensuring that the numbers you see are mathematically correct. This dual-engine approach provides a level of assurance typically reserved for formal financial audits.

**Standards Compliance.** The model adheres to Generally Accepted Accounting Principles — specifically ASC 230 (statement of cash flows), ASC 360 (property, plant, and equipment), ASC 470 (debt), and ASC 606 (revenue recognition) — as well as the Uniform System of Accounts for the Lodging Industry (USALI).
