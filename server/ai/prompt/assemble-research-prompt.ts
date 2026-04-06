import type { PropertyContextPack, CompanyContextPack } from "../context-pack/types";

export type ResearchTier = 1 | 2;

export interface AssemblePromptOptions {
  tier: ResearchTier;
  entityType: "property" | "company";
  assumptionKeys?: string[];
  ambientData?: string;
  priorResearch?: string;
  adminInstructions?: string;
}

const PROPERTY_ASSUMPTION_CATEGORIES = [
  { category: "Revenue", keys: ["adr", "adrGrowth", "startOccupancy", "maxOccupancy", "occupancyRampMonths", "occupancyGrowthStep", "revShareEvents", "revShareFB", "revShareOther", "cateringBoost"] },
  { category: "Operating Costs (USALI)", keys: ["costRooms", "costFB", "costAdmin", "costMarketing", "costPropertyOps", "costUtilities", "costTaxes", "costIT", "costFFE", "costOther", "costInsurance"] },
  { category: "Capital & Valuation", keys: ["capRate", "exitCapRate", "interestRate", "ltv", "landValue", "depreciationYears"] },
  { category: "Fees & Tax", keys: ["baseMgmtFee", "incentiveMgmtFee", "incomeTax", "saleCommission"] },
];

const COMPANY_ASSUMPTION_CATEGORIES = [
  { category: "Fee Revenue", keys: ["baseManagementFee", "incentiveManagementFee", "acquisitionCommission", "dispositionCommission"] },
  { category: "Service Markups", keys: ["svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting", "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement"] },
  { category: "Compensation & Staffing", keys: ["partnerComp", "staffSalary", "staffingTiers"] },
  { category: "Fixed Overhead", keys: ["officeLease", "professionalServices", "techInfra", "businessInsurance"] },
  { category: "Variable Costs", keys: ["travelCost", "itLicense", "marketingRate", "miscOps"] },
  { category: "Tax & Exit", keys: ["companyTaxRate", "costOfEquity"] },
];

function buildPropertyContextSection(pack: PropertyContextPack): string {
  return `## ENTITY CONTEXT — ${pack.identity.name}

### Classification
${pack.classification.compositeLabel}
Star Rating: ${pack.classification.starRating ?? "Not yet rated"}${pack.classification.starRatingSuggested ? ` (AI suggested: ${pack.classification.starRatingSuggested}★)` : ""}
Type: ${pack.classification.hospitalityType}

### Location
${pack.location.display}
Market: ${pack.location.market || "Not specified"}
${pack.location.latitude && pack.location.longitude ? `Coordinates: ${pack.location.latitude}, ${pack.location.longitude}` : ""}

### Physical Character & Amenities
${pack.amenityProfile.narrative}

### Revenue Profile
${pack.revenueProfile.narrative}

### Cost Profile (Current Assumptions)
${pack.costProfile.narrative}

### Capital Structure
${pack.capitalStructure.narrative}

### ICP Alignment
${pack.icpAlignment.narrative}

### Current Assumptions Summary
${pack.currentAssumptionsSummary}`;
}

function buildCompanyContextSection(pack: CompanyContextPack): string {
  return `## ENTITY CONTEXT — ${pack.companyProfile.name}

### Company Profile
${pack.companyProfile.description || "No description available"}
Property Label: ${pack.companyProfile.propertyLabel}

### Portfolio Footprint
${pack.portfolioFootprint.narrative}

### Service Menu
${pack.serviceMenu.narrative}

### Fee Structure
${pack.feeStructure.narrative}

### Staffing & Overhead
${pack.staffingOverhead.narrative}

### ICP Positioning
${pack.icpPositioning.narrative}

### Financial Scale
${pack.financialScale.narrative}`;
}

function buildTier1Instructions(entityType: "property" | "company"): string {
  const categories = entityType === "property" ? PROPERTY_ASSUMPTION_CATEGORIES : COMPANY_ASSUMPTION_CATEGORIES;

  return `## RESEARCH INSTRUCTIONS (Tier 1 — Full Entity Research)

Analyze ALL of the following assumption categories for this ${entityType}. For each assumption, provide:
- **Recommended range** (low, mid, high values)
- **Confidence level** (high/medium/low)
- **Data source** and date
- **Reasoning** explaining why this range is appropriate given the entity's specific characteristics

### Categories to Research:
${categories.map(c => `**${c.category}**: ${c.keys.join(", ")}`).join("\n")}

Use the entity context above to determine the EXACT comparable set. Do not guess — the context tells you the property's star rating, type, size, ADR range, amenities, and location. Search for benchmarks matching these specific characteristics.

For every recommended metric, include a "confidence" field with one of: "high" (strong data support), "medium" (reasonable extrapolation), or "low" (limited data, significant uncertainty).`;
}

function buildTier2Instructions(assumptionKeys: string[], entityType: "property" | "company"): string {
  return `## RESEARCH INSTRUCTIONS (Tier 2 — Single Assumption Deep-Dive)

Focus ONLY on the following assumption${assumptionKeys.length > 1 ? "s" : ""}:
${assumptionKeys.map(k => `- **${k}**`).join("\n")}

Use the full entity context above to provide a precise, calibrated recommendation. Include:
- **Recommended value** (low, mid, high)
- **Confidence** (high/medium/low)
- **3-5 comparable data points** from properties/companies matching this entity's classification
- **Source citations** with dates
- **Detailed reasoning** explaining why this specific value is appropriate given the entity's characteristics

Be specific — reference the entity's exact star rating, type, location, and amenities when justifying the recommendation.`;
}

function buildOutputSchema(tier: ResearchTier, entityType: "property" | "company", assumptionKeys?: string[]): string {
  if (tier === 2 && assumptionKeys?.length) {
    return `## OUTPUT FORMAT

Return a JSON object with this structure for each assumption:
\`\`\`json
{
  ${assumptionKeys.map(k => `"${k}": {
    "valueLow": <number>,
    "valueMid": <number>,
    "valueHigh": <number>,
    "confidence": "high" | "medium" | "low",
    "sourceName": "<primary source>",
    "sourceDate": "<YYYY-MM or YYYY>",
    "reasoning": "<2-3 sentence justification>",
    "comparableSet": ["<comp1>", "<comp2>", "<comp3>"],
    "display": "<human-readable range string>"
  }`).join(",\n  ")}
}
\`\`\`
Do not output any text outside the JSON code block.`;
  }

  return `## OUTPUT FORMAT

Return the EXACT same JSON format as a standard ${entityType} research report.
Every numeric field must include a "display" range string, a "mid" point estimate, and a "confidence" field ("high" | "medium" | "low").
Include source citations and reasoning for every recommendation.
Do not output any text outside the JSON code block.`;
}

export function assembleResearchPrompt(
  contextPack: PropertyContextPack | CompanyContextPack,
  options: AssemblePromptOptions,
): string {
  const { tier, entityType, assumptionKeys, ambientData, priorResearch, adminInstructions } = options;

  const sections: string[] = [];

  if ("identity" in contextPack) {
    sections.push(buildPropertyContextSection(contextPack));
  } else {
    sections.push(buildCompanyContextSection(contextPack));
  }

  if (ambientData) {
    sections.push(`## VERIFIED MARKET DATA (use as ground truth)\n${ambientData}`);
  }

  if (priorResearch) {
    sections.push(`## PRIOR RESEARCH (relevant historical findings)\n${priorResearch}`);
  }

  if (tier === 1) {
    sections.push(buildTier1Instructions(entityType));
  } else {
    sections.push(buildTier2Instructions(assumptionKeys ?? [], entityType));
  }

  sections.push(buildOutputSchema(tier, entityType, assumptionKeys));

  if (adminInstructions) {
    sections.push(`## ADDITIONAL INSTRUCTIONS\n${adminInstructions}`);
  }

  return sections.join("\n\n");
}
