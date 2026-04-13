import type { MarketIntelligence } from "../../shared/market-intelligence";

export interface ResearchParams {
  type: "property" | "company" | "global";
  propertyId?: number;
  propertyLabel?: string;
  propertyContext?: {
    name: string;
    location: string;
    market: string;
    roomCount: number;
    startAdr: number;
    maxOccupancy: number;
    type: string;
    purchasePrice?: number;
    // Entity-aware context (Task 4.5) — all optional for backward compatibility
    qualityTier?: string;           // luxury, upper_upscale, upscale, etc.
    businessModel?: string;         // hotel, lodge, vrbo
    pricingModel?: string;          // per_room, per_property
    nightlyPropertyRate?: number;   // for per_property pricing
    maxGuests?: number;             // capacity for luxury rental
    serviceLevel?: string;          // full_service, select_service, etc.
    locationType?: string;          // urban, suburban, resort, rural
    marketTier?: string;            // primary, secondary, tertiary
    fbVenues?: number;              // number of F&B outlets
    fbSeats?: number;               // total F&B seating capacity
    eventSpaceSqft?: number;        // event space in sqft
    totalPropertyAcreage?: number;  // total land area
    totalBuildingSqft?: number;     // total building area
    yearBuilt?: number;
    lastRenovationYear?: number;
    revShareFB?: number;            // current F&B share of total revenue
    revShareEvents?: number;        // current events share of total revenue
    depreciationYears?: number;     // country-specific depreciation
    country?: string;               // for country-specific research context
    seasonalityProfile?: number[];  // monthly multipliers if set
    ownerPriorityReturn?: number;   // investor protection context
    feeSubordination?: string;      // none, partial, full
  };
  assetDefinition: {
    minRooms: number;
    maxRooms: number;
    hasFB: boolean;
    hasEvents: boolean;
    hasWellness: boolean;
    minAdr: number;
    maxAdr: number;
    level?: string;
    eventLocations?: number;
    maxEventCapacity?: number;
    acreage?: number;
    privacyLevel?: string;
    parkingSpaces?: number;
    description?: string;
  };
  researchVariables?: {
    focusAreas?: string[];
    regions?: string[];
    timeHorizon?: string;
    customQuestions?: string;
    inflationRate?: number;
    modelDurationYears?: number;
    customSources?: { name: string; url?: string; category: string }[];
  };
  eventConfig?: {
    enabled?: boolean;
    focusAreas?: string[];
    regions?: string[];
    timeHorizon?: string;
    customInstructions?: string;
    customQuestions?: string;
    enabledTools?: string[];
    customSources?: { name: string; url?: string; category: string }[];
  };
  marketIntelligence?: MarketIntelligence;
}

const REQUIRED_SOURCES = [
  { name: "Damodaran Online (NYU Stern)", category: "Cost of Capital & Country Risk", url: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html" },
  { name: "Damodaran WACC by Industry", category: "Cost of Equity & WACC", url: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html" },
  { name: "CBRE Cap Rate Survey", category: "Cap Rates & Valuation", url: "https://www.cbre.com" },
  { name: "PKF Trends in the Hotel Industry", category: "Operating Benchmarks" },
  { name: "CoStar Group / STR", category: "Market Performance (RevPAR, ADR, Occupancy, Supply Pipeline, Transaction Comps)", url: "https://www.costar.com" },
  { name: "HVS", category: "Hotel Valuation & Transaction Data", url: "https://hvs.com" },
  { name: "Moody's Analytics", category: "Credit Risk & Default Probability", url: "https://www.moodys.com" },
  { name: "S&P Global Market Intelligence", category: "Real Estate Indices & Economic Forecasts", url: "https://www.spglobal.com/marketintelligence" },
  { name: "Xotelo", category: "Live OTA Hotel Rates (Booking.com, Expedia, Hotels.com, Agoda — real-time ADR benchmarks)", url: "https://xotelo.com" },
];

/** Build the curated source block appended to all prompt types. */
function buildSourceRegistryBlock(ecSources?: any[], rvSources?: any[]): string {
  const userSources = ecSources?.length ? ecSources : rvSources?.length ? rvSources : [];

  let suffix = "\n\nRequired Data Sources (always reference these):\n";
  REQUIRED_SOURCES.forEach((s) => {
    suffix += `- ${s.name} (${s.category})${s.url ? `: ${s.url}` : ""}\n`;
  });

  if (userSources.length > 0) {
    suffix += "\nAdditional Curated Sources (also prioritize):\n";
    userSources.forEach((s: any) => {
      suffix += `- ${s.name} (${s.category})${s.url ? `: ${s.url}` : ""}\n`;
    });
  }
  return suffix;
}

function formatAssetDefinition(bd: ResearchParams["assetDefinition"], label: string): string {
  const features = [
    bd.hasFB && "F&B operations",
    bd.hasEvents && "event hosting",
    bd.hasWellness && "wellness programming",
  ].filter(Boolean).join(", ");
  return `${label} definition: ${bd.description || "Independently operated, design-forward properties with curated guest experiences."}
- Property level: ${bd.level || "luxury"}
- Room range: ${bd.minRooms}–${bd.maxRooms} rooms
- ADR range: $${bd.minAdr}–$${bd.maxAdr}
- Features: ${features || "standard hospitality"}
- Event locations: ${bd.eventLocations ?? 2}
- Max event capacity: ${bd.maxEventCapacity ?? 150} people
- Acreage: ${bd.acreage ?? 5} acres
- Privacy: ${bd.privacyLevel || "high"}
- Parking: ${bd.parkingSpaces ?? 50} spaces`;
}

/** Build the admin-config suffix block appended to all prompt types. */
function buildEventConfigSuffix(ec: ResearchParams["eventConfig"]): string {
  if (!ec) return "";
  let suffix = "";

  const focusAreas = ec.focusAreas?.length ? ec.focusAreas : null;
  const regions = ec.regions?.length ? ec.regions : null;

  if (focusAreas) {
    suffix += `\n\nAdmin-specified focus areas (address all of these):\n`;
    focusAreas.forEach((a) => { suffix += `- ${a}\n`; });
  }
  if (regions) {
    suffix += `\nAdmin-specified geographic scope: ${regions.join(", ")}`;
  }
  if (ec.timeHorizon) {
    suffix += `\nInvestment horizon: ${ec.timeHorizon}`;
  }
  if (ec.customInstructions?.trim()) {
    suffix += `\n\nAdditional context from admin:\n${ec.customInstructions.trim()}`;
  }
  if (ec.customQuestions?.trim()) {
    suffix += `\n\nAdmin-required questions to address:\n${ec.customQuestions.trim()}`;
  }
  return suffix;
}

function buildMarketIntelligenceBlock(mi?: MarketIntelligence): string {
  if (!mi) return "";

  let block = "\n\n=== VERIFIED MARKET DATA (use these as ground truth — do NOT override with estimates) ===\n";

  const rateLabels: Record<string, string> = {
    sofr: "SOFR (Secured Overnight Financing Rate)",
    treasury2y: "2-Year Treasury Yield",
    treasury5y: "5-Year Treasury Yield",
    treasury10y: "10-Year Treasury Yield",
    primeRate: "Prime Rate",
    cpi: "CPI (Consumer Price Index)",
  };

  let hasRates = false;
  for (const [key, label] of Object.entries(rateLabels)) {
    const rate = mi.rates[key as keyof typeof mi.rates];
    if (rate?.current) {
      if (!hasRates) { block += "\nCurrent Interest Rates & Economic Indicators (Source: FRED, Federal Reserve):\n"; hasRates = true; }
      block += `- ${label}: ${rate.current.value}${key === "cpi" ? "" : "%"} (as of ${rate.current.publishedAt || "recent"})\n`;
    }
  }

  if (mi.benchmarks) {
    const b = mi.benchmarks;
    block += `\nHospitality Market Benchmarks — ${b.submarket} (Source: ${b.revpar?.source || b.adr?.source || "STR/CoStar"}):\n`;
    if (b.revpar) block += `- Trailing-12-Month RevPAR: $${b.revpar.value.toFixed(2)}\n`;
    if (b.adr) block += `- Trailing-12-Month ADR: $${b.adr.value.toFixed(2)}\n`;
    if (b.occupancy) block += `- Trailing-12-Month Occupancy: ${(b.occupancy.value * 100).toFixed(1)}%\n`;
    if (b.capRate) block += `- Market Cap Rate: ${b.capRate.value.toFixed(2)}%\n`;
    if (b.supplyPipeline) block += `- Supply Pipeline: ${b.supplyPipeline.value.newRooms} new rooms, ${b.supplyPipeline.value.underConstruction} under construction\n`;
  }

  if (mi.moodys) {
    const m = mi.moodys;
    block += `\nCredit Risk Analytics (Source: Moody's Analytics):\n`;
    if (m.propertyRiskScore) block += `- Property Risk Score: ${m.propertyRiskScore.value} / 100\n`;
    if (m.defaultProbability) block += `- Default Probability: ${(m.defaultProbability.value * 100).toFixed(2)}%\n`;
    if (m.creditRating) block += `- Credit Rating: ${m.creditRating.value}\n`;
    if (m.riskPremiumBps) block += `- Risk Premium: ${m.riskPremiumBps.value} bps\n`;
    if (m.lossGivenDefault) block += `- Loss Given Default: ${(m.lossGivenDefault.value * 100).toFixed(1)}%\n`;
    if (m.watchlistStatus) block += `- Watchlist Status: ${m.watchlistStatus.value}\n`;
  }

  if (mi.spGlobal) {
    const sp = mi.spGlobal;
    block += `\nReal Estate Market Intelligence (Source: S&P Global):\n`;
    if (sp.caseShillerIndex) block += `- Case-Shiller Home Price Index: ${sp.caseShillerIndex.value.toFixed(1)}\n`;
    if (sp.caseShillerYoY) block += `- Case-Shiller YoY Change: ${sp.caseShillerYoY.value.toFixed(1)}%\n`;
    if (sp.sectorOutlook) block += `- Sector Outlook: ${sp.sectorOutlook.value}\n`;
    if (sp.marketTier) block += `- Market Tier: ${sp.marketTier.value}\n`;
    if (sp.economicForecast) {
      const ef = sp.economicForecast.value;
      block += `- Economic Forecast: GDP Growth ${ef.gdpGrowth.toFixed(1)}%, Employment Growth ${ef.employmentGrowth.toFixed(1)}%, Inflation ${ef.inflationForecast.toFixed(1)}%\n`;
    }
    if (sp.capRateForecast) {
      const cr = sp.capRateForecast.value;
      block += `- Cap Rate Forecast: Current ${cr.current.toFixed(2)}%, 12-Month Forecast ${cr.forecast12m.toFixed(2)}%\n`;
    }
  }

  if (mi.costar) {
    const cs = mi.costar;
    block += `\nCommercial Real Estate Market Data (Source: CoStar Group / STR):\n`;
    if (cs.revpar) block += `- RevPAR: $${cs.revpar.value.toFixed(2)}\n`;
    if (cs.adr) block += `- ADR (Average Daily Rate): $${cs.adr.value.toFixed(2)}\n`;
    if (cs.occupancyRate) block += `- Occupancy Rate: ${(cs.occupancyRate.value * 100).toFixed(1)}%\n`;
    if (cs.rentGrowthYoY) block += `- Rate Growth (YoY): ${cs.rentGrowthYoY.value.toFixed(1)}%\n`;
    if (cs.demandGrowthYoY) block += `- Demand Growth (YoY): ${cs.demandGrowthYoY.value.toFixed(1)}%\n`;
    if (cs.submarketCapRate) block += `- Submarket Cap Rate: ${cs.submarketCapRate.value.toFixed(2)}%\n`;
    if (cs.marketScore) block += `- CoStar Market Score: ${cs.marketScore.value.toFixed(0)} / 100\n`;
    if (cs.marketVacancy) block += `- Market Vacancy Rate: ${(cs.marketVacancy.value * 100).toFixed(1)}%\n`;
    if (cs.submarketTier) block += `- Submarket Tier: ${cs.submarketTier.value}\n`;
    if (cs.supplyPipeline) {
      const sp = cs.supplyPipeline.value;
      block += `- Supply Pipeline: ${sp.newRooms} new rooms total, ${sp.underConstruction} under construction, ${sp.deliverySchedule12m} delivering in 12 months\n`;
    }
    if (cs.transactionVolume) {
      const tv = cs.transactionVolume.value;
      block += `- Transaction Volume: ${tv.totalSales} sales, avg $${tv.avgPricePerKey.toLocaleString()}/key\n`;
    }
  }

  if (mi.xotelo) {
    const x = mi.xotelo;
    block += `\nLive OTA Hotel Rate Data (Source: Xotelo — real-time rates from Booking.com, Expedia, Hotels.com, Agoda):\n`;
    if (x.location) block += `- Market: ${x.location}\n`;
    if (x.hotelCount != null) block += `- Sample Size: ${x.hotelCount} hotels surveyed\n`;
    if (x.avgPriceMin != null) block += `- Average Nightly Rate (low end): $${x.avgPriceMin}\n`;
    if (x.avgPriceMax != null) block += `- Average Nightly Rate (high end): $${x.avgPriceMax}\n`;
    if (x.adrBenchmark) block += `- ADR Benchmark (midpoint): $${x.adrBenchmark.value} (confidence: ${x.adrBenchmark.confidence})\n`;
    block += `NOTE: These are live OTA published rates, not negotiated rates. Actual ADR may differ due to discounting, group rates, and direct bookings.\n`;
  }

  if (mi.groundedResearch.length > 0) {
    block += "\nRecent Market Intelligence (web-sourced with citations):\n";
    for (const result of mi.groundedResearch) {
      if (result.answer) {
        block += `\nQuery: ${result.query}\nFindings: ${result.answer.slice(0, 1000)}\n`;
        if (result.sources.length > 0) {
          block += "Sources:\n";
          for (const src of result.sources.slice(0, 3)) {
            block += `  - ${src.title}: ${src.url}${src.publishedDate ? ` (${src.publishedDate})` : ""}\n`;
          }
        }
      }
    }
  }

  block += "\n=== END VERIFIED MARKET DATA ===\n";
  return block;
}

/**
 * Build entity-aware context block from extended property fields (Task 4.5).
 * Only includes fields that have values — keeps prompts clean when context is sparse.
 */
function buildEntityContext(pc: NonNullable<ResearchParams["propertyContext"]>): string {
  const lines: string[] = [];

  // Classification & positioning
  if (pc.qualityTier) lines.push(`- Quality Tier: ${pc.qualityTier}`);
  if (pc.businessModel) lines.push(`- Business Model: ${pc.businessModel}`);
  if (pc.pricingModel === "per_property") {
    lines.push(`- Pricing: Whole-property rental at $${pc.nightlyPropertyRate}/night (luxury rental model)`);
    if (pc.maxGuests) lines.push(`- Guest Capacity: ${pc.maxGuests} guests`);
  }
  if (pc.serviceLevel) lines.push(`- Service Level: ${pc.serviceLevel}`);

  // Location context
  if (pc.locationType) lines.push(`- Location Type: ${pc.locationType}`);
  if (pc.marketTier) lines.push(`- Market Tier: ${pc.marketTier}`);
  if (pc.country && pc.country !== "United States") lines.push(`- Country: ${pc.country} (use country-specific benchmarks, regulations, and tax rates)`);

  // Physical property
  if (pc.totalPropertyAcreage) lines.push(`- Total Acreage: ${pc.totalPropertyAcreage} acres`);
  if (pc.totalBuildingSqft) lines.push(`- Building: ${pc.totalBuildingSqft.toLocaleString()} sq ft`);
  if (pc.yearBuilt) lines.push(`- Year Built: ${pc.yearBuilt}${pc.lastRenovationYear ? `, last renovated ${pc.lastRenovationYear}` : ""}`);

  // F&B capacity (critical for revenue mix research)
  if (pc.fbVenues || pc.fbSeats) {
    const fbParts = [];
    if (pc.fbVenues) fbParts.push(`${pc.fbVenues} venue(s)`);
    if (pc.fbSeats) fbParts.push(`${pc.fbSeats} total seats`);
    lines.push(`- F&B Program: ${fbParts.join(", ")}`);
  }
  if (pc.revShareFB != null) lines.push(`- Current F&B Revenue Share: ${(pc.revShareFB * 100).toFixed(0)}% of total revenue`);
  if (pc.revShareEvents != null) lines.push(`- Current Events Revenue Share: ${(pc.revShareEvents * 100).toFixed(0)}% of total revenue`);

  // Events capacity
  if (pc.eventSpaceSqft) lines.push(`- Event Space: ${pc.eventSpaceSqft.toLocaleString()} sq ft`);

  // Financial structure context for research
  if (pc.depreciationYears) lines.push(`- Depreciation: ${pc.depreciationYears}-year straight-line`);
  if (pc.ownerPriorityReturn) lines.push(`- Owner Priority Return: ${(pc.ownerPriorityReturn * 100).toFixed(0)}% (incentive fees deferred until met)`);
  if (pc.feeSubordination && pc.feeSubordination !== "none") lines.push(`- Fee Subordination: ${pc.feeSubordination} (fees deferred when cash < debt service)`);

  // Seasonality hint for research
  if (pc.seasonalityProfile && pc.seasonalityProfile.some(f => f !== 1)) {
    const peak = Math.max(...pc.seasonalityProfile);
    const trough = Math.min(...pc.seasonalityProfile);
    lines.push(`- Seasonality: ${(peak * 100).toFixed(0)}% peak / ${(trough * 100).toFixed(0)}% trough (seasonal market)`);
  }

  if (lines.length === 0) return "";
  return "\nEntity Context (use for comp set selection and benchmark calibration):\n" + lines.join("\n");
}

export function buildUserPrompt(params: ResearchParams): string {
  const { type, propertyContext, assetDefinition: bd, propertyLabel: pl, eventConfig: ec } = params;
  const label = pl || "boutique hotel";

  if (type === "property" && propertyContext) {
    const pc = propertyContext;
    let prompt = `Analyze the market for this ${label.toLowerCase()} property:
- Property: ${pc.name}
- Location: ${pc.location}
- Market: ${pc.market}
- Room Count: ${pc.roomCount}
- Current ADR: $${pc.startAdr}
- Target Occupancy: ${(pc.maxOccupancy * 100).toFixed(0)}%
- Property Type: ${pc.type}
${pc.purchasePrice ? `- Purchase Price: $${pc.purchasePrice.toLocaleString()}` : ""}
${buildEntityContext(pc)}

${formatAssetDefinition(bd, label)}

Use the available tools to gather data on each analysis dimension, then synthesize your findings into the required JSON format. Call each tool to build your analysis, then provide the final synthesized research as a JSON object.

IMPORTANT: For every recommended metric, include a "confidence" field with EXACTLY one of: "high" (multiple sources agree, strong comps), "medium" (single reliable source, moderate coverage), or "low" (sparse data, high uncertainty). Do NOT use "conservative", "moderate", or "aggressive" — those describe positioning, not evidence quality. This applies to adrAnalysis, occupancyAnalysis, capRateAnalysis, cateringAnalysis, landValueAllocation, incomeTaxAnalysis, and every cost category in operatingCostAnalysis, propertyValueCostAnalysis, and managementServiceFeeAnalysis.${buildEventConfigSuffix(ec)}`;

    prompt += buildMarketIntelligenceBlock(params.marketIntelligence);
    prompt += buildSourceRegistryBlock(ec?.customSources, params.researchVariables?.customSources);
    return prompt;
  }

  if (type === "company") {
    let prompt = `Provide comprehensive research on hotel management company fee structures, GAAP standards, and industry benchmarks for a ${label.toLowerCase()} management company.

${formatAssetDefinition(bd, label + " asset")}

Research the following areas for management companies that specialize in this type of property:
1. Base management fee structures and industry norms (ASC 606 revenue recognition)
2. Incentive management fee (IMF) structures and triggers
3. GAAP-compliant fee recognition standards
4. Operating expense ratios by department (USALI format)
5. Management company compensation benchmarks
6. Typical contract terms and duration
7. **Company Income Tax**: Recommend an effective corporate income tax rate for the management company entity. Include federal/state breakdown, entity structure considerations (C-Corp vs pass-through), and explain how company income tax is calculated: Pre-Tax Income = Total Fee Revenue - Total Vendor Costs - Total Operating Expenses; Company Income Tax = max(0, Pre-Tax Income) × Company Tax Rate. The system default is 30% but the actual rate depends on jurisdiction and entity structure. Include this as a "companyIncomeTax" section in your response with recommendedRate, effectiveRange, entityNotes, calculationMethodology, and rationale.
8. **Cost of Equity (WACC Input)**: Recommend a cost of equity (required equity return) for private hospitality investments in this asset class. This is used as the Re component in WACC = (E/V × Re) + (D/V × Rd × (1−T)). For private companies, CAPM is not used — instead provide a direct hurdle rate based on: asset class risk profile, property type (boutique hotel vs full-service), market tier (primary/secondary/tertiary), current interest rate environment, and illiquidity premium for private real estate. Typical range: 15%–25%. Reference Damodaran's WACC data (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html) for hospitality sector cost of equity benchmarks and Damodaran's country risk premiums (https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html) for international property adjustments. Include this as a "costOfEquity" section in your response with recommendedRate (e.g. "18%–22%"), rationale, riskFactors (array of factors that push rate higher or lower), countryRiskPremium (for non-US properties, the Damodaran CRP to add to the base rate), and comparables (e.g. "Private boutique hotel equity returns average 18–22% in secondary markets").
Focus specifically on management companies specializing in ${label.toLowerCase()} properties with unique events like wellness retreats, corporate retreats, and experiential hospitality.

9. **ICP Comparison Against Market Data**: Evaluate the user's Ideal Customer Profile (ICP) against real market data for comparable management companies. Identify what similar operator profiles are succeeding at — markets, property sizes, fee structures, staffing levels, and growth rates that are working — and where the defined target may have gaps, blind spots, or elevated risk. Highlight any mismatches between the ICP assumptions and observed industry benchmarks.

10. **Experience Vertical Analysis**: Analyze growing experience verticals in boutique hospitality that represent strong revenue opportunities for management companies. Cover the following segments with market sizing, growth rates, competitive density, and revenue potential:
    - Wellness retreats (spa, meditation, fitness, holistic health)
    - Corporate retreats and executive offsites
    - Exotic and experiential hospitality (adventure lodges, eco-resorts, glamping, immersive cultural stays)
    - Consensual adult lifestyle retreats (swinger retreats, couples-focused lifestyle events, clothing-optional resorts)
    - Yoga, mindfulness, and spiritual retreat programming
    - Relationship and couples retreats
    - Emerging niche segments in boutique hospitality
    For each vertical, include estimated addressable market size, trailing and projected growth rates, typical ADR premiums vs. standard boutique operations, and key success factors for management companies entering each segment.${buildEventConfigSuffix(ec)}`;

    prompt += buildMarketIntelligenceBlock(params.marketIntelligence);
    prompt += buildSourceRegistryBlock(ec?.customSources, params.researchVariables?.customSources);
    return prompt;
  }

  // global
  const rv = params.researchVariables;

  // eventConfig overrides researchVariables when present
  const regions = (ec?.regions?.length ? ec.regions : rv?.regions?.length ? rv.regions : null)
    ?.join(", ") ?? "North America and Latin America";
  const timeHorizon = ec?.timeHorizon || rv?.timeHorizon || "5 years";

  const defaultFocusAreas = [
    "Market Overview & Trends",
    "Event Hospitality (wellness, corporate, yoga, relationship retreats)",
    "Experience & Lifestyle Verticals (wellness retreats, exotic experiential hospitality, consensual adult lifestyle retreats, swinger retreats, adventure lodges, eco-resorts, couples retreats, emerging boutique segments)",
    "Financial Benchmarks (ADR, occupancy, RevPAR)",
    "Cap Rates & Investment Returns",
    "Country Risk Premiums & Cost of Capital (Damodaran)",
    "Debt Market Conditions",
    "Supply Pipeline & Competitive Landscape",
    "Regulatory Environment & Licensing",
    "Emerging Trends & Niche Hospitality Segments",
  ];
  const focusAreas = (ec?.focusAreas?.length ? ec.focusAreas : rv?.focusAreas?.length ? rv.focusAreas : null) ?? defaultFocusAreas;

  let prompt = `Provide comprehensive ${label.toLowerCase()} industry research covering:\n`;
  focusAreas.forEach((area, i) => { prompt += `${i + 1}. ${area}\n`; });

  const features = [
    bd.hasFB && "F&B operations",
    bd.hasEvents && "event hosting",
    bd.hasWellness && "wellness programming",
  ].filter(Boolean).join(", ");

  prompt += `\nResearch Parameters:
- Asset type: ${label} (${bd.level || "luxury"} tier)
- Asset definition: ${bd.description || "Independently operated, design-forward properties with curated guest experiences."}
- Room range: ${bd.minRooms}–${bd.maxRooms} rooms
- ADR range: $${bd.minAdr}–$${bd.maxAdr}
- Features: ${features}
- Target regions: ${regions}
- Investment horizon: ${timeHorizon}`;

  if (rv?.inflationRate != null) {
    prompt += `\n- Assumed inflation rate: ${(rv.inflationRate * 100).toFixed(1)}%`;
  }
  if (rv?.modelDurationYears != null) {
    prompt += `\n- Financial model duration: ${rv.modelDurationYears} years`;
  }

  prompt += `\n\nInclude specific data points, market sizes, growth rates, and cite sources.`;

  // customQuestions: eventConfig takes precedence over researchVariables
  const customQ = ec?.customQuestions?.trim() || rv?.customQuestions;
  if (customQ) {
    prompt += `\n\nAdditional research questions to address:\n${customQ}`;
  }
  if (ec?.customInstructions?.trim()) {
    prompt += `\n\nAdditional context from admin:\n${ec.customInstructions.trim()}`;
  }

  prompt += buildMarketIntelligenceBlock(params.marketIntelligence);
  prompt += buildSourceRegistryBlock(ec?.customSources, rv?.customSources);

  return prompt;
}
