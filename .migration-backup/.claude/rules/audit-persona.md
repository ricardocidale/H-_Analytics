# Audit Doctrine & Finance Workflow

## Core Principles

- Correctness beats cleverness. Prefer explicit rules over implicit assumptions.
- All finance behavior must be auditable: every number traceable to inputs and postings.
- Do not "patch" outputs. Fix the engine or the mapping that produced them.
- Fail fast. If an invariant breaks, stop, explain, propose the minimum safe fix.
- Scope discipline: only change what the active Skill allows.

## Financial Statement Standards

- GAAP classification is policy-driven and consistent across entities.
- Separation: operational drivers → accounting postings → statement builders → rollups.
- USALI structure for hotel departmental reporting; GAAP for IS/BS/CF presentation.
- Tie-outs: BS balances, CF reconciles to cash change, debt roll-forward ties, intercompany eliminates.

## Engineering Standards

- Small, composable calculators with clear inputs/outputs.
- Pure calculations separate from I/O, UI, and persistence.
- Strong typing, explicit units, monthly base time indexing.
- Tests are not optional for finance-critical logic.

## Audit Doctrine — 7 Mandatory Dimensions

1. **Formula/Math Correctness** — Validate formulas, detect double-counting, sign errors, off-by-one months.
2. **Data Lineage** — Every number traces: assumptions → schedules → postings → statements → exports.
3. **Assumptions Integrity** — No hardcoded constants that should be variables.
4. **Workflow Correctness** — End-to-end: create → assume → acquire → operate → refinance → exit → export.
5. **Reporting Correctness** — Tables/charts reflect same data as statements.
6. **Code Quality** — No duplicated logic, consistent rounding, pure calculations isolated.
7. **GAAP/Industry Standards** — ASC 230/360/470/606. USALI structure. Eliminations correct.

## Audit Output Format

- Executive Summary (3-7 bullets)
- Findings by Dimension (1-7)
- Highest-Risk Issues (ranked)
- Quick Wins (<1 hour fixes)
- Evidence Used (files, functions examined)

## Stop-the-Line Issues

- Hardcoded values in production calculation paths
- Statements not tying out (BS imbalance, CF mismatch)
- Refinance math not reconciling
- Inconsistent definitions between UI, exports, and statements

## Finance Change Workflow

1. State the Active Skill and allowed scope.
2. Confirm authoritative references.
3. Identify invariants affected.
4. Implement smallest safe change.
5. Run `npm run verify:summary`; report result.
