/**
 * mgmt-co-overhead-prompt-input-builder.ts — pure input adapters for the
 * Overhead Surface Specialist's Tier-1 graduation (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-compensation-prompt-input-builder.ts — same pattern,
 * same constraints. No I/O, no LLM, no HTTP.
 *
 * Three exports:
 *
 *   1. `buildOverheadPromptInput(ctx)` — assembles the structured input
 *      pack consumed by the Opus prompt stage.
 *
 *   2. `mapOverheadToDimensionInputs(inputs)` — adapts `OverheadInputs`
 *      shape into `DimensionInput[]` (one per dimension key; all numeric).
 *
 *   3. `buildOverheadCacheKey(args)` — wraps `computeCacheKey` with
 *      Overhead-specific field-group taxonomy.
 *
 * Constraints (per ADR-007 §1 + .claude/rules/specialist-intelligence-bar.md):
 *   - Pure functions: no DB, no LLM, no HTTP.
 *   - Field keys MUST match `mgmt-co.overhead.candidateFields[].key` in
 *     `engine/analyst/registry/specialist-catalog.ts` verbatim.
 *   - Per `.claude/rules/field-definitions-no-prescription-hints.md`: evidence
 *     cues name reasoning sources, NEVER typical-range hints.
 */

import { createHash } from "node:crypto";
import {
  computeInputContextHash,
  type CompanyCacheInputs,
  type VerdictCacheKey,
} from "@engine/analyst/cognitive/cache-keys";
import type { DimensionInput } from "@engine/analyst/cognitive/verdict-reconstructor";
import type { OverheadInputs } from "@engine/watchdog/overheadEvaluator";
import type { CanonicalResearchField } from "../synthesis-schema";

// ────────────────────────────────────────────────────────────────────────────
// Overhead dimension taxonomy (6 keys, locked to specialist-catalog.ts entry N)

/**
 * The 6 Overhead dimension keys. Must match
 * `mgmt-co.overhead.candidateFields[].key` in `specialist-catalog.ts`
 * verbatim.
 */
export const OVERHEAD_DIMENSION_KEYS = [
  "officeLeaseStart",
  "professionalServicesStart",
  "techInfraStart",
  "businessInsuranceStart",
  "travelCostPerClient",
  "itLicensePerClient",
] as const;

export type OverheadDimensionKey = (typeof OVERHEAD_DIMENSION_KEYS)[number];

/**
 * Per-dimension descriptor consumed by the Opus prompt stage. `evidenceCues`
 * names reasoning sources — never a typical-range hint, per the
 * field-definitions-no-prescription-hints rule.
 */
export interface OverheadDimensionDescriptor {
  key: OverheadDimensionKey;
  label: string;
  /** Display unit hint for prompt rendering — "$" for all 6 dims (USD/yr). */
  unit: "$";
  /** Data sources + reasoning inputs Opus should consult. No numbers. */
  evidenceCues: readonly string[];
}

const OVERHEAD_DIMENSIONS: readonly OverheadDimensionDescriptor[] = [
  {
    key: "officeLeaseStart",
    label: "Annual office lease + utilities (USD)",
    unit: "$",
    evidenceCues: [
      "corporate-office rent + utilities for comparable boutique-luxury management companies in the operator's primary locale (AHLA Lodging Industry Survey, HFTP/AICPA practice benchmarks)",
      "remote-first vs. anchor-office posture LPs prefer at the operator's stage and how that constrains defensible office spend",
      "proximity to core portfolio properties and how meeting/coordination cadence justifies the lease envelope",
    ],
  },
  {
    key: "professionalServicesStart",
    label: "Annual legal + accounting + audit (USD)",
    unit: "$",
    evidenceCues: [
      "legal + audit retainer benchmarks for early-stage hospitality management companies (AICPA practice benchmarks, hospitality-specialised firm rate cards)",
      "audit-readiness expectations LPs price into the operator's stage — first-audit overruns are the classic under-budget trap",
      "specialised consulting needs implied by the operator's vertical, locale, and capital-stack complexity",
    ],
  },
  {
    key: "techInfraStart",
    label: "Annual corporate tech infrastructure (USD)",
    unit: "$",
    evidenceCues: [
      "corporate-level cloud + cybersecurity + IT-support spend for comparable hospitality operators (HFTP Technology Survey, hospitality SaaS benchmark cohorts)",
      "growing cybersecurity + privacy compliance load LPs scrutinise as the operator's portfolio expands",
      "explicit separation from per-property IT licensing — corporate tech is distinct from `itLicensePerClient` and should not double-count",
    ],
  },
  {
    key: "businessInsuranceStart",
    label: "Annual business insurance — D&O / E&O / cyber (USD)",
    unit: "$",
    evidenceCues: [
      "D&O / E&O / cyber liability premiums for comparable boutique-luxury management companies (hospitality insurance broker indices, AHLA risk-management benchmarks)",
      "personal-liability exposure LPs price into under-insured ManCo cap-tables — partners are personally exposed without adequate D&O",
      "policy-stack overlap with property-level coverage — corporate ManCo policy is distinct from per-property GL/property insurance",
    ],
  },
  {
    key: "travelCostPerClient",
    label: "Annual per-property travel cost (USD per property)",
    unit: "$",
    evidenceCues: [
      "site-visit + owner-meeting + brand-audit travel benchmarks per managed property (AHLA Lodging Industry Survey, third-party operator manuals)",
      "operating model implied by per-property travel — light travel signals remote-first or thin owner-relationship cadence; heavy travel signals high-touch concierge ops",
      "compounding effect at portfolio scale — per-property travel × active property count drives variable cost growth LPs scrutinise",
    ],
  },
  {
    key: "itLicensePerClient",
    label: "Annual per-property IT/licensing cost (USD per property)",
    unit: "$",
    evidenceCues: [
      "per-property PMS + revenue-management + channel-manager + accounting-integration licensing benchmarks (HFTP Technology Survey, hospitality SaaS pricing cohorts)",
      "tech-stack richness expected for boutique-luxury operations vs. midscale — under-spend usually signals a thin RM/channel posture",
      "explicit separation from corporate tech infrastructure — per-property IT is distinct from `techInfraStart` and should not double-count",
    ],
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Persona + portfolio context shapes

export interface OverheadPortfolioAggregate {
  /** Number of revenue-active properties in the portfolio at evaluation time. */
  propertyCount: number;
  /** Total annual ManCo revenue (USD) implied by the financial model. */
  totalManagementCoRevenueUsd: number;
  /** Modeled monthly burn (USD), used to ground overhead share. */
  monthlyBurnUsd: number;
}

export interface OverheadPersonaContext {
  /** Vertical slug (e.g. "wellness", "boutique-luxury", "lifestyle"). */
  verticalSlug: string;
  /** Market tier ("L+B", "lifestyle", "luxury", "midscale"). */
  marketTier: string;
  /** Primary operating locale (e.g. "US", "Brazil", "MX"). */
  locale: string;
}

export interface OverheadPriorVerdictRef {
  /** Specialist id that produced the prior verdict (composition reference). */
  specialistId: string;
  /** Cognitive run id — non-null for Tier-1 verdicts. */
  cognitiveRunId: string | null;
  /** Iso date of the prior verdict. */
  asOf: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-input pack

export interface OverheadPromptInputContext {
  inputs: OverheadInputs;
  portfolio: OverheadPortfolioAggregate;
  persona: OverheadPersonaContext;
  /** Composition references; empty in Phase 2's first run. */
  priorVerdicts?: readonly OverheadPriorVerdictRef[];
}

export interface OverheadPromptInput {
  specialistId: "mgmt-co.overhead";
  /** The 6 dimension descriptors the Opus prompt must address. */
  requiredFields: readonly OverheadDimensionDescriptor[];
  /** Aggregate portfolio numbers; engine-computed, never re-derived here. */
  portfolio: OverheadPortfolioAggregate;
  /** Persona triplet that drives prompt framing + cache personaHash. */
  persona: OverheadPersonaContext;
  /** User's currently-saved Overhead-tab values per dimension key. */
  currentValues: Readonly<Record<OverheadDimensionKey, number | null>>;
  /** Empty in Phase 2; populated when composing against another Specialist. */
  priorVerdicts: readonly OverheadPriorVerdictRef[];
  /** Specialist intent string consumed verbatim by the Opus stage. */
  intent: string;
}

const OVERHEAD_INTENT =
  "Overhead plan adequacy: are the management company's fixed lines (office lease, professional services, tech infrastructure, business insurance) and variable per-property lines (travel, IT licensing) defensible to LPs given the operator's vertical, locale, and portfolio scale? Evaluate each dimension against ManCo overhead comparables and persona expectations. Flag both under-budget gaps that signal operational fragility (under-insured, under-audit-readiness) and over-budget bloat that signals undisciplined retainer or redundant spend.";

/**
 * Assemble the structured input pack the Opus prompt stage consumes.
 * Pure: ctx is the only signal; no defaults reach into the database.
 */
export function buildOverheadPromptInput(
  ctx: OverheadPromptInputContext,
): OverheadPromptInput {
  const currentValues = Object.fromEntries(
    OVERHEAD_DIMENSION_KEYS.map((k) => [k, ctx.inputs[k] ?? null]),
  ) as Record<OverheadDimensionKey, number | null>;

  return {
    specialistId: "mgmt-co.overhead",
    requiredFields: OVERHEAD_DIMENSIONS,
    portfolio: ctx.portfolio,
    persona: ctx.persona,
    currentValues,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: OVERHEAD_INTENT,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// OverheadInputs → DimensionInput[]

/**
 * Adapt `OverheadInputs` into `DimensionInput[]` for `consultCognitive`.
 * One DimensionInput per known Overhead dimension key.
 */
export function mapOverheadToDimensionInputs(
  inputs: OverheadInputs,
): DimensionInput[] {
  return OVERHEAD_DIMENSIONS.map((dim) => ({
    field: dim.key,
    userValue: inputs[dim.key] ?? null,
    isNumericField: true,
    unit: dim.unit,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Cache key

export interface OverheadCacheKeyArgs {
  specialistId: "mgmt-co.overhead";
  fieldGroup?: readonly OverheadDimensionKey[];
  persona: OverheadPersonaContext;
  companyInputs: CompanyCacheInputs;
  scenarioId: number | null;
  entityId: number;
  engineVersion: string;
}

/**
 * Build the structured `VerdictCacheKey` for an Overhead-tab evaluation.
 * Mirrors `buildCompensationCacheKey` — same cast rationale (Overhead keys
 * are not in CanonicalResearchField; widening cache-keys.ts is its own
 * packet).
 */
export function buildOverheadCacheKey(args: OverheadCacheKeyArgs): VerdictCacheKey {
  const fieldGroup = args.fieldGroup ?? OVERHEAD_DIMENSION_KEYS;
  const fieldGroupAsCanonical = fieldGroup as readonly string[] as CanonicalResearchField[];

  const personaHash = sha256OfPersona(args.persona);
  const inputContextHash = computeInputContextHash(
    "company",
    args.companyInputs,
    fieldGroupAsCanonical,
  );

  return {
    scenarioId: args.scenarioId,
    entityType: "company",
    entityId: args.entityId,
    fieldGroup: fieldGroupAsCanonical,
    personaHash,
    inputContextHash,
    engineVersion: args.engineVersion,
  };
}

function sha256OfPersona(persona: OverheadPersonaContext): string {
  const canonical = `${persona.verticalSlug}|${persona.marketTier}|${persona.locale}`;
  return createHash("sha256").update(canonical).digest("hex");
}

export { computeCacheKey } from "@engine/analyst/cognitive/cache-keys";
