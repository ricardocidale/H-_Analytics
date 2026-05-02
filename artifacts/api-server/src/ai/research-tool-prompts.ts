import { executeComputationTool } from "@calc/dispatch";
import type { ReferenceBrand } from "@workspace/db";

/**
 * Optional dependency injection for async data sources.
 *
 * handleToolCall is historically pure (prompt builders + compute tools).
 * `get_reference_brands` needs live DB data; we receive a fetcher via deps
 * so the caller controls the storage layer and this module stays import-free
 * of the server runtime. Legacy callers omit deps and get a graceful fallback.
 */
export interface ResearchToolDeps {
  getReferenceBrands?: () => Promise<ReferenceBrand[]>;
}

type ToolPromptBuilder = (input: Record<string, any>) => string;

const TOOL_PROMPTS: Record<string, ToolPromptBuilder> = {
  analyze_market: (input) =>
    `Provide market overview analysis for ${input.location} (${input.market_region}). Property type: ${input.property_type}, ${input.room_count} rooms. Include tourism volume, hotel supply metrics, demand trends, RevPAR data, and market positioning for comparable properties in this specific location. Use your knowledge of this market to provide specific, data-backed metrics with industry sources.`,

  analyze_adr: (input) =>
    `ADR context: ${input.location}, $${input.current_adr} target, ${input.room_count} rooms, ${input.property_level}. F&B: ${input.has_fb ?? "unknown"}, Events: ${input.has_events ?? "unknown"}, Wellness: ${input.has_wellness ?? "unknown"}. Use compute_adr_projection for multi-year projections. Provide market average, comparable ADRs (4+), and recommended range.`,

  analyze_occupancy: (input) => {
    const targetOcc = typeof input.target_occupancy === "number" ? (input.target_occupancy * 100).toFixed(0) : "70";
    return `Occupancy context: ${input.location}, ${input.room_count || 20} rooms, target ${targetOcc}%, ${input.property_level || "luxury"}. Use compute_occupancy_ramp for month-by-month schedule. Provide market average, seasonal patterns (4 seasons), and ramp-up timeline.`;
  },

  analyze_event_demand: (input) =>
    `Provide event demand analysis for ${input.location}. ${input.event_locations || 2} event spaces, max capacity ${input.max_event_capacity || 150} guests. Wellness: ${input.has_wellness ?? true}, F&B: ${input.has_fb ?? true}, Privacy: ${input.privacy_level || "high"}, Acreage: ${input.acreage || 5}. Include corporate event demand, wellness retreat potential, wedding/private event demand, estimated event revenue share, and key demand drivers.`,

  analyze_cap_rates: (input) =>
    `Cap rate context: ${input.location} (${input.market_region}), ${input.property_level}, ${input.room_count} rooms${input.purchase_price ? `, $${input.purchase_price.toLocaleString()}` : ""}. Use compute_cap_rate_valuation for implied value and sensitivity table. Provide market range, comparable transactions (3+), and recommended acquisition/exit range. Reference CBRE Cap Rate Survey, S&P Global cap rate forecasts, and Damodaran country risk premium data for international properties. If S&P Global Market Intelligence data is available, use their Case-Shiller index trends and sector outlook to contextualize cap rate direction.`,

  analyze_competitive_set: (input) =>
    `Provide competitive set analysis for ${input.location}. Subject: ${input.room_count} rooms at $${input.current_adr} ADR, ${input.property_level} positioning. Has events: ${input.has_events ?? true}, wellness: ${input.has_wellness ?? true}, F&B: ${input.has_fb ?? true}. Identify 4-6 comparable properties with room counts, ADRs, and positioning descriptions.`,

  analyze_catering: (input) =>
    `Catering context: ${input.property_level || "luxury"} property, ${input.location}, ${input.room_count || 20} rooms, ${input.event_locations || 2} event spaces, max ${input.max_event_capacity || 150} guests, F&B: ${input.has_fb ?? true}, events: ${input.has_events ?? true}. Catering boost = uplift to base F&B from catered events (15-50%). Provide raw market data — do NOT convert revenue breakdowns. Include recommended boost %, market range, event mix breakdown.`,

  analyze_land_value: (input) =>
    `Land value context: ${input.location} (${input.market_region}), ${input.property_type}, ${input.acreage ?? 10}+ acres, ${input.room_count ?? 20} rooms, $${(input.purchase_price ?? 0).toLocaleString()} purchase, $${(input.building_improvements ?? 0).toLocaleString()} improvements, ${input.setting || "rural estate"}. Use compute_depreciation_basis for tax impact. Provide recommended land %, market range, assessment method, and rationale.`,

  analyze_operating_costs: (input) =>
    `Cost context: ${input.property_level || "luxury"} hotel, ${input.location}, ${input.room_count ?? 20} rooms, ADR $${input.current_adr ?? 300}, F&B: ${input.has_fb ?? true}, Events: ${input.has_events ?? true}, Market: ${input.market_region || "North America"}. Use compute_cost_benchmarks for dollar amounts from rates. Provide USALI-aligned rates: Room Revenue-based (housekeeping, F&B COGS), Total Revenue-based (admin, ops, utilities, FF&E, marketing, IT, other). Cite PKF Trends, STR HOST, CBRE.`,

  analyze_property_value_costs: (input) =>
    `Property value cost context: ${input.property_level || "luxury"} hotel, ${input.location}, ${input.room_count ?? 20} rooms, $${(input.purchase_price ?? 0).toLocaleString()} purchase, $${(input.building_improvements ?? 0).toLocaleString()} improvements, ${input.market_region || "North America"}. Costs are % of property value, not revenue. Provide property tax rates with jurisdiction-specific context.`,

  analyze_management_service_fees: (input) =>
    `Service fee context: ${input.property_level || "luxury"} hotel, ${input.location}, ${input.room_count ?? 20} rooms, F&B: ${input.has_fb ?? true}, Events: ${input.has_events ?? true}, ${input.market_region || "North America"}. 6 categories (% of Total Revenue): Marketing, Technology & Reservations, Accounting, Revenue Management, General Mgmt, Procurement. Plus incentive fee (% of GOP). Provide rates, total fee rate, and industry ranges.`,

  analyze_income_tax: (input) =>
    `Tax context: SPV entity in ${input.location}, ${input.market_region || "North America"}, ${input.entity_type || "LLC"}, $${(input.purchase_price ?? 0).toLocaleString()} property value. Taxable Income = ANOI - Interest Expense - Depreciation (tax only applies when positive). Provide: combined effective rate, federal/state/local breakdown, entity structure notes, hospitality-specific incentives, and a "calculationMethodology" field explaining how income tax is calculated in the model (taxable income formula, depreciation tax shield, interest deductibility for financed properties, and that losses carry no tax).`,

  analyze_outsourcing_make_vs_buy: (input) =>
    `Make-vs-buy context: Service: ${input.service_name}, In-house labor: $${input.in_house_labor ?? 0}/yr, Benefits rate: ${input.benefits_rate ?? 0.25 /* research benchmark: 25% standard benefits load */}, Vendor price: $${input.vendor_price ?? 0}/yr, Oversight hours: ${input.oversight_hours ?? 2}/wk, Manager rate: $${input.manager_rate ?? 50}/hr, Unit count: ${input.unit_count ?? 20}. Use compute_make_vs_buy for financial comparison and recommendation. Provide market benchmarks for this service type.`,

  analyze_local_economics: (input) =>
    `Local economic context: ${input.location} (${input.market_region || "North America"}). Focus on inflation rates (CPI), interest rates (SOFR, Prime, Mortgage), and general economic health. Research FRED and BLS data for this specific location. If S&P Global economic forecasts are available, incorporate their GDP growth, employment growth, and inflation projections. If Moody's credit risk data is available, factor in property risk scores and default probability metrics for lending environment context. Provide inflationRate and interestRate for this market.`,


  analyze_marketing_costs: (input) =>
    `Marketing context: ${input.location}, property level: ${input.property_level || "luxury"}. Research hospitality marketing costs, digital spend, OTA commissions, and direct booking costs for this property level. Provide marketingCostRate as % of total revenue.`,
};

export async function handleToolCall(
  name: string,
  input: Record<string, any>,
  deps?: ResearchToolDeps,
): Promise<string> {
  // get_reference_brands — live DB data via DI fetcher; no DB import here.
  // Legacy callers omit deps and get a graceful "not available" fallback.
  if (name === "get_reference_brands") {
    if (!deps?.getReferenceBrands) {
      return "Reference brand data is not available in this research context. Proceed with general market knowledge.";
    }
    const brands = await deps.getReferenceBrands();
    if (brands.length === 0) {
      return "No reference brands have been configured yet. Proceed with general market knowledge.";
    }
    return JSON.stringify(brands, null, 2);
  }

  // Web search — calls external API, requires async
  if (name === "web_search") {
    const { webSearch } = await import("../data/webSearch.js");
    const results = await webSearch(input.query, input.num_results);
    if (results.length === 0) {
      return "Web search is not available or returned no results. Proceed with your existing knowledge.";
    }
    return JSON.stringify(results, null, 2);
  }

  const promptBuilder = TOOL_PROMPTS[name];
  if (promptBuilder) {
    return promptBuilder(input);
  }
  const result = executeComputationTool(name, input);
  return result ?? `Unknown tool: ${name}. Please proceed with your analysis.`;
}
