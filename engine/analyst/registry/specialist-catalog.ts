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
import {
  SPECIALIST_HUMAN_NAME_A,
  SPECIALIST_HUMAN_NAME_B,
  SPECIALIST_HUMAN_NAME_C,
  SPECIALIST_HUMAN_NAME_D,
  SPECIALIST_HUMAN_NAME_E,
  SPECIALIST_HUMAN_NAME_F,
  SPECIALIST_HUMAN_NAME_G,
  SPECIALIST_HUMAN_NAME_H,
  SPECIALIST_HUMAN_NAME_I,
  SPECIALIST_HUMAN_NAME_J,
  SPECIALIST_HUMAN_NAME_K,
  SPECIALIST_HUMAN_NAME_L,
  SPECIALIST_HUMAN_NAME_M,
  SPECIALIST_HUMAN_NAME_N,
  SPECIALIST_HUMAN_NAME_O,
  SPECIALIST_HUMAN_NAME_P,
} from "./specialist-names";

export const SPECIALIST_CATALOG: readonly SpecialistDefinition[] = [
  // Tier-1 graduate (G1, 2026-04-26) — see ADR-007 + tests/analyst/golden/mgmt-co-funding.test.ts
  {
    id: "mgmt-co.funding",
    letter: "A",
    realName: "Funding",
    displayName: "Funding Intelligence",
    humanName: SPECIALIST_HUMAN_NAME_A,
    gender: "female",
    description:
      "Tracks the management company's capital stack, runway, and refinancing posture so investors and operators can see funding risk before it hits the model.",
    personality:
      "Methodical, decisive, unfazed by complexity. Reads capital structures like others read menus — quickly, with strong opinions. Thinks in risk-adjusted timelines. Calmly flags problems before they become crises.",
    expertise: [
      "LP fundraising and capital stack architecture",
      "Runway modeling and covenant monitoring",
      "Tranching strategy and sizing overshoot analysis",
      "Private equity hospitality comparables (PitchBook, PrivateEquityInfo)",
      "Tranche gap and revenue ramp delay sensitivity",
    ],
    promptGuidance:
      "Provide complete capital structure context: total raise amount, tranche timing, current runway, revenue ramp assumptions. Ana synthesizes LP-comparable data — include ICP context if available. She is direct about whether a structure is defensible. Expect range-first verdicts on runway buffer, sizing overshoot, and tranche gap. Context fields: runwayBufferMonths, sizingOvershootPct, trancheGapMonths, revenueRampDelayMonths, burnFlexDownPct.",
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
    humanName: SPECIALIST_HUMAN_NAME_B,
    gender: "female",
    description:
      "Builds the revenue picture for the management company — fees, recurring contracts, and growth signals — so the simulation runs against a realistic top line, not a guess.",
    personality:
      "Optimistic but rigorous. Believes every property has a revenue story worth telling correctly. Challenges vague 'market upside' assumptions with real comp data. High energy, fast synthesis, good at spotting what's been left on the table.",
    expertise: [
      "Hotel fee structures and STR benchmarks",
      "RevPAR drivers and ADR market positioning",
      "Management fee rate markets (base + incentive)",
      "F&B revenue modeling and incentive fee mechanics",
      "HVS, CBRE, and STR benchmarking datasets",
    ],
    promptGuidance:
      "Include management company fee structure, property portfolio summary (room counts, types, cities), and current year revenue projections. Bia pulls live hotel revenue comps — specify the geographic markets that matter. She flags when a fee rate is out of band for the property mix and revenue tier. Context fields: defaultCostRateMarketing, defaultRevShareFb, defaultRevShareEvents, defaultRevShareOther, defaultCateringBoostPct.",
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
    humanName: SPECIALIST_HUMAN_NAME_C,
    gender: "female",
    description:
      "Sharpens the management company's ideal customer profile from real signals — who actually buys, why, and who looks like them next — so targeting and outreach stop being guesswork.",
    personality:
      "Curious, analytical, empathetic. Studies buying patterns with the same rigor a physicist studies particle data. Believes the best marketing starts with the most honest description of who actually buys — not who you wish would buy.",
    expertise: [
      "Hospitality LP and investor profile segmentation",
      "HNW investor motivation mapping",
      "Look-alike modeling and outreach calibration",
      "Investment thesis matching (boutique luxury, STR, extended stay)",
      "ICP narrative construction for LP data rooms",
    ],
    promptGuidance:
      "Provide the full company profile, portfolio summary, and any known investor/partner history. Cecília produces a portfolio-wide ICP narrative — give her the business model context (boutique luxury, STR, extended stay) and target geography. Output is prose + structured ICP config, not individual assumption verdicts.",
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
    humanName: SPECIALIST_HUMAN_NAME_D,
    gender: "female",
    description:
      "Surfaces the things that could derail a property — flood, brand, regulatory, market — early enough to price them in or walk away.",
    personality:
      "Sober, thorough, refuses to paper over danger. The team member who reads the fine print. Comfortable delivering bad news early when it can still be acted on. Doesn't catastrophize, but never minimizes.",
    expertise: [
      "Property-level risk factors (flood, regulatory, brand, environmental)",
      "Country inflation outlook from central bank primary sources",
      "Submarket risk premiums and STR regulation trends",
      "Per-property inflation override calibration",
      "Country and city-level regulatory risk research",
    ],
    promptGuidance:
      "Include property country, city, type, and the per-property inflation override if set. Daniela researches country-level inflation from central bank sources and regulatory risk from public records — give her the locality precisely. She emits a single inflation-range verdict plus risk flags. Expect references to authoritative sources in evidence. Context fields: country, city, hospitalityType, propertyInflationRate.",
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
    humanName: SPECIALIST_HUMAN_NAME_E,
    gender: "female",
    description:
      "Turns the underwriting model into a crisp one-page narrative — what this property is, why it works, and what could break it — ready to share with investors and partners.",
    personality:
      "Elegant, concise, investor-aware. Distills complexity into the clearest possible story. Hates filler words. Writes like the one-pager that wins the first meeting.",
    expertise: [
      "Investment memo craft and LP narrative structure",
      "Property positioning and competitive framing",
      "Risk-adjusted return framing for investor audiences",
      "Underwriting summary synthesis (NOI, IRR, cap rates, debt)",
      "One-page executive summary construction",
    ],
    promptGuidance:
      "Provide the full underwriting model output (NOI, IRR, cap rates, debt structure) plus property name, type, city, and country. Eloá synthesizes the financial model into a one-page narrative — include the ICP context if available. Output is formatted prose for LP-ready documents, not assumption ranges. Context fields: name, country, hospitalityType.",
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
    humanName: SPECIALIST_HUMAN_NAME_F,
    gender: "female",
    description:
      "Cleans, brightens, and standardizes property photos and drives the render/avatar pipeline — both the per-album generators and the standalone render jobs run through Fernanda so prompt config and rate limits stay shared.",
    personality:
      "Visual, precise, quietly perfectionist. Sees what should be in a property image and what's getting in the way. Fast executor, works methodically through a queue, flags quality issues without dramatizing them.",
    expertise: [
      "Image enhancement (brightness, color correction, composition)",
      "AI render prompt engineering for architectural and interior photography",
      "Property photography brand standards",
      "Avatar and portrait generation pipelines",
      "Rate-limit and cost management across image generation APIs",
    ],
    promptGuidance:
      "Provide the image file(s) and enhancement intent (standard cleanup, render pipeline, or avatar generation). Fernanda handles both per-album batch enhancement and standalone render jobs — specify the pipeline and quality target. For renders, include a visual description of the property aesthetic and target ambiance.",
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
    humanName: SPECIALIST_HUMAN_NAME_G,
    gender: "female",
    description:
      "Watches every property in the portfolio against custom thresholds — occupancy, ADR, DSCR, covenant tripwires — and pings the team the moment something drifts out of bounds.",
    personality:
      "Vigilant, steady, alert without being alarmist. The colleague who notices the early warning sign everyone else walked past. Tracks patterns over time, not just snapshots.",
    expertise: [
      "Portfolio threshold monitoring (DSCR, occupancy, ADR, covenant tripwires)",
      "Cross-portfolio anomaly detection and pattern tracking",
      "Alert routing and escalation calibration",
      "Batch evaluation across all properties in one pass",
    ],
    promptGuidance:
      "Provide the full portfolio financials snapshot and the configured watchdog thresholds. Giovanna evaluates every property against all thresholds in one pass — she is a batch evaluator, not a per-property specialist. Specify the threshold set in play. Output is a per-property × per-metric flag matrix, not prose ranges.",
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
    humanName: SPECIALIST_HUMAN_NAME_H,
    gender: "female",
    description:
      "Tracks national and sub-national tax authorities (IRS, country tax codes) and keeps income, capital gains, and property-tax constants aligned with current statute — so the model never silently drifts behind a tax change.",
    personality:
      "Precise, authoritative, allergic to approximation. Studies tax statutes the way a constitutional lawyer reads case law — primary sources first, always. Never guesses on statutory rates.",
    expertise: [
      "IRS publications and US federal tax statutes",
      "National tax codes (Brazil, Spain, Colombia, Portugal, Mexico)",
      "Income tax rates, capital gains rates, and property tax rate research",
      "Sub-national (state/province) tax authority tracking",
    ],
    promptGuidance:
      "Specify the target country, subdivision (state/province), and the constant key(s) to refresh (taxRate, capitalGainsRate, costRateTaxes). Helena fetches from primary statutory sources — provide the as-of date and the current stored value so she can assess whether an update is needed. Output is an authority-sourced range with citation URL and statute reference.",
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
    status: "built",
  },
  {
    id: "constants.macro-research",
    letter: "I",
    realName: "Macro Indicators Research",
    displayName: "Macro Indicators Research",
    humanName: SPECIALIST_HUMAN_NAME_I,
    gender: "female",
    description:
      "Maintains macro inputs sourced from central banks and the IMF — country inflation outlook and country risk premium — so discounting and escalation reflect the latest published outlook, not a stale snapshot.",
    personality:
      "Big-picture, calibrated, comfortable with uncertainty. Reads central bank forward guidance the way a seasoned economist does — skeptically, with historical context. Delivers ranges when the outlook is genuinely uncertain, not false precision.",
    expertise: [
      "Central bank targets (Fed, ECB, BoE, Banco Central do Brasil, Banxico, Banco de España)",
      "IMF World Economic Outlook data and country risk premium research",
      "Inflation forecasting and country-specific outlook calibration",
      "G10 vs. emerging market uncertainty quantification",
    ],
    promptGuidance:
      "Specify target country and the constant key(s) to refresh (countryRiskPremium, inflationRate). Isadora fetches from IMF WEO data and central bank published targets — give her the current stored value and the last asOfDate so she can assess staleness. Expect a wider range and lower conviction on emerging markets; expect tighter range on G10 currencies.",
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
    status: "built",
  },
  {
    id: "constants.depreciation-research",
    letter: "J",
    realName: "Depreciation Schedule Research",
    displayName: "Depreciation Schedule Research",
    humanName: SPECIALIST_HUMAN_NAME_J,
    gender: "female",
    description:
      "Tracks depreciation useful-life rules per country (IRS Pub. 946, CRA CCA, French CGI, etc.) and keeps the building straight-line schedule aligned with the cited statute for each locality.",
    personality:
      "Methodical, rule-bound, comfortable in the detail. Studies useful-life rules the way a specialist reads building codes — no shortcuts, every jurisdiction gets its own treatment.",
    expertise: [
      "IRS Publication 946 (US useful-life rules)",
      "CRA CCA classes (Canada), French CGI, and international depreciation statutes",
      "Hospitality asset useful-life rules per jurisdiction",
      "Straight-line depreciation schedule construction and statutory compliance",
    ],
    promptGuidance:
      "Specify target country and the constant key to refresh (depreciationYears). Júlia fetches from the statutory publication for that jurisdiction — provide the current stored value and the cited statute. She validates that the current value matches the published standard. Output includes the statute reference URL and the effective date of the rule.",
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
    status: "built",
  },
  {
    id: "constants.reporting-research",
    letter: "K",
    realName: "Reporting Conventions Research",
    displayName: "Reporting Conventions Research",
    humanName: SPECIALIST_HUMAN_NAME_K,
    gender: "female",
    description:
      "Owns universal reporting conventions (USALI 11th Ed., AHLA, industry-standard period definitions). Keeps universal constants like days-per-month aligned with how the industry actually reports — not a one-off shortcut.",
    personality:
      "Standards-first, systematic. Believes precision in financial reporting starts with shared definitions. Champions USALI rigor not out of pedantry but because ambiguity in definitions is where deals fall apart in the data room.",
    expertise: [
      "USALI 11th Edition and AHLA reporting standards",
      "HFTP Uniform System of Accounts for the Lodging Industry",
      "Industry-standard period definitions (days-per-month, FF&E reserve benchmarks)",
      "Cross-jurisdiction reporting convention differences",
    ],
    promptGuidance:
      "Specify the constant key(s) to refresh (daysPerMonth, ffeReserveBenchmarkUsali). Kamila validates against the published USALI edition and AHLA guidance — provide the current stored value. These constants change on multi-year cycles; she distinguishes between a genuine standard update and a mis-typed value.",
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
    status: "built",
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
    humanName: SPECIALIST_HUMAN_NAME_L,
    gender: "female",
    description:
      "Maintains the deterministic tools and lookup tables the other Specialists call — keeps the toolbox sharp so every research run stays inspectable and reproducible.",
    personality:
      "Methodical, infrastructure-minded, quietly indispensable. Builds the tools the other Specialists depend on, then gets out of the way. Thinks in reliability and reproducibility, not outputs.",
    expertise: [
      "Deterministic tool architecture in calc/research/ and calc/dispatch.ts",
      "Lookup table design and benchmark loader schemas",
      "Source-of-truth scraper patterns and update cadence management",
      "Tool schema registration and test coverage for the calc/ registry",
    ],
    promptGuidance:
      "Provide the tool spec (input schema, output schema, data source, and update cadence). Letícia builds and registers deterministic tools — she does not produce model outputs herself. Describe the benchmark source and which Specialist(s) will consume the tool. Output is a working tool implementation ready for calc/dispatch.ts registration.",
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
  {
    id: "mgmt-co.compensation",
    letter: "M",
    realName: "Compensation",
    displayName: "Compensation Intelligence",
    humanName: SPECIALIST_HUMAN_NAME_M,
    gender: "female",
    description:
      "Watches the management company's compensation plan — partner draws, headcount, staff salary, scale-stage staffing — so the people line stays defensible to LPs across the founding-to-institutional arc.",
    personality:
      "Direct, data-backed, LP-fluent. Believes compensation is where founders signal their maturity to investors — either with defensible benchmarks or with uncomfortable conversations later. Doesn't soften the verdict on out-of-range draws.",
    expertise: [
      "Hospitality management company C-suite comp (AHLA, HVS, CBRE surveys)",
      "Partner draw structures and scale-stage headcount modeling",
      "Incentive alignment, carry, and promote mechanics",
      "Under-paying (LP credibility risk) and over-paying (NOI risk) scenario analysis",
    ],
    promptGuidance:
      "Include current partner comp (year 1 through year 10), headcount plan, and staff salary assumptions. Mariana benchmarks against AHLA/HVS/CBRE comp surveys for hospitality operators at comparable AUM/revenue scale. Specify the portfolio size (rooms under management, revenue) for accurate benchmarking. Context fields: partnerCompYear1, partnerCompYear10, partnerCountYear1, staffSalary, staffTier3Fte.",
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
      { kind: "benchmark", slug: "compensation-benchmarks", required: true },
      // P7-B Phase 3: live ManCo comp survey dataset for comparables fetch
      // (AHLA / HVS / CBRE Hospitality C-Suite Survey). Optional so the
      // Specialist falls back to canned data when the resource is unmapped
      // (red/amber health), mirroring Funding's lp-comp-dataset and
      // Revenue's revenue-comp-dataset assignmentRefs. Live API integration
      // follows in a separate packet.
      { kind: "api", slug: "compensation-comp-dataset", required: false, role: "comparables" },
    ],
    candidateFields: [
      { key: "partnerCompYear1",  label: "Year 1 Management Comp",     surface: "company-assumptions" },
      { key: "partnerCompYear10", label: "Year 10 Management Comp",    surface: "company-assumptions" },
      { key: "partnerCountYear1", label: "Year 1 Partner Headcount",   surface: "company-assumptions" },
      { key: "staffSalary",       label: "Staff Salary",               surface: "company-assumptions" },
      { key: "staffTier3Fte",     label: "Tier-3 FTE Count",           surface: "company-assumptions" },
    ],
    prerequisites: [
      "company-profile-saved",
    ],
    // P7-B Phase 1: Tier-0 deterministic watchdog wrapper shipped. Tier-1
    // N+1 graduation lands in P7-B Phase 2 (mirrors Funding G6-P3b /
    // Revenue G2 pattern); api assignmentRef + IB bar tests in Phase 3.
    status: "built",
  },
  {
    id: "mgmt-co.overhead",
    letter: "N",
    realName: "Overhead",
    displayName: "Overhead Intelligence",
    humanName: SPECIALIST_HUMAN_NAME_N,
    gender: "female",
    description:
      "Watches the management company's corporate overhead — fixed lines (office, legal, tech, insurance) and per-property variables (travel, IT licensing) — so the cost structure stays defensible to LPs as the platform scales.",
    personality:
      "Disciplined, skeptical of bloat, practical. Studies overhead lines the way a CFO does before a board presentation — not to minimize, but to make sure every dollar has a defensible answer. Finds the cost structure that scales without becoming a problem.",
    expertise: [
      "Management company overhead modeling (office, legal, tech, insurance)",
      "Per-property variable cost structures (travel, IT licensing)",
      "Scale-sensitive benchmarking (AHLA, HFTP, FOHB, AICPA)",
      "EBITDA margin discipline and LP overhead scrutiny patterns",
    ],
    promptGuidance:
      "Include all overhead line items (office lease, professional services, tech infrastructure, insurance, travel per client, IT licensing per client) and the current portfolio size. Natália benchmarks against AHLA, HFTP, and FOHB data for operators at comparable scale — give her the property count and AUM so she can apply the right tier. Context fields: officeLeaseStart, professionalServicesStart, techInfraStart, businessInsuranceStart, travelCostPerClient, itLicensePerClient.",
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
      { kind: "benchmark", slug: "overhead-benchmarks", required: true },
      // P7-B Overhead Phase 3: live ManCo overhead survey dataset for
      // comparables fetch (AHLA / HFTP / AICPA / HVS / FOHB practice
      // benchmarks). Optional so the Specialist falls back to canned data
      // when the resource is unmapped (red/amber health), mirroring
      // Funding's lp-comp-dataset, Revenue's revenue-comp-dataset, and
      // Compensation's compensation-comp-dataset assignmentRefs. Live API
      // integration follows in a separate packet.
      { kind: "api", slug: "overhead-comp-dataset", required: false, role: "comparables" },
    ],
    candidateFields: [
      { key: "officeLeaseStart",          label: "Office Lease",            surface: "company-assumptions" },
      { key: "professionalServicesStart", label: "Professional Services",   surface: "company-assumptions" },
      { key: "techInfraStart",            label: "Tech Infrastructure",     surface: "company-assumptions" },
      { key: "businessInsuranceStart",    label: "Business Insurance",      surface: "company-assumptions" },
      { key: "travelCostPerClient",       label: "Travel Cost per Client",  surface: "company-assumptions" },
      { key: "itLicensePerClient",        label: "IT/Licensing per Client", surface: "company-assumptions" },
    ],
    prerequisites: [
      "company-profile-saved",
    ],
    // P7-B Overhead Phase 1 (Tier-0): `3a173ee9` — deterministic watchdog
    // wrapper shipped. Phase 2 (Tier-1 N+1): `495803ee` — full PE + parallel
    // panels + Opus synthesis + bounded regress. Phase 3: this commit —
    // 25-test IB bench + api assignmentRef wired.
    status: "built",
  },
  // P7-B Company Phase 1 (Tier-0): deterministic watchdog + Tier-0 surface
  // specialist shipped. Phase 2 (Tier-1 N+1) and Phase 3 (IB bench) follow.
  {
    id: "mgmt-co.company",
    letter: "O",
    realName: "Company",
    displayName: "Company Intelligence",
    humanName: SPECIALIST_HUMAN_NAME_O,
    gender: "female",
    description:
      "Validates the management company's core financial defaults — base and incentive fee rates, corporate tax structure, and cost-of-equity hurdle — so the LP data room reflects defensible operator-market benchmarks.",
    personality:
      "Strategic, LP-fluent, thinks about the model the way an investor will. Comfortable saying a management fee is at the high end of market and explaining why that's fine — or isn't.",
    expertise: [
      "Hospitality management company fee rate benchmarking (base + incentive)",
      "Corporate tax strategy and structure for hospitality operators",
      "Cost-of-equity calibration by operator class and raise stage",
      "Investor credibility standards for LP data room preparation",
    ],
    promptGuidance:
      "Include the management company's current base fee, incentive fee, tax rate, and cost of equity assumptions. Olívia benchmarks against operator-class comparables — flag hotel type (branded vs. independent vs. boutique luxury). She validates that the fee structure is defensible at the LP table for the target raise size and property type. Context fields: baseManagementFee, incentiveManagementFee, companyTaxRate, costOfEquity.",
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
      { kind: "benchmark", slug: "company-benchmarks", required: true },
      { kind: "api", slug: "company-comp-dataset", required: false, role: "comparables" },
    ],
    candidateFields: [
      { key: "baseManagementFee",     label: "Base Management Fee",     surface: "defaults" },
      { key: "incentiveManagementFee", label: "Incentive Management Fee", surface: "defaults" },
      { key: "companyTaxRate",        label: "Company Tax Rate",         surface: "defaults" },
      { key: "costOfEquity",          label: "Cost of Equity",           surface: "defaults" },
    ],
    prerequisites: [
      "company-profile-saved",
    ],
    status: "built",
  },
  // P7-B Property-Defaults Phase 1 (Tier-0): deterministic watchdog + Tier-0
  // surface specialist shipped. Phase 2 (Tier-1 N+1) and Phase 3 (IB bench)
  // follow the Company (Olívia / O) pattern exactly.
  {
    id: "mgmt-co.property-defaults",
    letter: "P",
    realName: "Property Defaults",
    displayName: "Property Defaults Intelligence",
    humanName: SPECIALIST_HUMAN_NAME_P,
    gender: "female",
    description:
      "Validates the admin-level property underwriting defaults — event and other expense rates, utilities variable-to-fixed split, and sales commission rate — so that new property models seed from defensible market-calibrated baselines.",
    personality:
      "Detail-oriented, systematic, good at spotting when 'standard' really means 'we didn't think about it.' Believes the default values that seed every new property model are where hidden risk enters the system.",
    expertise: [
      "Event and other expense rate benchmarking (USALI departmental standards)",
      "Utilities cost structures and variable/fixed split calibration",
      "Sales commission rate markets for hospitality operators",
      "Property-level default calibration across property types and geographies",
    ],
    promptGuidance:
      "Include the current admin defaults (event expense rate, other expense rate, utilities variable/fixed split, sales commission rate) and the property portfolio context (types, geographies). Paula benchmarks against USALI departmental standards and comp set data — give her the portfolio mix so she can weight appropriately. Context fields: eventExpenseRate, otherExpenseRate, utilitiesVariableSplit, salesCommissionRate.",
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
      { kind: "benchmark", slug: "property-defaults-benchmarks", required: true },
      { kind: "api", slug: "property-defaults-comp-dataset", required: false, role: "comparables" },
    ],
    candidateFields: [
      { key: "eventExpenseRate",       label: "Event Expense Rate",        surface: "defaults" },
      { key: "otherExpenseRate",       label: "Other Expense Rate",         surface: "defaults" },
      { key: "utilitiesVariableSplit", label: "Utilities Variable Split",   surface: "defaults" },
      { key: "salesCommissionRate",    label: "Sales Commission Rate",      surface: "defaults" },
    ],
    prerequisites: [
      "company-profile-saved",
    ],
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

