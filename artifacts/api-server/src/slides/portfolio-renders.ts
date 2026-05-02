/**
 * Ensures every portfolio property has a hero photo before slide rendering.
 *
 * For properties with no existing photos, generates a photorealistic
 * architectural render via Replicate FLUX and saves it as the hero photo.
 * Stored as imageData in Neon so it's available independent of object storage.
 */

import { storage } from "../storage";
import { replicateService } from "../integrations/replicate";
import { getStorageProviderAsync } from "../providers/storage";
import { logger } from "../logger";
import { randomUUID } from "crypto";
import type { Property } from "@workspace/db";

/** Properties with ≤ this many keys are described as "intimate, residential scale". */
const INTIMATE_PROPERTY_KEY_THRESHOLD = 20;

/** Max characters of property description appended to the render prompt. */
const DESCRIPTION_PROMPT_CHARS = 180;

function buildRenderPrompt(property: Property): string {
  const p = property as Record<string, unknown>;
  const type = ((p.hospitalityType ?? property.businessModel ?? "") as string).toLowerCase();

  const parts: string[] = [];

  if (type.includes("boutique") || type.includes("hotel")) {
    parts.push("boutique luxury hotel exterior architectural render");
  } else if (type.includes("retreat")) {
    parts.push("boutique wellness retreat center exterior, serene natural setting");
  } else if (type.includes("bnb") || type.includes("bed")) {
    parts.push("charming luxury bed and breakfast exterior, historic character");
  } else if (type.includes("motel")) {
    parts.push("renovated boutique motel exterior, modern hospitality aesthetic");
  } else if (type.includes("resort")) {
    parts.push("intimate boutique resort exterior, destination feel");
  } else {
    parts.push("boutique hospitality property exterior, luxury aesthetic");
  }

  if (property.city && property.stateProvince) {
    parts.push(`located in ${property.city}, ${property.stateProvince}`);
  } else if (property.city) {
    parts.push(`in ${property.city}`);
  }
  if (property.country && property.country !== "US" && property.country !== "United States") {
    parts.push(property.country);
  }

  if (p.isHistoric) {
    parts.push("historic architecture with preserved period details, thoughtful character renovation");
  }

  if (property.roomCount && property.roomCount <= INTIMATE_PROPERTY_KEY_THRESHOLD) {
    parts.push(`intimate ${property.roomCount}-key property, residential scale`);
  } else if (property.roomCount) {
    parts.push(`${property.roomCount} guest rooms, substantial boutique hotel`);
  }

  const qualityTier = ((p.qualityTier ?? "") as string).toLowerCase();
  if (qualityTier.includes("luxury") || qualityTier.includes("ultra")) {
    parts.push("ultra-luxury finishes, manicured grounds, impeccable curb appeal");
  } else if (qualityTier.includes("upscale")) {
    parts.push("upscale finishes, sophisticated street presence, landscaped entry");
  } else {
    parts.push("thoughtfully renovated exterior, boutique character, welcoming entrance");
  }

  if (property.description && property.description.length > INTIMATE_PROPERTY_KEY_THRESHOLD) {
    parts.push(property.description.slice(0, DESCRIPTION_PROMPT_CHARS).replace(/\n/g, " "));
  }

  parts.push(
    "professional architectural photography",
    "golden hour warm directional light",
    "dramatic sky, scattered clouds",
    "sharp focus on facade and entrance",
    "high-resolution editorial quality render",
  );

  return parts.join(", ");
}

/**
 * Checks each property in the list. For those with no hero photo,
 * generates an architectural render via Replicate and saves it.
 * Safe to call concurrently — each property is checked independently.
 */
export async function ensurePortfolioRenders(propertyIds: number[]): Promise<void> {
  const missing: number[] = [];
  for (const id of propertyIds) {
    const hero = await storage.getHeroPhoto(id);
    if (!hero) missing.push(id);
  }

  if (missing.length === 0) {
    logger.info("[portfolio-renders] All portfolio properties have hero photos", "slides");
    return;
  }

  logger.info(`[portfolio-renders] Generating renders for ${missing.length} properties`, "slides");

  await Promise.allSettled(
    missing.map(async (propertyId) => {
      const property = await storage.getProperty(propertyId);
      if (!property) return;

      try {
        const prompt = buildRenderPrompt(property);
        logger.info(
          `[portfolio-renders] Generating render for "${property.name}": ${prompt.slice(0, 100)}…`,
          "slides",
        );

        const buffer = await replicateService.generateImage("architectural-exterior", prompt);

        const storageProvider = await getStorageProviderAsync();
        const objectPath = await storageProvider.uploadBuffer(
          `renders/properties/${propertyId}/${randomUUID()}`,
          buffer,
          "image/png",
        );

        const existing = await storage.getPropertyPhotos(propertyId);
        await storage.addPropertyPhoto({
          propertyId,
          imageUrl: objectPath,
          caption: `AI architectural render — ${property.city ?? property.name}`,
          sortOrder: existing.length,
          isHero: existing.length === 0,
          generationStyle: "architectural-exterior",
          imageData: buffer.toString("base64"),
        });

        logger.info(`[portfolio-renders] Render saved for "${property.name}"`, "slides");
      } catch (err) {
        logger.warn(
          `[portfolio-renders] Failed to generate render for property ${propertyId}: ${err}`,
          "slides",
        );
      }
    }),
  );
}
