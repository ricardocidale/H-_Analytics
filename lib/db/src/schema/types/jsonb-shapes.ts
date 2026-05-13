export interface IcpResearchReport {
  targetProfile?: string;
  marketSize?: string;
  segments?: Array<{ name: string; description: string; priority?: string }>;
  channels?: string[];
  [key: string]: unknown;
}

export interface IcpConfig {
  _research?: IcpResearchReport;
  _researchMarkdown?: string;
  [key: string]: unknown;
}

export interface ExportCategoryFormat {
  allowLandscape?: boolean;
  allowPortrait?: boolean;
  allowShort?: boolean;
  allowExtended?: boolean;
  allowPremium?: boolean;
  densePagination?: boolean;
}

export interface ExportConfigOverview extends ExportCategoryFormat {
  kpiMetrics?: boolean;
  revenueChart?: boolean;
  projectionTable?: boolean;
  compositionTables?: boolean;
  compositionCharts?: boolean;
  waterfallTable?: boolean;
  propertyInsights?: boolean;
  aiInsights?: boolean;
}

export interface ExportConfigStatements extends ExportCategoryFormat {
  incomeStatement?: boolean;
  incomeChart?: boolean;
  cashFlow?: boolean;
  cashFlowChart?: boolean;
  balanceSheet?: boolean;
  balanceSheetChart?: boolean;
}

export interface ExportConfigAnalysis extends ExportCategoryFormat {
  kpiSummaryCards?: boolean;
  returnChart?: boolean;
  freeCashFlowTable?: boolean;
  propertyIrrTable?: boolean;
  dcfAnalysis?: boolean;
  performanceTrend?: boolean;
}

export interface ExportConfig {
  overview?: ExportConfigOverview;
  statements?: ExportConfigStatements;
  analysis?: ExportConfigAnalysis;
}

export interface MarketResearchContent {
  sections?: Array<{ title: string; body: string }>;
  summary?: string;
  [key: string]: unknown;
}

export interface PromptConditions {
  [key: string]: unknown;
}

export interface ActivityLogMetadata {
  previousValue?: unknown;
  newValue?: unknown;
  changedFields?: string[];
  [key: string]: unknown;
}

export interface ScenarioGlobalAssumptionsSnapshot {
  modelStartDate?: string;
  baseManagementFeePercent?: number;
  projectionYears?: number;
  [key: string]: unknown;
}

export interface ScenarioPropertySnapshot {
  id?: number;
  name: string;
  stableKey?: string;
  startAdr?: number;
  adrGrowthRate?: number;
  occupancyRate?: number;
  roomCount?: number;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface ScenarioFeeCategorySnapshot {
  id?: number;
  name?: string;
  amount?: number;
  [key: string]: unknown;
}

export interface ScenarioPhotoSnapshot {
  id?: number;
  url?: string;
  caption?: string;
  [key: string]: unknown;
}

export interface ScenarioServiceTemplateSnapshot {
  id?: number;
  name: string;
  defaultRate: number;
  serviceModel: string;
  serviceMarkup: number;
  isActive: boolean;
  sortOrder: number;
  [key: string]: unknown;
}

export interface ScenarioImagesSnapshot {
  [key: string]: unknown;
}

export interface ScenarioPropertyOverrideData {
  isActive?: boolean;
  [key: string]: unknown;
}

export interface VerificationRunResults {
  propertyResults?: Array<{
    propertyName: string;
    checks: Array<{
      name: string;
      passed: boolean;
      expected?: unknown;
      actual?: unknown;
    }>;
  }>;
  companyChecks?: Array<{
    name: string;
    passed: boolean;
  }>;
  consolidatedChecks?: Array<{
    name: string;
    passed: boolean;
  }>;
  [key: string]: unknown;
}

export interface StandardAcqPackage {
  purchasePrice: number;
  buildingImprovements: number;
  preOpeningCosts: number;
  operatingReserve: number;
  monthsToOps: number;
}

export interface DebtAssumptions {
  interestRate: number;
  amortizationYears: number;
  refiLTV: number;
  refiClosingCostRate: number;
  refiInterestRate?: number;
  refiAmortizationYears?: number;
  refiPeriodYears?: number;
  acqLTV: number;
  acqClosingCostRate: number;
}

export interface AssetDefinition {
  minRooms: number;
  maxRooms: number;
  hasFB: boolean;
  hasEvents: boolean;
  hasWellness: boolean;
  minAdr: number;
  maxAdr: number;
  level?: "budget" | "average" | "luxury";
  eventLocations?: number;
  maxEventCapacity?: number;
  acreage?: number;
  privacyLevel?: "low" | "moderate" | "high";
  parkingSpaces?: number;
  description: string;
}

export type ConsolidatedYearlyJson = unknown[];

export interface NotificationLogMetadata {
  alertRuleName?: string;
  propertyName?: string;
  metricValue?: number;
  threshold?: number;
  [key: string]: unknown;
}

export interface RawExtractionData {
  pages?: Array<{ pageNumber: number; text?: string; fields?: Record<string, unknown> }>;
  rawText?: string;
  confidence?: number;
  [key: string]: unknown;
}

// ── ICP Bracket Mix ───────────────────────────────────────────────────────

/**
 * A single bracket entry within a Management Company's ICP bracket mix.
 * `weight` is a value in [0, 1]; all entries in a BracketMixData.entries
 * array must sum to exactly 1.0.
 */
export interface BracketEntry {
  id: string;
  name: string;
  archetypeLabel: string;
  /** "hotel" = all service lines; "str" = marketing/branding/perf-bonus only; "mixed" = blended */
  serviceConsumption: "hotel" | "str" | "mixed";
  weight: number;
  rationale?: string;
}

/**
 * The full bracket mix stored in global_assumptions.bracket_mix.
 * NULL = bracket mix has not been assigned yet.
 */
export interface BracketMixData {
  entries: BracketEntry[];
  assignedAt?: string;
  evidence?: string;
}

// ── ICP Peer Companies — Phase B Specialist output shapes ─────────────────

/**
 * Phase B (R1) — one slug → weight pair within a peer's brand-level
 * archetype split. `weight` is in [0, 1]; entries within a single
 * BrandArchetypeSplit.entries array must sum to 1.0.
 */
export interface BrandArchetypeSplitEntry {
  bracketSlug: string;
  weight: number;
}

/**
 * Phase B (R1, R10) — Tiago's per-peer Specialist output: how this peer's
 * properties distribute across the active bracket archetypes. Stored on
 * `icp_peer_companies.brand_archetype_split` and aggregated by Hugo into
 * the global default `BracketMixData`.
 */
export interface BrandArchetypeSplit {
  entries: BrandArchetypeSplitEntry[];
}

/**
 * Phase B (R1) — one citation surfaced in the K&R per-peer Evidence panel.
 */
export interface SplitEvidenceCitation {
  /** Cited source URL — required. */
  url: string;
  /** Page or article title; optional. */
  title?: string;
  /** Short excerpt or rationale for citation; optional. */
  snippet?: string;
}

/**
 * Phase B (R1) — one of the 5–10 representative properties Tiago surfaces
 * per peer to ground the archetype split in concrete examples.
 */
export interface SplitEvidenceSampleProperty {
  /** Display name of the example property. */
  name: string;
  /** Which bracket slug this property maps to in Tiago's classification. */
  bracketSlug?: string;
  /** Optional source URL for the property itself. */
  url?: string;
}

/**
 * Phase B (R1, R10) — full citation bundle persisted on
 * `icp_peer_companies.split_evidence`. Surfaced read-only in the K&R
 * per-peer Evidence panel; never edited by admins.
 */
export interface SplitEvidence {
  citations: SplitEvidenceCitation[];
  sampleProperties: SplitEvidenceSampleProperty[];
}

/**
 * Phase B (R13) — per-peer override of Costantino's freshness defaults.
 * Defaults (90 days stale / weekly recheck) live in DB on the
 * source-registry / admin_resources row for `icp_peer_companies`; this
 * jsonb shadows those defaults on a single peer when the operator wants a
 * tighter or looser cadence for that brand.
 */
export interface CostantinoPeerConfig {
  /** Override `staleAfterDays` from the source-registry default. */
  staleAfterDays?: number;
  /** Override the default recheck cadence. */
  recheckCadence?: "weekly" | "monthly";
}
