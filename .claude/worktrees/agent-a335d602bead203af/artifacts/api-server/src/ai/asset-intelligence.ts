import { storage } from "../storage";
import { upsertChunks, queryChunks, isVectorStoreAvailable, isEmbeddingAvailable } from "./vector-store-service";
import { logger } from "../logger";
import { resolveCanonicalLogoUrl } from "../lib/canonical-asset-url";

// Task #521 — All photo URLs surfaced into Rebecca's prompt MUST be the
// canonical /api/property-photos/<id>/image form, never the raw `imageUrl`
// (which may still hold a legacy `/objects/uploads/<uuid>` value that 404s
// post R2 cutover). The photo route falls back through image_data → image_url
// so the canonical URL stays serveable regardless of the underlying storage.
function canonicalPhotoUrl(photoId: number): string {
  return `/api/property-photos/${photoId}/image`;
}

/**
 * Logos are not slot-served (no per-id endpoint), so a legacy
 * `/objects/uploads/<uuid>` URL on a `logos` row can only be canonicalised
 * if a sibling row already points at `/api/media/<file>`. When no canonical
 * equivalent exists we return null and the caller skips the entry rather
 * than poisoning the vector store / Rebecca prompt with a 404 URL.
 */
async function safeCanonicalLogoUrl(rawUrl: string): Promise<string | null> {
  if (!rawUrl) return null;
  if (!rawUrl.startsWith("/objects/uploads/")) return rawUrl;
  try {
    return await resolveCanonicalLogoUrl(rawUrl);
  } catch (err: unknown) {
    logger.warn(
      `Logo URL canonicalisation failed for ${rawUrl}: ${err instanceof Error ? err.message : err}`,
      "asset-intelligence",
    );
    return null;
  }
}

export interface AssetMatch {
  type: "photo" | "logo";
  id: number;
  url: string;
  caption: string;
  propertyName?: string;
  propertyId?: number;
  isHero?: boolean;
  score: number;
}

export async function indexPropertyPhotos(): Promise<number> {
  if (!isVectorStoreAvailable() || !isEmbeddingAvailable()) return 0;

  try {
    const allProperties = await storage.getAllProperties();
    let indexed = 0;

    for (const property of allProperties) {
      const photos = await storage.getPropertyPhotos(property.id);
      if (photos.length === 0) continue;

      const chunks = photos
        .filter(p => p.caption || p.isHero)
        .map(photo => ({
          id: `asset:photo:${photo.id}`,
          text: [
            `Property photo of ${property.name}`,
            property.location ? `located in ${property.location}` : "",
            photo.caption ?? "",
            photo.isHero ? "hero image main photo" : "",
            photo.generationStyle ?? "",
            "hotel property real estate hospitality image picture",
          ].filter(Boolean).join(" "),
          metadata: {
            assetType: "photo",
            assetId: photo.id,
            propertyId: property.id,
            propertyName: property.name ?? "",
            caption: (photo.caption ?? "").slice(0, 500),
            isHero: photo.isHero,
            url: canonicalPhotoUrl(photo.id),
          },
        }));

      if (chunks.length > 0) {
        await upsertChunks("knowledge-base", chunks);
        indexed += chunks.length;
      }
    }

    logger.info(`Indexed ${indexed} property photos into Vector store`, "asset-intelligence");
    return indexed;
  } catch (err: unknown) {
    logger.warn(`Failed to index property photos: ${err instanceof Error ? err.message : err}`, "asset-intelligence");
    return 0;
  }
}

export async function indexLogos(): Promise<number> {
  if (!isVectorStoreAvailable() || !isEmbeddingAvailable()) return 0;

  try {
    const logos = await storage.getAllLogos();
    if (logos.length === 0) return 0;

    const chunks: Array<{
      id: string;
      text: string;
      metadata: Record<string, string | number | boolean>;
    }> = [];
    let skippedLegacy = 0;
    for (const logo of logos) {
      const canonical = await safeCanonicalLogoUrl(logo.url);
      if (!canonical) {
        // Legacy /objects/uploads/<uuid> with no resolvable canonical sink:
        // skip rather than poison the vector store with a URL that 404s
        // post R2 cutover.
        skippedLegacy += 1;
        continue;
      }
      chunks.push({
        id: `asset:logo:${logo.id}`,
        text: [
          `Company logo for ${logo.name}`,
          logo.companyName ?? "",
          logo.isDefault ? "default company logo branding" : "",
          "logo branding company identity image",
        ].filter(Boolean).join(" "),
        metadata: {
          assetType: "logo",
          assetId: logo.id,
          name: logo.name,
          companyName: logo.companyName ?? "",
          isDefault: logo.isDefault,
          url: canonical,
        },
      });
    }

    if (chunks.length > 0) {
      await upsertChunks("knowledge-base", chunks);
    }
    if (skippedLegacy > 0) {
      logger.warn(`Skipped ${skippedLegacy} logo(s) with unresolvable legacy /objects/uploads URL during indexing`, "asset-intelligence");
    }
    logger.info(`Indexed ${chunks.length} logos into Vector store`, "asset-intelligence");
    return chunks.length;
  } catch (err: unknown) {
    logger.warn(`Failed to index logos: ${err instanceof Error ? err.message : err}`, "asset-intelligence");
    return 0;
  }
}

export async function searchAssets(query: string, topK = 6, accessiblePropertyIds?: number[]): Promise<AssetMatch[]> {
  if (!isVectorStoreAvailable() || !isEmbeddingAvailable()) {
    return fallbackAssetSearch(query, accessiblePropertyIds);
  }

  try {
    const enrichedQuery = `${query} photo image logo picture visual property hotel`;
    const matches = await queryChunks("knowledge-base", enrichedQuery, topK * 2);

    const assetMatches = matches
      .filter(m => String(m.metadata.assetType) === "photo" || String(m.metadata.assetType) === "logo")
      .filter(m => m.score > 0.3)
      .filter(m => {
        if (!accessiblePropertyIds) return true;
        if (String(m.metadata.assetType) === "logo") return true;
        const propId = Number(m.metadata.propertyId ?? 0);
        return propId === 0 || accessiblePropertyIds.includes(propId);
      })
      .slice(0, topK);

    if (assetMatches.length === 0) {
      return fallbackAssetSearch(query, accessiblePropertyIds);
    }

    // Defensive canonicalisation at query time — entries indexed before
    // Task #521 may still carry raw `/objects/uploads/<uuid>` URLs in
    // their metadata. Photos always rewrite to the served endpoint;
    // logos drop out of the result set when no canonical sink exists
    // rather than emit a 404 URL into Rebecca's prompt.
    const out: AssetMatch[] = [];
    for (const m of assetMatches) {
      if (String(m.metadata.assetType) === "photo") {
        const id = Number(m.metadata.assetId);
        out.push({
          type: "photo",
          id,
          url: canonicalPhotoUrl(id),
          caption: String(m.metadata.caption || m.metadata.propertyName || ""),
          propertyName: String(m.metadata.propertyName || ""),
          propertyId: Number(m.metadata.propertyId ?? 0),
          isHero: Boolean(m.metadata.isHero),
          score: m.score,
        });
        continue;
      }
      const rawUrl = String(m.metadata.url);
      const canonical = await safeCanonicalLogoUrl(rawUrl);
      if (!canonical) continue;
      out.push({
        type: "logo",
        id: Number(m.metadata.assetId),
        url: canonical,
        caption: String(m.metadata.name || ""),
        score: m.score,
      });
    }
    return out;
  } catch (err: unknown) {
    logger.warn(`Vector store asset search failed, falling back: ${err instanceof Error ? err.message : err}`, "asset-intelligence");
    return fallbackAssetSearch(query, accessiblePropertyIds);
  }
}

async function fallbackAssetSearch(query: string, accessiblePropertyIds?: number[]): Promise<AssetMatch[]> {
  const lq = query.toLowerCase();
  const results: AssetMatch[] = [];

  try {
    const allProperties = await storage.getAllProperties();
    const filteredProperties = accessiblePropertyIds
      ? allProperties.filter(p => accessiblePropertyIds.includes(p.id))
      : allProperties;

    for (const prop of filteredProperties) {
      const nameMatch = prop.name && lq.includes(prop.name.toLowerCase());
      const locationMatch = prop.location && lq.includes(prop.location.toLowerCase());
      if (!nameMatch && !locationMatch) continue;

      const photos = await storage.getPropertyPhotos(prop.id);
      for (const photo of photos) {
        const captionMatch = photo.caption && lq.includes(photo.caption.toLowerCase());
        results.push({
          type: "photo",
          id: photo.id,
          url: canonicalPhotoUrl(photo.id),
          caption: photo.caption ?? prop.name ?? "",
          propertyName: prop.name ?? "",
          propertyId: prop.id,
          isHero: photo.isHero,
          score: photo.isHero ? 0.9 : captionMatch ? 0.8 : 0.6,
        });
      }
    }

    if (lq.includes("logo") || lq.includes("brand")) {
      const logos = await storage.getAllLogos();
      for (const logo of logos) {
        const canonical = await safeCanonicalLogoUrl(logo.url);
        if (!canonical) continue;
        results.push({
          type: "logo",
          id: logo.id,
          url: canonical,
          caption: logo.name,
          score: 0.7,
        });
      }
    }
  } catch (err: unknown) {
    logger.warn(`Fallback asset search failed: ${err instanceof Error ? err.message : err}`, "asset-intelligence");
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 6);
}

export function buildAssetContext(assets: AssetMatch[]): string {
  if (assets.length === 0) return "";

  const lines = ["AVAILABLE VISUAL ASSETS (use markdown image syntax to show these):"];

  for (const asset of assets) {
    if (asset.type === "photo") {
      lines.push(`- Photo ID ${asset.id}: "${asset.caption}" (${asset.propertyName}${asset.isHero ? ", HERO" : ""}) → ![${asset.caption}](${asset.url})`);
    } else {
      lines.push(`- Logo ID ${asset.id}: "${asset.caption}" → ![${asset.caption}](${asset.url})`);
    }
  }

  lines.push("");
  lines.push("When the user asks to see photos, logos, or images, include the markdown image syntax exactly as shown above. Always include relevant images when discussing a specific property.");

  return lines.join("\n");
}

export async function indexAllAssets(): Promise<{ photos: number; logos: number }> {
  const [photos, logos] = await Promise.all([
    indexPropertyPhotos(),
    indexLogos(),
  ]);
  return { photos, logos };
}
