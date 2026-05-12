/**
 * icp-brackets-002 — Normalise bracket_mix persisted shape to BracketMixData.
 *
 * Task #1486 — Both writers now emit BracketMixData
 * ({ entries: BracketEntry[], assignedAt?, evidence? }). This migration
 * converts any existing global_assumptions rows where bracket_mix was
 * persisted in the old flat-array shape ([ { bracketSlug, weight } ])
 * to the canonical BracketMixData shape.
 *
 * Idempotent: rows that are already BracketMixData (jsonb_typeof = 'object')
 * or NULL are left unchanged.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-brackets-002";

interface FlatMixEntry {
  bracketSlug: string;
  weight: number;
}

interface BracketRow {
  slug: string;
  name: string;
  archetype_label: string;
  customer_type: string;
}

export async function runIcpBrackets002(): Promise<void> {
  // Find rows where bracket_mix is still the old flat-array format.
  const legacyRows = await db.execute(sql`
    SELECT id, bracket_mix
    FROM global_assumptions
    WHERE bracket_mix IS NOT NULL
      AND jsonb_typeof(bracket_mix) = 'array'
  `);

  if (legacyRows.rows.length === 0) {
    logger.info(`${TAG} no legacy flat-array bracket_mix rows found — nothing to migrate`);
    return;
  }

  logger.info(`${TAG} found ${legacyRows.rows.length} row(s) with legacy flat-array bracket_mix — converting`);

  // Load the full icp_brackets catalog once for metadata lookup.
  const catalogRows = await db.execute(sql`
    SELECT slug, name, archetype_label, customer_type
    FROM icp_brackets
  `);

  const bracketBySlug = new Map<string, BracketRow>(
    catalogRows.rows.map((r) => {
      const row = r as unknown as BracketRow;
      return [row.slug, row];
    }),
  );

  let converted = 0;
  for (const row of legacyRows.rows) {
    const rawRow = row as { id: number; bracket_mix: unknown };
    const flatMix = rawRow.bracket_mix as FlatMixEntry[];

    if (!Array.isArray(flatMix) || flatMix.length === 0) continue;

    const entries = flatMix.map((e) => {
      const bracket = bracketBySlug.get(e.bracketSlug);
      return {
        id: e.bracketSlug,
        name: bracket?.name ?? e.bracketSlug,
        archetypeLabel: bracket?.archetype_label ?? e.bracketSlug,
        serviceConsumption: bracket?.customer_type ?? "hotel",
        weight: e.weight,
        rationale: "Migrated from catalog-API flat format (icp-brackets-002).",
      };
    });

    const newMix = {
      entries,
      assignedAt: new Date().toISOString(),
      evidence: "Migrated from catalog-API flat format by icp-brackets-002.",
    };

    await db.execute(sql`
      UPDATE global_assumptions
      SET bracket_mix = ${JSON.stringify(newMix)}::jsonb
      WHERE id = ${rawRow.id}
    `);

    converted++;
  }

  logger.info(`${TAG} converted ${converted} row(s) to canonical BracketMixData shape`);
}
