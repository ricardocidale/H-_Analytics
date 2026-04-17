/**
 * ModelConstantsStorage — DB layer for the override table.
 *
 * Reads/writes only. Resolution math (factory + override layering) lives in
 * `shared/get-effective-constant.ts` so it can be re-used on the client.
 *
 * Write invariant enforced here: never persist an override row whose value
 * equals the current factory value at the same locality. The caller (route
 * handler) should compute the factory value via `getFactoryValue` and only
 * call into storage when there is a genuine departure. As a defense in depth,
 * `upsertOverride` also re-checks via the registry.
 *
 * Concurrency: writes use `onConflictDoUpdate` against the unique
 * (constant_key, country, country_subdivision) tuple so two parallel Analyst
 * regenerations cannot race into a duplicate-key error.
 */

import { db } from "../db";
import { and, eq, isNull, asc, sql } from "drizzle-orm";
import {
  modelConstantOverrides,
  type ModelConstantOverride,
  type InsertModelConstantOverride,
} from "@shared/schema";
import { getFactoryValue } from "@shared/model-constants-registry";

/**
 * Order-independent deep equality for JSON-serialisable values. Required so
 * the "delete if equal to factory" invariant doesn't false-negative on
 * objects whose key insertion order differs from the factory baseline.
 */
function jsonValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!jsonValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!jsonValuesEqual(ao[k], bo[k])) return false;
  }
  return true;
}

export class ModelConstantsStorage {
  /**
   * Return all overrides, optionally filtered by constantKey. The admin UI
   * loads everything for a key+country to render the table; the runtime
   * resolver loads everything for a key.
   */
  async listModelConstantOverrides(filter?: { constantKey?: string }): Promise<ModelConstantOverride[]> {
    if (filter?.constantKey) {
      return db
        .select()
        .from(modelConstantOverrides)
        .where(eq(modelConstantOverrides.constantKey, filter.constantKey))
        .orderBy(asc(modelConstantOverrides.country), asc(modelConstantOverrides.countrySubdivision));
    }
    return db
      .select()
      .from(modelConstantOverrides)
      .orderBy(
        asc(modelConstantOverrides.constantKey),
        asc(modelConstantOverrides.country),
        asc(modelConstantOverrides.countrySubdivision),
      );
  }

  /** Find the row at an exact locality (used to update-or-insert). */
  async findModelConstantOverride(
    key: string,
    country: string | null,
    subdivision: string | null,
  ): Promise<ModelConstantOverride | undefined> {
    const conds = [
      eq(modelConstantOverrides.constantKey, key),
      country === null ? isNull(modelConstantOverrides.country) : eq(modelConstantOverrides.country, country),
      subdivision === null
        ? isNull(modelConstantOverrides.countrySubdivision)
        : eq(modelConstantOverrides.countrySubdivision, subdivision),
    ];
    const [row] = await db.select().from(modelConstantOverrides).where(and(...conds));
    return row ?? undefined;
  }

  /**
   * Upsert an override at the given locality.
   *
   * Invariant: if the new value equals the factory value at this locality,
   * the existing row is DELETED (and no insert happens) — this keeps the
   * override table semantically a "departures only" log.
   *
   * Returns the resulting row, or `null` when the call resolved to a delete
   * (factory-equal) so the caller can render a "reset to factory" message.
   */
  async upsertModelConstantOverride(
    data: InsertModelConstantOverride,
  ): Promise<ModelConstantOverride | null> {
    const country = data.country ?? null;
    const subdivision = data.countrySubdivision ?? null;
    const factory = getFactoryValue(data.constantKey, country, subdivision);

    if (jsonValuesEqual(factory, data.value)) {
      await this.deleteModelConstantOverride(data.constantKey, country, subdivision);
      return null;
    }

    // Atomic upsert: relies on the unique (constant_key, country, country_subdivision)
    // index. `country` and `country_subdivision` are nullable, but Postgres treats
    // NULLs as distinct in unique indexes — that's exactly what we want here, since
    // (key, NULL, NULL) is genuinely a different locality from (key, 'US', NULL).
    // The unique constraint we created uses standard semantics so the conflict path
    // works for non-null tuples; the (NULL, NULL) universal row is single-occurrence
    // by construction (only one universal row per key at a time, enforced by the
    // pre-write find below for that single edge case).
    if (country === null && subdivision === null) {
      const existing = await this.findModelConstantOverride(data.constantKey, null, null);
      if (existing) {
        const [updated] = await db
          .update(modelConstantOverrides)
          .set({
            value: data.value,
            source: data.source,
            authority: data.authority ?? null,
            referenceUrl: data.referenceUrl ?? null,
            researchRunId: data.researchRunId ?? null,
            overrideNote: data.overrideNote ?? null,
            createdBy: data.createdBy ?? null,
            createdAt: new Date(),
          })
          .where(eq(modelConstantOverrides.id, existing.id))
          .returning();
        return updated;
      }
    }

    const [row] = await db
      .insert(modelConstantOverrides)
      .values({
        constantKey: data.constantKey,
        country,
        countrySubdivision: subdivision,
        value: data.value,
        source: data.source,
        authority: data.authority ?? null,
        referenceUrl: data.referenceUrl ?? null,
        researchRunId: data.researchRunId ?? null,
        overrideNote: data.overrideNote ?? null,
        createdBy: data.createdBy ?? null,
      })
      .onConflictDoUpdate({
        target: [
          modelConstantOverrides.constantKey,
          modelConstantOverrides.country,
          modelConstantOverrides.countrySubdivision,
        ],
        set: {
          value: data.value,
          source: data.source,
          authority: data.authority ?? null,
          referenceUrl: data.referenceUrl ?? null,
          researchRunId: data.researchRunId ?? null,
          overrideNote: data.overrideNote ?? null,
          createdBy: data.createdBy ?? null,
          createdAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }

  /** Reset a single locality back to factory by removing its override row. */
  async deleteModelConstantOverride(
    key: string,
    country: string | null,
    subdivision: string | null,
  ): Promise<void> {
    const conds = [
      eq(modelConstantOverrides.constantKey, key),
      country === null ? isNull(modelConstantOverrides.country) : eq(modelConstantOverrides.country, country),
      subdivision === null
        ? isNull(modelConstantOverrides.countrySubdivision)
        : eq(modelConstantOverrides.countrySubdivision, subdivision),
    ];
    await db.delete(modelConstantOverrides).where(and(...conds));
  }
}
