/**
 * PropertyDdStorage — hospitality due-diligence template + per-property
 * checklist instances. See `shared/dd-template.ts` for the canonical
 * catalog and `shared/schema/property-dd.ts` for the table shapes.
 *
 * The catalog is mirrored into `dd_template_items` on first read; admins
 * can edit per-row defaults via the Constants admin tab without a code
 * change. Per-property rows in `property_dd_items` denormalize the
 * label / workstream / stop-gate flag at seed time so a future template
 * label edit does not silently rewrite history on a closed deal.
 */
import { db } from "../db";
import { eq, asc, inArray } from "drizzle-orm";
import {
  ddTemplateItems,
  propertyDdItems,
  type DdTemplateItemRow,
  type PropertyDdItemRow,
  type UpdateDdTemplateItem,
  type UpdatePropertyDdItem,
} from "@workspace/db";
import {
  HOSPITALITY_DD_TEMPLATE,
  DD_TEMPLATE_VERSION,
  DD_WORKSTREAM_LABELS,
  type DdSummary,
  type DdGoIndicator,
  type DdStatus,
  type DdWorkstream,
} from "@shared/dd-template";

let templateSeedPromise: Promise<void> | null = null;

async function ensureTemplateSeeded(): Promise<void> {
  if (templateSeedPromise) return templateSeedPromise;
  templateSeedPromise = (async () => {
    const existing = await db
      .select({ key: ddTemplateItems.key, archived: ddTemplateItems.archived })
      .from(ddTemplateItems);
    const existingByKey = new Map(existing.map((r) => [r.key, r]));
    const codeKeys = new Set(HOSPITALITY_DD_TEMPLATE.map((t) => t.key));

    // 1. Insert any rows new in the code template.
    const newRows = HOSPITALITY_DD_TEMPLATE.filter((t) => !existingByKey.has(t.key));
    if (newRows.length > 0) {
      await db.insert(ddTemplateItems).values(
        newRows.map((t) => ({
          key: t.key,
          workstream: t.workstream,
          label: t.label,
          description: t.description,
          isStopGate: t.isStopGate,
          defaultVendorType: t.defaultVendorType ?? null,
          sortOrder: t.sortOrder,
          archived: false,
          templateVersion: DD_TEMPLATE_VERSION,
        })),
      );
    }

    // 2. Archive rows that exist in the DB but no longer in the code
    //    template — e.g. an item retired in version N+1. We never delete
    //    them so existing per-property instances keep their workstream and
    //    label, but seedPropertyDdItems() will stop instantiating them on
    //    new properties (it filters on `archived = false`).
    const toArchive = existing
      .filter((r) => !codeKeys.has(r.key) && !r.archived)
      .map((r) => r.key);
    if (toArchive.length > 0) {
      await db
        .update(ddTemplateItems)
        .set({ archived: true, updatedAt: new Date() })
        .where(inArray(ddTemplateItems.key, toArchive));
    }

    // 3. Un-archive rows that were previously archived but reappear in
    //    the code template. Without this, restoring a removed item via a
    //    version bump would leave it permanently hidden.
    const toUnarchive = existing
      .filter((r) => codeKeys.has(r.key) && r.archived)
      .map((r) => r.key);
    if (toUnarchive.length > 0) {
      await db
        .update(ddTemplateItems)
        .set({ archived: false, updatedAt: new Date() })
        .where(inArray(ddTemplateItems.key, toUnarchive));
    }
  })().catch((err) => {
    // Reset so a transient failure (e.g. migrations not yet ready) doesn't
    // permanently disable seeding for the process lifetime.
    templateSeedPromise = null;
    throw err;
  });
  return templateSeedPromise;
}

function computeSummary(rows: PropertyDdItemRow[]): DdSummary {
  const inScope = rows.filter((r) => r.status !== "na");
  const completed = inScope.filter((r) => r.status === "complete");
  const blocked = inScope.filter((r) => r.status === "blocked");
  const blockedStop = blocked.filter((r) => r.isStopGate);

  const wsMap = new Map<DdWorkstream, { total: number; completed: number; blocked: number }>();
  for (const r of inScope) {
    const ws = r.workstream as DdWorkstream;
    const cur = wsMap.get(ws) ?? { total: 0, completed: 0, blocked: 0 };
    cur.total += 1;
    if (r.status === "complete") cur.completed += 1;
    if (r.status === "blocked") cur.blocked += 1;
    wsMap.set(ws, cur);
  }

  const workstreams = (Object.keys(DD_WORKSTREAM_LABELS) as DdWorkstream[])
    .filter((ws) => wsMap.has(ws))
    .map((ws) => {
      const v = wsMap.get(ws)!;
      return {
        workstream: ws,
        label: DD_WORKSTREAM_LABELS[ws],
        total: v.total,
        completed: v.completed,
        blocked: v.blocked,
        percentComplete: v.total === 0 ? 0 : Math.round((v.completed / v.total) * 100),
      };
    });

  const budgetTotal = inScope.reduce((s, r) => s + (r.costEstimate ?? 0), 0);
  const spendCommitted = inScope.reduce((s, r) => s + (r.costActual ?? 0), 0);

  let goIndicator: DdGoIndicator = "go";
  let goReason = "All workstreams clear";
  if (blockedStop.length > 0) {
    goIndicator = "stop";
    goReason = `${blockedStop.length} stop-gate item${blockedStop.length === 1 ? "" : "s"} blocked: ${blockedStop.map((r) => r.label).slice(0, 3).join("; ")}`;
  } else if (blocked.length > 0) {
    goIndicator = "caution";
    goReason = `${blocked.length} blocked item${blocked.length === 1 ? "" : "s"} need resolution`;
  } else if (inScope.length > 0 && completed.length < inScope.length) {
    goIndicator = "caution";
    goReason = `${inScope.length - completed.length} item${inScope.length - completed.length === 1 ? "" : "s"} still open`;
  }

  const openFindings = rows
    .filter((r) => r.status !== "complete" && r.status !== "na" && r.findings && r.findings.trim().length > 0)
    .map((r) => ({
      itemKey: r.templateItemKey,
      label: r.label,
      workstream: r.workstream as DdWorkstream,
      status: r.status as DdStatus,
      findings: r.findings ?? "",
    }));

  return {
    totalItems: inScope.length,
    completedItems: completed.length,
    blockedItems: blocked.length,
    blockedStopGateItems: blockedStop.length,
    workstreams,
    budgetTotal,
    spendCommitted,
    goIndicator,
    goReason,
    openFindings,
  };
}

export class PropertyDdStorage {
  async getDdTemplate(): Promise<DdTemplateItemRow[]> {
    await ensureTemplateSeeded();
    return await db
      .select()
      .from(ddTemplateItems)
      .orderBy(asc(ddTemplateItems.workstream), asc(ddTemplateItems.sortOrder), asc(ddTemplateItems.id));
  }

  async updateDdTemplateItem(id: number, data: UpdateDdTemplateItem): Promise<DdTemplateItemRow | undefined> {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) setData[k] = v;
    }
    if (Object.keys(setData).length === 1) {
      const [row] = await db.select().from(ddTemplateItems).where(eq(ddTemplateItems.id, id));
      return row || undefined;
    }
    const [row] = await db
      .update(ddTemplateItems)
      .set(setData)
      .where(eq(ddTemplateItems.id, id))
      .returning();
    return row || undefined;
  }

  async getPropertyDdItems(propertyId: number): Promise<PropertyDdItemRow[]> {
    return await db
      .select()
      .from(propertyDdItems)
      .where(eq(propertyDdItems.propertyId, propertyId))
      .orderBy(asc(propertyDdItems.workstream), asc(propertyDdItems.sortOrder), asc(propertyDdItems.id));
  }

  /**
   * Seed any missing template rows onto the property. Idempotent — already-
   * seeded rows are left alone (their per-property edits are preserved).
   * Archived template rows are not seeded onto new properties.
   */
  async seedPropertyDdItems(propertyId: number): Promise<PropertyDdItemRow[]> {
    await ensureTemplateSeeded();
    const template = await db
      .select()
      .from(ddTemplateItems)
      .where(eq(ddTemplateItems.archived, false));
    const existing = await db
      .select({ key: propertyDdItems.templateItemKey })
      .from(propertyDdItems)
      .where(eq(propertyDdItems.propertyId, propertyId));
    const existingKeys = new Set(existing.map((r) => r.key));
    const toInsert = template
      .filter((t) => !existingKeys.has(t.key))
      .map((t) => ({
        propertyId,
        templateItemKey: t.key,
        workstream: t.workstream,
        label: t.label,
        isStopGate: t.isStopGate,
        sortOrder: t.sortOrder,
        status: "not_started",
        vendor: t.defaultVendorType ?? null,
      }));
    if (toInsert.length > 0) {
      await db.insert(propertyDdItems).values(toInsert);
    }
    return this.getPropertyDdItems(propertyId);
  }

  async updatePropertyDdItem(id: number, data: UpdatePropertyDdItem): Promise<PropertyDdItemRow | undefined> {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) setData[k] = v;
    }
    if (Object.keys(setData).length === 1) {
      const [row] = await db.select().from(propertyDdItems).where(eq(propertyDdItems.id, id));
      return row || undefined;
    }
    const [row] = await db
      .update(propertyDdItems)
      .set(setData)
      .where(eq(propertyDdItems.id, id))
      .returning();
    return row || undefined;
  }

  async getPropertyDdItemById(id: number): Promise<PropertyDdItemRow | undefined> {
    const [row] = await db.select().from(propertyDdItems).where(eq(propertyDdItems.id, id));
    return row || undefined;
  }

  async getPropertyDdSummary(propertyId: number): Promise<DdSummary> {
    const rows = await this.getPropertyDdItems(propertyId);
    return computeSummary(rows);
  }
}

export { computeSummary as computeDdSummary };
