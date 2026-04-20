# H+ Analytics — Project-Life Replit Cost Report

_Generated 2026-04-20T11:44:19.010Z from `replit_invoices` + `replit_invoice_line_items` (75 invoices, Jan 23 - Apr 23 2026)._

## Methodology

Per-invoice line-item raw extraction was deferred (the Orb invoice-history HTML view requires a paid CSV export or browser-driven scraping). This report uses **attributed estimates**:

- **Routine invoices** (non-spike days): H+ workspace `e53ea481-4c36-4e2a-8bfc-80697f311b65` allocated **91%** of net cash (the ratio confirmed from the Apr 23 portal snapshot of `XFPSSE-DRAFT`).
- **Spike days** (Feb 10, Mar 8, Apr 19): H+ allocated **95%** — those bursts were dominated by H+ multi-file sweep work (TypeScript-error campaign, audit v2/v3, OT-A.4 ship).
- **`XFPSSE-DRAFT` (Apr 23 cycle)**: H+ figures are **portal-line-item-exact** (gross $2,558.98).
- **$0 invoices**: zero attribution (pre-purchase fully covered, no real consumption invoiced).

## Headline Numbers

| Metric | Value |
|---|---|
| Total invoices | 75 |
| Cap-hit invoices ($511.68) | 2 |
| Spike-day invoices | 6 |
| Zero invoices (pre-purchase covered) | 6 |
| **Total cash invoiced** | **$4747.69** |
| Total gross usage (where known) | $3118.57 |
| Pre-purchase pool consumed (Apr cycle) | $2477.64 |
| Prior-invoice credit (Apr cycle) | $297.44 |
| **H+ attributed cash** | **$4378.41** |
| H+ attributed gross | $6924.59 |
| H+ % of total cash | 92.2% |
| H+ daily-avg cash burn | $128.78 per active day |
| Active billing days | 34 |

## Top 5 High-Cost Days

| Rank | Date | Total cash | H+ attributed | Spike day? |
|---|---|---|---|---|
| 1 | 2026-02-10 | $674.84 | $641.10 | YES |
| 2 | 2026-03-08 | $511.68 | $486.10 | YES |
| 3 | 2026-03-22 | $323.11 | $294.04 | no |
| 4 | 2026-02-06 | $269.53 | $245.28 | no |
| 5 | 2026-04-19 | $266.95 | $253.60 | YES |

## Monthly Burn

| Month | Invoices | Total cash | H+ attributed |
|---|---|---|---|
| 2026-01 | 9 | $429.45 | $390.80 |
| 2026-02 | 33 | $2018.97 | $1864.27 |
| 2026-03 | 30 | $1931.80 | $1778.40 |
| 2026-04 | 3 | $367.47 | $344.94 |

## Workspace Attribution (line-item rollup)

| Workspace UUID | Label | Line items | Total amount | H+? |
|---|---|---|---|---|
| `e53ea481-4c36-4e2a-8bfc-80697f311b65` | H+ Analytics (LB-Hospitality) | 69 | $6895.62 | YES |
| `other_unattributed` | Other workspaces (estimated remainder) | 68 | $365.00 | — |
| `ff0487fd-797f-433c-b449-3b8b3000efee` | Secondary workspace | 1 | $239.55 | — |
| `9fae4009-cc0c-4840-9576-ce0c5c1142c6` | Small/inactive workspace | 1 | $15.07 | — |

## Per-Day Ledger

| Date | Invoices | Total cash | H+ attributed |
|---|---|---|---|
| 2026-01-23 | 1 | $0.00 | $0.00 |
| 2026-01-26 | 3 | $160.80 | $146.33 |
| 2026-01-27 | 1 | $54.15 | $49.28 |
| 2026-01-30 | 1 | $53.31 | $48.51 |
| 2026-01-31 | 3 | $161.19 | $146.68 |
| 2026-02-01 | 1 | $53.73 | $48.89 |
| 2026-02-02 | 1 | $53.53 | $48.71 |
| 2026-02-05 | 1 | $53.99 | $49.13 |
| 2026-02-06 | 5 | $269.53 | $245.28 |
| 2026-02-07 | 1 | $54.58 | $49.67 |
| 2026-02-08 | 1 | $53.58 | $48.76 |
| 2026-02-09 | 3 | $161.89 | $147.32 |
| 2026-02-10 | 4 | $674.84 | $641.10 |
| 2026-02-16 | 1 | $54.09 | $49.22 |
| 2026-02-18 | 4 | $215.84 | $196.42 |
| 2026-02-19 | 1 | $53.84 | $48.99 |
| 2026-02-20 | 1 | $54.13 | $49.26 |
| 2026-02-21 | 2 | $109.52 | $99.67 |
| 2026-02-23 | 1 | $24.05 | $21.89 |
| 2026-02-24 | 2 | $110.76 | $100.79 |
| 2026-02-25 | 4 | $21.07 | $19.17 |
| 2026-03-07 | 1 | $54.28 | $49.39 |
| 2026-03-08 | 1 | $511.68 | $486.10 |
| 2026-03-11 | 2 | $107.80 | $98.09 |
| 2026-03-12 | 3 | $164.62 | $149.80 |
| 2026-03-13 | 2 | $109.62 | $99.75 |
| 2026-03-14 | 3 | $182.62 | $166.18 |
| 2026-03-15 | 6 | $251.68 | $229.03 |
| 2026-03-22 | 6 | $323.11 | $294.04 |
| 2026-03-23 | 5 | $218.73 | $199.05 |
| 2026-03-24 | 1 | $7.66 | $6.97 |
| 2026-04-16 | 1 | $54.47 | $49.57 |
| 2026-04-19 | 1 | $266.95 | $253.60 |
| 2026-04-23 | 1 | $46.05 | $41.77 |

## Sources

- Schema: `shared/schema/replit-billing.ts`
- Seeder: `script/seed-replit-billing.ts` (re-runnable; deletes and re-inserts)
- Source ledger: `rewritetax.md` (75-invoice forensic audit, commit history)
- Portal snapshot: Orb invoice-history view, 2026-04-23 — Apr-cycle workspace breakdown

## Refresh

```bash
npx tsx script/seed-replit-billing.ts   # re-seed (idempotent)
npx tsx script/billing-report.ts        # regenerate this report
```

## Upgrade path (B)

To replace ratio estimates with raw line items: export the Orb invoice CSV from the portal, drop it at `./.local/orb-invoice-export.csv`, and a follow-up loader will overwrite the line-item table with workspace-exact figures while leaving the invoice-header table unchanged.
