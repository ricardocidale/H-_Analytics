/**
 * Task #521 — Block re-introduction of legacy `/objects/uploads/<uuid>`
 * URLs into long-lived rows.
 *
 * After the R2 cutover (Task #519) any pre-cutover `/objects/uploads/<uuid>`
 * URL whose bytes lived in the legacy GCS-backed Replit bucket 404s. The
 * data was remediated by `script/r2-cutover-reconcile.ts`; this module
 * prevents recurrence by:
 *
 *   1. Detecting `/objects/uploads/<key>` URL fragments.
 *   2. Resolving each one against canonical sinks
 *      (property_photos row → `/api/property-photos/<id>/image`,
 *       logos with a sibling `/api/media/<file>` row).
 *   3. Rewriting the legacy fragment in-place when a canonical
 *      equivalent exists. Unresolvable fragments are left alone so the
 *      reconcile script can still flag them on its next run.
 *
 * Helpers here are intentionally free of the `storage` facade so they can
 * be imported from `server/storage/*` without creating an import cycle.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../logger";

/**
 * Matches an `/objects/uploads/<key>` fragment anywhere in a string. The key
 * is `[A-Za-z0-9_-]+` because `uploads/` paths are written by the upload
 * routes as object-storage UUIDs (no slashes, no dots, no query strings).
 */
const LEGACY_UPLOAD_RE = /\/objects\/uploads\/[A-Za-z0-9_-]+/g;

/** Cheap predicate so callers can skip the DB hop on the common case. */
export function containsLegacyUploadUrl(s: string | null | undefined): boolean {
  return typeof s === "string" && s.includes("/objects/uploads/");
}

/**
 * Asset-type hint used to disambiguate when the same legacy URL could
 * conceivably appear in multiple tables. In practice an `/objects/uploads/<uuid>`
 * is owned by exactly one table, but the hint keeps callers explicit and
 * removes any cross-table guessing in the resolver.
 */
export type LegacyAssetHint = "photo" | "logo";

/**
 * Resolve a legacy URL against the `property_photos` table only. Canonical
 * sink is the photo-served endpoint, which falls back to image_data → image_url
 * so it stays serveable post-cutover.
 */
export async function resolveCanonicalPhotoUrl(legacyUrl: string): Promise<string | null> {
  if (!legacyUrl.startsWith("/objects/uploads/")) return null;
  const photoRes = await db.execute<{ id: number }>(sql`
    SELECT id FROM property_photos WHERE image_url = ${legacyUrl} LIMIT 1
  `);
  if (photoRes.rows[0]) {
    return `/api/property-photos/${photoRes.rows[0].id}/image`;
  }
  return null;
}

/**
 * Resolve a legacy URL against the `logos` table only. Looks for a sibling
 * logo (same company_name) already pointing at `/api/media/<file>`; if found,
 * that's the canonical equivalent. Prefer the default logo so multiple
 * siblings resolve deterministically.
 */
export async function resolveCanonicalLogoUrl(legacyUrl: string): Promise<string | null> {
  if (!legacyUrl.startsWith("/objects/uploads/")) return null;
  const logoRes = await db.execute<{ company_name: string }>(sql`
    SELECT company_name FROM logos WHERE url = ${legacyUrl} LIMIT 1
  `);
  if (!logoRes.rows[0]) return null;
  const sibling = await db.execute<{ url: string }>(sql`
    SELECT url FROM logos
     WHERE company_name = ${logoRes.rows[0].company_name}
       AND url LIKE '/api/media/%'
     ORDER BY is_default DESC, id ASC
     LIMIT 1
  `);
  return sibling.rows[0]?.url ?? null;
}

/**
 * Resolve canonical equivalent for a single `/objects/uploads/<uuid>` URL.
 * Returns the canonical URL (e.g. `/api/property-photos/12/image` or
 * `/api/media/foo.png`) when one exists in the DB, or `null` if no canonical
 * sink owns the same bytes (in which case the caller should leave the URL
 * untouched — it may be a fresh upload whose `/objects/...` form is the
 * canonical sink at this point in time, or a legacy stray to be flagged).
 *
 * Pass `hint` when the asset type is known (e.g. from indexing pipelines)
 * to skip the table the URL cannot belong to. With no hint we try photos
 * first then logos — in practice an upload key is owned by exactly one
 * table, so the order only matters for the theoretical collision case.
 */
export async function resolveCanonicalUploadUrl(
  legacyUrl: string,
  hint?: LegacyAssetHint,
): Promise<string | null> {
  if (!legacyUrl.startsWith("/objects/uploads/")) return null;
  if (hint === "photo") return resolveCanonicalPhotoUrl(legacyUrl);
  if (hint === "logo") return resolveCanonicalLogoUrl(legacyUrl);
  return (
    (await resolveCanonicalPhotoUrl(legacyUrl)) ??
    (await resolveCanonicalLogoUrl(legacyUrl))
  );
}

/**
 * Scan a free-text body (e.g. `rebecca_messages.content`) for legacy upload
 * URLs and rewrite the resolvable ones in place. Unresolvable legacy URLs
 * are left untouched so the reconcile script can still surface them.
 */
export async function rewriteLegacyUploadsInText(
  text: string,
): Promise<{ text: string; rewritten: number }> {
  if (!containsLegacyUploadUrl(text)) return { text, rewritten: 0 };
  const matches = Array.from(new Set(text.match(LEGACY_UPLOAD_RE) ?? []));
  if (matches.length === 0) return { text, rewritten: 0 };

  let out = text;
  let rewritten = 0;
  for (const legacy of matches) {
    let canonical: string | null = null;
    try {
      canonical = await resolveCanonicalUploadUrl(legacy);
    } catch (err: unknown) {
      logger.warn(
        `canonical-asset-url: lookup failed for ${legacy}: ${err instanceof Error ? err.message : err}`,
        "canonical-asset-url",
      );
    }
    if (canonical && canonical !== legacy) {
      out = out.split(legacy).join(canonical);
      rewritten += 1;
    }
  }
  return { text: out, rewritten };
}

/**
 * Rewrite the conventional `metadata.objectPath` field in an
 * `activity_logs` payload when it points at a legacy upload URL whose
 * canonical equivalent exists. Other metadata keys are left untouched —
 * `objectPath` is the only field the upload routes currently write.
 */
export async function rewriteLegacyUploadsInMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Promise<{ metadata: Record<string, unknown> | null | undefined; rewritten: number }> {
  if (!metadata || typeof metadata !== "object") return { metadata, rewritten: 0 };
  const op = (metadata as Record<string, unknown>).objectPath;
  if (typeof op !== "string" || !op.startsWith("/objects/uploads/")) {
    return { metadata, rewritten: 0 };
  }
  let canonical: string | null = null;
  try {
    canonical = await resolveCanonicalUploadUrl(op);
  } catch (err: unknown) {
    logger.warn(
      `canonical-asset-url: metadata lookup failed for ${op}: ${err instanceof Error ? err.message : err}`,
      "canonical-asset-url",
    );
  }
  if (!canonical || canonical === op) return { metadata, rewritten: 0 };
  return { metadata: { ...metadata, objectPath: canonical }, rewritten: 1 };
}
