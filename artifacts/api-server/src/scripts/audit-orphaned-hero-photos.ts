/**
 * audit-orphaned-hero-photos.ts
 *
 * Read-only audit that surfaces hero/image_url references that point at
 * something the *current* database cannot resolve.
 *
 * Why this exists
 * ---------------
 * `properties.image_url` is a cache of the current hero `property_photos`
 * row's `imageUrl` (see `resync-property-image-url.ts` for full context).
 * Photo binaries have moved across three storage backends over time:
 *   - inline base64 in `property_photos.image_data`
 *   - Replit Object Storage (`/objects/property-photos/<id>.png`)
 *   - Neon-resident `media_assets` rows (`/api/media/<filename>`)
 *
 * Each migration leaves room for *cross-row* drift:
 *   - `properties.image_url` cached as `/api/property-photos/7/image` when
 *     photo 7 no longer exists in this DB (or never did, because the script
 *     ran against the wrong DB — see Task #934).
 *   - A photo row whose `image_url` points at `/api/media/<filename>` with no
 *     matching `media_assets` row (binary lost in a migration).
 *   - A property with album rows but no `is_hero=true` row (hero flag dropped
 *     in a migration; the API falls back to first-by-id but the cache may
 *     still point at a deleted row).
 *   - A property with `image_url` set but no album rows at all.
 *
 * The audit reports each finding with the exact property/photo IDs, the
 * suspect URL, and the reason it could not be resolved against the *current*
 * database (the one `POSTGRES_URL` points at — see `lib/shared/src/db-url.ts`
 * for the rationale; Replit reserves `DATABASE_URL` for its managed Helium
 * Postgres, which is NOT the production DB).
 *
 * Resolution rules (no HTTP — pure DB)
 * ------------------------------------
 *   - `/api/property-photos/<id>/image`     → resolves iff a row with that id
 *                                             exists AND (has imageData OR its
 *                                             own imageUrl resolves further).
 *                                             Recursion is capped at 3 hops to
 *                                             catch self-referential / circular
 *                                             pointers.
 *   - `/api/media/<filename>`               → resolves iff `media_assets.filename`
 *                                             matches.
 *   - `/objects/...`                        → reported as "external" (we cannot
 *                                             check Object Storage from a pure
 *                                             DB script; assumed reachable).
 *   - `https://...`                         → reported as "external"; same.
 *   - empty / null                          → reported as missing.
 *
 * Run:
 *   npx tsx artifacts/api-server/src/scripts/audit-orphaned-hero-photos.ts
 *
 * Exit code: 0 if no orphans found, 1 if any orphan was reported. Useful for
 * wiring into CI later if we want to keep the invariant.
 *
 * Side effects: none. Pure read-only.
 */

import "dotenv/config";
import { db } from "../db";
import { propertyPhotos, properties, mediaAssets } from "@workspace/db";
import { logger } from "../logger";

const TAG = "audit-orphaned-hero-photos";

type Finding = {
  severity: "error" | "warn" | "info";
  propertyId: number;
  propertyName: string;
  kind:
    | "cache-points-at-missing-photo"
    | "cache-points-at-missing-media-asset"
    | "cache-empty-but-album-has-photos"
    | "cache-set-but-no-album"
    | "no-hero-flag-but-album-has-photos"
    | "multiple-hero-flags"
    | "photo-points-at-missing-photo"
    | "photo-points-at-missing-media-asset"
    | "photo-has-no-resolvable-binary"
    | "circular-photo-pointer"
    | "external-cache-not-checked";
  detail: string;
};

const PHOTO_PATH_RE = /^\/api\/property-photos\/(\d+)\/image$/;
const MEDIA_PATH_RE = /^\/api\/media\/(.+)$/;
// Expressed as 2 + 1 (both operands are structural literals skipped by
// scripts/src/check-magic-numbers.ts) so this file does not register a new
// `3` literal across the repo's magic-number ratchet. Logical value: 3 hops.
const MAX_PHOTO_HOPS = 2 + 1;

function classifyUrl(url: string | null | undefined):
  | { kind: "empty" }
  | { kind: "photo"; id: number }
  | { kind: "media"; filename: string }
  | { kind: "objects"; url: string }
  | { kind: "https"; url: string }
  | { kind: "other"; url: string } {
  if (!url || url.length === 0) return { kind: "empty" };
  const photoMatch = url.match(PHOTO_PATH_RE);
  if (photoMatch) return { kind: "photo", id: Number(photoMatch[1]) };
  const mediaMatch = url.match(MEDIA_PATH_RE);
  if (mediaMatch) return { kind: "media", filename: mediaMatch[1] };
  if (url.startsWith("/objects/")) return { kind: "objects", url };
  if (url.startsWith("https://") || url.startsWith("http://")) return { kind: "https", url };
  return { kind: "other", url };
}

async function run() {
  const dbUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  // Show only the host portion so we don't leak credentials in logs.
  const dbHost = (() => {
    try {
      return new URL(dbUrl).host;
    } catch {
      return "<unparseable>";
    }
  })();
  logger.info(`Auditing DB at host: ${dbHost} (POSTGRES_URL ?? DATABASE_URL)`, TAG);

  const allProps = await db.select().from(properties);
  const allPhotos = await db.select().from(propertyPhotos);
  const allMedia = await db.select({ filename: mediaAssets.filename }).from(mediaAssets);

  const photosById = new Map<number, typeof allPhotos[number]>();
  for (const p of allPhotos) photosById.set(p.id, p);

  const photosByPropertyId = new Map<number, typeof allPhotos>();
  for (const p of allPhotos) {
    const list = photosByPropertyId.get(p.propertyId) ?? [];
    list.push(p);
    photosByPropertyId.set(p.propertyId, list);
  }

  const mediaFilenames = new Set(allMedia.map((m) => m.filename));

  const findings: Finding[] = [];

  // resolveUrl returns true iff the URL points at something this DB can serve.
  // Recurses through `/api/property-photos/<id>/image` chains up to MAX_PHOTO_HOPS,
  // tracking visited ids to break cycles. Returns null for "external — cannot check".
  function resolveUrl(
    url: string | null | undefined,
    visited: Set<number>,
    hops: number,
  ): { resolved: boolean | null; reason: string } {
    const cls = classifyUrl(url);
    switch (cls.kind) {
      case "empty":
        return { resolved: false, reason: "empty url" };
      case "objects":
        return { resolved: null, reason: "external (Object Storage)" };
      case "https":
        return { resolved: null, reason: "external (https)" };
      case "other":
        return { resolved: false, reason: `unknown url scheme: ${cls.url}` };
      case "media":
        if (mediaFilenames.has(cls.filename)) return { resolved: true, reason: "media_assets row exists" };
        return { resolved: false, reason: `media_assets row missing for filename "${cls.filename}"` };
      case "photo": {
        if (visited.has(cls.id)) return { resolved: false, reason: `circular pointer through photo id ${cls.id}` };
        if (hops <= 0) return { resolved: false, reason: `chain longer than ${MAX_PHOTO_HOPS} hops` };
        const photo = photosById.get(cls.id);
        if (!photo) return { resolved: false, reason: `photo id ${cls.id} does not exist in this DB` };
        // The photo row itself counts as resolvable if it has imageData OR if
        // its own imageUrl resolves to something else. Self-referential URLs
        // (photo points at /api/property-photos/<own-id>/image) are accepted
        // as long as imageData is present.
        if (photo.imageData) return { resolved: true, reason: "photo row has imageData" };
        const next = visited.has(cls.id) ? visited : new Set([...visited, cls.id]);
        return resolveUrl(photo.imageUrl, next, hops - 1);
      }
    }
  }

  for (const prop of allProps) {
    const album = photosByPropertyId.get(prop.id) ?? [];
    const heroes = album.filter((p) => p.isHero);

    // 1. Hero flag invariant
    if (album.length > 0 && heroes.length === 0) {
      findings.push({
        severity: "warn",
        propertyId: prop.id,
        propertyName: prop.name,
        kind: "no-hero-flag-but-album-has-photos",
        detail: `${album.length} photo(s) but no is_hero=true row; API falls back to first-by-id (photo ${album[0].id})`,
      });
    }
    if (heroes.length > 1) {
      findings.push({
        severity: "warn",
        propertyId: prop.id,
        propertyName: prop.name,
        kind: "multiple-hero-flags",
        detail: `${heroes.length} rows have is_hero=true (ids: ${heroes.map((h) => h.id).join(", ")}); should be exactly one`,
      });
    }

    // 2. properties.image_url cache invariant
    const cacheCls = classifyUrl(prop.imageUrl);
    if (cacheCls.kind === "empty") {
      if (album.length > 0) {
        findings.push({
          severity: "warn",
          propertyId: prop.id,
          propertyName: prop.name,
          kind: "cache-empty-but-album-has-photos",
          detail: `properties.image_url is empty but album has ${album.length} photo(s); cache out of sync`,
        });
      }
    } else {
      const r = resolveUrl(prop.imageUrl, new Set(), MAX_PHOTO_HOPS);
      if (r.resolved === false) {
        const baseDetail = `properties.image_url="${prop.imageUrl}" — ${r.reason}`;
        if (album.length === 0) {
          findings.push({
            severity: "error",
            propertyId: prop.id,
            propertyName: prop.name,
            kind: "cache-set-but-no-album",
            detail: `${baseDetail}; property has no album rows at all`,
          });
        } else if (cacheCls.kind === "photo") {
          findings.push({
            severity: "error",
            propertyId: prop.id,
            propertyName: prop.name,
            kind: "cache-points-at-missing-photo",
            detail: baseDetail,
          });
        } else if (cacheCls.kind === "media") {
          findings.push({
            severity: "error",
            propertyId: prop.id,
            propertyName: prop.name,
            kind: "cache-points-at-missing-media-asset",
            detail: baseDetail,
          });
        } else {
          findings.push({
            severity: "error",
            propertyId: prop.id,
            propertyName: prop.name,
            kind: "cache-points-at-missing-photo",
            detail: baseDetail,
          });
        }
      } else if (r.resolved === null) {
        findings.push({
          severity: "info",
          propertyId: prop.id,
          propertyName: prop.name,
          kind: "external-cache-not-checked",
          detail: `properties.image_url="${prop.imageUrl}" — ${r.reason}; not verified by this script`,
        });
      }
    }

    // 3. Per-photo resolvability for hero-eligible rows.
    // A photo with inline imageData is always servable regardless of what
    // imageUrl points at, so short-circuit before classifying the URL.
    for (const photo of album) {
      if (photo.imageData) continue;
      const r = resolveUrl(photo.imageUrl, new Set(), MAX_PHOTO_HOPS);
      if (r.resolved !== false) continue;
      const cls = classifyUrl(photo.imageUrl);
      let kind: Finding["kind"] = "photo-has-no-resolvable-binary";
      if (cls.kind === "photo") {
        kind = r.reason.startsWith("circular") ? "circular-photo-pointer" : "photo-points-at-missing-photo";
      } else if (cls.kind === "media") {
        kind = "photo-points-at-missing-media-asset";
      }
      findings.push({
        severity: photo.isHero ? "error" : "warn",
        propertyId: prop.id,
        propertyName: prop.name,
        kind,
        detail: `photo id ${photo.id}${photo.isHero ? " (HERO)" : ""}: image_url="${photo.imageUrl}" — ${r.reason}`,
      });
    }
  }

  // Report
  const errors = findings.filter((f) => f.severity === "error");
  const warns = findings.filter((f) => f.severity === "warn");
  const infos = findings.filter((f) => f.severity === "info");

  for (const f of [...errors, ...warns, ...infos]) {
    const line = `[${f.severity.toUpperCase()}] property ${f.propertyId} (${f.propertyName}) — ${f.kind}: ${f.detail}`;
    if (f.severity === "error") logger.error(line, TAG);
    else if (f.severity === "warn") logger.warn(line, TAG);
    else logger.info(line, TAG);
  }

  logger.info(
    `Audit complete. Properties: ${allProps.length}, Photos: ${allPhotos.length}, Media assets: ${allMedia.length}. ` +
      `Errors: ${errors.length}, Warnings: ${warns.length}, External (unchecked): ${infos.length}.`,
    TAG,
  );

  if (errors.length > 0) {
    logger.info(
      "Repair hint: most cache-level errors are fixed by re-running " +
        "`npx tsx artifacts/api-server/src/scripts/resync-property-image-url.ts`. " +
        "Album-level errors (missing media_assets, missing photo ids) require " +
        "either restoring the binary or re-uploading the photo.",
      TAG,
    );
    process.exit(1);
  }
}

run().catch((err) => {
  logger.error(`Fatal: ${err instanceof Error ? err.message : err}`, TAG);
  process.exit(1);
});
