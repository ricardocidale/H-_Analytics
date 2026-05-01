/**
 * Replit billing telemetry — INTERNAL DEV TOOLING.
 *
 * These tables live in the `dev_internal` Postgres schema, not `public`.
 * They record Replit invoice + line-item history for the H+ Analytics
 * project so we can reconcile spend against ship milestones. They are
 * NOT part of the application's data model — no server route, client
 * query, or engine calc references them.
 *
 * This file is intentionally not re-exported from `shared/schema/index.ts`
 * so the main-app barrel can never pull these types into app code.
 * Dev scripts import directly: `import { replitInvoices } from "@workspace/db"`.
 */

import { pgSchema, text, integer, timestamp, numeric, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

export const HPLUS_WORKSPACE_UUID = "e53ea481-4c36-4e2a-8bfc-80697f311b65" as const;

const devInternal = pgSchema("dev_internal");

export const replitInvoices = devInternal.table("replit_invoices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceNumber: text("invoice_number").notNull(),
  issuedDate: timestamp("issued_date", { mode: "date" }).notNull(),
  cycleStart: timestamp("cycle_start", { mode: "date" }),
  cycleEnd: timestamp("cycle_end", { mode: "date" }),
  status: text("status").notNull(),
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }).notNull(),
  grossSubtotal: numeric("gross_subtotal", { precision: 10, scale: 2 }),
  prePurchaseApplied: numeric("pre_purchase_applied", { precision: 10, scale: 2 }),
  priorInvoiceCredit: numeric("prior_invoice_credit", { precision: 10, scale: 2 }),
  isCapHit: boolean("is_cap_hit").notNull().default(false),
  isSpikeDay: boolean("is_spike_day").notNull().default(false),
  shipDayContext: text("ship_day_context"),
  hplusAttributedNet: numeric("hplus_attributed_net", { precision: 10, scale: 2 }).notNull(),
  hplusAttributedGross: numeric("hplus_attributed_gross", { precision: 10, scale: 2 }).notNull(),
  hplusAttributionRatio: numeric("hplus_attribution_ratio", { precision: 5, scale: 4 }).notNull(),
  attributionMethod: text("attribution_method").notNull(),
  notes: text("notes"),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("replit_invoices_invoice_number_idx").on(table.invoiceNumber),
  index("replit_invoices_issued_date_idx").on(table.issuedDate),
  index("replit_invoices_is_spike_day_idx").on(table.isSpikeDay),
]);

export const replitInvoiceLineItems = devInternal.table("replit_invoice_line_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  invoiceId: integer("invoice_id").notNull().references(() => replitInvoices.id, { onDelete: "cascade" }),
  workspaceUuid: text("workspace_uuid").notNull(),
  workspaceLabel: text("workspace_label"),
  unitsBilled: numeric("units_billed", { precision: 14, scale: 6 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  amountBasis: text("amount_basis").notNull(),
  isHplusWorkspace: boolean("is_hplus_workspace").notNull().default(false),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("replit_invoice_line_items_invoice_id_idx").on(table.invoiceId),
  index("replit_invoice_line_items_workspace_uuid_idx").on(table.workspaceUuid),
  index("replit_invoice_line_items_is_hplus_idx").on(table.isHplusWorkspace),
]);

export type ReplitInvoice = typeof replitInvoices.$inferSelect;
export type InsertReplitInvoice = typeof replitInvoices.$inferInsert;

export type ReplitInvoiceLineItem = typeof replitInvoiceLineItems.$inferSelect;
export type InsertReplitInvoiceLineItem = typeof replitInvoiceLineItems.$inferInsert;
