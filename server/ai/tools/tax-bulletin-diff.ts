/**
 * tax-bulletin-diff — Helena's deterministic tax-authority bulletin tool
 * (Phase 2c proof of "deterministic-first, LLM as fallback" doctrine).
 *
 * What this is:
 *   A pure-code capability that, given a jurisdiction, fetches the latest
 *   tax-authority publication, parses out the constants we care about
 *   (income-tax rate, capital-gains rate, etc.), and diffs them against the
 *   cached payload from the previous fetch. Returns a structured changelog
 *   with citations and a parse-confidence score.
 *
 * What this is NOT:
 *   An LLM call site. There is no model in the loop here. The caller in
 *   `regenerate-constants.ts` consults this tool first and only falls back
 *   to the LLM-driven proposer when (a) the jurisdiction is unsupported,
 *   (b) the tool throws on a parse failure, or (c) `parseConfidence` is
 *   below the trust threshold.
 *
 * Loud-fail surface (the tool itself never silently degrades):
 *   - `UnsupportedJurisdictionError` when no source is configured.
 *   - `BulletinFetchError` when the HTTP fetch fails (non-2xx, network).
 *   - `BulletinParseError` when the parser cannot find ANY known field —
 *     this signals a structural change in the bulletin (e.g. IRS reformatted
 *     the page) that requires a human or the LLM to interpret. We do NOT
 *     try to coerce a low-confidence guess; the caller decides.
 */

import { createHash } from "node:crypto";
import {
  SPECIALIST_CATALOG,
} from "../../../engine/analyst/registry/specialist-catalog";

// ───────────────────────────────────────────────────────────────────────────
// Public types — kept stable so the Resources surface and the constants
// pipeline can both depend on them without a shared adapter.
// ───────────────────────────────────────────────────────────────────────────

export interface JurisdictionKey {
  readonly country: string;
  /** `null` for federal-level / country-only sources. */
  readonly subdivision: string | null;
}

export interface BulletinFetchResult {
  readonly url: string;
  readonly publisher: string;
  /** ISO timestamp captured at fetch time. */
  readonly retrievedAt: string;
  /** Canonical text payload — caller MUST normalize whitespace before hashing. */
  readonly rawText: string;
}

export interface BulletinCitation {
  readonly url: string;
  readonly publisher: string;
  readonly retrievedAt: string;
  /** Verbatim excerpt from the bulletin that supports the parsed value. */
  readonly rawExcerpt: string;
}

export interface BulletinDiffField {
  readonly fieldKey: string;
  readonly previousValue: unknown | null;
  readonly newValue: unknown;
  readonly citationIndex: number;
}

export interface CachedBulletin {
  readonly bulletinHash: string;
  readonly parsedValues: Readonly<Record<string, unknown>>;
  readonly fetchedAt: string;
}

export interface BulletinDiffResult {
  readonly jurisdiction: JurisdictionKey;
  readonly fetchedAt: string;
  readonly bulletinHash: string;
  readonly sourceUrl: string;
  readonly publisher: string;
  /** Fields whose value changed vs. the cached payload. Empty on cache hit
   *  with identical hash, or on first-ever fetch with no cached baseline. */
  readonly changedFields: readonly BulletinDiffField[];
  /** Fields the parser successfully extracted but that match the cache. */
  readonly unchangedFields: readonly string[];
  /** Citations indexed by `BulletinDiffField.citationIndex`. */
  readonly citations: readonly BulletinCitation[];
  /** 0..1 — fraction of expected fields the parser actually located.
   *  Caller compares against `MIN_PARSE_CONFIDENCE_FOR_TRUST`. */
  readonly parseConfidence: number;
  /** All values the parser successfully extracted (changed + unchanged). */
  readonly parsedValues: Readonly<Record<string, unknown>>;
  /** Excerpt to persist with the cache row so the next diff has a citation. */
  readonly rawExcerpt: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Errors — explicit classes so callers can branch without string-matching.
// ───────────────────────────────────────────────────────────────────────────

export class UnsupportedJurisdictionError extends Error {
  constructor(jurisdiction: JurisdictionKey) {
    super(
      `tax-bulletin-diff has no configured source for ${jurisdictionLabel(jurisdiction)}. ` +
      `Add an entry to BULLETIN_SOURCES to support this jurisdiction.`,
    );
    this.name = "UnsupportedJurisdictionError";
  }
}

export class BulletinFetchError extends Error {
  constructor(url: string, cause: unknown) {
    super(`tax-bulletin-diff failed to fetch ${url}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "BulletinFetchError";
  }
}

export class BulletinParseError extends Error {
  constructor(jurisdiction: JurisdictionKey, reason: string) {
    super(
      `tax-bulletin-diff could not parse ${jurisdictionLabel(jurisdiction)} bulletin: ${reason}. ` +
      `This signals a structural change in the source document; human review or LLM fallback required.`,
    );
    this.name = "BulletinParseError";
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Source registry & parsers.
//
// Each supported jurisdiction declares: the URL to fetch, the publisher
// label, the set of constant keys it can produce, and a `parse` function
// from raw text to (parsedValues, excerpt). Adding a jurisdiction means
// adding one entry here; the rest of the tool is generic.
//
// Phase 2c ships ONE concrete jurisdiction (US federal) to prove the
// architecture. Other countries fall through to LLM via the caller.
// ───────────────────────────────────────────────────────────────────────────

interface BulletinParseOutput {
  readonly parsedValues: Readonly<Record<string, unknown>>;
  /** The verbatim excerpts the values were extracted from, keyed by field. */
  readonly excerpts: Readonly<Record<string, string>>;
}

interface BulletinSource {
  readonly jurisdiction: JurisdictionKey;
  readonly url: string;
  readonly publisher: string;
  /** Constant keys this source CAN produce. parseConfidence is computed as
   *  (# parsed) / (# expected). Tuning this set tightens or loosens the
   *  trust threshold per jurisdiction. */
  readonly expectedFields: readonly string[];
  readonly parse: (rawText: string) => BulletinParseOutput;
}

/**
 * IRS federal corporate-tax page. Covers `taxRate` and `capitalGainsRate`
 * for the US (subdivision = null / federal). Per-state rates remain on
 * the LLM path until per-state sources are wired.
 *
 * The parser is intentionally strict-by-pattern. If the IRS changes the
 * page structure the parser will return zero fields → `parseConfidence`
 * goes to 0 → the tool throws `BulletinParseError` → caller falls back.
 */
function parseIrsFederalBulletin(rawText: string): BulletinParseOutput {
  const parsedValues: Record<string, unknown> = {};
  const excerpts: Record<string, string> = {};

  // Federal corporate income-tax rate — flat 21% since TCJA. Pattern is
  // tolerant of whitespace and decimal forms ("21%", "21.0 percent").
  const corporateRateMatch = rawText.match(
    /(?:corporate(?:\s+income)?\s+tax\s+rate(?:[^.]*?)|federal\s+corporate(?:[^.]*?))(\d{1,2}(?:\.\d+)?)\s*(?:%|percent)/i,
  );
  if (corporateRateMatch) {
    const pct = Number(corporateRateMatch[1]);
    if (Number.isFinite(pct) && pct > 0 && pct < 100) {
      parsedValues.taxRate = pct / 100;
      excerpts.taxRate = corporateRateMatch[0].trim();
    }
  }

  // Long-term capital gains for C-corps — historically taxed at the same
  // 21% federal corporate rate. Only emit when a citation is found.
  const cgRateMatch = rawText.match(
    /(?:capital\s+gains(?:[^.]*?))(\d{1,2}(?:\.\d+)?)\s*(?:%|percent)/i,
  );
  if (cgRateMatch) {
    const pct = Number(cgRateMatch[1]);
    if (Number.isFinite(pct) && pct > 0 && pct < 100) {
      parsedValues.capitalGainsRate = pct / 100;
      excerpts.capitalGainsRate = cgRateMatch[0].trim();
    }
  }

  return { parsedValues, excerpts };
}

const BULLETIN_SOURCES: readonly BulletinSource[] = [
  {
    jurisdiction: { country: "United States", subdivision: null },
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/corporations",
    publisher: "U.S. Internal Revenue Service",
    expectedFields: ["taxRate", "capitalGainsRate"],
    parse: parseIrsFederalBulletin,
  },
];

/** Trust threshold for the deterministic path. parseConfidence below this
 *  triggers LLM fallback in the caller. Set conservatively — we'd rather
 *  fall back to LLM than ship a half-parsed bulletin as authoritative. */
export const MIN_PARSE_CONFIDENCE_FOR_TRUST = 0.5 as const;

/** Owning Specialist for telemetry. Kept here (not just in SPECIALIST_TOOLS)
 *  so callers don't need to import the registry to attribute a run. */
export const TAX_BULLETIN_DIFF_OWNER_SPECIALIST_ID = "constants.tax-research" as const;
export const TAX_BULLETIN_DIFF_TOOL_ID = "tax-bulletin-diff" as const;

/** Static assertion: the owner Specialist must exist in the catalog. */
const _ownerExists = (() => {
  if (!SPECIALIST_CATALOG.some((d) => d.id === TAX_BULLETIN_DIFF_OWNER_SPECIALIST_ID)) {
    throw new Error(
      `tax-bulletin-diff owner '${TAX_BULLETIN_DIFF_OWNER_SPECIALIST_ID}' is not in SPECIALIST_CATALOG`,
    );
  }
  return true;
})();
export const TAX_BULLETIN_DIFF_OWNER_VALID = _ownerExists;

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers — fully covered by tests; no I/O.
// ───────────────────────────────────────────────────────────────────────────

function jurisdictionLabel(j: JurisdictionKey): string {
  return j.subdivision ? `${j.subdivision}, ${j.country}` : j.country;
}

function jurisdictionEquals(a: JurisdictionKey, b: JurisdictionKey): boolean {
  return a.country === b.country && (a.subdivision ?? null) === (b.subdivision ?? null);
}

export function getBulletinSource(jurisdiction: JurisdictionKey): BulletinSource {
  const found = BULLETIN_SOURCES.find((s) => jurisdictionEquals(s.jurisdiction, jurisdiction));
  if (!found) throw new UnsupportedJurisdictionError(jurisdiction);
  return found;
}

export function isJurisdictionSupported(jurisdiction: JurisdictionKey): boolean {
  return BULLETIN_SOURCES.some((s) => jurisdictionEquals(s.jurisdiction, jurisdiction));
}

/** Normalize whitespace before hashing so trivial reformatting does not
 *  invalidate the cache. This mirrors what we do in vector indexing. */
function normalizeForHash(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function hashBulletin(rawText: string): string {
  return createHash("sha256").update(normalizeForHash(rawText)).digest("hex");
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
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

// ───────────────────────────────────────────────────────────────────────────
// Pure diff — no I/O. Tests exercise this directly.
// ───────────────────────────────────────────────────────────────────────────

export function diffBulletin(args: {
  jurisdiction: JurisdictionKey;
  fetched: BulletinFetchResult;
  parsed: BulletinParseOutput;
  expectedFields: readonly string[];
  cached: CachedBulletin | null;
}): BulletinDiffResult {
  const { jurisdiction, fetched, parsed, expectedFields, cached } = args;
  const bulletinHash = hashBulletin(fetched.rawText);

  const citations: BulletinCitation[] = [];
  const changedFields: BulletinDiffField[] = [];
  const unchangedFields: string[] = [];

  for (const fieldKey of Object.keys(parsed.parsedValues)) {
    const newValue = parsed.parsedValues[fieldKey];
    const previousValue = cached?.parsedValues[fieldKey] ?? null;
    const citationIndex = citations.length;
    citations.push({
      url: fetched.url,
      publisher: fetched.publisher,
      retrievedAt: fetched.retrievedAt,
      rawExcerpt: parsed.excerpts[fieldKey] ?? "",
    });
    if (cached && deepEqual(previousValue, newValue)) {
      unchangedFields.push(fieldKey);
    } else {
      changedFields.push({ fieldKey, previousValue, newValue, citationIndex });
    }
  }

  // parseConfidence — fraction of expected fields actually parsed.
  const parseConfidence = expectedFields.length === 0
    ? 0
    : Object.keys(parsed.parsedValues).length / expectedFields.length;

  // Build a single excerpt string by joining per-field excerpts. The caller
  // persists this so the *next* refresh has a citation even before parsing.
  const rawExcerpt = Object.values(parsed.excerpts).join("\n\n").slice(0, 4000);

  return {
    jurisdiction,
    fetchedAt: fetched.retrievedAt,
    bulletinHash,
    sourceUrl: fetched.url,
    publisher: fetched.publisher,
    changedFields,
    unchangedFields,
    citations,
    parseConfidence,
    parsedValues: parsed.parsedValues,
    rawExcerpt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Composed entry point. Tests inject `fetcher` to avoid live HTTP.
// ───────────────────────────────────────────────────────────────────────────

export type BulletinFetcher = (url: string) => Promise<{ status: number; text: string }>;

const defaultFetcher: BulletinFetcher = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "hospitality-portal/tax-bulletin-diff (admin tool)" },
  });
  return { status: res.status, text: await res.text() };
};

export async function runTaxBulletinDiff(args: {
  jurisdiction: JurisdictionKey;
  cached: CachedBulletin | null;
  fetcher?: BulletinFetcher;
  now?: () => Date;
}): Promise<BulletinDiffResult> {
  const source = getBulletinSource(args.jurisdiction);
  const fetcher = args.fetcher ?? defaultFetcher;
  const now = args.now ?? (() => new Date());

  let raw: { status: number; text: string };
  try {
    raw = await fetcher(source.url);
  } catch (err) {
    throw new BulletinFetchError(source.url, err);
  }
  if (raw.status < 200 || raw.status >= 300) {
    throw new BulletinFetchError(source.url, new Error(`HTTP ${raw.status}`));
  }
  if (!raw.text || raw.text.trim().length === 0) {
    throw new BulletinFetchError(source.url, new Error("empty response body"));
  }

  const fetched: BulletinFetchResult = {
    url: source.url,
    publisher: source.publisher,
    retrievedAt: now().toISOString(),
    rawText: raw.text,
  };

  const parsed = source.parse(fetched.rawText);
  if (Object.keys(parsed.parsedValues).length === 0) {
    throw new BulletinParseError(
      args.jurisdiction,
      "parser extracted zero recognized fields from non-empty bulletin payload",
    );
  }

  return diffBulletin({
    jurisdiction: args.jurisdiction,
    fetched,
    parsed,
    expectedFields: source.expectedFields,
    cached: args.cached,
  });
}
