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

function buildBusinessModelGuidance(businessModel: string): string {
  if (businessModel === "vrbo") {
    return `### Business Model Context — VRBO / Short-Term Rental (STR)
This is a VRBO/STR property. Apply STR-specific benchmarks, NOT traditional hotel metrics:
- **Platform Economics**: Airbnb host fees ~3%, VRBO/HomeAway ~5%, guest service fees 6–14%. Total platform take rate typically 14–20% of gross booking.
- **Cleaning Turnover**: Per-turn cleaning costs $75–$250+ depending on unit size. Budget 8–15% of room revenue for cleaning.
- **Revenue Pattern**: Highly seasonal with weekend/holiday peaks. Use STR-specific demand curves, not hotel occupancy ramps.
- **Operating Costs**: Lower staffing (no front desk/concierge), higher per-stay linen/amenity costs, property management fee 20–35% if third-party managed.
- **ADR Benchmarks**: Reference AirDNA, AllTheRooms, or Mashvisor for comp market ADR — NOT STR/CoStar hotel data.
- **Occupancy Norms**: STR stabilized occupancy typically 55–80% (lower than hotels due to minimum stays, seasonality). Ramp period 1–6 months.
- **Cap Rates**: STR cap rates 5–10%, often 1–2% higher than comparable hotel cap rates due to income volatility.
- **Pre-Opening**: Minimal — furnishing, photography, listing optimization, initial supplies ($5K–$50K depending on unit count).`;
  }

  if (businessModel === "lodge") {
    return `### Business Model Context — Lodge / Whole-Property Rental
This is a lodge property (whole-property rental model). Apply lodge-specific benchmarks:
- **Rental Model**: Entire property rented to one group at a time (corporate retreats, weddings, family reunions). NOT per-room pricing.
- **ADR Concept**: ADR represents total nightly rate for the entire property divided by room count for per-key normalization.
- **Guest Meals**: Full-board or half-board common. F&B cost rates 35–55% of F&B revenue (higher than hotels due to custom menus).
- **Staffing**: Lean full-time staff (caretaker, chef, housekeeping) with event-surge contract labor. Staff-to-room ratio 0.3–0.8.
- **Seasonal Patterns**: Extreme seasonality — high season can be 60–90 days. Off-season occupancy may drop to 5–15%.
- **Premium Amenities**: Spa, outdoor recreation, private trails, water features. Amenity CAPEX 15–30% of purchase price.
- **Revenue Shares**: Events revenue 20–50% of total (much higher than hotels). F&B 15–30% (included meal packages).
- **Service Fees**: Higher per-stay service charges ($50–$200/night) common for concierge, activity coordination.
- **Cap Rates**: Lodge cap rates 6–12%, reflecting operational complexity and seasonal revenue concentration.
- **Pre-Opening**: Significant — renovations, brand development, website, marketing launch ($50K–$500K+).`;
  }

  return `### Business Model Context — Hotel (Traditional)
This is a traditional hotel property. Apply USALI (Uniform System of Accounts for the Lodging Industry) departmental benchmarks:
- **Revenue Departments**: Rooms (primary), F&B, Other Operated Departments, Miscellaneous Income.
- **Cost Structure**: USALI departmental expenses — Rooms (20–30% of rooms revenue), F&B (60–75% of F&B revenue), A&G (8–12% of total revenue).
- **Staffing**: Front desk, housekeeping, F&B service, maintenance, management. Staff-to-room ratio 0.8–1.5 for full-service.
- **Occupancy Norms**: Urban hotels 65–80% stabilized, resorts 55–75%. Ramp period 12–36 months.
- **Management Fees**: Base fee 2–4% of gross revenue, incentive fee 8–15% of GOP above threshold.
- **ADR Benchmarks**: Reference STR/CoStar chain scale reports for comparable ADR positioning.
- **Cap Rates**: Full-service 6–9%, select-service 7–10%, luxury 4–7% depending on market tier.
- **FF&E Reserve**: 4–5% of total revenue per USALI standard.`;
}

function buildPropertyContextSection(pack: PropertyContextPack): string {
  return `## ENTITY CONTEXT — ${pack.identity.name}

### Classification
${pack.classification.compositeLabel}
Star Rating: ${pack.classification.starRating ?? "Not yet rated"}${pack.classification.starRatingSuggested ? ` (AI suggested: ${pack.classification.starRatingSuggested}★)` : ""}
Type: ${pack.classification.hospitalityType}
Business Model: ${pack.classification.businessModel ?? "hotel"}

### Location
${pack.location.display}
Market: ${pack.location.market || "Not specified"}
${pack.location.latitude && pack.location.longitude ? `Coordinates: ${pack.location.latitude}, ${pack.location.longitude}` : ""}

${buildBusinessModelGuidance(pack.classification.businessModel ?? "hotel")}

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

/** Domain preamble — establishes the analyst's expertise and the fundraising context. */
function buildDomainPreamble(): string {
  return `# ROLE & DOMAIN CONTEXT

You are a hospitality investment analyst specializing in:
- **Boutique hotel conversions** — transforming large residential estates into intimate 5–20 room properties with distinctive character
- **Vertical community hospitality** — wellness retreats, corporate offsites, experiential lodging, and practitioner-led programming
- **Management company brand economics** — properties hire the brand for marketing, operations, and revenue management under a fee structure
- **Small-scale luxury** — NOT 200-room urban hotels. Think intimate, high-ADR, experience-driven properties in compelling locations

## Critical Context
This is a **fundraising context**. The user is building an investor pitch for a hospitality management company. Every number you provide must be:
1. **Defensible to a skeptical LP** — cite real sources, use industry-standard benchmarks
2. **Calibrated to the specific segment** — boutique/lifestyle, not chain-scale or convention hotels
3. **Conservative where data is thin** — widen ranges and lower confidence rather than guess
4. **Internally consistent** — if you recommend ADR $350, occupancy must match that tier; RevPAR must be ADR × occupancy

When in doubt, reference CBRE Hotels, STR/CoStar, HVS, JLL Hotels, PKF Hospitality, or USALI standards. For management company economics, reference Horwath HTL, HVS Management Contract Database, or comparable boutique management platforms.`;
}

export function assembleResearchPrompt(
  contextPack: PropertyContextPack | CompanyContextPack,
  options: AssemblePromptOptions,
): string {
  const { tier, entityType, assumptionKeys, ambientData, priorResearch, adminInstructions } = options;

  const sections: string[] = [];

  // Domain preamble goes first — sets the frame for all analysis
  sections.push(buildDomainPreamble());

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
