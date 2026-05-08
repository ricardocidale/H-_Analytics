/**
 * Intelligence Resources transparency hub (Task #500).
 *
 * These routes power the per-tab "Used by / Working / Quality" columns,
 * the gaps banner, and the per-resource detail page that answers:
 *
 *   • What is this resource?
 *   • Which Specialists consume it?
 *   • Is it healthy right now?
 *   • How good is the research it powers?
 *
 * No mocked numbers — every value is derived from `admin_resources`,
 * `specialist_assignments`, `resource_health_checks`, `research_runs`,
 * and the new `specialist_research_quality_snapshots` table. Computation
 * lives in `server/ai/research-quality.ts`; these routes are read/orchestrate
 * shells.
 *
 * Route ordering: registered BEFORE `/api/admin/resources/:id` (in
 * `index.ts`) so the static path segments are not swallowed by the
 * numeric-id catch-all. The fixed-path endpoints declared here use words
 * (`transparency`, `gaps`) that cannot collide with positive integers.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, zodErrorMessage } from "../helpers";
import {
  ResourceKindSchema,
  type ResourceKind,
  type ProbeStatus,
  toResourcePublicView,
  deriveHealthStatus,
  type QualityGap,
} from "@workspace/db";
import {
  getSpecialistById,
  SPECIALIST_CATALOG,
} from "@engine/analyst/registry/specialist-catalog";
import { specialistDisplayName } from "@workspace/db";
import { recomputeAndRecordSpecialistQuality } from "../../ai/research-quality";
import { logger, formatError } from "../../logger";
import type { SpecialistResearchQualitySnapshotRow } from "@workspace/db";

const listQuerySchema = z.object({ kind: (ResourceKindSchema as any).optional() });
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const QUALITY_TTL_MS = 6 * 60 * 60 * 1000; // 6h: snapshots auto-recompute on read.

interface ConsumerRow {
  specialistId: string;
  specialistName: string;
  letter: string | null;
  required: boolean;
  role: string | null;
  qualityScore: number | null;
  qualityGaps: QualityGap[];
  qualityComputedAt: string | null;
}

async function loadConsumersForResource(resourceId: number): Promise<ConsumerRow[]> {
  const impact = await storage.listResourceImpact(resourceId);
  const specialistIds = Array.from(new Set(impact.map((i) => i.specialistId)));
  const snapshots = await storage.getLatestQualitySnapshotsFor(specialistIds);

  return impact.map((entry) => {
    const def = getSpecialistById(entry.specialistId);
    const snap = snapshots.get(entry.specialistId);
    return {
      specialistId: entry.specialistId,
      specialistName: def ? specialistDisplayName(def) : entry.specialistId,
      letter: def?.letter ?? null,
      required: entry.required,
      role: entry.assignmentRole,
      qualityScore: snap?.score ?? null,
      qualityGaps: (snap?.gaps as QualityGap[] | undefined) ?? [],
      qualityComputedAt: snap?.computedAt ? new Date(snap.computedAt).toISOString() : null,
    };
  });
}

/**
 * Resource-level aggregate trend (Task #563).
 *
 * Collapses every consumer's per-snapshot history into one daily series
 * showing how the *resource* is trending overall — answering "is this
 * resource trending up or down?" in one glance, instead of forcing ops
 * users to scan a stack of per-consumer sparklines.
 *
 * Algorithm:
 *   1. Bucket each consumer's snapshots by UTC date (latest snapshot per
 *      day wins, since later writes overwrite earlier ones in the map).
 *   2. Walk the union of dates chronologically, carrying each consumer's
 *      last known score forward — a consumer whose score didn't change on
 *      day D should still contribute its most recent value to day D's
 *      aggregate (we want "as-of state of the resource on day D", not
 *      "did anything happen for this consumer on day D").
 *   3. For each date, compute avg + min across the carry-forward scores.
 *
 * `score` is the avg so the shared QualityHistoryChart (which only reads
 * `score`) renders the average line directly with band coloring; `min`
 * and `consumerCount` ride along for the tooltip / future use.
 *
 * Returns `[]` when there are no consumers or no snapshots — the chart
 * already handles the empty/single-point fallback.
 */
interface ResourceAggregatePoint {
  score: number;
  min: number;
  consumerCount: number;
  computedAt: string;
}

function computeResourceAggregateTrend(
  historyMap: Map<string, SpecialistResearchQualitySnapshotRow[]>,
  consumerIds: string[],
): { points: ResourceAggregatePoint[] } {
  if (consumerIds.length === 0) return { points: [] };

  const datesAcrossConsumers = new Set<string>();
  const perConsumerByDate = new Map<string, Map<string, number>>();
  for (const sid of consumerIds) {
    const m = new Map<string, number>();
    perConsumerByDate.set(sid, m);
    const snaps = historyMap.get(sid) ?? [];
    // Sort ascending by computedAt so later writes overwrite earlier ones,
    // leaving each date's value = the most recent snapshot of that day.
    const sorted = [...snaps].sort(
      (a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    );
    for (const s of sorted) {
      const d = new Date(s.computedAt).toISOString().slice(0, 10);
      m.set(d, s.score);
      datesAcrossConsumers.add(d);
    }
  }
  if (datesAcrossConsumers.size === 0) return { points: [] };

  const sortedDates = Array.from(datesAcrossConsumers).sort();
  const lastSeen = new Map<string, number>();
  const points: ResourceAggregatePoint[] = [];
  for (const d of sortedDates) {
    for (const sid of consumerIds) {
      const m = perConsumerByDate.get(sid);
      if (m && m.has(d)) lastSeen.set(sid, m.get(d) as number);
    }
    if (lastSeen.size === 0) continue; // no consumer has reported yet
    const scores = Array.from(lastSeen.values());
    const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
    const min = Math.min(...scores);
    points.push({
      score: avg,
      min,
      consumerCount: scores.length,
      computedAt: new Date(`${d}T00:00:00.000Z`).toISOString(),
    });
  }
  return { points };
}

function aggregateQuality(consumers: ConsumerRow[]): { avg: number | null; min: number | null; criticalGaps: number } {
  const scores = consumers.map((c) => c.qualityScore).filter((s): s is number => typeof s === "number");
  const avg = scores.length > 0 ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
  const min = scores.length > 0 ? Math.min(...scores) : null;
  const criticalGaps = consumers.reduce(
    (s, c) => s + c.qualityGaps.filter((g) => g.severity === "critical").length,
    0,
  );
  return { avg, min, criticalGaps };
}

export function registerResourceTransparencyRoutes(app: Express) {
  // ── Enriched per-tab list (Used by / Working / Quality) ─────────
  // Single round-trip per tab. Returns the resource public view plus
  // consumer-derived columns, so the table renders without the prior
  // N×health + N×consumers fan-out.
  app.get("/api/admin/resources/transparency", requireAdmin, async (req, res) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: zodErrorMessage(parsed.error) });
      }
      const rows = await storage.listAdminResources(parsed.data.kind);
      const now = new Date();

      // Pre-load every assignment in a single shot; then fan in.
      const allAssignments = await storage.listSpecialistAssignments();
      const byResourceId = new Map<number, typeof allAssignments>();
      for (const a of allAssignments) {
        if (a.resourceId == null) continue;
        const arr = byResourceId.get(a.resourceId) ?? [];
        arr.push(a);
        byResourceId.set(a.resourceId, arr);
      }
      const allSpecialistIds = Array.from(new Set(allAssignments.map((a) => a.specialistId)));

      // Lazy auto-recompute: any specialist whose snapshot is missing or
      // older than QUALITY_TTL_MS gets recomputed inline before we read.
      // Without this the Resources tabs would show stale or empty quality
      // by default until an admin clicked "Recompute all", which would
      // contradict the "at a glance" promise of the transparency hub.
      // We bound the work to 8 specialists per request so a cold start
      // can't time out — the rest catch up on subsequent loads.
      const existingSnaps = await storage.getLatestQualitySnapshotsFor(allSpecialistIds);
      const nowMs = Date.now();
      const stale = allSpecialistIds.filter((sid) => {
        const snap = existingSnaps.get(sid);
        return !snap || nowMs - new Date(snap.computedAt).getTime() > QUALITY_TTL_MS;
      });
      if (stale.length > 0) {
        await Promise.all(
          stale.slice(0, 8).map((sid) =>
            recomputeAndRecordSpecialistQuality(sid).catch((e: unknown) => {
              // Never let one bad specialist block the whole page render.
              logger.warn(`quality recompute failed for ${sid}: ${formatError(e)}`, "transparency");
            }),
          ),
        );
      }
      const snapshotMap = stale.length > 0
        ? await storage.getLatestQualitySnapshotsFor(allSpecialistIds)
        : existingSnaps;

      const enriched = await Promise.all(
        rows.map(async (r) => {
          const assignments = byResourceId.get(r.id) ?? [];
          const consumerIds = Array.from(new Set(assignments.map((a) => a.specialistId)));
          const consumers = consumerIds.map((sid) => {
            const def = getSpecialistById(sid);
            const snap = snapshotMap.get(sid);
            return {
              specialistId: sid,
              specialistName: def ? specialistDisplayName(def) : sid,
              letter: def?.letter ?? null,
              qualityScore: snap?.score ?? null,
            };
          });
          const required = assignments.some((a) => a.required);
          const latest = await storage.getLatestHealthCheck(r.id);
          const status = deriveHealthStatus({
            lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
            lastCheckedAt: latest?.checkedAt ?? null,
            kind: r.kind as ResourceKind,
            now,
          });
          // For Working-pill last-failure tooltip: include the most recent
          // probe's error code/message (whichever is set). When the latest
          // is `ok` we leave both null so the tooltip shows healthy state.
          const lastFailureCode = latest && latest.status !== "ok" ? latest.errorCode ?? null : null;
          const lastFailureMessage = latest && latest.status !== "ok" ? latest.errorMessage ?? null : null;
          const scores = consumers
            .map((c) => c.qualityScore)
            .filter((s): s is number => typeof s === "number");
          const qualityAvg = scores.length > 0 ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
          const qualityMin = scores.length > 0 ? Math.min(...scores) : null;

          return {
            resource: toResourcePublicView(r, now),
            consumers,
            consumerCount: consumers.length,
            requiredAnywhere: required,
            health: {
              status,
              lastChecked: latest?.checkedAt ? latest.checkedAt.toISOString() : null,
              lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
              lastFailureCode,
              lastFailureMessage,
            },
            quality: { avg: qualityAvg, min: qualityMin, scoredCount: scores.length },
          };
        }),
      );

      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load resources transparency view", error);
    }
  });

  // ── Gaps banner (per-tab or global) ─────────────────────────────
  // Returns the system-wide health-and-quality counters that drive the
  // banner above each tab. Surfaces four categories of gap, each with
  // jump-targets so the UI can render actionable links:
  //
  //   • resources.failingList          → red-band resources to inspect
  //   • resources.orphanList           → resources with zero consumers
  //                                      (live in DB but no Specialist
  //                                      reads them — likely dead wiring)
  //   • specialists.missingHealthyList → required-true assignments where
  //                                      the bound resource is red/gray
  //                                      → Specialists are running blind
  app.get("/api/admin/resources/gaps", requireAdmin, async (req, res) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: zodErrorMessage(parsed.error) });
      }
      const rows = await storage.listAdminResources(parsed.data.kind);
      const now = new Date();
      let failing = 0;
      let amber = 0;
      let unprobed = 0;
      const failingResources: Array<{ id: number; slug: string; displayName: string; kind: string }> = [];

      // Cache health status per resource so the orphan/missing-healthy
      // passes below don't re-probe each row.
      const statusByResource = new Map<number, "green" | "amber" | "red" | "gray">();
      for (const r of rows) {
        const latest = await storage.getLatestHealthCheck(r.id);
        const status = deriveHealthStatus({
          lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
          lastCheckedAt: latest?.checkedAt ?? null,
          kind: r.kind as ResourceKind,
          now,
        });
        statusByResource.set(r.id, status);
        if (status === "red") {
          failing += 1;
          failingResources.push({ id: r.id, slug: r.slug, displayName: r.displayName, kind: r.kind });
        } else if (status === "amber") amber += 1;
        else if (status === "gray") unprobed += 1;
      }

      // Orphans: resources with zero specialist_assignments rows. Either
      // the catalog moved on or the resource was added-but-never-wired.
      const allAssignments = await storage.listSpecialistAssignments();
      const wiredResourceIds = new Set(
        allAssignments.map((a) => a.resourceId).filter((v): v is number => v != null),
      );
      const orphanList: Array<{ id: number; slug: string; displayName: string; kind: string }> = [];
      for (const r of rows) {
        if (!wiredResourceIds.has(r.id)) {
          orphanList.push({ id: r.id, slug: r.slug, displayName: r.displayName, kind: r.kind });
        }
      }

      // Specialists missing a healthy resource for a required role: any
      // assignment with required=true whose bound resource is red/gray.
      // (amber is permitted — it just means stale, not broken.)
      // A specialist is "missing-healthy" when a required assignment is
      // either bound to a red/gray resource OR is entirely unbound. The
      // unbound case (`resourceId == null`) is just as much of a gap as a
      // failing probe — the specialist literally has no data source for
      // that role — so we surface it with a specialist-level jump target
      // (resourceId: 0, slug: "(unbound)") instead of skipping it.
      const missingHealthyList: Array<{
        specialistId: string;
        specialistName: string;
        resourceId: number;
        resourceSlug: string;
        role: string | null;
        status: "red" | "gray";
      }> = [];
      const seen = new Set<string>();
      for (const a of allAssignments) {
        if (!a.required) continue;
        let resourceIdForLink = 0;
        let resourceSlug = "(unbound)";
        let status: "red" | "gray";
        if (a.resourceId == null) {
          // Unbound required slot — same severity as failing.
          status = "red";
          // Apply tab filter on the assignment's declared kind so the gap
          // appears under the right Resources tab. If the assignment has
          // no declared kind, fall through to all tabs.
          if (parsed.data.kind && a.assignmentKind && a.assignmentKind !== parsed.data.kind) continue;
        } else {
          const s = statusByResource.get(a.resourceId);
          if (s !== "red" && s !== "gray") continue;
          status = s;
          const resourceRow = rows.find((r) => r.id === a.resourceId);
          if (!resourceRow) continue; // resource is in a different kind tab
          resourceIdForLink = a.resourceId;
          resourceSlug = resourceRow.slug;
        }
        const key = `${a.specialistId}:${resourceIdForLink}:${a.assignmentRole ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const def = getSpecialistById(a.specialistId);
        missingHealthyList.push({
          specialistId: a.specialistId,
          specialistName: def ? specialistDisplayName(def) : a.specialistId,
          resourceId: resourceIdForLink,
          resourceSlug,
          role: a.assignmentRole ?? null,
          status,
        });
      }

      const qualityAgg = await storage.aggregateLatestQualityScores();

      // Decorate the below-70 list with display names so the banner can
      // render "Helena · 42 →" links straight to the Specialist page.
      const below70Named = qualityAgg.below70List.map((r) => {
        const def = getSpecialistById(r.specialistId);
        return {
          specialistId: r.specialistId,
          specialistName: def ? specialistDisplayName(def) : r.specialistId,
          score: r.score,
        };
      });

      res.json({
        kind: parsed.data.kind ?? null,
        resources: {
          total: rows.length,
          failing,
          amber,
          unprobed,
          orphans: orphanList.length,
          failingList: failingResources.slice(0, 5),
          orphanList: orphanList.slice(0, 5),
        },
        specialists: {
          missingHealthy: missingHealthyList.length,
          missingHealthyList: missingHealthyList.slice(0, 5),
        },
        quality: {
          avg: qualityAgg.avg,
          below70: qualityAgg.below70,
          total: qualityAgg.total,
          below70List: below70Named.slice(0, 5),
        },
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load resource gaps banner", error);
    }
  });

  // ── Per-resource detail (Overview / Consumers / Workflow / Quality) ──
  app.get("/api/admin/resources/:id/transparency", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const row = await storage.getAdminResourceById(id);
      if (!row) return res.status(404).json({ error: "Resource not found" });

      const now = new Date();
      const latest = await storage.getLatestHealthCheck(id);
      const recentProbes = await storage.listHealthChecksForResource(id, 25);
      const consumers = await loadConsumersForResource(id);
      const quality = aggregateQuality(consumers);

      // Recent calls: aggregate `research_runs` rows whose specialistId
      // points to a consumer of this resource, capped to the most recent 25.
      const consumerIds = consumers.map((c) => c.specialistId);
      const recentCalls: Array<{
        runId: number;
        specialistId: string;
        specialistName: string;
        status: string;
        startedAt: string;
        completedAt: string | null;
        durationMs: number | null;
      }> = [];
      for (const sid of consumerIds) {
        const def = getSpecialistById(sid);
        const runs = await storage.getResearchRunsForSpecialist(sid, 5);
        for (const r of runs) {
          recentCalls.push({
            runId: r.id,
            specialistId: sid,
            specialistName: def ? specialistDisplayName(def) : sid,
            status: r.status,
            startedAt: new Date(r.startedAt).toISOString(),
            completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
            durationMs: r.durationMs ?? null,
          });
        }
      }
      recentCalls.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

      const status = deriveHealthStatus({
        lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
        lastCheckedAt: latest?.checkedAt ?? null,
        kind: row.kind as ResourceKind,
        now,
      });

      res.json({
        resource: toResourcePublicView(row, now),
        health: {
          status,
          lastChecked: latest?.checkedAt ? latest.checkedAt.toISOString() : null,
          lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
          recentProbes: recentProbes.map((p) => ({
            id: p.id,
            status: p.status,
            latencyMs: p.latencyMs,
            errorCode: p.errorCode,
            errorMessage: p.errorMessage,
            checkedAt: p.checkedAt.toISOString(),
          })),
        },
        consumers,
        quality,
        recentCalls: recentCalls.slice(0, 25),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load resource transparency detail", error);
    }
  });

  // ── Per-Specialist quality view (read; auto-recompute when stale) ───
  // Mirrors the same data on Specialist pages without the front end having
  // to know the formula. If the most recent snapshot is older than the TTL
  // (or none exists), we recompute and persist transparently.
  app.get("/api/admin/specialists/:id/quality", requireAdmin, async (req, res) => {
    try {
      const specialistId = String(req.params.id);
      const def = getSpecialistById(specialistId);
      if (!def) return res.status(404).json({ error: "Specialist not found" });

      const existing = await storage.getLatestQualitySnapshot(specialistId);
      const stale = !existing || Date.now() - new Date(existing.computedAt).getTime() > QUALITY_TTL_MS;
      if (stale) {
        await recomputeAndRecordSpecialistQuality(specialistId);
      }
      const snap = await storage.getLatestQualitySnapshot(specialistId);
      if (!snap) return res.status(500).json({ error: "Quality snapshot unavailable" });

      res.json({
        specialistId,
        score: snap.score,
        gaps: snap.gaps,
        signals: snap.signals,
        computedAt: new Date(snap.computedAt).toISOString(),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist quality", error);
    }
  });

  // ── Per-Specialist quality history (Task #511) ──────────────────
  // Returns the most-recent N snapshots in chronological order (oldest
  // first) so the Quality & Gaps card on the Specialist page can render
  // a sparkline/bar chart of how the score has moved over time. Each
  // recompute appends a new row, so this is just a thin read of the
  // existing append-only history table — no recompute side-effects.
  app.get("/api/admin/specialists/:id/quality/history", requireAdmin, async (req, res) => {
    try {
      const specialistId = String(req.params.id);
      const def = getSpecialistById(specialistId);
      if (!def) return res.status(404).json({ error: "Specialist not found" });

      const limitParsed = z
        .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
        .safeParse(req.query);
      if (!limitParsed.success) {
        return res.status(400).json({ error: zodErrorMessage(limitParsed.error) });
      }
      // Default to 30 — the nightly recompute job appends one row per day,
      // so 30 ≈ the last 30 days of scores. Task #540: makes slow-burn
      // drift (e.g. "amber for two weeks") visible at a glance.
      const limit = limitParsed.data.limit ?? 30;

      const rows = await storage.listQualitySnapshotHistory(specialistId, limit);
      // Storage returns DESC; flip to chronological for charting.
      const points = rows
        .slice()
        .reverse()
        .map((r) => ({
          score: r.score,
          computedAt: new Date(r.computedAt).toISOString(),
        }));
      res.json({ specialistId, points });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load specialist quality history", error);
    }
  });

  // ── Per-resource quality history (Task #555 + #563) ─────────────
  // Bulk variant of `/api/admin/specialists/:id/quality/history` that
  // returns the score history for every consumer of a resource in one
  // payload. The Resource detail dialog used to fan out N per-row
  // requests (one per consumer); for high-fan-out resources (e.g. a
  // shared LLM model wired into ~20 specialists) that meant ~20
  // sequential admin queries each time the dialog opened. This route
  // collapses that to one round trip via a single window-function query
  // in storage. Behaviour matches the per-Specialist endpoint:
  // chronological order (oldest first), default 30, max 100.
  //
  // Task #563: response now also carries an `aggregate` field — a
  // resource-level daily trend (avg + min across consumers, with
  // last-known carry-forward) so the Quality & Gaps tab can render one
  // prominent sparkline above the per-consumer list. Computed in the
  // route from the same per-consumer rows so we don't fan out a second
  // query. Empty-consumer / no-snapshot cases yield `points: []` —
  // QualityHistoryChart renders its own empty fallback.
  app.get("/api/admin/resources/:id/quality/history", requireAdmin, async (req, res) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const limitParsed = z
        .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
        .safeParse(req.query);
      if (!limitParsed.success) {
        return res.status(400).json({ error: zodErrorMessage(limitParsed.error) });
      }
      const limit = limitParsed.data.limit ?? 30;

      const row = await storage.getAdminResourceById(id);
      if (!row) return res.status(404).json({ error: "Resource not found" });

      const impact = await storage.listResourceImpact(id);
      const specialistIds = Array.from(new Set(impact.map((i) => i.specialistId)));
      const historyMap = await storage.listQualitySnapshotHistoryForMany(
        specialistIds,
        limit,
      );

      // Shape: array of `{ specialistId, points }` so each entry is the
      // same QualityHistoryResponse shape the per-Specialist endpoint
      // returns — the chart and child components can consume it without
      // a second adapter type. Storage returns DESC; flip to chronological
      // for charting (matches the per-Specialist route's contract).
      const histories = specialistIds.map((sid) => {
        const rows = historyMap.get(sid) ?? [];
        const points = rows
          .slice()
          .reverse()
          .map((r) => ({
            score: r.score,
            computedAt: new Date(r.computedAt).toISOString(),
          }));
        return { specialistId: sid, points };
      });

      const aggregate = computeResourceAggregateTrend(historyMap, specialistIds);

      res.json({ resourceId: id, histories, aggregate });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load resource quality history", error);
    }
  });

  // ── Force recompute (admin button) ──────────────────────────────
  app.post("/api/admin/specialists/:id/quality/recompute", requireAdmin, async (req, res) => {
    try {
      const specialistId = String(req.params.id);
      const def = getSpecialistById(specialistId);
      if (!def) return res.status(404).json({ error: "Specialist not found" });
      const result = await recomputeAndRecordSpecialistQuality(specialistId);
      res.json({
        specialistId,
        score: result.score,
        gaps: result.gaps,
        signals: result.signals,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to recompute specialist quality", error);
    }
  });

  // ── Bulk recompute (used by gaps banner refresh button) ─────────
  app.post("/api/admin/specialists/quality/recompute-all", requireAdmin, async (_req, res) => {
    try {
      const ids = SPECIALIST_CATALOG.map((d) => d.id);
      const out: Array<{ specialistId: string; score: number }> = [];
      for (const sid of ids) {
        const r = await recomputeAndRecordSpecialistQuality(sid);
        out.push({ specialistId: sid, score: r.score });
      }
      res.json({ updated: out.length, results: out });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to recompute all specialist quality scores", error);
    }
  });
}
