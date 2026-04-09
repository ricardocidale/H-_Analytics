import type { DocumentAIResult } from "../integrations/document-ai";
import type { Property } from "@shared/schema";

export interface MappedField {
  fieldName: string;
  fieldLabel: string;
  extractedValue: string;
  numericValue: number | null;
  mappedPropertyField: string | null;
  confidence: number;
  currentValue: string | null;
}

interface FieldMapping {
  propertyField: string;
  aliases: string[];
  isPercentage?: boolean;
  isCurrency?: boolean;
  isInteger?: boolean;
}

const FIELD_MAPPINGS: FieldMapping[] = [
  {
    propertyField: "purchasePrice",
    aliases: ["purchase price", "acquisition price", "sale price", "asking price", "total price", "property price", "property value"],
    isCurrency: true,
  },
  {
    propertyField: "startAdr",
    aliases: ["average daily rate", "adr", "avg daily rate", "daily rate", "room rate", "average rate"],
    isCurrency: true,
  },
  {
    propertyField: "startOccupancy",
    aliases: ["occupancy rate", "occupancy", "occ rate", "occupancy %", "occ %", "average occupancy"],
    isPercentage: true,
  },
  {
    propertyField: "maxOccupancy",
    aliases: ["max occupancy", "maximum occupancy", "stabilized occupancy", "target occupancy"],
    isPercentage: true,
  },
  {
    propertyField: "roomCount",
    aliases: ["room count", "rooms", "number of rooms", "total rooms", "guest rooms", "keys", "total keys"],
    isInteger: true,
  },
  {
    propertyField: "revShareEvents",
    aliases: ["events revenue", "event revenue", "banquet revenue", "catering revenue", "meeting revenue", "revenue events", "rev share events"],
    isPercentage: true,
  },
  {
    propertyField: "revShareFB",
    aliases: ["food & beverage revenue", "f&b revenue", "fb revenue", "food and beverage", "restaurant revenue", "dining revenue", "food beverage revenue"],
    isPercentage: true,
  },
  {
    propertyField: "revShareOther",
    aliases: ["other revenue", "miscellaneous revenue", "other income", "ancillary revenue", "misc revenue"],
    isPercentage: true,
  },
  {
    propertyField: "costRateRooms",
    aliases: ["rooms expense", "room expense", "rooms cost", "rooms department", "room department expense", "rooms dept"],
    isPercentage: true,
  },
  {
    propertyField: "costRateFB",
    aliases: ["f&b expense", "food & beverage expense", "fb expense", "food and beverage cost", "f&b cost", "food beverage expense"],
    isPercentage: true,
  },
  {
    propertyField: "costRateAdmin",
    aliases: ["administrative & general", "admin & general", "a&g", "admin expense", "administrative expense", "general & admin", "g&a"],
    isPercentage: true,
  },
  {
    propertyField: "costRateMarketing",
    aliases: ["marketing", "sales & marketing", "marketing expense", "sales and marketing", "s&m"],
    isPercentage: true,
  },
  {
    propertyField: "costRatePropertyOps",
    aliases: ["property operations", "property ops", "maintenance", "property operations & maintenance", "pom", "repairs & maintenance", "r&m"],
    isPercentage: true,
  },
  {
    propertyField: "costRateUtilities",
    aliases: ["utilities", "utility expense", "utility cost", "energy costs", "electricity", "utilities expense"],
    isPercentage: true,
  },
  {
    propertyField: "costRateTaxes",
    aliases: ["property taxes", "taxes", "real estate taxes", "property tax", "tax expense", "tax assessment"],
    isPercentage: true,
  },
  {
    propertyField: "costRateIT",
    aliases: ["it & telecom", "it expense", "technology", "information technology", "telecom", "it cost", "it"],
    isPercentage: true,
  },
  {
    propertyField: "costRateFFE",
    aliases: ["ff&e reserve", "ffe reserve", "furniture fixtures", "ff&e", "capital reserve", "reserve for replacement"],
    isPercentage: true,
  },
  {
    propertyField: "costRateOther",
    aliases: ["other expense", "other costs", "miscellaneous expense", "other operating expense"],
    isPercentage: true,
  },
  {
    propertyField: "exitCapRate",
    aliases: ["cap rate", "capitalization rate", "exit cap rate", "going-in cap rate"],
    isPercentage: true,
  },
  {
    propertyField: "buildingImprovements",
    aliases: ["building improvements", "renovations", "capex", "capital expenditure", "improvements"],
    isCurrency: true,
  },
  {
    propertyField: "preOpeningCosts",
    aliases: ["pre-opening costs", "pre opening costs", "preopening", "startup costs", "pre-opening expenses"],
    isCurrency: true,
  },
  {
    propertyField: "operatingReserve",
    aliases: ["operating reserve", "working capital", "cash reserve", "operating reserve fund"],
    isCurrency: true,
  },
  {
    propertyField: "adrGrowthRate",
    aliases: ["adr growth", "rate growth", "adr growth rate", "revenue growth", "growth rate"],
    isPercentage: true,
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s&%$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(input: string, candidate: string): number {
  const normalizedInput = normalize(input);
  const normalizedCandidate = normalize(candidate);

  if (normalizedInput === normalizedCandidate) return 1.0;
  if (normalizedInput.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedInput)) return 0.9;

  const maxLen = Math.max(normalizedInput.length, normalizedCandidate.length);
  if (maxLen === 0) return 0;
  const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
  return 1 - distance / maxLen;
}

function findBestMapping(label: string): { mapping: FieldMapping; score: number } | null {
  let bestMapping: FieldMapping | null = null;
  let bestScore = 0;

  for (const mapping of FIELD_MAPPINGS) {
    for (const alias of mapping.aliases) {
      const score = fuzzyMatch(label, alias);
      if (score > bestScore && score >= 0.65) {
        bestScore = score;
        bestMapping = mapping;
      }
    }
  }

  return bestMapping ? { mapping: bestMapping, score: bestScore } : null;
}

function parseNumericValue(text: string): number | null {
  const cleaned = text
    .replace(/[$,]/g, "")
    .replace(/%/g, "")
    .trim();

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function getPropertyValue(property: Property, field: string): string | null {
  const value = (property as Record<string, unknown>)[field];
  if (value === null || value === undefined) return null;
  return String(value);
}

export function mapExtractionToFields(
  result: DocumentAIResult,
  property: Property
): MappedField[] {
  const fields: MappedField[] = [];
  const seenFields = new Set<string>();

  for (const page of result.pages) {
    for (const table of page.tables) {
      for (const row of table.bodyRows) {
        if (row.length < 2) continue;

        const label = row[0]?.trim();
        const value = row[row.length - 1]?.trim();
        if (!label || !value) continue;

        const match = findBestMapping(label);
        const numericValue = parseNumericValue(value);

        if (match && !seenFields.has(match.mapping.propertyField)) {
          seenFields.add(match.mapping.propertyField);

          let processedValue = numericValue;
          if (processedValue !== null && match.mapping.isPercentage && processedValue > 1) {
            processedValue = processedValue / 100;
          }

          fields.push({
            fieldName: match.mapping.propertyField,
            fieldLabel: label,
            extractedValue: value,
            numericValue: processedValue,
            mappedPropertyField: match.mapping.propertyField,
            confidence: match.score,
            currentValue: getPropertyValue(property, match.mapping.propertyField),
          });
        } else if (!match) {
          fields.push({
            fieldName: normalize(label).replace(/\s+/g, "_"),
            fieldLabel: label,
            extractedValue: value,
            numericValue,
            mappedPropertyField: null,
            confidence: 0.3,
            currentValue: null,
          });
        }
      }
    }
  }

  for (const kvp of result.keyValuePairs) {
    const match = findBestMapping(kvp.key);
    if (match && !seenFields.has(match.mapping.propertyField)) {
      seenFields.add(match.mapping.propertyField);
      const numericValue = parseNumericValue(kvp.value);
      let processedValue = numericValue;
      if (processedValue !== null && match.mapping.isPercentage && processedValue > 1) {
        processedValue = processedValue / 100;
      }

      fields.push({
        fieldName: match.mapping.propertyField,
        fieldLabel: kvp.key,
        extractedValue: kvp.value,
        numericValue: processedValue,
        mappedPropertyField: match.mapping.propertyField,
        confidence: Math.min(kvp.confidence, match.score),
        currentValue: getPropertyValue(property, match.mapping.propertyField),
      });
    }
  }

  return fields.sort((a, b) => b.confidence - a.confidence);
}

export function getConfidenceLevel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}
