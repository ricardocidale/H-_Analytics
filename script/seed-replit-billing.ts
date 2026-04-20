/**
 * Seed the replit_invoices + replit_invoice_line_items tables from the
 * complete 75-invoice ledger captured in rewritetax.md.
 *
 * Attribution model (C-then-B from user choice):
 *   - Routine invoices: H+ workspace gets 91% of the net amount (the ratio
 *     confirmed from the Apr 23 portal snapshot of XFPSSE-DRAFT, where the
 *     H+ workspace UUID e53ea481-... was 90.9% of the cycle subtotal).
 *   - Spike days (Feb 10, Mar 8, Apr 19): 95% — those days were dominated
 *     by H+ multi-file sweep work (TypeScript-error campaign, comprehensive
 *     audit v2/v3, OT-A.4 ship). Lifting the ratio captures that workspace
 *     concentration during heavy-activity bursts.
 *   - XFPSSE-DRAFT: line-item-exact (raw H+ figure from portal: $2,558.98).
 *   - XFPSSE-00074: gross $297.44 known from portal; H+ at 95% spike rate.
 *   - $0.00 invoices: zero attribution (pre-purchase fully covered, no real
 *     consumption invoiced — those represent settlement events, not spend).
 *
 * Re-runnable: deletes all rows then re-inserts.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  replitInvoices,
  replitInvoiceLineItems,
  HPLUS_WORKSPACE_UUID,
  type InsertReplitInvoice,
  type InsertReplitInvoiceLineItem,
} from "../shared/schema/replit-billing";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const ROUTINE_RATIO = 0.91;
const SPIKE_RATIO = 0.95;
const REPLIT_CAP = 511.68;

type InvoiceSeed = {
  number: string;
  issued: string;
  status: "paid" | "draft";
  net: number;
  gross?: number;
  prePurchase?: number;
  priorCredit?: number;
  capHit?: boolean;
  spike?: boolean;
  shipContext?: string;
  notes?: string;
  hplusOverride?: number;
};

const INVOICES: InvoiceSeed[] = [
  { number: "XFPSSE-00001", issued: "2026-01-23", status: "paid", net: 0, notes: "Account setup; pre-billing event" },
  { number: "XFPSSE-00002", issued: "2026-01-26", status: "paid", net: 53.44 },
  { number: "XFPSSE-00003", issued: "2026-01-26", status: "paid", net: 53.67 },
  { number: "XFPSSE-00004", issued: "2026-01-26", status: "paid", net: 53.69 },
  { number: "XFPSSE-00005", issued: "2026-01-27", status: "paid", net: 54.15 },
  { number: "XFPSSE-00006", issued: "2026-01-30", status: "paid", net: 53.31 },
  { number: "XFPSSE-00007", issued: "2026-01-31", status: "paid", net: 53.70 },
  { number: "XFPSSE-00008", issued: "2026-01-31", status: "paid", net: 53.53 },
  { number: "XFPSSE-00009", issued: "2026-01-31", status: "paid", net: 53.96 },
  { number: "XFPSSE-00010", issued: "2026-02-01", status: "paid", net: 53.73 },
  { number: "XFPSSE-00011", issued: "2026-02-02", status: "paid", net: 53.53 },
  { number: "XFPSSE-00012", issued: "2026-02-05", status: "paid", net: 53.99 },
  { number: "XFPSSE-00013", issued: "2026-02-06", status: "paid", net: 54.01 },
  { number: "XFPSSE-00014", issued: "2026-02-06", status: "paid", net: 53.80 },
  { number: "XFPSSE-00015", issued: "2026-02-06", status: "paid", net: 54.16 },
  { number: "XFPSSE-00016", issued: "2026-02-06", status: "paid", net: 53.57 },
  { number: "XFPSSE-00017", issued: "2026-02-06", status: "paid", net: 53.99 },
  { number: "XFPSSE-00018", issued: "2026-02-07", status: "paid", net: 54.58 },
  { number: "XFPSSE-00019", issued: "2026-02-08", status: "paid", net: 53.58 },
  { number: "XFPSSE-00020", issued: "2026-02-09", status: "paid", net: 54.85 },
  { number: "XFPSSE-00021", issued: "2026-02-09", status: "paid", net: 53.48 },
  { number: "XFPSSE-00022", issued: "2026-02-09", status: "paid", net: 53.56 },
  { number: "XFPSSE-00023", issued: "2026-02-10", status: "paid", net: 53.41, spike: true, shipContext: "Cluster on Feb 10 cap-spike day" },
  { number: "XFPSSE-00024", issued: "2026-02-10", status: "paid", net: 55.02, spike: true, shipContext: "Cluster on Feb 10 cap-spike day" },
  { number: "XFPSSE-00025", issued: "2026-02-10", status: "paid", net: 54.73, spike: true, shipContext: "Cluster on Feb 10 cap-spike day" },
  { number: "XFPSSE-00026", issued: "2026-02-10", status: "paid", net: 511.68, capHit: true, spike: true, shipContext: "Fix all 117 TypeScript errors + API/admin hardening + error-state plumbing + dead-code removal + claude.md/replit.md harmonization", notes: "First $511.68 cap-hit invoice in the ledger" },
  { number: "XFPSSE-00027", issued: "2026-02-16", status: "paid", net: 54.09 },
  { number: "XFPSSE-00028", issued: "2026-02-18", status: "paid", net: 53.59 },
  { number: "XFPSSE-00029", issued: "2026-02-18", status: "paid", net: 54.03 },
  { number: "XFPSSE-00030", issued: "2026-02-18", status: "paid", net: 53.40 },
  { number: "XFPSSE-00031", issued: "2026-02-18", status: "paid", net: 54.82 },
  { number: "XFPSSE-00032", issued: "2026-02-19", status: "paid", net: 53.84 },
  { number: "XFPSSE-00033", issued: "2026-02-20", status: "paid", net: 54.13 },
  { number: "XFPSSE-00034", issued: "2026-02-21", status: "paid", net: 55.93 },
  { number: "XFPSSE-00035", issued: "2026-02-21", status: "paid", net: 53.59 },
  { number: "XFPSSE-00036", issued: "2026-02-23", status: "paid", net: 24.05 },
  { number: "XFPSSE-00037", issued: "2026-02-24", status: "paid", net: 56.74 },
  { number: "XFPSSE-00038", issued: "2026-02-24", status: "paid", net: 54.02 },
  { number: "XFPSSE-00039", issued: "2026-02-25", status: "paid", net: 0, notes: "Pre-purchase fully covered" },
  { number: "XFPSSE-00040", issued: "2026-02-25", status: "paid", net: 0, notes: "Pre-purchase fully covered" },
  { number: "XFPSSE-00041", issued: "2026-02-25", status: "paid", net: 21.07 },
  { number: "XFPSSE-00042", issued: "2026-02-25", status: "paid", net: 0, notes: "Pre-purchase fully covered" },
  { number: "XFPSSE-00043", issued: "2026-03-07", status: "paid", net: 54.28, notes: "First invoice after 10-day Feb 25 -> Mar 7 quiet gap (pre-purchase top-up was active)" },
  { number: "XFPSSE-00044", issued: "2026-03-08", status: "paid", net: 511.68, capHit: true, spike: true, shipContext: "Comprehensive audit v2/v3: debtOutstanding bug + A=L+E identity checks + 149-test golden battery + Lucide->branded icon migration + dead-code removal + mobile layout + rollback (b6312c2c)", notes: "Second $511.68 cap-hit invoice — same exact amount as XFPSSE-00026 confirms structural Replit billing cap" },
  { number: "XFPSSE-00045", issued: "2026-03-11", status: "paid", net: 53.41 },
  { number: "XFPSSE-00046", issued: "2026-03-11", status: "paid", net: 54.39 },
  { number: "XFPSSE-00047", issued: "2026-03-12", status: "paid", net: 54.73 },
  { number: "XFPSSE-00048", issued: "2026-03-12", status: "paid", net: 55.79 },
  { number: "XFPSSE-00049", issued: "2026-03-12", status: "paid", net: 54.10 },
  { number: "XFPSSE-00050", issued: "2026-03-13", status: "paid", net: 55.53 },
  { number: "XFPSSE-00051", issued: "2026-03-13", status: "paid", net: 54.09 },
  { number: "XFPSSE-00052", issued: "2026-03-14", status: "paid", net: 72.96, notes: "Slight elevation — adjacent to icon-migration sweep" },
  { number: "XFPSSE-00053", issued: "2026-03-14", status: "paid", net: 54.02 },
  { number: "XFPSSE-00054", issued: "2026-03-14", status: "paid", net: 55.64 },
  { number: "XFPSSE-00055", issued: "2026-03-15", status: "paid", net: 53.50 },
  { number: "XFPSSE-00056", issued: "2026-03-15", status: "paid", net: 56.09 },
  { number: "XFPSSE-00057", issued: "2026-03-15", status: "paid", net: 57.43 },
  { number: "XFPSSE-00058", issued: "2026-03-15", status: "paid", net: 55.85 },
  { number: "XFPSSE-00059", issued: "2026-03-15", status: "paid", net: 0, notes: "Pre-purchase fully covered" },
  { number: "XFPSSE-00060", issued: "2026-03-15", status: "paid", net: 28.81 },
  { number: "XFPSSE-00061", issued: "2026-03-22", status: "paid", net: 53.95 },
  { number: "XFPSSE-00062", issued: "2026-03-22", status: "paid", net: 54.05 },
  { number: "XFPSSE-00063", issued: "2026-03-22", status: "paid", net: 54.04 },
  { number: "XFPSSE-00064", issued: "2026-03-22", status: "paid", net: 53.78 },
  { number: "XFPSSE-00065", issued: "2026-03-22", status: "paid", net: 53.61 },
  { number: "XFPSSE-00066", issued: "2026-03-22", status: "paid", net: 53.68 },
  { number: "XFPSSE-00067", issued: "2026-03-23", status: "paid", net: 55.47 },
  { number: "XFPSSE-00068", issued: "2026-03-23", status: "paid", net: 53.71 },
  { number: "XFPSSE-00069", issued: "2026-03-23", status: "paid", net: 55.97 },
  { number: "XFPSSE-00070", issued: "2026-03-23", status: "paid", net: 53.58 },
  { number: "XFPSSE-00071", issued: "2026-03-23", status: "paid", net: 0, notes: "Pre-purchase fully covered" },
  { number: "XFPSSE-00072", issued: "2026-03-24", status: "paid", net: 7.66, notes: "Final settlement of pre-cycle" },
  { number: "XFPSSE-00073", issued: "2026-04-16", status: "paid", net: 54.47 },
  { number: "XFPSSE-00074", issued: "2026-04-19", status: "paid", net: 266.95, gross: 297.44, spike: true, shipContext: "OT-A.4 Path A1 ship: retire legacy regex extractor; streamObject is single synthesis path (commit 7da9f25a). Budgeted $22 single-rerun.", notes: "Net $266.95; gross $297.44 per Orb portal (cycle-to-date settlement deducted from XFPSSE-DRAFT subtotal). Worst budget-to-actual variance in project: 13.5x the named $22 budget." },
  {
    number: "XFPSSE-DRAFT",
    issued: "2026-04-23",
    status: "draft",
    net: 46.05,
    gross: 2821.13,
    prePurchase: 2477.64,
    priorCredit: 297.44,
    notes: "Apr 23 cycle (Mar 23 - Apr 22). Three workspaces: H+ (e53ea481) $2,558.98 = 90.9%; medium (ff0487fd) $239.55 = 8.5%; small (9fae4009) $15.07 = 0.5%. Pre-purchase credit pool drained to $0.",
    hplusOverride: 2558.98,
  },
];

const SECONDARY_WORKSPACE_UUID = "ff0487fd-797f-433c-b449-3b8b3000efee";
const SMALL_WORKSPACE_UUID = "9fae4009-cc0c-4840-9576-ce0c5c1142c6";

function attribute(invoice: InvoiceSeed): { ratio: number; method: string; net: number; gross: number } {
  if (invoice.hplusOverride !== undefined) {
    // Override is the H+ GROSS figure from the portal line items.
    // Derive H+ NET by applying the H+/gross ratio to the cash net amount,
    // since pre-purchase / prior credits reduce all workspaces proportionally.
    const gross = invoice.gross ?? invoice.net;
    const ratio = gross > 0 ? invoice.hplusOverride / gross : 0;
    const hplusNet = Number((invoice.net * ratio).toFixed(2));
    return {
      ratio: Number(ratio.toFixed(4)),
      method: "portal_line_item_exact",
      net: hplusNet,
      gross: Number(invoice.hplusOverride.toFixed(2)),
    };
  }
  if (invoice.net === 0) {
    return { ratio: 0, method: "zero_invoice", net: 0, gross: 0 };
  }
  const ratio = invoice.spike ? SPIKE_RATIO : ROUTINE_RATIO;
  const grossBase = invoice.gross ?? invoice.net;
  return {
    ratio,
    method: invoice.spike ? "spike_day_ratio" : "routine_91pct_ratio",
    net: Number((invoice.net * ratio).toFixed(2)),
    gross: Number((grossBase * ratio).toFixed(2)),
  };
}

async function main() {
  console.log(`Seeding ${INVOICES.length} Replit invoices...`);

  let totalNet = 0;
  let totalGrossKnown = 0;
  let totalHplusNet = 0;
  let totalHplusGross = 0;
  let totalPrePurchase = 0;

  // All-or-nothing: a mid-run failure leaves the previous good state intact.
  await db.transaction(async (tx) => {
  await tx.delete(replitInvoiceLineItems);
  await tx.delete(replitInvoices);

  for (const inv of INVOICES) {
    const attrib = attribute(inv);
    totalNet += inv.net;
    totalGrossKnown += inv.gross ?? inv.net;
    totalHplusNet += attrib.net;
    totalHplusGross += attrib.gross;
    totalPrePurchase += inv.prePurchase ?? 0;

    const insert: InsertReplitInvoice = {
      invoiceNumber: inv.number,
      issuedDate: new Date(`${inv.issued}T00:00:00Z`),
      cycleStart: inv.number === "XFPSSE-DRAFT" ? new Date("2026-03-23T00:00:00Z") : null,
      cycleEnd: inv.number === "XFPSSE-DRAFT" ? new Date("2026-04-22T00:00:00Z") : null,
      status: inv.status,
      netAmount: inv.net.toFixed(2),
      grossSubtotal: inv.gross !== undefined ? inv.gross.toFixed(2) : null,
      prePurchaseApplied: inv.prePurchase !== undefined ? inv.prePurchase.toFixed(2) : null,
      priorInvoiceCredit: inv.priorCredit !== undefined ? inv.priorCredit.toFixed(2) : null,
      isCapHit: inv.capHit ?? (Math.abs(inv.net - REPLIT_CAP) < 0.01),
      isSpikeDay: inv.spike ?? false,
      shipDayContext: inv.shipContext ?? null,
      hplusAttributedNet: attrib.net.toFixed(2),
      hplusAttributedGross: attrib.gross.toFixed(2),
      hplusAttributionRatio: attrib.ratio.toFixed(4),
      attributionMethod: attrib.method,
      notes: inv.notes ?? null,
      rawJson: null,
    };

    const [row] = await tx.insert(replitInvoices).values(insert).returning();

    if (inv.number === "XFPSSE-DRAFT") {
      // Portal-line-item-exact GROSS values (before pre-purchase / prior credits).
      const lines: InsertReplitInvoiceLineItem[] = [
        {
          invoiceId: row.id,
          workspaceUuid: HPLUS_WORKSPACE_UUID,
          workspaceLabel: "H+ Analytics (LB-Hospitality)",
          unitsBilled: "2558.979447",
          unitPrice: "1.0000",
          amount: "2558.98",
          amountBasis: "gross",
          isHplusWorkspace: true,
          source: "portal_line_item",
        },
        {
          invoiceId: row.id,
          workspaceUuid: SECONDARY_WORKSPACE_UUID,
          workspaceLabel: "Secondary workspace",
          unitsBilled: "239.552061",
          unitPrice: "1.0000",
          amount: "239.55",
          amountBasis: "gross",
          isHplusWorkspace: false,
          source: "portal_line_item",
        },
        {
          invoiceId: row.id,
          workspaceUuid: SMALL_WORKSPACE_UUID,
          workspaceLabel: "Small/inactive workspace",
          unitsBilled: "15.065747",
          unitPrice: "1.0000",
          amount: "15.07",
          amountBasis: "gross",
          isHplusWorkspace: false,
          source: "portal_line_item",
        },
      ];
      await tx.insert(replitInvoiceLineItems).values(lines);
    } else if (inv.net > 0) {
      // Ratio-estimated NET values (the cash actually invoiced).
      const lines: InsertReplitInvoiceLineItem[] = [
        {
          invoiceId: row.id,
          workspaceUuid: HPLUS_WORKSPACE_UUID,
          workspaceLabel: "H+ Analytics (LB-Hospitality)",
          unitsBilled: attrib.net.toFixed(6),
          unitPrice: "1.0000",
          amount: attrib.net.toFixed(2),
          amountBasis: "net",
          isHplusWorkspace: true,
          source: inv.spike ? "ratio_estimate_spike_95pct" : "ratio_estimate_routine_91pct",
        },
      ];
      const remainder = Number((inv.net - attrib.net).toFixed(2));
      if (remainder > 0) {
        lines.push({
          invoiceId: row.id,
          workspaceUuid: "other_unattributed",
          workspaceLabel: "Other workspaces (estimated remainder)",
          unitsBilled: remainder.toFixed(6),
          unitPrice: "1.0000",
          amount: remainder.toFixed(2),
          amountBasis: "net",
          isHplusWorkspace: false,
          source: inv.spike ? "ratio_estimate_spike_5pct" : "ratio_estimate_routine_9pct",
        });
      }
      await tx.insert(replitInvoiceLineItems).values(lines);
    }
  }
  });

  console.log("");
  console.log("Done. Project-life totals:");
  console.log(`  Invoices loaded:           ${INVOICES.length}`);
  console.log(`  Total net invoiced (cash): $${totalNet.toFixed(2)}`);
  console.log(`  Total gross usage:         $${totalGrossKnown.toFixed(2)}`);
  console.log(`  Pre-purchase drawn down:   $${totalPrePurchase.toFixed(2)} (Apr cycle confirmed only)`);
  console.log(`  H+ attributed net (cash):  $${totalHplusNet.toFixed(2)}`);
  console.log(`  H+ attributed gross:       $${totalHplusGross.toFixed(2)}`);
  console.log(`  H+ % of total cash:        ${((totalHplusNet / totalNet) * 100).toFixed(1)}%`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
