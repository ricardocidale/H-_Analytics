/**
 * slot-context-map.ts
 *
 * Compile-time lookup that maps each LLM-draftable slot key to the minimal
 * subset of PropertyBrief fields it needs. Used by draftSlot() and
 * draftAllSlots() to build tight, token-efficient prompts — only the fields
 * a given slot group actually uses are included in the prompt string.
 *
 * Estimated token savings vs. sending the full brief every time: 40–60%.
 */

import type { PropertyBrief } from "./property-brief";

export type DraftSlotKey =
  | "slide1.headerSubtitle"
  | "slide1.visionBullets"
  | "slide2.operationalModelText"
  | "slide2.revenueBullet"
  | "slide2.programmingBullet"
  | "slide3.conceptParagraph"
  | "slide3.marketRationale"
  | "slide3.reasons"
  | "slide3.closingLine"
  | "slide5.transformationDescription"
  | "slide5.transformationRows";

/**
 * Logical batch groups — slots in the same group are drafted in a single LLM
 * call to minimise round-trips.
 */
export type SlotBatchGroup =
  | "vision"
  | "operational"
  | "investment"
  | "transformation";

export interface SlotContextEntry {
  group: SlotBatchGroup;
  briefFields: Array<keyof PropertyBrief>;
}

export const SLOT_CONTEXT_MAP: Record<DraftSlotKey, SlotContextEntry> = {
  "slide1.headerSubtitle": {
    group: "vision",
    briefFields: [
      "name",
      "locationLabel",
      "modelTierLabel",
      "marketInsight",
      "acquisitionStatus",
    ],
  },
  "slide1.visionBullets": {
    group: "vision",
    briefFields: [
      "name",
      "locationLabel",
      "roomCount",
      "adrFormatted",
      "revparFormatted",
      "occupancyPct",
      "modelTierLabel",
      "marketInsight",
    ],
  },
  "slide2.operationalModelText": {
    group: "operational",
    briefFields: [
      "name",
      "modelTierLabel",
      "adrFormatted",
      "occupancyPct",
      "roomCount",
      "description",
    ],
  },
  "slide2.revenueBullet": {
    group: "operational",
    briefFields: [
      "modelTierLabel",
      "adrFormatted",
      "revparFormatted",
      "occupancyPct",
    ],
  },
  "slide2.programmingBullet": {
    group: "operational",
    briefFields: [
      "name",
      "modelTierLabel",
      "locationLabel",
      "description",
    ],
  },
  "slide3.conceptParagraph": {
    group: "investment",
    briefFields: [
      "name",
      "modelTierLabel",
      "locationLabel",
      "adrFormatted",
      "occupancyPct",
      "marketInsight",
    ],
  },
  "slide3.marketRationale": {
    group: "investment",
    briefFields: [
      "locationLabel",
      "city",
      "stateProvince",
      "marketInsight",
      "roomCount",
    ],
  },
  "slide3.reasons": {
    group: "investment",
    briefFields: [
      "name",
      "locationLabel",
      "modelTierLabel",
      "adrFormatted",
      "revparFormatted",
      "occupancyPct",
      "marketInsight",
      "purchasePriceFormatted",
      "irrFormatted",
      "equityMultipleFormatted",
    ],
  },
  "slide3.closingLine": {
    group: "investment",
    briefFields: [
      "name",
      "city",
      "modelTierLabel",
      "irrFormatted",
    ],
  },
  "slide5.transformationDescription": {
    group: "transformation",
    briefFields: [
      "name",
      "modelTierLabel",
      "roomCount",
      "isHistoric",
      "renovationScope",
      "renovationBudgetFormatted",
    ],
  },
  "slide5.transformationRows": {
    group: "transformation",
    briefFields: [
      "modelTierLabel",
      "roomCount",
      "isHistoric",
      "renovationScope",
      "renovationBudgetFormatted",
      "adrFormatted",
      "revparFormatted",
    ],
  },
};

/**
 * Returns all draft slot keys that belong to a given batch group.
 */
export function getSlotsForGroup(group: SlotBatchGroup): DraftSlotKey[] {
  return (Object.entries(SLOT_CONTEXT_MAP) as [DraftSlotKey, SlotContextEntry][])
    .filter(([, entry]) => entry.group === group)
    .map(([key]) => key);
}

/**
 * Returns the union of PropertyBrief fields needed by every slot in a group.
 * Used to build a single minimal prompt string for a whole batch.
 */
export function getGroupBriefFields(group: SlotBatchGroup): Array<keyof PropertyBrief> {
  const slots = getSlotsForGroup(group);
  const fieldSet = new Set<keyof PropertyBrief>();
  for (const slot of slots) {
    for (const f of SLOT_CONTEXT_MAP[slot].briefFields) {
      fieldSet.add(f);
    }
  }
  return [...fieldSet];
}
