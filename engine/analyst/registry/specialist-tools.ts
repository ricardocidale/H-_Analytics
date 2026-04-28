/**
 * Specialist Tool registry — METADATA ONLY.
 *
 * Doctrine: replit.md "Wiring authority — code-only with break-glass" block
 *           and Phase 2b ("Tool inspectability & Letícia's home").
 *
 * What this is:
 *   A static, inspectable manifest of every deterministic capability the
 *   12 Specialists rely on (regulatory tables, FRED reader, vector store,
 *   finance compute, Replicate render pipeline, OpenAI image fallback).
 *   Each entry attributes the tool to an owning Specialist (defaulting to
 *   Letícia, the Resource Builder) and declares which other Specialists
 *   call it via static-import inspection.
 *
 * What this is NOT:
 *   A runtime dispatcher. Specialists keep calling deterministic functions
 *   directly — there is no router, no tool-resolution layer, no hidden
 *   indirection. Adding an entry here does not make a tool callable; it
 *   just makes it visible on the Resources surface and inspectable in the
 *   admin API.
 *
 * Editing this file:
 *   - Add an entry when you introduce a new deterministic capability that
 *     is shared across Specialists OR whose freshness/provenance matters
 *     for audit.
 *   - `calledBy` is populated by static inspection of imports. Keep it
 *     accurate when you wire a new Specialist to an existing tool.
 *   - `lastBuiltSource` declares where the storage layer should look up
 *     the tool's freshness timestamp. Adding a new `kind` requires also
 *     teaching `IntelligenceV2Storage.getSpecialistToolLastBuilt` how to
 *     resolve it — that method loud-fails on unknown sources so drift is
 *     surfaced at boot.
 */

/**
 * What backs `lastBuiltAt` for a given tool.
 *
 * Discriminated union so the storage hook can dispatch without string
 * pattern-matching, and so the registry rejects ill-formed entries at
 * type-check time.
 */
export type ToolLastBuiltSource =
  /** Hardcoded ISO date pulled out of the tool's source file (e.g. the
   *  `lastUpdated` field on each regulatory profile). The newest date
   *  across the file becomes the tool's `lastBuiltAt`. */
  | { readonly kind: "static"; readonly isoDate: string }
  /** A Postgres table whose newest row timestamp is the tool's
   *  `lastBuiltAt`. The storage hook knows which column to read per
   *  table (e.g. `vector_chunks.updated_at`,
   *  `market_adr_index.fetched_at`, `benchmark_snapshots.fetched_at`). */
  | { readonly kind: "table"; readonly table: "vector_chunks" | "market_adr_index" | "benchmark_snapshots" | "tax_bulletin_cache" }
  /** Newest `research_runs` row whose `metadata.specialistId` matches.
   *  Used for tools whose only durable artefact is the research-run
   *  audit trail (Replicate pipeline, OpenAI image fallback). */
  | { readonly kind: "research-runs-specialist"; readonly specialistId: string }
  /** The tool is pure code (no persisted output). `lastBuiltAt` resolves
   *  to the server process start time so admins can still see "this code
   *  has been live since X" without a misleading null. */
  | { readonly kind: "build-time" };

export type ToolKind = "deterministic" | "llm" | "hybrid";

export interface SpecialistTool {
  /** Stable kebab-case identifier. Survives renames of the underlying file. */
  readonly id: string;
  /** Human-readable name rendered on the Resources strip. */
  readonly displayName: string;
  /** 1-line description of what the tool does. */
  readonly description: string;
  /** Tool category. `deterministic` = pure code; `llm` = model call;
   *  `hybrid` = code wrapping an LLM/external API call. */
  readonly kind: ToolKind;
  /** Specialist id that owns the tool (i.e. is responsible for keeping
   *  it sharp). Defaults to `resources.builder` (Letícia). */
  readonly ownerSpecialistId: string;
  /** Specialist ids that call this tool. Populated by static inspection
   *  of imports — keep this in sync when wiring a new Specialist. */
  readonly calledBy: readonly string[];
  /** Source file relative to the repo root. The registry test asserts
   *  this resolves to a real file. */
  readonly sourceFile: string;
  /** Citation / authoritative source, where applicable. */
  readonly citation?: string;
  /** Freshness source — see `ToolLastBuiltSource` above. */
  readonly lastBuiltSource: ToolLastBuiltSource;
  /** Optional admin-Resource slugs this tool surfaces under. The
   *  Resources tab uses these to render the per-row inspectability
   *  strip beneath any matching `admin_resources` row. A single tool
   *  may back multiple Resource rows (e.g. one ingest pipeline that
   *  feeds both the funding and revenue benchmark resources), and a
   *  single Resource row may be backed by multiple tools (e.g. the
   *  primary render API and its image-fallback both surface beneath
   *  `image-enhancement-api`). Tools without any Resource slug still
   *  appear in the admin registry endpoint but don't decorate any row. */
  readonly resourceSlugs?: readonly string[];
}

/**
 * Newest `lastUpdated` ISO date across the regulatory profiles modules.
 * Hardcoded mirror of the data the seed loads from
 * `shared/regulatory/profiles-{na,europe,latam}.ts`. Bump this when the
 * profiles are refreshed so the Resources strip stops reading stale.
 */
const REGULATORY_PROFILES_LAST_UPDATED = "2026-04-13" as const;

export const LETICIA_SPECIALIST_ID = "resources.builder" as const;

export const SPECIALIST_TOOLS: readonly SpecialistTool[] = [
  {
    id: "regulatory-profiles",
    displayName: "Regulatory Profiles",
    description:
      "Static lookup of country-level licensing, zoning, building-code, foreign-investment, and labor rules used to anchor risk and tax research.",
    kind: "deterministic",
    ownerSpecialistId: LETICIA_SPECIALIST_ID,
    calledBy: ["constants.tax-research", "property.risk-intelligence"],
    sourceFile: "shared/regulatory/profiles-na.ts",
    citation: "IRS, NFPA, IBC, USMCA, Investment Canada Act (per-country sources cited inline)",
    lastBuiltSource: { kind: "static", isoDate: REGULATORY_PROFILES_LAST_UPDATED },
  },
  {
    id: "fred-reader",
    displayName: "FRED Reader",
    description:
      "Federal Reserve Economic Data series fetcher (10-yr Treasury, CPI, etc.). Drives macro-indicator constants and discount-rate refreshes.",
    kind: "hybrid",
    ownerSpecialistId: LETICIA_SPECIALIST_ID,
    calledBy: ["constants.macro-research"],
    sourceFile: "server/services/FREDService.ts",
    citation: "https://fred.stlouisfed.org/docs/api/fred/",
    lastBuiltSource: { kind: "table", table: "market_adr_index" },
  },
  {
    id: "vector-store-snapshots",
    displayName: "Vector Store Snapshots",
    description:
      "pgvector-backed semantic store for benchmark snapshots, prior research, and property URL chunks. Powers retrieval-augmented synthesis.",
    kind: "deterministic",
    ownerSpecialistId: LETICIA_SPECIALIST_ID,
    calledBy: [
      "mgmt-co.funding",
      "mgmt-co.revenue",
      "property.risk-intelligence",
      "property.executive-summary",
    ],
    sourceFile: "server/ai/vector-store-service.ts",
    lastBuiltSource: { kind: "table", table: "vector_chunks" },
  },
  {
    id: "benchmark-snapshots",
    displayName: "Hospitality Benchmarks",
    description:
      "Curated ADR / RevPAR / occupancy / cap-rate snapshots ingested per market. Anchors numeric synthesis when API live-data is sparse.",
    kind: "deterministic",
    ownerSpecialistId: LETICIA_SPECIALIST_ID,
    calledBy: ["mgmt-co.funding", "mgmt-co.revenue", "property.executive-summary"],
    sourceFile: "server/storage/intelligence-v2.ts",
    lastBuiltSource: { kind: "table", table: "benchmark_snapshots" },
    // The same snapshots table feeds both the funding and the revenue
    // benchmark Resource rows — surface this tool beneath each.
    resourceSlugs: ["funding-benchmarks", "revenue-benchmarks"],
  },
  {
    id: "finance-compute",
    displayName: "Deterministic Finance Compute",
    description:
      "Pure-code property financials engine — every scenario number flows through here so the model is reproducible from inputs alone.",
    kind: "deterministic",
    ownerSpecialistId: LETICIA_SPECIALIST_ID,
    calledBy: [
      "mgmt-co.funding",
      "mgmt-co.revenue",
      "property.executive-summary",
      "portfolio-ops.watchdog",
    ],
    sourceFile: "engine/property/property-engine.ts",
    lastBuiltSource: { kind: "build-time" },
  },
  {
    id: "replicate-render-pipeline",
    displayName: "Replicate Render Pipeline",
    description:
      "Style-driven image generation via Replicate models (avatars, exterior renders). Owned by Fernanda since prompt config and rate limits live with the photo-enhancer.",
    kind: "hybrid",
    ownerSpecialistId: "photos.photo-enhancer",
    calledBy: ["photos.photo-enhancer"],
    sourceFile: "server/integrations/replicate.ts",
    lastBuiltSource: {
      kind: "research-runs-specialist",
      specialistId: "photos.photo-enhancer",
    },
    resourceSlugs: ["image-enhancement-api"],
  },
  {
    id: "tax-bulletin-diff",
    displayName: "Tax Bulletin Diff",
    description:
      "Deterministic-first proof tool: fetches a tax-authority publication, parses governed constants out of it, and diffs them against the cached payload. Helena consults this before falling back to LLM-driven research.",
    kind: "deterministic",
    ownerSpecialistId: "constants.tax-research",
    calledBy: ["constants.tax-research"],
    sourceFile: "server/ai/tools/tax-bulletin-diff.ts",
    citation: "U.S. IRS (per-jurisdiction sources cited in tool source)",
    lastBuiltSource: { kind: "table", table: "tax_bulletin_cache" },
  },
  {
    id: "reference-range-lookup",
    displayName: "Reference Ranges",
    description:
      "Admin-curated low / mid / high reference ranges (tax, macro, hospitality KPIs, construction, financing, labor, risk, demand). Phase 1 surfaces the corpus read-only; Phase 3 will expose a best-match resolver to Specialists.",
    kind: "deterministic",
    ownerSpecialistId: LETICIA_SPECIALIST_ID,
    // Empty until Phase 3 wires the `lookupReferenceRange` tool into the
    // research Specialists. Keeping this array empty (rather than
    // listing speculative callers) preserves the static-import accuracy
    // guarantee documented at the top of this file.
    calledBy: [],
    sourceFile: "server/storage/reference-range.ts",
    lastBuiltSource: { kind: "build-time" },
  },
  {
    id: "openai-image-fallback",
    displayName: "OpenAI Image Fallback",
    description:
      "gpt-image-1 fallback when Gemini image generation fails. Same Specialist owner as the Replicate pipeline so render policy stays unified.",
    kind: "hybrid",
    ownerSpecialistId: "photos.photo-enhancer",
    calledBy: ["photos.photo-enhancer"],
    sourceFile: "server/image/client.ts",
    lastBuiltSource: {
      kind: "research-runs-specialist",
      specialistId: "photos.photo-enhancer",
    },
    // Same Resource row as the Replicate primary — admins viewing
    // `image-enhancement-api` should see both backings inline.
    resourceSlugs: ["image-enhancement-api"],
  },
] as const;

// Boot-time catalog reference used by the IIFE below. Imported here (not
// lazily) because specialist-catalog.ts does not import specialist-tools —
// no cycle risk — and ESM has no `require` at runtime.
import { SPECIALIST_CATALOG } from "./specialist-catalog";

const validation = (() => {
  const catalogIds = new Set(SPECIALIST_CATALOG.map((s) => s.id));
  const ids = new Set<string>();
  for (const tool of SPECIALIST_TOOLS) {
    if (ids.has(tool.id)) {
      throw new Error(`SPECIALIST_TOOLS: duplicate tool id "${tool.id}"`);
    }
    ids.add(tool.id);
    // Boot-time referential integrity: every ownerSpecialistId AND every
    // calledBy entry must resolve to a real Specialist in the catalog.
    // Without this, a typo or a stale entry ships fine — the first
    // admin-UI fetch falls back to the raw ID string as humanName. Fail
    // loud at boot instead of silently at first-user-click.
    if (!catalogIds.has(tool.ownerSpecialistId)) {
      throw new Error(
        `SPECIALIST_TOOLS: tool "${tool.id}" has unknown ownerSpecialistId "${tool.ownerSpecialistId}"`,
      );
    }
    for (const caller of tool.calledBy) {
      if (!catalogIds.has(caller)) {
        throw new Error(
          `SPECIALIST_TOOLS: tool "${tool.id}" has unknown calledBy entry "${caller}"`,
        );
      }
    }
  }
  return true;
})();

export const SPECIALIST_TOOLS_VALID = validation;

export function getSpecialistTool(id: string): SpecialistTool | undefined {
  return SPECIALIST_TOOLS.find((t) => t.id === id);
}

export function getToolsByOwner(specialistId: string): SpecialistTool[] {
  return SPECIALIST_TOOLS.filter((t) => t.ownerSpecialistId === specialistId);
}

export function getToolsByResourceSlug(slug: string): SpecialistTool[] {
  return SPECIALIST_TOOLS.filter((t) => t.resourceSlugs?.includes(slug) ?? false);
}
