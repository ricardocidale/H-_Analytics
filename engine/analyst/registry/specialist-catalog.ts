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
  // Tier-1 graduate (G1, 2026-04-26) — see ADR-007 + tests/analyst/golden/mgmt-co-funding.test.ts
  {
    id: "mgmt-co.funding",
    letter: "A",
    realName: "Funding",
    displayName: "Funding Intelligence",
    humanName: "Ana",
    gender: "female",
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
      // G1 Tier-1 graduation: live LP-comp dataset for comparables fetch.
      // Optional so the Specialist falls back to benchmark-only when the
      // resource is unmapped (red/amber health). G1 v1 fetcher returns
      // canned data per ADR-007 §6 ("wiring matters; data quality follows");
      // live PitchBook/PrivateEquityInfo integration follows in a separate
      // packet.
      { kind: "api", slug: "lp-comp-dataset", required: false, role: "comparables" },
    ],
    // candidateFields[].key is the dispatch/payload key the required-fields
    // gate evaluates against (matches `CapitalRaiseInputs` keys verbatim —
    // see required-field-keys.ts and FUNDING_DIMENSION_KEYS in
    // mgmt-co-funding-prompt-input-builder.ts). For the three dimensions
    // whose verdict.field deep-links to a different form input than the
    // dispatch key (capital-raise dollar amounts / dates derive the
    // dimension), `verdictField` carries the form-anchor id so the
    // candidate-field parity test
    // (`tests/analyst/voice/field-registry-parity.test.ts`) can confirm
    // every Specialist-emitted verdict field is admin-promotable to
    // required from this catalog row.
    candidateFields: [
      { key: "runwayBufferMonths",     label: "Runway buffer (months)",      surface: "company-assumptions", verdictField: "capitalRaise1Amount" },
      { key: "sizingOvershootPct",     label: "Sizing overshoot %",          surface: "company-assumptions", verdictField: "capitalRaise2Amount" },
      { key: "trancheGapMonths",       label: "Tranche gap (months)",        surface: "company-assumptions", verdictField: "capitalRaise2Date"   },
      { key: "revenueRampDelayMonths", label: "Revenue ramp delay (months)", surface: "company-assumptions" },
      { key: "burnFlexDownPct",        label: "Burn flex-down %",            surface: "company-assumptions" },
    ],
    prerequisites: [
      "company-profile-saved",
      "all-properties-financials-computed",
    ],
    status: "built",
  },
  {
    id: "mgmt-co.revenue",
    letter: "B",
    realName: "Revenue",
    displayName: "Revenue Intelligence",
    humanName: "Bia",
    gender: "female",
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
      // G2 Tier-1 graduation: live hotel-revenue-comp dataset for comparables
      // fetch (STR / HVS / CBRE benchmarks). Optional so the Specialist falls
      // back to canned data when the resource is unmapped (red/amber health),
      // mirroring Funding's lp-comp-dataset assignmentRef. Live API integration
      // follows in a separate packet.
      { kind: "api", slug: "revenue-comp-dataset", required: false, role: "comparables" },
    ],
    candidateFields: [
      { key: "defaultCostRateMarketing", label: "Marketing cost %",   surface: "company-assumptions" },
      { key: "defaultRevShareFb",        label: "F&B revenue share %", surface: "company-assumptions" },
      { key: "defaultRevShareEvents",    label: "Events revenue share %", surface: "company-assumptions" },
      { key: "defaultRevShareOther",     label: "Other revenue share %", surface: "company-assumptions" },
      { key: "defaultCateringBoostPct",  label: "Catering boost %",     surface: "company-assumptions" },
    ],
    prerequisites: [
      "company-profile-saved",
      "all-properties-financials-computed",
    ],
    status: "built",
  },
  {
    id: "mgmt-co.icp-intelligence",
    letter: "C",
    realName: "ICP Intelligence",
    displayName: "ICP Intelligence",
    humanName: "Cecília",
    gender: "female",
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
    // ICP Intelligence generates a portfolio-wide narrative (Ideal Customer
    // Profile prose + deterministic config). It is a narrative output surface
    // like Executive Summary (Eloá), NOT a per-field assumption evaluator —
    // there are no verdict dimensions deep-linking to individual form inputs.
    // candidateFields intentionally empty; prerequisites cover the sole
    // preflight requirement (at least one property / company profile saved).
    candidateFields: [],
    prerequisites: [
      "company-profile-saved",
    ],
    status: "built",
  },
  {
    id: "property.risk-intelligence",
    letter: "D",
    realName: "Risk Intelligence",
    displayName: "Property Risk Intelligence",
    humanName: "Daniela",
    gender: "female",
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
    // candidateFields[].key is the dispatch/payload key the required-fields
    // gate evaluates against. The three location/basics rows are
    // upstream preflight prerequisites of the single verdict Daniela
    // emits today (the per-property inflation override): without
    // country / city / hospitalityType she cannot resolve the
    // country-level inflation outlook her runner reasons against, so
    // each preflight row sets `verdictField: "propertyInflationRate"`
    // to make the candidate-field parity test
    // (`tests/analyst/voice/field-registry-parity.test.ts`) read these
    // rows as upstream gates for the same verdict id Daniela emits.
    // Locked-hard preflight gating (see `getLockedHardCandidateKeys` in
    // this file) still keys off `key`, so the run-trigger preflight
    // and the `MissingRequiredFieldsPrompt` deep-link continue to
    // resolve to the location / basics anchors as before.
    candidateFields: [
      { key: "country",         label: "Country",       surface: "property-edit", lockedHard: true, surfaceAnchor: "location", verdictField: "propertyInflationRate" },
      { key: "city",            label: "City",          surface: "property-edit",                   surfaceAnchor: "location", verdictField: "propertyInflationRate" },
      { key: "hospitalityType", label: "Property type", surface: "property-edit", lockedHard: true, surfaceAnchor: "basics",   verdictField: "propertyInflationRate" },
      // Per-property inflation override is a property-level signal (the
      // user judges what inflation actually looks like in this market /
      // submarket) and is the natural counterpart to the macro
      // Specialist's global `inflationRate` Constant. Daniela owns the
      // property-level surface for inflation guidance: when the user's
      // override deviates from the country/market's published outlook
      // her Risk Intelligence verdict deep-links to the per-property
      // slider via the `propertyInflationRate` field id (registry entry
      // mountPoint `property-edit/other-assumptions`). The macro
      // Specialist (constants.macro-research / Isadora I) keeps owning
      // the global `inflationRate` Constant and its `defaults/market-
      // macro` mountPoint — the two field ids exist precisely so each
      // Specialist gets its own deep-link target without violating the
      // inflation-cascade rule (`.claude/rules/inflation-cascade.md`).
      { key: "propertyInflationRate", label: "Property inflation override", surface: "property-edit", surfaceAnchor: "other-assumptions" },
      // NOTE (Task #810): the property-level `strExempt` flag is operator-
      // owned and gates the STR Restriction Trends panel — it is NOT a
      // verdict field this Specialist emits, so it is intentionally not
      // listed here (the field-registry parity test enforces that every
      // candidate entry resolves to a TRACKED_FIELD on the Specialist).
    ],
    prerequisites: [],
    status: "built",
  },
  {
    id: "property.executive-summary",
    letter: "E",
    realName: "Executive Summary",
    displayName: "Executive Summary",
    humanName: "Eloá",
    gender: "female",
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
    candidateFields: [
      { key: "name",         label: "Property name", surface: "property-edit", lockedHard: true, surfaceAnchor: "basics"   },
      { key: "country",      label: "Country",       surface: "property-edit", lockedHard: true, surfaceAnchor: "location" },
      { key: "hospitalityType", label: "Property type", surface: "property-edit",                   surfaceAnchor: "basics"   },
    ],
    prerequisites: [],
    status: "built",
  },
  {
    id: "photos.photo-enhancer",
    letter: "F",
    realName: "Photo Enhancer",
    displayName: "Photo Enhancer & Renders",
    humanName: "Fernanda",
    gender: "female",
    description:
      "Cleans, brightens, and standardizes property photos and drives the render/avatar pipeline — both the per-album generators and the standalone render jobs run through Fernanda so prompt config and rate limits stay shared.",
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
    candidateFields: [],
    prerequisites: [],
    status: "built",
  },
  {
    id: "portfolio-ops.watchdog",
    letter: "G",
    realName: "Watchdog",
    displayName: "Portfolio Watchdog",
    humanName: "Giovanna",
    gender: "female",
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
    candidateFields: [],
    prerequisites: [
      "all-properties-financials-computed",
      "all-properties-required-fields-complete",
    ],
    status: "built",
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
    humanName: "Helena",
    gender: "female",
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
    candidateFields: [],
    prerequisites: ["constants-refreshed-within-cadence"],
    // Tax statutes change on annual cycles; monthly cadence catches mid-year
    // adjustments without spamming the Specialist or the activity log.
    refreshCadenceDays: 30,
    status: "needs-page",
  },
  {
    id: "constants.macro-research",
    letter: "I",
    realName: "Macro Indicators Research",
    displayName: "Macro Indicators Research",
    humanName: "Isadora",
    gender: "female",
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
    candidateFields: [],
    prerequisites: ["constants-refreshed-within-cadence"],
    // Central bank moves and IMF outlook updates are fast-moving; weekly
    // cadence keeps the discount-rate math honest without overrunning the
    // grounded-search budget.
    refreshCadenceDays: 7,
    status: "needs-page",
  },
  {
    id: "constants.depreciation-research",
    letter: "J",
    realName: "Depreciation Schedule Research",
    displayName: "Depreciation Schedule Research",
    humanName: "Júlia",
    gender: "female",
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
    candidateFields: [],
    prerequisites: ["constants-refreshed-within-cadence"],
    // Useful-life statutes are slow-moving; quarterly cadence keeps the
    // schedule current after annual tax-code refreshes.
    refreshCadenceDays: 90,
    status: "needs-page",
  },
  {
    id: "constants.reporting-research",
    letter: "K",
    realName: "Reporting Conventions Research",
    displayName: "Reporting Conventions Research",
    humanName: "Kamila",
    gender: "female",
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
    constantsOwned: ["daysPerMonth", "ffeReserveBenchmarkUsali"],
    candidateFields: [],
    prerequisites: ["constants-refreshed-within-cadence"],
    // USALI / AHLA conventions update on multi-year cycles; an annual
    // cadence is plenty.
    refreshCadenceDays: 365,
    status: "needs-page",
  },
  // ──────────────────────────────────────────────────────────────────────────
  // Resource Builder (letter L) — Letícia. Maintains the deterministic tools
  // the other Specialists call (lookup tables, source-of-truth scrapers,
  // benchmark loaders, etc.). She does not herself produce model outputs;
  // she keeps the toolbox sharp so the other 11 Specialists can stay
  // deterministic and inspectable.
  //
  // Capability tabs:
  //   - resource-assignments → her assignmentRefs are empty by design (she
  //     OWNS deterministic tools rather than CONSUMING canonical Resources),
  //     but the tab still surfaces the live Quality & Gaps card so admins
  //     can see her health like every other Specialist.
  //   - audit → records every cadence/runtime edit on her config row so
  //     toolbox-policy changes (e.g. lowering benchmark refresh cadence)
  //     stay traceable.
  // The catalog ALSO drives a page-level "Tools I build" surface
  // (SpecialistToolsIBuild) populated from SPECIALIST_TOOLS — that's where
  // the deterministic-tools work she does for the other 11 actually
  // renders. It mirrors the SpecialistToolsICall card every consuming
  // Specialist already gets, so Letícia's page stays consistent with the
  // rest of the team without inventing a Letícia-specific tab.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "resources.builder",
    letter: "L",
    realName: "Resource Builder",
    displayName: "Resource Builder",
    humanName: "Letícia",
    gender: "female",
    description:
      "Maintains the deterministic tools and lookup tables the other Specialists call — keeps the toolbox sharp so every research run stays inspectable and reproducible.",
    subject: "resources",
    capabilities: [
      "resource-assignments",
      "audit",
    ],
    assignmentRefs: [],
    candidateFields: [],
    prerequisites: [],
    // "built": her toolbox ships in code (SPECIALIST_TOOLS registry) and
    // her admin page renders real content (Quality & Gaps card, Audit
    // history, and the page-level "Tools I build" inspectability strip).
    // There is no separate evaluator to wire — her work product IS the
    // toolbox, so the "needs-page" banner doesn't apply.
    status: "built",
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

/**
 * Resolve the scheduled-refresh cadence (in days) for a given Constants
 * registry key. Returns the owning Specialist's `refreshCadenceDays` if set,
 * otherwise `null` (meaning: no scheduled refresh — admin-on-demand only).
 *
 * Used by `server/jobs/specialist-constants-refresh.ts` to decide which
 * (key, locality) rows are due for a re-fetch, and by the admin Constants
 * tab API to surface a "Stale — last refreshed N days ago" indicator.
 */
export function getRefreshCadenceDaysForConstant(
  constantKey: string,
): number | null {
  const owner = getSpecialistForConstant(constantKey);
  return owner?.refreshCadenceDays ?? null;
}

export const SPECIALIST_CATALOG_VALID = validation;

/**
 * Catalog-locked hard-required candidate-field keys for a Specialist.
 *
 * Source of truth for the admin lock and server-side enforcement:
 * these keys cannot be demoted by admins, and any other key cannot be
 * promoted to "hard". Returns an empty array when the Specialist declares
 * no candidate fields or none of them are locked.
 */
export function getLockedHardCandidateKeys(
  specialistId: string,
): string[] {
  const def = getSpecialistById(specialistId);
  if (!def?.candidateFields) return [];
  return def.candidateFields.filter((c) => c.lockedHard === true).map((c) => c.key);
}

/** True when the Specialist's catalog declares the given candidate key as locked-hard. */
export function isLockedHardCandidate(
  specialistId: string,
  fieldKey: string,
): boolean {
  return getLockedHardCandidateKeys(specialistId).includes(fieldKey);
}

/**
 * Full locked-hard candidate-field entries (key + label + surface +
 * surfaceAnchor) for a Specialist. Used by run-trigger preflight checks
 * to build the `MissingRequiredFieldsPrompt` payload — the
 * client modal needs the human label and deep-link anchor, not just the
 * raw key.
 */
export interface LockedHardCandidateField {
  key: string;
  label: string;
  surface: string;
  surfaceAnchor?: string;
}
export function getLockedHardCandidateFields(
  specialistId: string,
): LockedHardCandidateField[] {
  const def = getSpecialistById(specialistId);
  if (!def?.candidateFields) return [];
  return def.candidateFields
    .filter((c) => c.lockedHard === true)
    .map((c) => ({
      key: c.key,
      label: c.label,
      surface: c.surface,
      surfaceAnchor: c.surfaceAnchor,
    }));
}

