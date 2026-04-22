/**
 * Specialist catalog — single source of truth for the 7 user-facing
 * Specialists in the AI Research IA.
 *
 * Doctrine: replit.md "Initial Specialist set (7 total, locked 2026-04-21)"
 *           and "Wiring authority — code-only with break-glass" blocks.
 *
 * Editing this file:
 *   - Adding a Specialist appends a new entry at the next free letter.
 *     Letters are stable identifiers; do NOT reshuffle when inserting.
 *   - Capabilities determine which page tabs render. Don't declare a
 *     capability the Specialist doesn't actually use — the tab will
 *     render empty.
 *   - assignmentRefs declare which canonical Resources (Resources sidebar
 *     section, P2) the Specialist is wired to. Refs use stable slug IDs;
 *     the catalog-sync job (P2) materializes them into the
 *     specialist_assignments DB table.
 *   - Any change here requires PR + deploy. The break-glass override
 *     surface (P2) is the only runtime alternative and is reserved for
 *     incident reroute.
 *
 * P1 scope: declaration only. The materialization job, the Resources
 * canonical tables, and the read-only Specialist page surfaces land
 * in P2–P5.
 */

import {
  type SpecialistDefinition,
  SpecialistDefinitionSchema,
} from "@shared/schema/specialist";

export const SPECIALIST_CATALOG: readonly SpecialistDefinition[] = [
  {
    id: "mgmt-co.funding",
    letter: "A",
    realName: "Funding",
    displayName: "Funding Intelligence",
    description:
      "Tracks the management company's capital stack, runway, and refinancing posture so investors and operators can see funding risk before it hits the model.",
    subject: "mgmt-co",
    capabilities: [
      "required-fields",
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "tier-1-cognitive", required: true },
      { kind: "benchmark", slug: "funding-benchmarks", required: true },
    ],
    status: "built",
  },
  {
    id: "mgmt-co.revenue",
    letter: "B",
    realName: "Revenue",
    displayName: "Revenue Intelligence",
    description:
      "Builds the revenue picture for the management company — fees, recurring contracts, and growth signals — so the simulation runs against a realistic top line, not a guess.",
    subject: "mgmt-co",
    capabilities: [
      "required-fields",
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "tier-1-cognitive", required: true },
      { kind: "benchmark", slug: "revenue-benchmarks", required: true },
    ],
    status: "built",
  },
  {
    id: "mgmt-co.icp-intelligence",
    letter: "C",
    realName: "ICP Intelligence",
    displayName: "ICP Intelligence",
    description:
      "Sharpens the management company's ideal customer profile from real signals — who actually buys, why, and who looks like them next — so targeting and outreach stop being guesswork.",
    subject: "mgmt-co",
    capabilities: [
      "required-fields",
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
      { kind: "api", slug: "web-search", required: true },
    ],
    status: "needs-page",
  },
  {
    id: "property.risk-intelligence",
    letter: "D",
    realName: "Risk Intelligence",
    displayName: "Property Risk Intelligence",
    description:
      "Surfaces the things that could derail a property — flood, brand, regulatory, market — early enough to price them in or walk away.",
    subject: "property",
    capabilities: [
      "required-fields",
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
      { kind: "api", slug: "web-search", required: true },
    ],
    status: "needs-page",
  },
  {
    id: "property.executive-summary",
    letter: "E",
    realName: "Executive Summary",
    displayName: "Executive Summary",
    description:
      "Turns the underwriting model into a crisp one-page narrative — what this property is, why it works, and what could break it — ready to share with investors and partners.",
    subject: "property",
    capabilities: [
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
    ],
    status: "needs-page",
  },
  {
    id: "photos.photo-enhancer",
    letter: "F",
    realName: "Photo Enhancer",
    displayName: "Photo Enhancer",
    description:
      "Cleans, brightens, and standardizes property photos so every listing looks consistently professional — no more dim phone shots dragging down a portfolio's first impression.",
    subject: "photos",
    capabilities: [
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "api", slug: "image-enhancement-api", required: true },
      { kind: "model", slug: "vision-llm", role: "image-analysis", required: true },
    ],
    status: "needs-page",
  },
  {
    id: "portfolio-ops.watchdog",
    letter: "G",
    realName: "Watchdog",
    displayName: "Portfolio Watchdog",
    description:
      "Watches every property in the portfolio against custom thresholds — occupancy, ADR, DSCR, covenant tripwires — and pings the team the moment something drifts out of bounds.",
    subject: "portfolio-ops",
    capabilities: [
      "required-fields",
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "table", slug: "watchdog-thresholds", required: true },
    ],
    status: "needs-page",
  },
  // ──────────────────────────────────────────────────────────────────────────
  // Constants & Authority Sources (letters H–K) — own the governed Model
  // Constants registry. Per the locked principle: Constants are authority-
  // sourced (IRS, central banks, IMF, GAAP/USALI, statutes) and ONLY these
  // Specialists may write `model_constant_overrides` rows with
  // `source = 'analyst'`. Admins cannot type values; the Constants tab exposes
  // a per-row "Refresh research" button that triggers the owning Specialist.
  //
  // Coverage invariant (enforced below): every key in
  // `MODEL_CONSTANTS_REGISTRY` MUST appear in exactly one Specialist's
  // `constantsOwned[]`. Adding a new registry key requires also assigning it
  // to the appropriate Specialist here in the same PR.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "constants.tax-research",
    letter: "H",
    realName: "Tax Authority Research",
    displayName: "Tax Authority Research",
    description:
      "Tracks national and sub-national tax authorities (IRS, country tax codes) and keeps income, capital gains, and property-tax constants aligned with current statute — so the model never silently drifts behind a tax change.",
    subject: "constants",
    capabilities: [
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
      { kind: "api", slug: "web-search", required: true },
    ],
    constantsOwned: ["taxRate", "capitalGainsRate", "costRateTaxes"],
    status: "needs-page",
  },
  {
    id: "constants.macro-research",
    letter: "I",
    realName: "Macro Indicators Research",
    displayName: "Macro Indicators Research",
    description:
      "Maintains macro inputs sourced from central banks and the IMF — country inflation outlook and country risk premium — so discounting and escalation reflect the latest published outlook, not a stale snapshot.",
    subject: "constants",
    capabilities: [
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
      { kind: "api", slug: "web-search", required: true },
    ],
    constantsOwned: ["countryRiskPremium", "inflationRate"],
    status: "needs-page",
  },
  {
    id: "constants.depreciation-research",
    letter: "J",
    realName: "Depreciation Schedule Research",
    displayName: "Depreciation Schedule Research",
    description:
      "Tracks depreciation useful-life rules per country (IRS Pub. 946, CRA CCA, French CGI, etc.) and keeps the building straight-line schedule aligned with the cited statute for each locality.",
    subject: "constants",
    capabilities: [
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
      { kind: "api", slug: "web-search", required: true },
    ],
    constantsOwned: ["depreciationYears"],
    status: "needs-page",
  },
  {
    id: "constants.reporting-research",
    letter: "K",
    realName: "Reporting Conventions Research",
    displayName: "Reporting Conventions Research",
    description:
      "Owns universal reporting conventions (USALI 11th Ed., AHLA, industry-standard period definitions). Keeps universal constants like days-per-month aligned with how the industry actually reports — not a one-off shortcut.",
    subject: "constants",
    capabilities: [
      "llm-config",
      "resource-assignments",
      "runtime",
      "audit",
    ],
    assignmentRefs: [
      { kind: "model", slug: "primary-llm", role: "synthesis", required: true },
      { kind: "api", slug: "web-search", required: true },
    ],
    constantsOwned: ["daysPerMonth"],
    status: "needs-page",
  },
] as const;

const validation = (() => {
  for (const def of SPECIALIST_CATALOG) {
    const parsed = SpecialistDefinitionSchema.safeParse(def);
    if (!parsed.success) {
      throw new Error(
        `SPECIALIST_CATALOG entry ${def.id ?? "(unknown)"} failed validation:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`,
      );
    }
  }
  const ids = new Set<string>();
  const letters = new Set<string>();
  for (const def of SPECIALIST_CATALOG) {
    if (ids.has(def.id)) {
      throw new Error(`SPECIALIST_CATALOG: duplicate Specialist id "${def.id}"`);
    }
    ids.add(def.id);
    if (letters.has(def.letter)) {
      throw new Error(`SPECIALIST_CATALOG: duplicate letter "${def.letter}" (id=${def.id})`);
    }
    letters.add(def.letter);
  }
  // Constants ownership uniqueness — every key claimed by `constantsOwned[]`
  // must be claimed by exactly one Specialist across the whole catalog.
  // Prevents two Specialists from racing to write the same model_constant
  // override row, which would silently corrupt provenance.
  const claimedConstants = new Map<string, string>();
  for (const def of SPECIALIST_CATALOG) {
    const owned = def.constantsOwned ?? [];
    for (const key of owned) {
      const existing = claimedConstants.get(key);
      if (existing) {
        throw new Error(
          `SPECIALIST_CATALOG: constant "${key}" is claimed by both "${existing}" and "${def.id}". Each constant has exactly one owning Specialist.`,
        );
      }
      claimedConstants.set(key, def.id);
    }
  }
  return true;
})();

export function getSpecialistById(id: string): SpecialistDefinition | undefined {
  return SPECIALIST_CATALOG.find((d) => d.id === id);
}

export function getSpecialistsBySubject(
  subject: SpecialistDefinition["subject"],
): SpecialistDefinition[] {
  return SPECIALIST_CATALOG.filter((d) => d.subject === subject).sort((a, b) =>
    a.realName.localeCompare(b.realName),
  );
}

/**
 * Resolve the AI Intelligence Specialist that owns a given Model Constants
 * registry key. Returns `undefined` when no Specialist claims the key — the
 * coverage test in `tests/registry/constants-specialist-coverage.test.ts`
 * asserts every registered key has an owner, so a `undefined` here at runtime
 * indicates a registry/catalog drift that should fail loudly at the call site.
 */
export function getSpecialistForConstant(
  constantKey: string,
): SpecialistDefinition | undefined {
  return SPECIALIST_CATALOG.find((d) =>
    (d.constantsOwned ?? []).includes(constantKey),
  );
}

export const SPECIALIST_CATALOG_VALID = validation;
