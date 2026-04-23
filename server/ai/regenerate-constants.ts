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
import { storage } from "../storage";
import { getSpecialistForConstant } from "../../engine/analyst/registry/specialist-catalog";
import { logger } from "../logger";
import {
  runTaxBulletinDiff,
  isJurisdictionSupported,
  MIN_PARSE_CONFIDENCE_FOR_TRUST,
  TAX_BULLETIN_DIFF_TOOL_ID,
  TAX_BULLETIN_DIFF_OWNER_SPECIALIST_ID,
  type BulletinDiffResult,
  type BulletinFetcher,
} from "./tools/tax-bulletin-diff";

const ANALYST_MODEL = normalizeModelId("claude-sonnet-4-5");

/**
 * Sentinel `entity_id` used when persisting `research_runs` rows for
 * Constants regeneration. The `research_runs.entity_id` column is `notNull
 * integer` and was designed for property/company entities (which always have
 * a real PK). Constants are keyed by `(constantKey, country, subdivision)` —
 * a composite that doesn't fit. We pin entity_id to 0 and stash the real
 * identity in `metadata.constant` so the audit trail is intact and the
 * existing covering indexes don't get polluted with synthetic key hashes.
 */
const CONSTANTS_ENTITY_ID = 0;
const CONSTANTS_ENTITY_TYPE = "model-constant";

/**
 * Telemetry tag stamped into `research_runs.metadata.toolId` so the audit
 * trail records which capability produced a given proposal.
 *   - `tax-bulletin-diff` — Helena's deterministic tool succeeded.
 *   - `llm-fallback` — every other proposal (the LLM Analyst path).
 *
 * Do NOT remove either constant — `tests/server/tax-bulletin-diff.test.ts`
 * asserts both surface in the metadata.
 */
export const LLM_FALLBACK_TOOL_ID = "llm-fallback" as const;

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
  /**
   * Persistent `research_runs.id` written when this proposal was synthesized.
   * The Apply route round-trips this id into `model_constant_overrides
   * .research_run_id`, so every analyst-sourced override is traceable to the
   * exact run that produced it (model knobs, duration, sources, the
   * Specialist that owned the constant).
   *
   * `null` only when persistence failed (logged) — the proposal is still
   * returned so the UI can display it, but the resulting override row will
   * carry a null FK.
   */
  researchRunId: number | null;
  /**
   * The Specialist (`SpecialistDefinition.id`) that owned the regeneration.
   * Resolved via `getSpecialistForConstant(key)`. Mirrored into the persisted
   * `research_runs.metadata.specialistId` for cross-table audit lookups.
   * Never `null` in well-formed catalogs (the coverage test asserts every
   * registry key has an owner); typed nullable for defensive degradation.
   */
  specialistId: string | null;
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
 * Try Helena's deterministic tax-bulletin-diff tool BEFORE the LLM path.
 *
 * Returns a fully-formed `ConstantRegenerationProposal` (and persists a
 * `research_runs` row tagged `metadata.toolId = "tax-bulletin-diff"`) when:
 *   - The owning Specialist is Helena (`constants.tax-research`).
 *   - The jurisdiction is in `BULLETIN_SOURCES`.
 *   - The tool fetches + parses the bulletin successfully.
 *   - The parsed value for the requested constant key is present.
 *   - `parseConfidence >= MIN_PARSE_CONFIDENCE_FOR_TRUST`.
 *
 * Returns `null` when ANY precondition fails — the caller then falls through
 * to the LLM Analyst path. The reason is logged for observability and (when
 * the tool actually ran) recorded as a failed `research_runs` row so the
 * Resources surface can show "tool fell back" telemetry.
 *
 * `fetcher` is injectable for testing — production calls leave it undefined
 * to use the default `fetch`-based implementation.
 */
async function tryTaxBulletinDiff(args: {
  key: string;
  country: string | null;
  subdivision: string | null;
  owningSpecialistId: string;
  resolvedValue: unknown;
  factoryValue: unknown;
  fetcher?: BulletinFetcher;
}): Promise<ConstantRegenerationProposal | null> {
  if (args.owningSpecialistId !== TAX_BULLETIN_DIFF_OWNER_SPECIALIST_ID) return null;
  if (!args.country) return null;
  const jurisdiction = { country: args.country, subdivision: args.subdivision };
  if (!isJurisdictionSupported(jurisdiction)) return null;

  const startedAt = Date.now();
  let diff: BulletinDiffResult;
  try {
    const cached = await storage.getTaxBulletinCache(args.country, args.subdivision);
    diff = await runTaxBulletinDiff({
      jurisdiction,
      cached: cached
        ? {
            bulletinHash: cached.bulletinHash,
            parsedValues: cached.parsedValues,
            fetchedAt: cached.fetchedAt.toISOString(),
          }
        : null,
      fetcher: args.fetcher,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `tax-bulletin-diff failed for ${args.country}/${args.subdivision ?? "federal"} (key=${args.key}); falling back to LLM: ${msg}`,
      "regenerate-constants",
    );
    // Persist the failure as a research_run so the audit trail records the
    // attempt — without this the Resources surface would show "tool never
    // ran" when in fact it ran and failed.
    try {
      await storage.createResearchRun({
        entityType: CONSTANTS_ENTITY_TYPE,
        entityId: CONSTANTS_ENTITY_ID,
        tier: 1,
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        error: msg,
        metadata: {
          specialistId: args.owningSpecialistId,
          toolId: TAX_BULLETIN_DIFF_TOOL_ID,
          constant: { key: args.key, country: args.country, subdivision: args.subdivision },
        },
      });
    } catch { /* swallow audit-logging failure; we're already on fallback */ }
    return null;
  }

  const parsed = diff.parsedValues[args.key];
  if (parsed === undefined) return null;
  if (diff.parseConfidence < MIN_PARSE_CONFIDENCE_FOR_TRUST) {
    logger.warn(
      `tax-bulletin-diff parseConfidence=${diff.parseConfidence.toFixed(2)} below trust threshold for ${args.country}/${args.subdivision ?? "federal"}; falling back to LLM`,
      "regenerate-constants",
    );
    return null;
  }

  // Persist the cache so the next refresh produces a real diff.
  try {
    await storage.upsertTaxBulletinCache({
      country: args.country,
      subdivision: args.subdivision ?? "",
      sourceUrl: diff.sourceUrl,
      publisher: diff.publisher,
      bulletinHash: diff.bulletinHash,
      parsedValues: diff.parsedValues as Record<string, unknown>,
      rawExcerpt: diff.rawExcerpt,
    });
  } catch (err: unknown) {
    // Cache persistence failure is loud — without it, the next diff is wrong.
    // Drop back to LLM rather than ship a proposal we can't reproduce.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      `tax-bulletin-diff cache upsert failed for ${args.country}/${args.subdivision ?? "federal"}; refusing to use deterministic result: ${msg}`,
      "regenerate-constants",
    );
    return null;
  }

  const value = parsed;
  const citation = diff.citations[0];
  const reasoning = diff.changedFields.length > 0
    ? `Deterministic fetch + parse from ${diff.publisher}. ${diff.changedFields.length} field(s) changed since last refresh.`
    : `Deterministic fetch from ${diff.publisher}; value unchanged since last refresh.`;
  const sources: CitedSource[] = diff.citations.map((c) => ({
    title: c.publisher,
    url: c.url,
    snippet: c.rawExcerpt,
  }));

  let researchRunId: number | null = null;
  try {
    const run = await storage.createResearchRun({
      entityType: CONSTANTS_ENTITY_TYPE,
      entityId: CONSTANTS_ENTITY_ID,
      tier: 0,
      status: "completed",
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
      modelPrimary: null,
      metadata: {
        specialistId: args.owningSpecialistId,
        toolId: TAX_BULLETIN_DIFF_TOOL_ID,
        constant: { key: args.key, country: args.country, subdivision: args.subdivision },
        proposal: {
          value,
          authority: diff.publisher,
          referenceUrl: diff.sourceUrl,
          reasoning,
          factoryValue: args.factoryValue,
          isDifferentFromCurrent: !deepEqual(value, args.resolvedValue),
        },
        bulletin: {
          hash: diff.bulletinHash,
          fetchedAt: diff.fetchedAt,
          parseConfidence: diff.parseConfidence,
          changedFields: diff.changedFields.map((f) => f.fieldKey),
        },
        sources,
      },
    });
    researchRunId = run.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Failed to persist research_run for tax-bulletin-diff (${args.country}/${args.subdivision ?? "federal"}); proceeding with null FK: ${msg}`,
      "regenerate-constants",
    );
  }

  const entry = MODEL_CONSTANTS_REGISTRY[args.key]!;
  return {
    key: args.key,
    label: entry.label,
    country: args.country,
    subdivision: args.subdivision,
    value,
    authority: citation?.publisher ?? diff.publisher,
    referenceUrl: diff.sourceUrl,
    reasoning,
    sources,
    factoryValue: args.factoryValue,
    currentValue: args.resolvedValue,
    isDifferentFromCurrent: !deepEqual(value, args.resolvedValue),
    researchRunId,
    specialistId: args.owningSpecialistId,
  };
}

/**
 * Produce a regeneration proposal for a single constant at a single
 * locality. Does NOT persist anything other than the audit `research_run`
 * (and, on Helena's deterministic path, the bulletin cache).
 *
 * Pipeline (Phase 2c addition):
 *   1. Resolve the owning Specialist; validate locality.
 *   2. If the owner is Helena AND the jurisdiction is supported by the
 *      tax-bulletin-diff tool, run the tool first. On success, return the
 *      tool's proposal directly — no LLM call.
 *   3. Otherwise, fall through to the LLM Analyst path (unchanged from
 *      Phase 3). The proposal is tagged `metadata.toolId = "llm-fallback"`.
 *
 * `fetcher` is wired through to the deterministic tool so tests can stub
 * HTTP without touching live tax-authority endpoints.
 */
export async function proposeConstantRegeneration(args: {
  key: string;
  country: string | null;
  subdivision: string | null;
  /** All current overrides — caller passes the cached list to avoid an extra DB hit. */
  overrides: ModelConstantOverride[];
  /** Test seam — production callers leave undefined to use real `fetch`. */
  bulletinFetcher?: BulletinFetcher;
}): Promise<ConstantRegenerationProposal> {
  const startedAt = Date.now();
  const entry = MODEL_CONSTANTS_REGISTRY[args.key];
  if (!entry) throw new Error(`Unknown constant key: ${args.key}`);

  const owningSpecialist = getSpecialistForConstant(args.key);
  if (!owningSpecialist) {
    // Hard fail — Constants doctrine requires an owning Specialist for every
    // governed key. The coverage test catches drifts at build time, so this
    // is a runtime safety net, not the primary enforcement.
    throw new Error(
      `No AI Intelligence Specialist owns constant '${args.key}'. ` +
      `Add it to a Specialist's constantsOwned[] in engine/analyst/registry/specialist-catalog.ts.`,
    );
  }

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

  // 0. Deterministic-first: try Helena's tax-bulletin-diff before any LLM
  //    call. Returns a fully-formed proposal on success, `null` to fall
  //    through to the LLM Analyst path. See `tryTaxBulletinDiff` for the
  //    full set of preconditions.
  const deterministicProposal = await tryTaxBulletinDiff({
    key: args.key,
    country: args.country,
    subdivision: args.subdivision,
    owningSpecialistId: owningSpecialist.id,
    resolvedValue: resolved.value,
    factoryValue,
    fetcher: args.bulletinFetcher,
  });
  if (deterministicProposal) return deterministicProposal;

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
  const referenceUrl = parsed.referenceUrl ?? entry.meta.referenceUrl ?? null;
  const durationMs = Date.now() - startedAt;

  // Persist the research run BEFORE returning so the proposal carries a real
  // FK target the Apply route can write into model_constant_overrides
  // .research_run_id. Failures are logged and degraded to a null FK — we
  // don't block the proposal because the analyst result is still useful.
  let researchRunId: number | null = null;
  try {
    const run = await storage.createResearchRun({
      entityType: CONSTANTS_ENTITY_TYPE,
      entityId: CONSTANTS_ENTITY_ID,
      tier: 1,
      status: "completed",
      completedAt: new Date(),
      durationMs,
      modelPrimary: ANALYST_MODEL,
      metadata: {
        specialistId: owningSpecialist.id,
        specialistLetter: owningSpecialist.letter,
        // Phase 2c — every Helena run records WHICH capability produced the
        // proposal. The deterministic path stamps "tax-bulletin-diff"; this
        // path is the catch-all LLM Analyst.
        toolId: LLM_FALLBACK_TOOL_ID,
        constant: {
          key: args.key,
          country: args.country,
          subdivision: args.subdivision,
        },
        proposal: {
          value,
          authority: parsed.authority,
          referenceUrl,
          reasoning: parsed.reasoning,
          factoryValue,
          isDifferentFromCurrent: !deepEqual(value, resolved.value),
        },
        sources: searchSources,
        groundedSearchUsed: searchSources.length > 0,
      },
    });
    researchRunId = run.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const loc = `${args.country ?? "universal"}${args.subdivision ? `/${args.subdivision}` : ""}`;
    logger.warn(
      `Failed to persist research_run for constant '${args.key}' (${loc}); proceeding with null FK: ${msg}`,
      "regenerate-constants",
    );
  }

  return {
    key: args.key,
    label: entry.label,
    country: args.country,
    subdivision: args.subdivision,
    value,
    authority: parsed.authority,
    referenceUrl,
    reasoning: parsed.reasoning,
    sources: searchSources,
    factoryValue,
    currentValue: resolved.value,
    isDifferentFromCurrent: !deepEqual(value, resolved.value),
    researchRunId,
    specialistId: owningSpecialist.id,
  };
}
