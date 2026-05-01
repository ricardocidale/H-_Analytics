/**
 * Per-Specialist research-quality snapshots (Task #500).
 *
 * Append-only history: every recompute writes a new row. Reads always go
 * through `getLatestQualitySnapshot` (or the bulk variant), which sorts by
 * computedAt DESC. The `signals` JSON captures the raw inputs to the score
 * so reviewers can audit the formula without re-querying every source.
 */
import { db } from "../../db";
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  specialistResearchQualitySnapshots,
  type QualityGap,
  type SpecialistResearchQualitySnapshotRow,
} from "@shared/schema";

export interface RecordQualitySnapshotInput {
  specialistId: string;
  score: number;
  gaps: QualityGap[];
  signals: Record<string, unknown>;
}

export class AdminResourceQualitySnapshotsStorage {
  async recordQualitySnapshot(
    input: RecordQualitySnapshotInput,
  ): Promise<SpecialistResearchQualitySnapshotRow> {
    const score = Math.max(0, Math.min(100, Math.round(input.score)));
    const [row] = await db
      .insert(specialistResearchQualitySnapshots)
      .values({
        specialistId: input.specialistId,
        score,
        gaps: input.gaps,
        signals: input.signals,
      })
      .returning();
    return row;
  }

  async getLatestQualitySnapshot(
    specialistId: string,
  ): Promise<SpecialistResearchQualitySnapshotRow | undefined> {
    const [row] = await db
      .select()
      .from(specialistResearchQualitySnapshots)
      .where(eq(specialistResearchQualitySnapshots.specialistId, specialistId))
      .orderBy(desc(specialistResearchQualitySnapshots.computedAt))
      .limit(1);
    return row || undefined;
  }

  /**
   * One-shot bulk read used by the Resources transparency surfaces. Returns
   * the most-recent snapshot for each specialistId in a single query via
   * DISTINCT ON. Specialists with no snapshot yet are simply absent.
   */
  async getLatestQualitySnapshotsFor(
    specialistIds: string[],
  ): Promise<Map<string, SpecialistResearchQualitySnapshotRow>> {
    const out = new Map<string, SpecialistResearchQualitySnapshotRow>();
    if (specialistIds.length === 0) return out;
    const rows = await db
      .select()
      .from(specialistResearchQualitySnapshots)
      .where(inArray(specialistResearchQualitySnapshots.specialistId, specialistIds))
      .orderBy(
        specialistResearchQualitySnapshots.specialistId,
        desc(specialistResearchQualitySnapshots.computedAt),
      );
    for (const r of rows) {
      if (!out.has(r.specialistId)) out.set(r.specialistId, r);
    }
    return out;
  }

  async listQualitySnapshotHistory(
    specialistId: string,
    limit = 20,
  ): Promise<SpecialistResearchQualitySnapshotRow[]> {
    return db
      .select()
      .from(specialistResearchQualitySnapshots)
      .where(eq(specialistResearchQualitySnapshots.specialistId, specialistId))
      .orderBy(desc(specialistResearchQualitySnapshots.computedAt))
      .limit(limit);
  }

  /**
   * Bulk variant of `listQualitySnapshotHistory` (Task #555).
   *
   * Returns the most-recent N snapshots for each specialistId as a single
   * map keyed by specialistId. Implemented with `ROW_NUMBER() OVER
   * (PARTITION BY specialist_id ORDER BY computed_at DESC)` so the whole
   * fan-out is one round trip — collapses the previous N×per-row queries
   * the Resource detail dialog issued (one per consumer) down to one,
   * which matters when a shared LLM resource is consumed by ~20
   * specialists. Each row order matches the per-specialist endpoint:
   * DESC by computedAt; the route flips to chronological for charting.
   *
   * Specialists with no snapshots get an empty array entry so callers
   * can render an "empty" state without an extra existence check.
   */
  async listQualitySnapshotHistoryForMany(
    specialistIds: string[],
    limit = 30,
  ): Promise<Map<string, SpecialistResearchQualitySnapshotRow[]>> {
    const out = new Map<string, SpecialistResearchQualitySnapshotRow[]>();
    if (specialistIds.length === 0) return out;
    for (const sid of specialistIds) out.set(sid, []);

    const sub = db
      .select({
        id: specialistResearchQualitySnapshots.id,
        specialistId: specialistResearchQualitySnapshots.specialistId,
        score: specialistResearchQualitySnapshots.score,
        gaps: specialistResearchQualitySnapshots.gaps,
        signals: specialistResearchQualitySnapshots.signals,
        computedAt: specialistResearchQualitySnapshots.computedAt,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${specialistResearchQualitySnapshots.specialistId} ORDER BY ${specialistResearchQualitySnapshots.computedAt} DESC)`.as(
          "rn",
        ),
      })
      .from(specialistResearchQualitySnapshots)
      .where(inArray(specialistResearchQualitySnapshots.specialistId, specialistIds))
      .as("t");

    const rows = await db
      .select({
        id: sub.id,
        specialistId: sub.specialistId,
        score: sub.score,
        gaps: sub.gaps,
        signals: sub.signals,
        computedAt: sub.computedAt,
      })
      .from(sub)
      .where(sql`${sub.rn} <= ${limit}`)
      .orderBy(sub.specialistId, desc(sub.computedAt));

    for (const r of rows) {
      const arr = out.get(r.specialistId);
      if (!arr) continue;
      arr.push(r as SpecialistResearchQualitySnapshotRow);
    }
    return out;
  }

  /**
   * Used by the system-gaps banner. Returns aggregate stats plus the list
   * of specialists currently scoring below 70 so the banner can render
   * jump-targets to each offender (sorted ascending by score).
   */
  async aggregateLatestQualityScores(): Promise<{
    avg: number | null;
    below70: number;
    total: number;
    below70List: Array<{ specialistId: string; score: number }>;
  }> {
    const rows = await db.execute(sql`
      SELECT specialist_id, score
      FROM (
        SELECT specialist_id, score,
               ROW_NUMBER() OVER (PARTITION BY specialist_id ORDER BY computed_at DESC) AS rn
        FROM specialist_research_quality_snapshots
      ) t
      WHERE rn = 1
    `);
    const list = (rows.rows as Array<{ specialist_id: string; score: number }>);
    if (list.length === 0) return { avg: null, below70: 0, total: 0, below70List: [] };
    const total = list.length;
    const avg = Math.round(list.reduce((s, r) => s + Number(r.score), 0) / total);
    const below = list
      .filter((r) => Number(r.score) < 70)
      .map((r) => ({ specialistId: r.specialist_id, score: Number(r.score) }))
      .sort((a, b) => a.score - b.score);
    return { avg, below70: below.length, total, below70List: below };
  }
}
