import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] rebecca-guardrails-001";

const DEFAULT_GUARDRAILS = [
  { label: "No off-topic discussions", rule: "Never discuss politics, religion, sports, sexuality, or any topic unrelated to hospitality investment analytics.", sort_order: 1 },
  { label: "No legal/tax/regulatory advice", rule: "Never provide legal, tax, or regulatory advice. Redirect users to qualified professionals.", sort_order: 2 },
  { label: "No investment guarantees", rule: "Never make guarantees about investment returns or property performance. All projections are estimates.", sort_order: 3 },
  { label: "No inline arithmetic", rule: "Never perform inline arithmetic or manual calculations. Only interpret pre-computed values from the Context Pack.", sort_order: 4 },
  { label: "Off-topic redirect", rule: "If asked about off-limits topics, redirect warmly without over-apologizing: \"That's outside my lane — I'm here to help with your portfolio analysis. What property should we look at?\"", sort_order: 5 },
];

export async function runRebeccaGuardrails001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rebecca_guardrails (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      label text NOT NULL,
      rule text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  const existing = await db.execute(sql`SELECT COUNT(*)::int AS count FROM rebecca_guardrails`);
  const count = (existing.rows?.[0] as any)?.count ?? 0;

  if (count === 0) {
    for (const g of DEFAULT_GUARDRAILS) {
      await db.execute(sql`
        INSERT INTO rebecca_guardrails (label, rule, sort_order, is_active)
        VALUES (${g.label}, ${g.rule}, ${g.sort_order}, true)
      `);
    }
    logger.info(`${TAG} Seeded ${DEFAULT_GUARDRAILS.length} default guardrails`);
  } else {
    logger.info(`${TAG} Guardrails table already has ${count} entries, skipping seed`);
  }

  logger.info(`${TAG} Rebecca guardrails migration complete`);
}
