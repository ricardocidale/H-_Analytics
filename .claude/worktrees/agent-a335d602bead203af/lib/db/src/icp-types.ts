/**
 * shared/icp-types.ts — Portable contracts for ICP (Ideal Customer Profile)
 * generation.
 *
 * Pure type declarations only. No runtime logic and no server-only imports.
 * Consumed by server-side ICP generators (`server/ai/icp/`) and by any
 * frontend surface that needs to render an ICP brief.
 *
 * Audit #319 R5 Phase 6 split `server/ai/icp-intelligence.ts` into focused
 * modules under `server/ai/icp/` and lifted these types up to `shared/`.
 */

// ─── Priority ranking for amenities ──────────────────────────────────────────

export type Priority = "must" | "major" | "nice" | "no";

// ─── Full structured ICP output matching the client IcpConfig interface ──────

export interface GeneratedIcpConfig {
  // Room/unit specs
  roomsMin: number;
  roomsMax: number;
  roomsSweetSpotMin: number;
  roomsSweetSpotMax: number;
  masterSuitesMin: number;
  masterSuiteSqFt: number;
  bedroomsMin: number;
  bedroomsMax: number;
  bathroomsMin: number;
  bathroomsMax: number;
  halfBaths: number;
  // Land & building
  landAcresMin: number;
  landAcresMax: number;
  builtSqFtMin: number;
  builtSqFtMax: number;
  livingAreas: number;
  // Dining & events
  diningCapacityMin: number;
  diningCapacityMax: number;
  indoorEventMin: number;
  indoorEventMax: number;
  outdoorEventMin: number;
  outdoorEventMax: number;
  parkingMin: number;
  parkingMax: number;
  // Facilities
  kitchenSqFt: number;
  maintenanceSqFt: number;
  staffQuartersMin: number;
  staffQuartersMax: number;
  staffHousingUnits: number;
  // Amenities (priority-ranked)
  pool: Priority;
  poolSqFt: number;
  secondPool: Priority;
  hotTub: Priority;
  spa: Priority;
  spaTreatmentRooms: number;
  sauna: Priority;
  steamRoom: Priority;
  coldPlunge: Priority;
  yogaStudio: Priority;
  gym: Priority;
  gymSqFtMin: number;
  gymSqFtMax: number;
  tennis: Priority;
  tennisCourts: number;
  pickleball: Priority;
  pickleballCourts: number;
  basketball: Priority;
  hikingTrails: Priority;
  horseFacilities: Priority;
  horseStalls: number;
  pastureAcres: number;
  garden: Priority;
  vineyard: Priority;
  casitas: Priority;
  casitasCount: number;
  barn: Priority;
  glamping: Priority;
  greenhouse: Priority;
  chapel: Priority;
  firePit: Priority;
  wineCellar: Priority;
  gameRoom: Priority;
  library: Priority;
  outdoorKitchen: Priority;
  garageBays: number;
  // Condition
  maxRoofAge: number;
  minElectricalAmps: number;
  maxRenovationBudget: number;
  // Access
  minSetbackFt: number;
  minDrivewayFt: number;
  // Proximity
  maxAirportMin: number;
  prefAirportMin: number;
  maxIntlAirportMin: number;
  prefIntlAirportMin: number;
  maxHospitalMin: number;
  prefHospitalMin: number;
  // Financial
  acquisitionMin: number;
  acquisitionMax: number;
  acquisitionTargetMin: number;
  acquisitionTargetMax: number;
  totalInvestmentMin: number;
  totalInvestmentMax: number;
  renovationMin: number;
  renovationMax: number;
  ffePerRoomMin: number;
  ffePerRoomMax: number;
  adrMin: number;
  adrMax: number;
  occupancyMin: number;
  occupancyMax: number;
  occupancyRampMonths: number;
  revParMin: number;
  revParMax: number;
  fbShareMin: number;
  fbShareMax: number;
  eventsShareMin: number;
  eventsShareMax: number;
  spaShareMin: number;
  spaShareMax: number;
  otherShareMin: number;
  otherShareMax: number;
  totalAncillaryMin: number;
  totalAncillaryMax: number;
  baseMgmtFeeMin: number;
  baseMgmtFeeMax: number;
  incentiveFeeMin: number;
  incentiveFeeMax: number;
  exitCapRateMin: number;
  exitCapRateMax: number;
  targetIrr: number;
  equityMultipleMin: number;
  equityMultipleMax: number;
  holdYearsMin: number;
  holdYearsMax: number;
  fbRating: number;
}

export interface GeneratedIcpDescriptive {
  propertyTypes: string;
  fbLevel: string;
  locationCharacteristics: string;
  locationDetails: string;
  conditionNotes: string;
  groundsTopography: string;
  vendorServices: string;
  regulatoryNotes: string;
  exclusions: string;
  additionalContext: string;
}

// ─── Numeric aggregate shapes used by the portfolio analysis ─────────────────

export interface NumericAggregate {
  min: number;
  max: number;
  median: number;
  mean: number;
}

export interface RevenueShareAggregate {
  min: number;
  max: number;
  mean: number;
}

export interface PortfolioAnalysis {
  propertyCount: number;
  // Numeric aggregates (min/max/median/mean)
  rooms: NumericAggregate;
  adr: NumericAggregate;
  occupancy: NumericAggregate;
  maxOccupancy: NumericAggregate;
  purchasePrice: NumericAggregate;
  acreage: NumericAggregate | null;
  buildingSqft: NumericAggregate | null;
  fbSeats: NumericAggregate | null;
  eventSpaceSqft: NumericAggregate | null;
  fbVenues: NumericAggregate | null;
  // Revenue mix
  revShareFB: RevenueShareAggregate | null;
  revShareEvents: RevenueShareAggregate | null;
  // Classifications
  qualityTiers: Record<string, number>;  // tier → count
  businessModels: Record<string, number>;
  countries: string[];
  regions: string[];                     // state/province or city
  locations: Array<{ city?: string; state?: string; country: string }>;
  // Derived
  dominantQualityTier: string;
  dominantBusinessModel: string;
  isInternational: boolean;
  hasFB: boolean;
  hasEvents: boolean;
  fbRating: number; // 1-5 derived from portfolio
}

export interface IcpGenerationResult {
  config: GeneratedIcpConfig;
  descriptive: GeneratedIcpDescriptive;
  portfolioAnalysis: PortfolioAnalysis;
  generatedAt: string;
  source: "portfolio" | "portfolio+ai";
  fieldsFromPortfolio: number;
  fieldsFromDefaults: number;
  fieldsFromAi: number;
}

export interface IcpGenerateOptions {
  /** If provided, call the LLM for qualitative sections. Otherwise portfolio-only. */
  llmCallback?: (prompt: string) => Promise<string>;
}
