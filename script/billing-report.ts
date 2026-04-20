/**
 * Generate the H+ Analytics project-life cost report from the seeded
 * replit_invoices + replit_invoice_line_items tables.
 *
 * Writes docs/billing/hplus-cost-report.md and prints a summary to stdout.
 */
import "dotenv/config";
import { Pool } from "pg";
import { writeFileSync } from "node:fs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

async function main() {
  const totals = await pool.query<{
    invoice_count: string;
    total_net: string;
    total_gross: string;
    total_hplus_net: string;
    total_hplus_gross: string;
    total_pre_purchase: string;
    total_prior_credit: string;
    cap_hit_count: string;
    spike_day_count: string;
    zero_invoice_count: string;
  }>(`
    SELECT
      COUNT(*)::text                                       AS invoice_count,
      COALESCE(SUM(net_amount), 0)::text                   AS total_net,
      COALESCE(SUM(gross_subtotal), SUM(net_amount))::text AS total_gross,
      COALESCE(SUM(hplus_attributed_net), 0)::text         AS total_hplus_net,
      COALESCE(SUM(hplus_attributed_gross), 0)::text       AS total_hplus_gross,
      COALESCE(SUM(pre_purchase_applied), 0)::text         AS total_pre_purchase,
      COALESCE(SUM(prior_invoice_credit), 0)::text         AS total_prior_credit,
      COUNT(*) FILTER (WHERE is_cap_hit)::text             AS cap_hit_count,
      COUNT(*) FILTER (WHERE is_spike_day)::text           AS spike_day_count,
      COUNT(*) FILTER (WHERE net_amount = 0)::text         AS zero_invoice_count
    FROM replit_invoices
  `);

  const t = totals.rows[0];
  const totalNet = Number(t.total_net);
  const totalGross = Number(t.total_gross);
  const totalHplusNet = Number(t.total_hplus_net);
  const totalHplusGross = Number(t.total_hplus_gross);
  const totalPrePurchase = Number(t.total_pre_purchase);
  const totalPriorCredit = Number(t.total_prior_credit);

  const dailyBurn = await pool.query<{ day: string; daily_net: string; daily_hplus: string; invoice_count: string }>(`
    SELECT
      to_char(issued_date, 'YYYY-MM-DD')      AS day,
      SUM(net_amount)::text                    AS daily_net,
      SUM(hplus_attributed_net)::text          AS daily_hplus,
      COUNT(*)::text                            AS invoice_count
    FROM replit_invoices
    GROUP BY day
    ORDER BY day
  `);

  const topCostDays = await pool.query<{ day: string; daily_net: string; daily_hplus: string; has_spike: boolean }>(`
    SELECT
      to_char(issued_date, 'YYYY-MM-DD') AS day,
      SUM(net_amount)::text               AS daily_net,
      SUM(hplus_attributed_net)::text     AS daily_hplus,
      bool_or(is_spike_day)              AS has_spike
    FROM replit_invoices
    GROUP BY day
    ORDER BY SUM(net_amount) DESC
    LIMIT 5
  `);

  const monthlyBurn = await pool.query<{ month: string; monthly_net: string; monthly_hplus: string; invoices: string }>(`
    SELECT
      to_char(issued_date, 'YYYY-MM')          AS month,
      SUM(net_amount)::text                     AS monthly_net,
      SUM(hplus_attributed_net)::text           AS monthly_hplus,
      COUNT(*)::text                             AS invoices
    FROM replit_invoices
    GROUP BY month
    ORDER BY month
  `);

  const workspaceShare = await pool.query<{ workspace_uuid: string; workspace_label: string; line_count: string; total_amount: string; is_hplus: boolean }>(`
    SELECT
      workspace_uuid,
      MIN(workspace_label)         AS workspace_label,
      COUNT(*)::text                AS line_count,
      SUM(amount)::text             AS total_amount,
      bool_or(is_hplus_workspace) AS is_hplus
    FROM replit_invoice_line_items
    GROUP BY workspace_uuid
    ORDER BY SUM(amount) DESC
  `);

  const days = dailyBurn.rows.length;
  const dailyAvgHplus = totalHplusNet / days;
  const hplusPctOfTotal = (totalHplusNet / totalNet) * 100;

  console.log("=== H+ Analytics Project-Life Cost Report ===");
  console.log(`Invoices:              ${t.invoice_count} (${t.cap_hit_count} cap-hits, ${t.spike_day_count} spike-day rows, ${t.zero_invoice_count} zero invoices)`);
  console.log(`Total cash invoiced:   ${fmt(totalNet)}`);
  console.log(`Total gross usage:     ${fmt(totalGross)}`);
  console.log(`Pre-purchase consumed: ${fmt(totalPrePurchase)} (Apr cycle confirmed only)`);
  console.log(`Prior-invoice credit:  ${fmt(totalPriorCredit)}`);
  console.log("");
  console.log(`H+ attributed cash:    ${fmt(totalHplusNet)}  (${hplusPctOfTotal.toFixed(1)}% of total cash)`);
  console.log(`H+ attributed gross:   ${fmt(totalHplusGross)}`);
  console.log(`H+ daily-avg cash:     ${fmt(dailyAvgHplus)} per active day (${days} active days)`);

  const md: string[] = [];
  md.push("# H+ Analytics — Project-Life Replit Cost Report");
  md.push("");
  md.push(`_Generated ${new Date().toISOString()} from \`replit_invoices\` + \`replit_invoice_line_items\` (75 invoices, Jan 23 - Apr 23 2026)._`);
  md.push("");
  md.push("## Methodology");
  md.push("");
  md.push("Per-invoice line-item raw extraction was deferred (the Orb invoice-history HTML view requires a paid CSV export or browser-driven scraping). This report uses **attributed estimates**:");
  md.push("");
  md.push("- **Routine invoices** (non-spike days): H+ workspace `e53ea481-4c36-4e2a-8bfc-80697f311b65` allocated **91%** of net cash (the ratio confirmed from the Apr 23 portal snapshot of `XFPSSE-DRAFT`).");
  md.push("- **Spike days** (Feb 10, Mar 8, Apr 19): H+ allocated **95%** — those bursts were dominated by H+ multi-file sweep work (TypeScript-error campaign, audit v2/v3, OT-A.4 ship).");
  md.push("- **`XFPSSE-DRAFT` (Apr 23 cycle)**: H+ figures are **portal-line-item-exact** (gross $2,558.98).");
  md.push("- **$0 invoices**: zero attribution (pre-purchase fully covered, no real consumption invoiced).");
  md.push("");
  md.push("## Headline Numbers");
  md.push("");
  md.push("| Metric | Value |");
  md.push("|---|---|");
  md.push(`| Total invoices | ${t.invoice_count} |`);
  md.push(`| Cap-hit invoices ($511.68) | ${t.cap_hit_count} |`);
  md.push(`| Spike-day invoices | ${t.spike_day_count} |`);
  md.push(`| Zero invoices (pre-purchase covered) | ${t.zero_invoice_count} |`);
  md.push(`| **Total cash invoiced** | **${fmt(totalNet)}** |`);
  md.push(`| Total gross usage (where known) | ${fmt(totalGross)} |`);
  md.push(`| Pre-purchase pool consumed (Apr cycle) | ${fmt(totalPrePurchase)} |`);
  md.push(`| Prior-invoice credit (Apr cycle) | ${fmt(totalPriorCredit)} |`);
  md.push(`| **H+ attributed cash** | **${fmt(totalHplusNet)}** |`);
  md.push(`| H+ attributed gross | ${fmt(totalHplusGross)} |`);
  md.push(`| H+ % of total cash | ${hplusPctOfTotal.toFixed(1)}% |`);
  md.push(`| H+ daily-avg cash burn | ${fmt(dailyAvgHplus)} per active day |`);
  md.push(`| Active billing days | ${days} |`);
  md.push("");
  md.push("## Top 5 High-Cost Days");
  md.push("");
  md.push("| Rank | Date | Total cash | H+ attributed | Spike day? |");
  md.push("|---|---|---|---|---|");
  topCostDays.rows.forEach((r, i) => {
    md.push(`| ${i + 1} | ${r.day} | ${fmt(Number(r.daily_net))} | ${fmt(Number(r.daily_hplus))} | ${r.has_spike ? "YES" : "no"} |`);
  });
  md.push("");
  md.push("## Monthly Burn");
  md.push("");
  md.push("| Month | Invoices | Total cash | H+ attributed |");
  md.push("|---|---|---|---|");
  monthlyBurn.rows.forEach((r) => {
    md.push(`| ${r.month} | ${r.invoices} | ${fmt(Number(r.monthly_net))} | ${fmt(Number(r.monthly_hplus))} |`);
  });
  md.push("");
  md.push("## Workspace Attribution (line-item rollup)");
  md.push("");
  md.push("| Workspace UUID | Label | Line items | Total amount | H+? |");
  md.push("|---|---|---|---|---|");
  workspaceShare.rows.forEach((r) => {
    md.push(`| \`${r.workspace_uuid}\` | ${r.workspace_label ?? "_(none)_"} | ${r.line_count} | ${fmt(Number(r.total_amount))} | ${r.is_hplus ? "YES" : "—"} |`);
  });
  md.push("");
  md.push("## Per-Day Ledger");
  md.push("");
  md.push("| Date | Invoices | Total cash | H+ attributed |");
  md.push("|---|---|---|---|");
  dailyBurn.rows.forEach((r) => {
    md.push(`| ${r.day} | ${r.invoice_count} | ${fmt(Number(r.daily_net))} | ${fmt(Number(r.daily_hplus))} |`);
  });
  md.push("");
  md.push("## Sources");
  md.push("");
  md.push("- Schema: `shared/schema/replit-billing.ts`");
  md.push("- Seeder: `script/seed-replit-billing.ts` (re-runnable; deletes and re-inserts)");
  md.push("- Source ledger: `rewritetax.md` (75-invoice forensic audit, commit history)");
  md.push("- Portal snapshot: Orb invoice-history view, 2026-04-23 — Apr-cycle workspace breakdown");
  md.push("");
  md.push("## Refresh");
  md.push("");
  md.push("```bash");
  md.push("npx tsx script/seed-replit-billing.ts   # re-seed (idempotent)");
  md.push("npx tsx script/billing-report.ts        # regenerate this report");
  md.push("```");
  md.push("");
  md.push("## Upgrade path (B)");
  md.push("");
  md.push("To replace ratio estimates with raw line items: export the Orb invoice CSV from the portal, drop it at `./.local/orb-invoice-export.csv`, and a follow-up loader will overwrite the line-item table with workspace-exact figures while leaving the invoice-header table unchanged.");
  md.push("");

  const path = "docs/billing/hplus-cost-report.md";
  writeFileSync(path, md.join("\n"));
  console.log(`\nReport written to ${path}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
