/**
 * mgmt-co-company-prompt-input-builder.ts — pure input adapters for the
 * Company Surface Specialist's Tier-1 graduation (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-overhead-prompt-input-builder.ts — same pattern, same
 * constraints. No I/O, no LLM, no HTTP.
 *
 * Four dimensions: all percentage-rate fields from the Company tab (Admin →
 * Model Defaults → Company). Values stored as fractions (e.g. 0.08 = 8%).
 */

import { createHash } from "node:crypto";
import {
  computeInputContextHash,
  type CompanyCacheInputs,
  type VerdictCacheKey,
} from "@engine/analyst/cognitive/cache-keys";
import type { DimensionInput } from "@engine/analyst/cognitive/verdict-reconstructor";
import type { CompanyInputs } from "@engine/watchdog/companyEvaluator";
import type { CanonicalResearchField } from "../synthesis-schema";

// ────────────────────────────────────────────────────────────────────────────
// Company dimension taxonomy (4 keys, locked to specialist-catalog.ts entry O)

export const COMPANY_DIMENSION_KEYS = [
  "baseManagementFee",
  "incentiveManagementFee",
  "companyTaxRate",
  "costOfEquity",
] as const;

export type CompanyDimensionKey = (typeof COMPANY_DIMENSION_KEYS)[number];

export interface CompanyDimensionDescriptor {
  key: CompanyDimensionKey;
  label: string;
  /** Display unit for prompt rendering — "%" for all 4 dims. */
  unit: "%";
  /** Data sources + reasoning inputs to consult. No numeric hints. */
  evidenceCues: readonly string[];
}

const COMPANY_DIMENSIONS: readonly CompanyDimensionDescriptor[] = [
  {
    key: "baseManagementFee",
    label: "Base management fee (% of total property revenue)",
    unit: "%",
    evidenceCues: [
      "base management fee benchmarks for boutique-luxury hospitality management companies relative to total property revenue (CBRE Hotel Management Fee Study, HVS Management Contract Study, AHLA Lodging Industry Survey)",
      "LP scrutiny of base fee relative to branded-operator alternatives — premium over branded requires a matching value proposition",
      "fee structure adequacy for covering corporate overhead at projected portfolio revenue without eroding property NOI below LP hurdle",
    ],
  },
  {
    key: "incentiveManagementFee",
    label: "Incentive management fee (% of Gross Operating Profit)",
    unit: "%",
    evidenceCues: [
      "incentive management fee benchmarks as a share of Gross Operating Profit for boutique-luxury operators (HVS Management Contract Study, CBRE Performance Fee Survey)",
      "operator-alignment signal: a low GOP kicker tells LPs the operator is not backing their own performance projections; a high kicker may exceed LP equity net of promote in good years",
      "contract-term context — brand-standard vs. independent boutique-luxury fee structures and how the kicker compares across operator classes",
    ],
  },
  {
    key: "companyTaxRate",
    label: "Effective company tax rate (combined federal + state)",
    unit: "%",
    evidenceCues: [
      "effective combined corporate income tax rate benchmarks for US-domiciled hospitality management companies (IRS Statistics of Income, KPMG hospitality sector tax survey, Big 4 effective-rate benchmarks)",
      "structure + domicile factors that allow a sub-federal blended rate — verify legal justification before LP data room review",
      "over-accruing tax understates distributable cash; under-accruing creates LP surprise distributions at tax time",
    ],
  },
  {
    key: "costOfEquity",
    label: "Cost of equity / WACC Re (DCF hurdle rate)",
    unit: "%",
    evidenceCues: [
      "build-up approach: (a) anchor to the current USD 10-year Treasury yield from FRED (series treasury_10y, live market rate); (b) add the Damodaran boutique hospitality sector equity risk premium (erp_boutique_hospitality from market rates, ~12%); (c) add the private-market illiquidity premium of 3–5% for boutique hospitality (Duff & Phelps Cost of Capital Navigator 2024); (d) for non-US USD-denominated properties, add the Damodaran country risk premium from the crp_* market rate rows — this yields the full private Re build-up",
      "US primary/secondary markets: HIGH conviction achievable when FRED treasury_10y is live; expected Re range 18–28% depending on market tier and operator maturity (LOW = US prime market seasoned operator ~18%; MID = US secondary or LatAm primary ~22%; HIGH = EM/tertiary or early-stage ~28%)",
      "international USD-denominated deals: MODERATE conviction — cite the applicable crp_* row from market rates and add it on top of the US build-up; flag if Damodaran CRP is unavailable for the target country",
      "LP underwriting impact: a low Re inflates the DCF and WACC NAV; institutional LPs re-underwrite with their own hurdle — projected returns will look weaker if Re is below market",
      "consistency between declared cost of equity and IRR target in the business plan — a high Re is conservative but must be defensible against the modeled return profile",
    ],
  },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Persona + portfolio context shapes

export interface CompanyPortfolioAggregate {
  propertyCount: number;
  /** Total annual ManCo revenue (USD) implied by the financial model. */
  totalManagementCoRevenueUsd: number;
  /** Modeled monthly burn (USD). */
  monthlyBurnUsd: number;
}

export interface CompanyPersonaContext {
  verticalSlug: string;
  marketTier: string;
  locale: string;
}

export interface CompanyPriorVerdictRef {
  specialistId: string;
  cognitiveRunId: string | null;
  asOf: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt-input pack

export interface CompanyPromptInputContext {
  inputs: CompanyInputs;
  portfolio: CompanyPortfolioAggregate;
  persona: CompanyPersonaContext;
  priorVerdicts?: readonly CompanyPriorVerdictRef[];
}

export interface CompanyPromptInput {
  specialistId: "mgmt-co.company";
  requiredFields: readonly CompanyDimensionDescriptor[];
  portfolio: CompanyPortfolioAggregate;
  persona: CompanyPersonaContext;
  currentValues: Readonly<Record<CompanyDimensionKey, number | null>>;
  priorVerdicts: readonly CompanyPriorVerdictRef[];
  intent: string;
}

const COMPANY_INTENT =
  "Company fee structure and financial defaults adequacy: are the management company's base management fee, incentive fee structure, effective tax rate, and cost-of-equity / WACC hurdle defensible to LPs given the operator's vertical, locale, and stage? Evaluate each dimension against boutique-luxury ManCo financial benchmarks. Flag LP scrutiny triggers: a low Re inflates the DCF; a high base fee needs a branded-operator value proposition; an under-accrued tax rate surfaces in audit; a low incentive fee signals operator skepticism of their own projections.";

export function buildCompanyPromptInput(ctx: CompanyPromptInputContext): CompanyPromptInput {
  const currentValues = Object.fromEntries(
    COMPANY_DIMENSION_KEYS.map((k) => [k, ctx.inputs[k] ?? null]),
  ) as Record<CompanyDimensionKey, number | null>;

  return {
    specialistId: "mgmt-co.company",
    requiredFields: COMPANY_DIMENSIONS,
    portfolio: ctx.portfolio,
    persona: ctx.persona,
    currentValues,
    priorVerdicts: ctx.priorVerdicts ?? [],
    intent: COMPANY_INTENT,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CompanyInputs → DimensionInput[]

export function mapCompanyToDimensionInputs(inputs: CompanyInputs): DimensionInput[] {
  return COMPANY_DIMENSIONS.map((dim) => ({
    field: dim.key,
    userValue: inputs[dim.key] ?? null,
    isNumericField: true,
    unit: dim.unit,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Cache key

export interface CompanyCacheKeyArgs {
  specialistId: "mgmt-co.company";
  fieldGroup?: readonly CompanyDimensionKey[];
  persona: CompanyPersonaContext;
  companyInputs: CompanyCacheInputs;
  scenarioId: number | null;
  entityId: number;
  engineVersion: string;
}

export function buildCompanyCacheKey(args: CompanyCacheKeyArgs): VerdictCacheKey {
  const fieldGroup = args.fieldGroup ?? COMPANY_DIMENSION_KEYS;
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

function sha256OfPersona(persona: CompanyPersonaContext): string {
  const canonical = `${persona.verticalSlug}|${persona.marketTier}|${persona.locale}`;
  return createHash("sha256").update(canonical).digest("hex");
}

export { computeCacheKey } from "@engine/analyst/cognitive/cache-keys";
