/**
 * LLM-generated property improvement suggestions for Slide 5.
 *
 * Called at render time so suggestions can evolve with each regeneration.
 * Falls back to computed generic rows if the LLM call fails.
 */

import { getAnthropicClient } from "../ai/clients";
import type { SlideProperty, PropertyImprovement } from "./slide-jsx";
import { logger } from "../logger";

export type { PropertyImprovement };

function typeLabel(p: SlideProperty): string {
  const m = ((p.hospitalityType ?? "") + (p.businessModel ?? "")).toLowerCase();
  if (m.includes("retreat")) return "retreat center";
  if (m.includes("vrbo") || m.includes("vacation")) return "luxury vacation rental";
  if (m.includes("boutique") || m.includes("hotel")) return "boutique hotel";
  if (m.includes("bnb")) return "bed and breakfast";
  if (m.includes("motel")) return "boutique motel";
  if (m.includes("resort")) return "boutique resort";
  return "boutique hospitality property";
}

export async function generatePropertyImprovements(
  property: SlideProperty,
): Promise<PropertyImprovement[]> {
  const client = getAnthropicClient();

  const prompt = `You are a senior hospitality investment analyst preparing an investor presentation slide for a boutique property acquisition.

Property Details:
- Name: ${property.name}
- Location: ${property.city}, ${property.stateProvince}, ${property.country}
- Type: ${typeLabel(property)}
- Rooms: ${property.roomCount} keys
- Quality Tier: ${property.qualityTier || "not specified"}
- Purchase Price: $${property.purchasePrice?.toLocaleString() ?? "not specified"}
- Description: ${property.description || "No description provided"}
- Renovation Scope: ${property.renovationScope || "Standard boutique conversion"}
- Historic: ${property.isHistoric ? "Yes — character-preserving renovation required" : "No"}

Generate exactly 4 improvement areas that will transform this specific property into a high-performing boutique hospitality asset. Each improvement must be:
1. Specific to this property's type, location, and characteristics — not generic
2. Financially compelling (revenue-generating or cost-reducing)
3. Realistic given the purchase price and property description
4. Brief: "existing" in 3–5 words, "proposed" in 4–8 words

Return ONLY a valid JSON array with no explanation:
[
  {"feature": "...", "existing": "...", "proposed": "..."},
  {"feature": "...", "existing": "...", "proposed": "..."},
  {"feature": "...", "existing": "...", "proposed": "..."},
  {"feature": "...", "existing": "...", "proposed": "..."}
]`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array in LLM response");

    const parsed = JSON.parse(match[0]) as PropertyImprovement[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty array");

    return parsed.slice(0, 5);
  } catch (err) {
    logger.warn(`[improvement-suggestions] LLM failed for "${property.name}": ${err}`, "slides");
    return fallbackImprovements(property);
  }
}

function fallbackImprovements(p: SlideProperty): PropertyImprovement[] {
  return [
    { feature: "Guest Rooms", existing: "Standard configuration", proposed: `${p.roomCount} boutique-designed keys` },
    { feature: "Event Space", existing: "Limited or underused", proposed: "Curated venue programming" },
    { feature: "Amenities", existing: "Basic hospitality", proposed: "Experiential amenity packages" },
    { feature: "F&B", existing: "Standard service model", proposed: "Chef-driven local concept" },
  ];
}
