/**
 * regenerate-constants — Phase 3 Analyst-driven regeneration of governed
 * Model Constants.
 *
 * Surface area is intentionally tiny: one function that takes a registry key
 * + locality and returns a typed *proposal* (no DB writes). The Admin route
 * decides whether to persist after the user has reviewed the diff.
 *
 * Pipeline:
 *   1. Look up the constant's registry entry (locality, factory value, helper
 *      text, cited authority). Validate the locality matches the registry —
 *      we never propose a value at an impossible locality (e.g. universal
 *      constant with a country qualifier).
 *   2. Build a focused web-search query from the registry metadata. If
 *      Perplexity / Tavily is configured we run it; otherwise we proceed
 *      without grounded sources and let the LLM reason from training data
 *      (the proposal will simply have an empty `sources[]`, which the UI
 *      surfaces as a confidence warning).
 *   3. Ask Claude to extract a single typed value plus authority + reasoning
 *      as strict JSON. The expected JS type is inferred from the current
 *      effective value (number stays number, etc.) and validated post-hoc.
 *   4. Return `{ value, authority, referenceUrl, reasoning, sources, currentValue,
 *      factoryValue, isDifferentFromCurrent }`. Caller persists via
 *      `storage.upsertModelConstantOverride` with `source='analyst'`.
 *
 * Notes:
 *   - Pure function side-effect-wise: no DB writes, only LLM + web-search
 *     IO. Caller is responsible for audit logging.
 *   - Failure modes raise; the route translates to 5xx so the UI shows an
 *     error rather than silently writing the wrong value.
 */

import { getAnthropicClient, normalizeModelId } from "./clients";
import { GroundedResearchService } from "../services/GroundedResearchService";
import { MODEL_CONSTANTS_REGISTRY, getFactoryValue } from "@shared/model-constants-registry";
import { getEffectiveConstant } from "@shared/get-effective-constant";
import type { ModelConstantOverride } from "@shared/schema";
import type { CitedSource } from "@shared/market-intelligence";

const ANALYST_MODEL = normalizeModelId("claude-sonnet-4-5");

export interface ConstantRegenerationProposal {
  key: string;
  label: string;
  country: string | null;
  subdivision: string | null;
  /** Proposed value, typed to match the existing factory value's JS type. */
  value: unknown;
  /** Cited authority (e.g. "IRS Publication 946, IRC §168(e)(2)(A)"). */
  authority: string;
  /** Optional canonical reference URL. */
  referenceUrl: string | null;
  /** Short Analyst reasoning (1-3 sentences) explaining the choice. */
  reasoning: string;
  /** Grounded sources (empty when no search provider is configured). */
  sources: CitedSource[];
  /** Factory baseline at this locality (for diff display). */
  factoryValue: unknown;
  /** Currently-effective value at this locality (factory + any overlay). */
  currentValue: unknown;
  /** True iff proposed value differs from currentValue (uses deep-equal). */
  isDifferentFromCurrent: boolean;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  if (ak.length !== Object.keys(bo).length) return false;
  return ak.every((k) =>
    Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]),
  );
}

/**
 * Best-effort JS type inference. Used to coerce/validate the LLM's JSON
 * output back to the same shape as the factory value so callers don't get
 * surprised by `"39"` (string) when they expect `39` (number).
 */
function expectedTypeOf(v: unknown): "number" | "string" | "boolean" | "array" | "object" | "unknown" {
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if (typeof v === "boolean") return "boolean";
  if (Array.isArray(v)) return "array";
  if (v && typeof v === "object") return "object";
  return "unknown";
}

function coerceToType(raw: unknown, target: ReturnType<typeof expectedTypeOf>): unknown {
  if (target === "unknown") return raw;
  if (target === "number") {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
    throw new Error(`Analyst returned non-numeric value: ${JSON.stringify(raw)}`);
  }
  if (target === "string") {
    if (typeof raw === "string") return raw;
    throw new Error(`Analyst returned non-string value: ${JSON.stringify(raw)}`);
  }
  if (target === "boolean") {
    if (typeof raw === "boolean") return raw;
    throw new Error(`Analyst returned non-boolean value: ${JSON.stringify(raw)}`);
  }
  if (target === "array") {
    if (Array.isArray(raw)) return raw;
    throw new Error(`Analyst returned non-array value: ${JSON.stringify(raw)}`);
  }
  if (target === "object") {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    throw new Error(`Analyst returned non-object value: ${JSON.stringify(raw)}`);
  }
  return raw;
}

function buildSearchQuery(key: string, label: string, country: string | null, subdivision: string | null): string {
  const loc = subdivision ? `${subdivision}, ${country}` : country ?? "global hospitality";
  // Constant-specific hints help the search engine; fall back to a generic
  // form for keys we haven't tuned yet.
  switch (key) {
    case "depreciationYears":
      return `hotel building straight-line depreciation useful life years tax authority ${loc} 2026`;
    case "daysPerMonth":
      return `hospitality industry standard days per month revenue calculation 365 12 convention`;
    default:
      return `${label} authoritative value ${loc}`;
  }
}

function buildSystemPrompt(): string {
  return [
    "You are The Analyst — a meticulous, GAAP/USALI-compliant financial research agent for boutique hotel portfolios.",
    "Your job in this turn is to propose ONE governed model constant value backed by a citable, authoritative source.",
    "Rules:",
    "  - Return ONLY a single JSON object. No markdown, no prose around it.",
    "  - Keys: { value, authority, referenceUrl, reasoning }.",
    "  - `value` MUST be the same JSON type as the factory value provided in the user message.",
    "  - `authority` MUST name the authoritative source (e.g. 'IRS Publication 946, IRC §168(e)(2)(A)' or 'AHLA convention').",
    "  - `referenceUrl` MUST be a canonical URL to the authority (or null if you cannot produce one).",
    "  - `reasoning` MUST be 1-3 sentences explaining the choice, citing the authority.",
    "  - If grounded search snippets are provided, prefer them over training data and quote the authority verbatim.",
    "  - If you cannot find a defensible value, return { error: '<reason>' } — do NOT guess.",
  ].join("\n");
}

function buildUserPrompt(args: {
  key: string;
  label: string;
  helperText: string;
  registryAuthority: string;
  registryReferenceUrl?: string;
  country: string | null;
  subdivision: string | null;
  factoryValue: unknown;
  expectedType: ReturnType<typeof expectedTypeOf>;
  searchAnswer: string;
  searchSources: CitedSource[];
}): string {
  const lines = [
    `Constant key: ${args.key}`,
    `Label: ${args.label}`,
    `Locality: ${args.subdivision ? `${args.subdivision}, ${args.country}` : args.country ?? "universal"}`,
    `Current factory value (TS baseline): ${JSON.stringify(args.factoryValue)}`,
    `Expected JSON type for \`value\`: ${args.expectedType}`,
    `Registry authority hint: ${args.registryAuthority}`,
  ];
  if (args.registryReferenceUrl) lines.push(`Registry URL hint: ${args.registryReferenceUrl}`);
  lines.push("", `Field documentation: ${args.helperText}`);
  if (args.searchAnswer) {
    lines.push("", "Grounded search synthesis:", args.searchAnswer);
  }
  if (args.searchSources.length > 0) {
    lines.push("", "Citations from grounded search:");
    args.searchSources.slice(0, 6).forEach((s, i) => {
      lines.push(`  [${i + 1}] ${s.title} — ${s.url}`);
    });
  }
  lines.push("", "Return the JSON object now.");
  return lines.join("\n");
}

interface AnalystJson {
  value?: unknown;
  authority?: string;
  referenceUrl?: string | null;
  reasoning?: string;
  error?: string;
}

function parseAnalystJson(raw: string): AnalystJson {
  // Claude is instructed to return raw JSON, but defensively strip any
  // accidental ```json fences.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(trimmed) as AnalystJson;
  } catch {
    // Fall back to the first {...} block if Claude wrapped the JSON in prose.
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Analyst returned non-JSON output: ${trimmed.slice(0, 200)}`);
    return JSON.parse(match[0]) as AnalystJson;
  }
}

/**
 * Produce a regeneration proposal for a single constant at a single
 * locality. Does NOT persist anything.
 */
export async function proposeConstantRegeneration(args: {
  key: string;
  country: string | null;
  subdivision: string | null;
  /** All current overrides — caller passes the cached list to avoid an extra DB hit. */
  overrides: ModelConstantOverride[];
}): Promise<ConstantRegenerationProposal> {
  const entry = MODEL_CONSTANTS_REGISTRY[args.key];
  if (!entry) throw new Error(`Unknown constant key: ${args.key}`);

  // Locality validation mirrors the route helper. We re-do it here so the
  // function is safe to call from non-route contexts (scheduler, tests).
  if (entry.locality === "universal" && (args.country || args.subdivision)) {
    throw new Error(`Constant '${args.key}' is universal — locality must be null/null.`);
  }
  if (entry.locality === "country" && args.subdivision) {
    throw new Error(`Constant '${args.key}' does not support subdivisions.`);
  }
  if (entry.locality !== "universal" && !args.country) {
    throw new Error(`Constant '${args.key}' requires a country.`);
  }

  const factoryValue = getFactoryValue(args.key, args.country, args.subdivision);
  const resolved = getEffectiveConstant({
    key: args.key,
    country: args.country,
    subdivision: args.subdivision,
    overrides: args.overrides,
  });
  const expectedType = expectedTypeOf(factoryValue);

  // 1. Grounded search (best-effort).
  let searchAnswer = "";
  let searchSources: CitedSource[] = [];
  const grs = new GroundedResearchService();
  if (grs.isAvailable()) {
    const query = buildSearchQuery(args.key, entry.label, args.country, args.subdivision);
    try {
      const results = await grs.search([{ query }]);
      const top = results[0];
      if (top) {
        searchAnswer = top.answer ?? "";
        searchSources = top.sources ?? [];
      }
    } catch {
      // Search failures are non-fatal — fall through to ungrounded LLM call.
      searchAnswer = "";
      searchSources = [];
    }
  }

  // 2. Ask Claude for the structured proposal.
  const anthropic = getAnthropicClient();
  const completion = await anthropic.messages.create({
    model: ANALYST_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildUserPrompt({
          key: args.key,
          label: entry.label,
          helperText: entry.meta.helperText,
          registryAuthority: entry.meta.authority,
          registryReferenceUrl: entry.meta.referenceUrl,
          country: args.country,
          subdivision: args.subdivision,
          factoryValue,
          expectedType,
          searchAnswer,
          searchSources,
        }),
      },
    ],
  });

  const textBlock = completion.content.find((b) => b.type === "text");
  const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!rawText) throw new Error("Analyst returned an empty response.");

  const parsed = parseAnalystJson(rawText);
  if (parsed.error) throw new Error(`Analyst declined: ${parsed.error}`);
  if (parsed.value === undefined) throw new Error("Analyst response missing `value` field.");
  if (!parsed.authority) throw new Error("Analyst response missing `authority` field.");
  if (!parsed.reasoning) throw new Error("Analyst response missing `reasoning` field.");

  const value = coerceToType(parsed.value, expectedType);

  return {
    key: args.key,
    label: entry.label,
    country: args.country,
    subdivision: args.subdivision,
    value,
    authority: parsed.authority,
    referenceUrl: parsed.referenceUrl ?? entry.meta.referenceUrl ?? null,
    reasoning: parsed.reasoning,
    sources: searchSources,
    factoryValue,
    currentValue: resolved.value,
    isDifferentFromCurrent: !deepEqual(value, resolved.value),
  };
}
