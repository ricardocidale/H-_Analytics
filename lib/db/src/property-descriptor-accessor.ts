// Property Descriptor Accessor (task #1407, Milestone B).
//
// Single server-side abstraction for reading the **effective value** of any
// catalogued property descriptor. The contract is:
//
//   effective_value(field) =
//     improved JSONB[field]              -- if set
//       ?? typed_improved_column         -- migration-window fallback
//       ?? purchased JSONB[field]        -- if set
//       ?? typed_purchased_column        -- migration-window fallback
//       ?? null
//
// All financial-engine reads, Rebecca context assembly, slide payload pulls,
// and report exporters are expected to flow through `getEffectivePropertyView`
// rather than reading raw typed columns. That centralizes the "which temporal
// view do we surface?" decision in one place and unblocks the eventual
// JSONB-only storage shape (per `deferred-milestone-b.md` step 7+).
//
// Drift instrumentation (`detectDescriptorDrift`) compares typed columns
// against the JSONB blobs and returns mismatches so the dual-write window can
// be observed for cleanliness before typed columns are dropped.

import {
  PROPERTY_DESCRIPTOR_CATALOG,
  PROPERTY_DESCRIPTOR_CATALOG_BY_KEY,
} from "./property-descriptor-catalog-seed";
import type { DescriptorCatalogEntry } from "./schema/property-descriptor-catalog";

// Loose row shape so this works against `Property` from drizzle-zod, raw DB
// rows from joins, and `PropertyInput`-shaped objects equally. Callers cast
// from `Property` or `Record<string, unknown>` without ceremony.
export type PropertyRow = Record<string, unknown> & {
  descriptors_purchased?: Record<string, unknown> | null;
  descriptors_improved?: Record<string, unknown> | null;
  descriptorsPurchased?: Record<string, unknown> | null;
  descriptorsImproved?: Record<string, unknown> | null;
};

function readJsonbBlob(
  row: PropertyRow,
  side: "purchased" | "improved",
): Record<string, unknown> {
  // Tolerate both camelCase (Drizzle) and snake_case (raw pg) row shapes.
  const camel = side === "purchased" ? "descriptorsPurchased" : "descriptorsImproved";
  const snake = side === "purchased" ? "descriptors_purchased" : "descriptors_improved";
  const raw = (row[camel] ?? row[snake]) as Record<string, unknown> | null | undefined;
  return raw && typeof raw === "object" ? raw : {};
}

function readTypedColumn(
  row: PropertyRow,
  snakeColumn: string | undefined,
): unknown {
  if (!snakeColumn) return undefined;
  // Drizzle returns camelCase; raw pg returns snake_case. Try both.
  const camel = snakeColumn.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const v = row[camel];
  if (v !== undefined) return v;
  return row[snakeColumn];
}

/**
 * Resolve the effective value of one descriptor, applying the
 * improved-then-purchased priority chain across both JSONB blobs and the
 * typed fallback columns.
 */
export function getEffectiveDescriptor(
  row: PropertyRow,
  fieldKey: string,
): unknown {
  const entry = PROPERTY_DESCRIPTOR_CATALOG_BY_KEY.get(fieldKey);
  if (!entry) return readTypedColumn(row, fieldKey);

  const improved = readJsonbBlob(row, "improved");
  const purchased = readJsonbBlob(row, "purchased");

  if (entry.scope === "parallel" || entry.scope === "improved_only") {
    if (improved[fieldKey] !== undefined && improved[fieldKey] !== null) {
      return improved[fieldKey];
    }
    const typedImproved = readTypedColumn(row, entry.typedColumnImproved);
    if (typedImproved !== undefined && typedImproved !== null) return typedImproved;
  }
  if (entry.scope === "improved_only") {
    // No purchased fallback for improved_only descriptors.
    return null;
  }

  if (purchased[fieldKey] !== undefined && purchased[fieldKey] !== null) {
    return purchased[fieldKey];
  }
  const typedPurchased = readTypedColumn(row, entry.typedColumnPurchased);
  return typedPurchased ?? null;
}

/**
 * Return the **As-Purchased** value of one catalogued descriptor — purchased
 * JSONB blob entry, falling back to the typed-purchased column for the
 * dual-write migration window. Never falls through to improved-side values.
 *
 * Used by the renovation-aware engine pass when it needs the acquisition-state
 * snapshot (years before `plannedReopeningYear`). For catalogued descriptors
 * with `scope: "improved_only"` (e.g. `plannedReopeningYear`), there is no
 * purchased side, so this returns `null`. For descriptors not in the catalog,
 * falls back to a raw typed-column read at the camelCase variant of
 * `fieldKey`.
 *
 * Pair with `getImprovedDescriptor` for the As-Improved-only side and
 * `getEffectiveDescriptor` for the full improved-then-purchased chain.
 */
export function getPurchasedDescriptor(
  row: PropertyRow,
  fieldKey: string,
): unknown {
  const entry = PROPERTY_DESCRIPTOR_CATALOG_BY_KEY.get(fieldKey);
  if (!entry) return readTypedColumn(row, fieldKey);
  if (entry.scope === "improved_only") return null;

  const purchased = readJsonbBlob(row, "purchased");
  if (purchased[fieldKey] !== undefined && purchased[fieldKey] !== null) {
    return purchased[fieldKey];
  }
  const typedPurchased = readTypedColumn(row, entry.typedColumnPurchased);
  return typedPurchased ?? null;
}

/**
 * Return the **As-Improved** value of one catalogued descriptor — improved
 * JSONB blob entry, falling back to the typed-improved column for the
 * dual-write migration window. Never falls back to the purchased side.
 *
 * Used as a "is the renovation hypothesis populated on this field?" predicate
 * (compare result against null/undefined) and as the value source for the
 * `plannedReopeningYear` gate (which is `scope: "improved_only"` so it has no
 * purchased twin). For descriptors with `scope: "purchased_only"` (e.g.
 * `yearBuilt`), there is no improved side and this returns `null`. For
 * descriptors not in the catalog, returns `null` (callers should not be
 * asking for an improved-side value on a non-catalogued field).
 *
 * Pair with `getPurchasedDescriptor` for the As-Purchased-only side and
 * `getEffectiveDescriptor` for the full improved-then-purchased chain.
 */
export function getImprovedDescriptor(
  row: PropertyRow,
  fieldKey: string,
): unknown {
  const entry = PROPERTY_DESCRIPTOR_CATALOG_BY_KEY.get(fieldKey);
  if (!entry) return null;
  if (entry.scope === "purchased_only" || entry.scope === "identity") return null;

  const improved = readJsonbBlob(row, "improved");
  if (improved[fieldKey] !== undefined && improved[fieldKey] !== null) {
    return improved[fieldKey];
  }
  const typedImproved = readTypedColumn(row, entry.typedColumnImproved);
  return typedImproved ?? null;
}

/**
 * Return a shallow copy of the row with each catalogued descriptor's typed
 * column rewritten to its effective (Improved ?? Purchased) value. Pass this
 * into the financial engine, Rebecca context-builder, and report exporters in
 * place of the raw row so they always see the temporally correct view without
 * needing to know about the catalog.
 *
 * Original typed columns that are NOT in the catalog (purchasePrice, ADR, cost
 * rates, etc.) pass through unchanged.
 */
export function getEffectivePropertyView<T extends PropertyRow>(row: T): T {
  const out: PropertyRow = { ...row };
  for (const entry of PROPERTY_DESCRIPTOR_CATALOG) {
    const eff = getEffectiveDescriptor(row, entry.fieldKey);
    // Surface the effective value at the camelCase typed-column name so
    // downstream readers that key off `property.fbVenues` etc. see the merged
    // view. We deliberately do NOT clobber the As-Improved typed columns;
    // those remain available for code that wants to inspect the renovation
    // delta explicitly.
    if (entry.typedColumnPurchased) {
      const camel = entry.typedColumnPurchased.replace(
        /_([a-z])/g,
        (_, c) => c.toUpperCase(),
      );
      out[camel] = eff;
    } else if (entry.typedColumnImproved) {
      const camel = entry.typedColumnImproved.replace(
        /_([a-z])/g,
        (_, c) => c.toUpperCase(),
      );
      out[camel] = eff;
    }
  }
  return out as T;
}

/**
 * Returns true if the row carries ANY As-Improved descriptor value — set
 * either in the `descriptors_improved` JSONB blob OR in a typed As-Improved
 * column. Used by report builders to decide whether to render an "(As-Improved
 * …)" section header at all.
 *
 * This is a *presence* check, not an effective-value read: the result
 * specifically reflects whether the operator has populated the As-Improved
 * side, distinct from `getEffectivePropertyView` which collapses purchased
 * and improved into one effective value.
 *
 * Plan 2026-05-13-002 Unit U3 — replaces the inline predicates in
 * `report/server-export-data.ts` and `report/assumption-sections.ts` that
 * directly OR'd together every typed `*Improved` column. New As-Improved
 * fields added to the catalog automatically participate without code edits.
 */
export function hasImprovedSideValues(row: PropertyRow): boolean {
  const improvedBlob = readJsonbBlob(row, "improved");
  for (const entry of PROPERTY_DESCRIPTOR_CATALOG) {
    if (entry.scope !== "parallel" && entry.scope !== "improved_only") continue;
    const fromBlob = improvedBlob[entry.fieldKey];
    if (fromBlob !== undefined && fromBlob !== null) return true;
    const typed = readTypedColumn(row, entry.typedColumnImproved);
    if (typed !== undefined && typed !== null) return true;
  }
  return false;
}

export interface DescriptorDrift {
  fieldKey: string;
  side: "purchased" | "improved";
  typedValue: unknown;
  jsonbValue: unknown;
}

/**
 * Compare the typed columns to the JSONB blobs and report any descriptor
 * where the two diverge. Used by callers to log a warning during the
 * dual-write window so silent drift is visible before typed columns are
 * dropped.
 *
 * Empty/undefined on both sides is not drift. A typed value with no JSONB
 * counterpart IS drift (and vice versa) — that signals the dual-write was
 * skipped on a write path we have not yet migrated.
 */
export function detectDescriptorDrift(row: PropertyRow): DescriptorDrift[] {
  const drift: DescriptorDrift[] = [];
  const purchased = readJsonbBlob(row, "purchased");
  const improved = readJsonbBlob(row, "improved");

  for (const entry of PROPERTY_DESCRIPTOR_CATALOG) {
    if (entry.typedColumnPurchased) {
      const t = readTypedColumn(row, entry.typedColumnPurchased);
      const j = purchased[entry.fieldKey];
      if (!isEqualishValue(t, j)) {
        drift.push({ fieldKey: entry.fieldKey, side: "purchased", typedValue: t, jsonbValue: j });
      }
    }
    if (entry.typedColumnImproved) {
      const t = readTypedColumn(row, entry.typedColumnImproved);
      const j = improved[entry.fieldKey];
      if (!isEqualishValue(t, j)) {
        drift.push({ fieldKey: entry.fieldKey, side: "improved", typedValue: t, jsonbValue: j });
      }
    }
  }
  return drift;
}

function isEqualishValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  // Numeric tolerance: real columns can round-trip with float jitter.
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-9;
  }
  return false;
}

/**
 * Given an update patch in camelCase typed-column form (the shape produced by
 * the property edit form), return:
 *   - `descriptorsPurchased` / `descriptorsImproved` JSONB patches that mirror
 *     every catalog field touched by the typed-column patch.
 *
 * The caller merges these into the storage update so both the typed columns
 * and the JSONB blobs are written in the same SQL UPDATE — this is the
 * "dual-write" half of the contract.
 *
 * Existing JSONB content for descriptors NOT touched by this patch is
 * preserved by passing `existingPurchased` / `existingImproved`.
 */
export function buildDescriptorDualWritePatch(
  typedPatch: Record<string, unknown>,
  existingPurchased: Record<string, unknown> | null | undefined,
  existingImproved: Record<string, unknown> | null | undefined,
): {
  descriptorsPurchased?: Record<string, unknown>;
  descriptorsImproved?: Record<string, unknown>;
} {
  const nextPurchased: Record<string, unknown> = { ...(existingPurchased ?? {}) };
  const nextImproved: Record<string, unknown> = { ...(existingImproved ?? {}) };
  let touchedPurchased = false;
  let touchedImproved = false;

  for (const entry of PROPERTY_DESCRIPTOR_CATALOG) {
    if (entry.typedColumnPurchased) {
      const camel = entry.typedColumnPurchased.replace(
        /_([a-z])/g,
        (_, c) => c.toUpperCase(),
      );
      if (Object.prototype.hasOwnProperty.call(typedPatch, camel)) {
        const v = typedPatch[camel];
        if (v === null || v === undefined) {
          delete nextPurchased[entry.fieldKey];
        } else {
          nextPurchased[entry.fieldKey] = v;
        }
        touchedPurchased = true;
      }
    }
    if (entry.typedColumnImproved) {
      const camel = entry.typedColumnImproved.replace(
        /_([a-z])/g,
        (_, c) => c.toUpperCase(),
      );
      if (Object.prototype.hasOwnProperty.call(typedPatch, camel)) {
        const v = typedPatch[camel];
        if (v === null || v === undefined) {
          delete nextImproved[entry.fieldKey];
        } else {
          nextImproved[entry.fieldKey] = v;
        }
        touchedImproved = true;
      }
    }
  }

  const out: {
    descriptorsPurchased?: Record<string, unknown>;
    descriptorsImproved?: Record<string, unknown>;
  } = {};
  if (touchedPurchased) out.descriptorsPurchased = nextPurchased;
  if (touchedImproved) out.descriptorsImproved = nextImproved;
  return out;
}

export { PROPERTY_DESCRIPTOR_CATALOG, PROPERTY_DESCRIPTOR_CATALOG_BY_KEY };
export type { DescriptorCatalogEntry };
