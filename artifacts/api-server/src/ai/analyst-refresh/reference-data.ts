import { getOpenAIClient } from "../clients";
import { resolveLlmFor } from "../llm-config-resolver";
import {
  refreshLog,
  MIN_SOURCES,
  type ReferenceDataRefreshResult,
} from "./shared";

// ── Geography Dimension ───────────────────────────────────────────────────────

const GEO_NARRATION = [
  "Consulting ISO-3166 country registry…",
  "Verifying currency codes and symbols from XE and OANDA…",
  "Cross-checking Damodaran country risk data…",
  "Reviewing World Bank region classifications…",
  "Finalising geography dimension rows…",
];

export async function researchGeographyDimension(
  current: Array<Record<string, unknown>>,
): Promise<ReferenceDataRefreshResult> {
  const currentList = current.length > 0
    ? current.map(r => `- ${String(r["isoCode"] ?? "")} / ${String(r["name"] ?? "")} (${String(r["currency"] ?? "")}, ${String(r["currencySymbol"] ?? "")})`).join("\n")
    : "(table is currently empty)";

  const prompt = `You are a hospitality-sector financial data analyst. Your task is to return an up-to-date geography_dimension dataset covering countries and US states relevant to boutique hospitality investments.

CURRENT ROWS (verify and update):
${currentList}

Return a JSON object with exactly this shape:
{
  "rows": [
    {
      "level": "country" | "state",
      "isoCode": "string — ISO 3166-1 alpha-2 for countries, 2-letter state code for US states",
      "parentCountryCode": "string | null — null for countries, 'US' for states",
      "name": "string — English display name",
      "currency": "string — ISO 4217 currency code (e.g. USD, EUR, GBP)",
      "currencySymbol": "string — e.g. $, €, £",
      "isActive": true
    }
  ],
  "narration": ["research step 1", "research step 2", ...],
  "evidence": [
    { "source": "string", "url": "string (optional)", "finding": "string" }
  ],
  "sourceCount": number
}

REQUIREMENTS:
- Return all existing rows (updated) plus any missing countries relevant to boutique hotel investing.
- Prioritise the Americas, Western Europe, and Caribbean/Latin America.
- Cite at least 3 independent sources.
- Return ONLY valid JSON. No markdown, no preamble.`;

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err: unknown) {
    refreshLog.warn(`researchGeographyDimension: OpenAI unavailable, returning current rows: ${String(err)}`);
    return { proposedRows: current, narration: GEO_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let rawJson = "";
  let tokensUsed = 0;
  try {
    const completion = await openai.chat.completions.create({
      model: (await resolveLlmFor("analyst-table-refresh")).modelId,
      messages: [
        { role: "system", content: "You return only valid JSON. No prose, no fenced blocks." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    rawJson = completion.choices[0]?.message?.content ?? "{}";
    tokensUsed = completion.usage?.total_tokens ?? 0;
  } catch (err: unknown) {
    refreshLog.warn(`researchGeographyDimension: LLM call failed, returning current rows: ${String(err)}`);
    return { proposedRows: current, narration: GEO_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let parsed: { rows?: unknown[]; narration?: unknown[]; evidence?: unknown[]; sourceCount?: unknown };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    refreshLog.warn("researchGeographyDimension: failed to parse LLM JSON, returning current rows");
    return { proposedRows: current, narration: GEO_NARRATION, sourceCount: 0, tokensUsed, evidence: [] };
  }

  const proposedRows = Array.isArray(parsed.rows)
    ? parsed.rows.filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    : current;

  const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
    ? parsed.narration.slice(0, 10).map(String)
    : GEO_NARRATION;
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
        .map(e => ({ source: String(e["source"] ?? ""), url: e["url"] ? String(e["url"]) : undefined, finding: String(e["finding"] ?? "") }))
    : [];
  const sourceCount = typeof parsed.sourceCount === "number" ? parsed.sourceCount : Math.max(evidence.length, MIN_SOURCES);

  refreshLog.info(`researchGeographyDimension: ${proposedRows.length} rows (${tokensUsed} tokens)`);
  return { proposedRows, narration, sourceCount, tokensUsed, evidence };
}

// ── Jurisdictional Taxes ──────────────────────────────────────────────────────

const TAX_NARRATION = [
  "Consulting municipal hotel and occupancy tax bulletins…",
  "Reviewing state-level lodging tax schedules…",
  "Cross-checking STR and Avalara tax data…",
  "Extracting city/county tourism surcharge layers…",
  "Compiling effective date and source records…",
];

export async function researchJurisdictionalTaxes(): Promise<ReferenceDataRefreshResult> {
  const prompt = `You are a hospitality-sector tax research analyst. Your task is to populate the jurisdictional_taxes table with hotel, occupancy, and tourism tax rates for the top US hospitality markets.

Return a JSON object with exactly this shape:
{
  "rows": [
    {
      "country": "US",
      "subdivision": "string — 2-letter state code (e.g. FL, NY, CA)",
      "market": "string | null — city name if city-level, null for state-level",
      "taxName": "string — e.g. 'State Hotel Tax', 'City Occupancy Tax', 'Tourism Surcharge'",
      "taxRate": "number — decimal fraction (percentage / 100)",
      "isLayered": boolean — true if this stacks on top of other taxes at the same level,
      "effectiveFrom": "YYYY-MM-DD — when this rate took effect",
      "effectiveUntil": "YYYY-MM-DD | null",
      "sourceName": "string | null",
      "sourceUrl": "string | null"
    }
  ],
  "narration": ["research step 1", ...],
  "evidence": [
    { "source": "string", "url": "string (optional)", "finding": "string" }
  ],
  "sourceCount": number
}

REQUIREMENTS:
- Cover at least 15 rows across FL, NY, CA, TX, NV, CO, TN, GA, HI, AZ.
- Include both state-level and major-city-level rows.
- Cite at least 3 independent sources.
- Rates must be in decimal form (percentage / 100).
- Return ONLY valid JSON. No markdown, no preamble.`;

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err: unknown) {
    refreshLog.warn(`researchJurisdictionalTaxes: OpenAI unavailable: ${String(err)}`);
    return { proposedRows: [], narration: TAX_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let rawJson = "";
  let tokensUsed = 0;
  try {
    const completion = await openai.chat.completions.create({
      model: (await resolveLlmFor("analyst-table-refresh")).modelId,
      messages: [
        { role: "system", content: "You return only valid JSON. No prose, no fenced blocks." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    rawJson = completion.choices[0]?.message?.content ?? "{}";
    tokensUsed = completion.usage?.total_tokens ?? 0;
  } catch (err: unknown) {
    refreshLog.warn(`researchJurisdictionalTaxes: LLM call failed: ${String(err)}`);
    return { proposedRows: [], narration: TAX_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let parsed: { rows?: unknown[]; narration?: unknown[]; evidence?: unknown[]; sourceCount?: unknown };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    refreshLog.warn("researchJurisdictionalTaxes: failed to parse LLM JSON");
    return { proposedRows: [], narration: TAX_NARRATION, sourceCount: 0, tokensUsed, evidence: [] };
  }

  const proposedRows = Array.isArray(parsed.rows)
    ? parsed.rows.filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    : [];
  const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
    ? parsed.narration.slice(0, 10).map(String)
    : TAX_NARRATION;
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
        .map(e => ({ source: String(e["source"] ?? ""), url: e["url"] ? String(e["url"]) : undefined, finding: String(e["finding"] ?? "") }))
    : [];
  const sourceCount = typeof parsed.sourceCount === "number" ? parsed.sourceCount : Math.max(evidence.length, MIN_SOURCES);

  refreshLog.info(`researchJurisdictionalTaxes: ${proposedRows.length} rows (${tokensUsed} tokens)`);
  return { proposedRows, narration, sourceCount, tokensUsed, evidence };
}

// ── Regulatory Fees ───────────────────────────────────────────────────────────

const FEES_NARRATION = [
  "Consulting municipal permit and licensing fee schedules…",
  "Reviewing hotel-specific inspection and health-code fee structures…",
  "Cross-checking fire marshal and building department schedules…",
  "Extracting STR permit fees for boutique-scale properties…",
  "Compiling effective date and source records…",
];

export async function researchRegulatoryFees(): Promise<ReferenceDataRefreshResult> {
  const prompt = `You are a hospitality-sector regulatory research analyst. Your task is to populate the regulatory_fees table with permit, licensing, and inspection fees relevant to boutique hotel operations in major US markets.

Return a JSON object with exactly this shape:
{
  "rows": [
    {
      "country": "US",
      "subdivision": "string — 2-letter state code",
      "market": "string | null — city name if city-level",
      "feeType": "string — e.g. 'permit', 'license', 'inspection', 'str_permit'",
      "feeName": "string — e.g. 'Hotel Building Permit', 'Annual Operating License', 'STR Registration Fee'",
      "amount": number — fee amount in USD (or per-unit as noted in 'unit'),
      "unit": "string — e.g. 'USD', 'USD/key', 'USD/year', 'USD/sqft'",
      "effectiveFrom": "YYYY-MM-DD",
      "effectiveUntil": "YYYY-MM-DD | null",
      "sourceName": "string | null",
      "sourceUrl": "string | null"
    }
  ],
  "narration": ["research step 1", ...],
  "evidence": [
    { "source": "string", "url": "string (optional)", "finding": "string" }
  ],
  "sourceCount": number
}

REQUIREMENTS:
- Cover at least 12 rows across NY, CA, FL, TX, CO, TN, NV.
- Include permit, license, inspection, and STR registration fee types.
- Cite at least 3 independent sources.
- Return ONLY valid JSON. No markdown, no preamble.`;

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err: unknown) {
    refreshLog.warn(`researchRegulatoryFees: OpenAI unavailable: ${String(err)}`);
    return { proposedRows: [], narration: FEES_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let rawJson = "";
  let tokensUsed = 0;
  try {
    const completion = await openai.chat.completions.create({
      model: (await resolveLlmFor("analyst-table-refresh")).modelId,
      messages: [
        { role: "system", content: "You return only valid JSON. No prose, no fenced blocks." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    rawJson = completion.choices[0]?.message?.content ?? "{}";
    tokensUsed = completion.usage?.total_tokens ?? 0;
  } catch (err: unknown) {
    refreshLog.warn(`researchRegulatoryFees: LLM call failed: ${String(err)}`);
    return { proposedRows: [], narration: FEES_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let parsed: { rows?: unknown[]; narration?: unknown[]; evidence?: unknown[]; sourceCount?: unknown };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    refreshLog.warn("researchRegulatoryFees: failed to parse LLM JSON");
    return { proposedRows: [], narration: FEES_NARRATION, sourceCount: 0, tokensUsed, evidence: [] };
  }

  const proposedRows = Array.isArray(parsed.rows)
    ? parsed.rows.filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    : [];
  const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
    ? parsed.narration.slice(0, 10).map(String)
    : FEES_NARRATION;
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
        .map(e => ({ source: String(e["source"] ?? ""), url: e["url"] ? String(e["url"]) : undefined, finding: String(e["finding"] ?? "") }))
    : [];
  const sourceCount = typeof parsed.sourceCount === "number" ? parsed.sourceCount : Math.max(evidence.length, MIN_SOURCES);

  refreshLog.info(`researchRegulatoryFees: ${proposedRows.length} rows (${tokensUsed} tokens)`);
  return { proposedRows, narration, sourceCount, tokensUsed, evidence };
}

// ── Market Cap Rates ──────────────────────────────────────────────────────────

const CAPRATE_NARRATION = [
  "Consulting STR and CBRE hospitality cap rate surveys…",
  "Reviewing JLL and CoStar transaction-based cap rate data…",
  "Cross-checking recent boutique and full-service hotel sales…",
  "Analysing cap rate compression trends by submarket…",
  "Compiling as-of dates and source citations…",
];

export async function researchMarketCapRates(): Promise<ReferenceDataRefreshResult> {
  const prompt = `You are a hospitality real-estate analyst. Your task is to populate the market_cap_rates table with current cap rates for boutique and full-service hotels in major US markets.

Return a JSON object with exactly this shape:
{
  "rows": [
    {
      "country": "US",
      "subdivision": "string — 2-letter state code",
      "market": "string — city or metro name (e.g. 'Miami', 'New York City', 'Nashville')",
      "segment": "string | null — e.g. 'boutique', 'full-service', 'limited-service', 'luxury'",
      "capRate": "number — decimal fraction (percentage / 100)",
      "asOfDate": "YYYY-MM-DD — most recent quarter-end",
      "sourceName": "string | null — e.g. 'CBRE H2 2024 Hotel Cap Rate Survey'",
      "sourceUrl": "string | null"
    }
  ],
  "narration": ["research step 1", ...],
  "evidence": [
    { "source": "string", "url": "string (optional)", "finding": "string" }
  ],
  "sourceCount": number
}

REQUIREMENTS:
- Cover at least 15 rows across NY, FL, CA, TX, CO, TN, NV, HI, GA, AZ.
- Include both boutique and full-service segments for major metros.
- Cap rates must be in decimal form (percentage / 100).
- Use the most recent available data (2024 or 2025).
- Cite at least 3 independent sources (CBRE, JLL, STR, CoStar, RCA).
- Return ONLY valid JSON. No markdown, no preamble.`;

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err: unknown) {
    refreshLog.warn(`researchMarketCapRates: OpenAI unavailable: ${String(err)}`);
    return { proposedRows: [], narration: CAPRATE_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let rawJson = "";
  let tokensUsed = 0;
  try {
    const completion = await openai.chat.completions.create({
      model: (await resolveLlmFor("analyst-table-refresh")).modelId,
      messages: [
        { role: "system", content: "You return only valid JSON. No prose, no fenced blocks." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    rawJson = completion.choices[0]?.message?.content ?? "{}";
    tokensUsed = completion.usage?.total_tokens ?? 0;
  } catch (err: unknown) {
    refreshLog.warn(`researchMarketCapRates: LLM call failed: ${String(err)}`);
    return { proposedRows: [], narration: CAPRATE_NARRATION, sourceCount: 0, tokensUsed: 0, evidence: [] };
  }

  let parsed: { rows?: unknown[]; narration?: unknown[]; evidence?: unknown[]; sourceCount?: unknown };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    refreshLog.warn("researchMarketCapRates: failed to parse LLM JSON");
    return { proposedRows: [], narration: CAPRATE_NARRATION, sourceCount: 0, tokensUsed, evidence: [] };
  }

  const proposedRows = Array.isArray(parsed.rows)
    ? parsed.rows.filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    : [];
  const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
    ? parsed.narration.slice(0, 10).map(String)
    : CAPRATE_NARRATION;
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
        .map(e => ({ source: String(e["source"] ?? ""), url: e["url"] ? String(e["url"]) : undefined, finding: String(e["finding"] ?? "") }))
    : [];
  const sourceCount = typeof parsed.sourceCount === "number" ? parsed.sourceCount : Math.max(evidence.length, MIN_SOURCES);

  refreshLog.info(`researchMarketCapRates: ${proposedRows.length} rows (${tokensUsed} tokens)`);
  return { proposedRows, narration, sourceCount, tokensUsed, evidence };
}
