/**
 * ModelCanonicalsStorage — DB layer for the canonical authority table.
 *
 * Reads/writes only. Resolution math (canonical + override layering) lives in
 * `shared/get-effective-constant.ts` so it can be re-used on the client.
 *
 * Distinct from `ModelConstantsStorage` which writes the *override* table.
 * This table holds the *baseline* every property starts from — sourced from
 * authorities like IRS § 168, Damodaran CRP, country tax codes.
 *
 * Concurrency: writes use `onConflictDoUpdate` against the unique
 * (constant_key, country, country_subdivision) tuple so two parallel admin
 * edits cannot race into a duplicate-key error.
 *
 * NULL semantics: Postgres treats NULLs as DISTINCT in standard unique
 * indexes, so universal/country-level rows (where one or both locality
 * columns are NULL) are upserted via an explicit pre-find emulation of
 * "NULLS NOT DISTINCT" — same pattern as the override storage.
 */

import { db } from "../db";
import { and, eq, isNull, asc, sql } from "drizzle-orm";
import {
  modelConstants,
  type ModelConstant,
  type InsertModelConstant,
} from "@shared/schema";

export class ModelCanonicalsStorage {
  /**
   * Return all canonical rows, optionally filtered by constantKey.
   * Loaded once per request by the admin GET route and the runtime resolver
   * so layering math stays pure.
   */
  async listCanonicals(filter?: { constantKey?: string }): Promise<ModelConstant[]> {
    if (filter?.constantKey) {
      return db
        .select()
        .from(modelConstants)
        .where(eq(modelConstants.constantKey, filter.constantKey))
        .orderBy(asc(modelConstants.country), asc(modelConstants.countrySubdivision));
    }
    return db
      .select()
      .from(modelConstants)
      .orderBy(
        asc(modelConstants.constantKey),
        asc(modelConstants.country),
        asc(modelConstants.countrySubdivision),
      );
  }

  /** Find the canonical row at an exact locality (used to update-or-insert). */
  async findCanonical(
    key: string,
    country: string | null,
    subdivision: string | null,
  ): Promise<ModelConstant | undefined> {
    const conds = [
      eq(modelConstants.constantKey, key),
      country === null ? isNull(modelConstants.country) : eq(modelConstants.country, country),
      subdivision === null
        ? isNull(modelConstants.countrySubdivision)
        : eq(modelConstants.countrySubdivision, subdivision),
    ];
    const [row] = await db.select().from(modelConstants).where(and(...conds));
    return row ?? undefined;
  }

  /**
   * Upsert a canonical row at the given locality. Used by the seed script
   * and (Phase 4) the admin "Edit canonical" UI.
   */
  async upsertCanonical(data: InsertModelConstant): Promise<ModelConstant> {
    const country = data.country ?? null;
    const subdivision = data.countrySubdivision ?? null;

    // Pre-find emulation for the NULL-distinct cases (universal + country-only).
    if (country === null || subdivision === null) {
      const existing = await this.findCanonical(data.constantKey, country, subdivision);
      if (existing) {
        const [updated] = await db
          .update(modelConstants)
          .set({
            value: data.value,
            unit: data.unit ?? null,
            authoritySource: data.authoritySource,
            authorityRef: data.authorityRef ?? null,
            effectiveFrom: data.effectiveFrom ?? null,
            notes: data.notes ?? null,
            lastEditedBy: data.lastEditedBy ?? null,
            lastEditedAt: new Date(),
          })
          .where(eq(modelConstants.id, existing.id))
          .returning();
        return updated;
      }
    }

    const [row] = await db
      .insert(modelConstants)
      .values({
        constantKey: data.constantKey,
        country,
        countrySubdivision: subdivision,
        value: data.value,
        unit: data.unit ?? null,
        authoritySource: data.authoritySource,
        authorityRef: data.authorityRef ?? null,
        effectiveFrom: data.effectiveFrom ?? null,
        notes: data.notes ?? null,
        lastEditedBy: data.lastEditedBy ?? null,
      })
      .onConflictDoUpdate({
        target: [
          modelConstants.constantKey,
          modelConstants.country,
          modelConstants.countrySubdivision,
        ],
        set: {
          value: data.value,
          unit: data.unit ?? null,
          authoritySource: data.authoritySource,
          authorityRef: data.authorityRef ?? null,
          effectiveFrom: data.effectiveFrom ?? null,
          notes: data.notes ?? null,
          lastEditedBy: data.lastEditedBy ?? null,
          lastEditedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  /** Remove a canonical row at the given locality. Rare — usually only seed deletions. */
  async deleteCanonical(
    key: string,
    country: string | null,
    subdivision: string | null,
  ): Promise<void> {
    const conds = [
      eq(modelConstants.constantKey, key),
      country === null ? isNull(modelConstants.country) : eq(modelConstants.country, country),
      subdivision === null
        ? isNull(modelConstants.countrySubdivision)
        : eq(modelConstants.countrySubdivision, subdivision),
    ];
    await db.delete(modelConstants).where(and(...conds));
  }
}
