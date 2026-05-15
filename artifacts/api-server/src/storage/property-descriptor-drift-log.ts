/**
 * Storage for `property_descriptor_drift_log` (Plan 2026-05-13-002, Unit U1).
 *
 * Two operations:
 *   - `recordDescriptorDriftEvents` — bulk-insert one row per drifted field.
 *     Called from PATCH /api/properties/:id after `detectDescriptorDrift`
 *     surfaces any divergence between typed columns and the JSONB mirrors.
 *   - `getDescriptorDriftWindowSummary` — sliding-window probe used by the
 *     Unit U8 cleanup gate. Returns `{ count, lastSeenAt }` over the last
 *     `sinceDays` days. `count = 0` is the green-light signal.
 */
import { db } from "../db";
import {
  propertyDescriptorDriftLog,
  type PropertyDescriptorDriftSide,
  type DescriptorDriftWindowSummary,
} from "@workspace/db";
import { gte, sql } from "drizzle-orm";

export interface DescriptorDriftEventInput {
  propertyId: number;
  fieldKey: string;
  side: PropertyDescriptorDriftSide;
  typedValue: unknown;
  jsonbValue: unknown;
}

export interface PropertyDescriptorDriftLogStorage {
  recordDescriptorDriftEvents(events: DescriptorDriftEventInput[]): Promise<void>;
  getDescriptorDriftWindowSummary(
    sinceDays: number,
  ): Promise<DescriptorDriftWindowSummary>;
}

export class PropertyDescriptorDriftLogStorageImpl
  implements PropertyDescriptorDriftLogStorage
{
  async recordDescriptorDriftEvents(
    events: DescriptorDriftEventInput[],
  ): Promise<void> {
    if (events.length === 0) return;
    await db.insert(propertyDescriptorDriftLog).values(
      events.map((e) => ({
        propertyId: e.propertyId,
        fieldKey: e.fieldKey,
        side: e.side,
        // jsonb columns accept any JSON-serializable value; cast unknowns
        // through JSON to drop functions/symbols and normalize undefined→null.
        typedValue: e.typedValue === undefined ? null : (e.typedValue as never),
        jsonbValue: e.jsonbValue === undefined ? null : (e.jsonbValue as never),
      })),
    );
  }

  async getDescriptorDriftWindowSummary(
    sinceDays: number,
  ): Promise<DescriptorDriftWindowSummary> {
    if (!Number.isFinite(sinceDays) || sinceDays <= 0) {
      throw new Error(
        `getDescriptorDriftWindowSummary: sinceDays must be a positive finite number, got ${sinceDays}`,
      );
    }
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        count: sql<number>`count(*)::int`,
        lastSeenAt: sql<Date | null>`max(${propertyDescriptorDriftLog.createdAt})`,
      })
      .from(propertyDescriptorDriftLog)
      .where(gte(propertyDescriptorDriftLog.createdAt, cutoff));
    const row = rows[0];
    return {
      count: row?.count ?? 0,
      lastSeenAt: row?.lastSeenAt ?? null,
    };
  }
}
