import { getOpenAIClient } from "../clients";
import { resolveLlmFor } from "../llm-config-resolver";
import { storage } from "../../storage";
import type { ReferenceBrand, InsertReferenceBrand } from "@workspace/db";
import {
  refreshLog,
  type ProposedRange,
  type AnalystRefreshResult,
} from "./shared";

// ─────────────────────────────────────────────────────────────────────────────
// Reference Brands refresh — auto-commit (no diff/review step)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenceBrandsRefreshResult extends AnalystRefreshResult {
  autoCommitted: true;
  brandCount: number;
}

const REFERENCE_BRANDS_NARRATION = [
  "Sourcing current boutique and lifestyle hospitality brand data…",
  "Reviewing ADR, occupancy, and RevPAR for known reference brands…",
  "Checking brand portfolios: property counts and key-count ranges…",
  "Cross-referencing M&A transactions and PE ownership changes…",
  "Synthesising positioning summaries from operator and trade sources…",
  "Auto-committing reference brands (no diff review required)…",
];

// Auto-commit coverage gate: the prompt demands 15–25 brands including these
// six founding names. A partial response would otherwise pass the empty-string
// filter and silently drop omitted brands on the full-table replace. Listed
// verbatim from the prompt so a prompt-side change forces a code-side update
// (CodeRabbit PR-85).
const REQUIRED_FOUNDING_BRANDS = [
  "Axel Hotels",
  "Mama Shelter",
  "Desire Resorts",
  "Selina",
  "Eleven Experience",
  "Yotel",
] as const;
const MIN_REFERENCE_BRANDS = 15; // lower bound of the "15–25 brands" prompt contract

// Implementation note: uses direct openai.chat.completions.create — the same
// approach as researchCapitalRaiseBenchmarks and researchExitMultiples above.
// The handleToolCall / aiResearch.ts pipeline is for the interactive specialist
// chat flow; these analyst-table refresh functions are batch, non-interactive,
// and intentionally follow the simpler prompt→JSON-parse pattern.
export async function researchReferenceBrands(
  current: ReferenceBrand[],
  auditId?: number,
): Promise<ReferenceBrandsRefreshResult> {
  const currentBrandList = current.length > 0
    ? current.map(b => `- ${b.brandName} (${b.niche ?? "n/a"}, ${b.propertyCount ?? "?"} properties)`).join("\n")
    : "(table is currently empty)";

  const prompt = `You are a hospitality industry analyst. Your task is to refresh the reference_brands table with current data on 15–25 real boutique / lifestyle / experiential hotel brands.

ALWAYS include these 6 founding brands (verify and update their current metrics):
1. Axel Hotels
2. Mama Shelter
3. Desire Resorts
4. Selina
5. Eleven Experience
6. Yotel

CURRENT TABLE (for orientation — verify and update each row):
${currentBrandList}

Return a JSON object with this exact shape:
{
  "brands": [
    {
      "brandName": "string — official brand name",
      "niche": "string — 2–5 word niche label (e.g. 'LGBTQ+ boutique lifestyle')",
      "positioningSummary": "string — 1–2 sentence brand DNA",
      "guestSegment": "string — primary guest profiles",
      "propertyCount": number | null,
      "keyCountMin": number | null,
      "keyCountMax": number | null,
      "geographicFocus": "string — primary markets",
      "adrUsd": number | null,
      "occupancyPct": number | null,
      "revparUsd": number | null,
      "revenueRangeLowUsd": number | null,
      "revenueRangeHighUsd": number | null,
      "ownershipModel": "string — ownership/management structure",
      "acquisitionContext": "string | null — M&A, PE, or IPO history if any",
      "description": "string — 2–4 sentence narrative",
      "dataYear": number,
      "sourceUrls": ["string", ...]
    }
  ],
  "narration": ["string line 1", ...],
  "evidence": [
    { "source": "string", "url": "string (optional)", "finding": "string" }
  ],
  "sourceCount": number
}

REQUIREMENTS:
- Include 15–25 brands total; always include the 6 founding brands above.
- Use orientation-grade data from public filings, press releases, and trade publications.
- Wide variation across rows is intentional and correct — do not normalize.
- Cite at least 3 independent sources in evidence[].
- narration should be 4–6 short ticker lines describing your research steps.
- All financial figures are in USD. occupancyPct is 0.0–1.0 (e.g. 0.82 = 82%).
- IMPORTANT: Return ONLY valid JSON with no markdown fences, no preamble, no trailing text.`;

  let rawJson = "";
  let tokensUsed = 0;

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: (await resolveLlmFor("analyst-table-refresh")).modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    rawJson = completion.choices[0]?.message?.content ?? "{}";
    tokensUsed = completion.usage?.total_tokens ?? 0;
  } catch (err: unknown) {
    refreshLog.warn(`researchReferenceBrands: LLM call failed, keeping existing rows: ${String(err)}`);
    return {
      autoCommitted: true,
      brandCount: current.length,
      proposedRanges: brandRowsToRanges(current),
      narration: REFERENCE_BRANDS_NARRATION,
      sourceCount: 0,
      tokensUsed: 0,
      evidence: [],
    };
  }

  let parsed: {
    brands?: unknown[];
    narration?: unknown[];
    evidence?: unknown[];
    sourceCount?: unknown;
  };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    refreshLog.warn("researchReferenceBrands: failed to parse LLM JSON; keeping existing rows");
    return {
      autoCommitted: true,
      brandCount: current.length,
      proposedRanges: brandRowsToRanges(current),
      narration: REFERENCE_BRANDS_NARRATION,
      sourceCount: 0,
      tokensUsed,
      evidence: [],
    };
  }

  const rawBrands = Array.isArray(parsed.brands) ? parsed.brands : [];
  const newBrands: InsertReferenceBrand[] = rawBrands
    .filter((b): b is Record<string, unknown> => b !== null && typeof b === "object")
    // Reject rows missing the only required field. Without this, a parseable
    // payload of `[{}]` becomes `[{ brandName: "Unknown", ... }]` and replaces
    // the entire reference_brands table with placeholder rows on auto-commit
    // (CodeRabbit PR-84).
    .filter((b): b is Record<string, unknown> & { brandName: string } => {
      return typeof b["brandName"] === "string" && b["brandName"].trim() !== "";
    })
    .map(b => ({
      brandName: b["brandName"].trim(),
      niche: b["niche"] ? String(b["niche"]) : null,
      positioningSummary: b["positioningSummary"] ? String(b["positioningSummary"]) : null,
      guestSegment: b["guestSegment"] ? String(b["guestSegment"]) : null,
      propertyCount: typeof b["propertyCount"] === "number" ? b["propertyCount"] : null,
      keyCountMin: typeof b["keyCountMin"] === "number" ? b["keyCountMin"] : null,
      keyCountMax: typeof b["keyCountMax"] === "number" ? b["keyCountMax"] : null,
      geographicFocus: b["geographicFocus"] ? String(b["geographicFocus"]) : null,
      adrUsd: typeof b["adrUsd"] === "number" ? b["adrUsd"] : null,
      occupancyPct: typeof b["occupancyPct"] === "number" ? b["occupancyPct"] : null,
      revparUsd: typeof b["revparUsd"] === "number" ? b["revparUsd"] : null,
      revenueRangeLowUsd: typeof b["revenueRangeLowUsd"] === "number" ? b["revenueRangeLowUsd"] : null,
      revenueRangeHighUsd: typeof b["revenueRangeHighUsd"] === "number" ? b["revenueRangeHighUsd"] : null,
      ownershipModel: b["ownershipModel"] ? String(b["ownershipModel"]) : null,
      acquisitionContext: b["acquisitionContext"] ? String(b["acquisitionContext"]) : null,
      description: b["description"] ? String(b["description"]) : null,
      referenceDisclaimer: true,
      dataYear: typeof b["dataYear"] === "number" ? b["dataYear"] : new Date().getFullYear(),
      sourceUrls: Array.isArray(b["sourceUrls"]) ? b["sourceUrls"] as string[] : null,
      lastRefreshedAt: new Date(),
      refreshedByRunId: auditId ?? null,
    }));

  // Auto-commit gate (CodeRabbit PR-85): a payload of (e.g.) 2 brands would
  // pass the empty-string filter and overwrite the entire table on the full
  // replace below. Require both a minimum row count AND every founding brand
  // before allowing the replace; otherwise re-insert the existing rows.
  const newBrandNames = new Set(newBrands.map(b => b.brandName));
  const missingFoundingBrands = REQUIRED_FOUNDING_BRANDS.filter(name => !newBrandNames.has(name));
  const hasRequiredCoverage =
    newBrands.length >= MIN_REFERENCE_BRANDS && missingFoundingBrands.length === 0;

  if (!hasRequiredCoverage) {
    refreshLog.warn(
      `researchReferenceBrands: payload incomplete ` +
      `(${newBrands.length} brands, need ≥${MIN_REFERENCE_BRANDS}; ` +
      `missing founding brands: ${missingFoundingBrands.length > 0 ? missingFoundingBrands.join(", ") : "none"}) ` +
      `— keeping existing rows`,
    );
  }

  // When falling back, re-insert the existing rows. Strip DB-managed fields
  // (id, createdAt, updatedAt) so the INSERT does not conflict with the
  // GENERATED ALWAYS IDENTITY column.
  const brandsToWrite: InsertReferenceBrand[] = hasRequiredCoverage ? newBrands : current.map(b => ({
    brandName: b.brandName,
    niche: b.niche,
    positioningSummary: b.positioningSummary,
    guestSegment: b.guestSegment,
    propertyCount: b.propertyCount,
    keyCountMin: b.keyCountMin,
    keyCountMax: b.keyCountMax,
    geographicFocus: b.geographicFocus,
    adrUsd: b.adrUsd,
    occupancyPct: b.occupancyPct,
    revparUsd: b.revparUsd,
    revenueRangeLowUsd: b.revenueRangeLowUsd,
    revenueRangeHighUsd: b.revenueRangeHighUsd,
    ownershipModel: b.ownershipModel,
    acquisitionContext: b.acquisitionContext,
    description: b.description,
    referenceDisclaimer: b.referenceDisclaimer,
    dataYear: b.dataYear,
    sourceUrls: b.sourceUrls,
    lastRefreshedAt: new Date(),
    refreshedByRunId: auditId ?? null,
  }));

  const written = await storage.replaceAllReferenceBrands(brandsToWrite);

  const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
    ? parsed.narration.map(String)
    : REFERENCE_BRANDS_NARRATION;
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
        .map(e => ({
          source: String(e["source"] ?? ""),
          url: e["url"] ? String(e["url"]) : undefined,
          finding: String(e["finding"] ?? ""),
        }))
    : [];
  const sourceCount = typeof parsed.sourceCount === "number"
    ? parsed.sourceCount
    : evidence.length;

  refreshLog.info(`researchReferenceBrands: auto-committed ${written.length} brands (${tokensUsed} tokens)`);

  return {
    autoCommitted: true,
    brandCount: written.length,
    proposedRanges: brandRowsToRanges(written),
    narration,
    sourceCount,
    tokensUsed,
    evidence,
  };
}

function brandRowsToRanges(brands: Array<Pick<ReferenceBrand, "id" | "brandName" | "niche" | "propertyCount" | "keyCountMin" | "keyCountMax">>): ProposedRange[] {
  // The ProposedRange triple must describe a single metric. The original code
  // mixed propertyCount (a count) into a keyCount (per-property room count)
  // range — different units. Fix: render the natural keyCount range with mid
  // as the midpoint when both bounds are present, falling back to whichever
  // single bound exists. unit changed from "properties" to "keys" to match
  // the data (CodeRabbit PR-84).
  return brands.map(b => {
    const low = b.keyCountMin ?? null;
    const high = b.keyCountMax ?? null;
    const mid = low !== null && high !== null ? (low + high) / 2 : (low ?? high);
    return {
      dimensionKey: `brand_${b.id}`,
      label: b.niche ? `${b.brandName} · ${b.niche}` : b.brandName,
      unit: "keys",
      valueLow: low,
      valueMid: mid,
      valueHigh: high,
    };
  });
}
