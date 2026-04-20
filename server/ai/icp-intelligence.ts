/**
 * icp-intelligence.ts — Auto-generates the ICP (Ideal Customer/Property Profile)
 * from portfolio analysis + AI enhancement.
 *
 * The ICP has 130+ fields. No user will fill them manually. Instead:
 *   Phase 1: Portfolio Reverse-Engineering (deterministic — instant, no AI cost)
 *     Scans all properties → computes min/max/median for every numeric dimension
 *     Ranks amenities by frequency → must/major/nice/no
 *   Phase 2: AI Enhancement (one LLM call — fills qualitative gaps)
 *     Takes portfolio analysis + company description → generates narratives
 *   Phase 3: Financial Derivation (deterministic — from global assumptions + portfolio)
 *     Derives target IRR, fee ranges, hold period from existing financial models
 *
 * The generated ICP then feeds ALL research prompts as rich context.
 */

import type { Property, GlobalAssumptions } from "@shared/schema";
import { logger } from "../logger";

// ─── Types ──────────────────────────────────────────────────────────────

type Priority = "must" | "major" | "nice" | "no";

/** Full structured ICP output matching the client IcpConfig interface */
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

export interface PortfolioAnalysis {
  propertyCount: number;
  // Numeric aggregates (min/max/median/mean)
  rooms: { min: number; max: number; median: number; mean: number };
  adr: { min: number; max: number; median: number; mean: number };
  occupancy: { min: number; max: number; median: number; mean: number };
  maxOccupancy: { min: number; max: number; median: number; mean: number };
  purchasePrice: { min: number; max: number; median: number; mean: number };
  acreage: { min: number; max: number; median: number; mean: number } | null;
  buildingSqft: { min: number; max: number; median: number; mean: number } | null;
  fbSeats: { min: number; max: number; median: number; mean: number } | null;
  eventSpaceSqft: { min: number; max: number; median: number; mean: number } | null;
  fbVenues: { min: number; max: number; median: number; mean: number } | null;
  // Revenue mix
  revShareFB: { min: number; max: number; mean: number } | null;
  revShareEvents: { min: number; max: number; mean: number } | null;
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

// ─── Phase 1: Portfolio Reverse-Engineering ─────────────────────────────

function aggregateNumeric(values: number[]): { min: number; max: number; median: number; mean: number } {
  if (values.length === 0) return { min: 0, max: 0, median: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: Math.round(median),
    mean: Math.round(sum / sorted.length),
  };
}

function aggregateNullable(values: (number | null | undefined)[]): { min: number; max: number; median: number; mean: number } | null {
  const valid = values.filter((v): v is number => v != null && v > 0);
  return valid.length > 0 ? aggregateNumeric(valid) : null;
}

function countMap<T extends string>(values: (T | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) {
    if (v) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

function dominant(counts: Record<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) { best = k; bestCount = v; }
  }
  return best;
}

export function analyzePortfolio(properties: Property[]): PortfolioAnalysis {
  const active = properties.filter(p => p.archivedAt == null);
  if (active.length === 0) {
    return emptyPortfolioAnalysis();
  }

  const rooms = aggregateNumeric(active.map(p => p.roomCount ?? 0).filter(v => v > 0));
  const adr = aggregateNumeric(active.map(p => p.startAdr ?? 0).filter(v => v > 0));
  const occ = aggregateNumeric(active.map(p => (p.startOccupancy ?? 0)).filter(v => v > 0));
  const maxOcc = aggregateNumeric(active.map(p => (p.maxOccupancy ?? 0)).filter(v => v > 0));
  const price = aggregateNumeric(active.map(p => p.purchasePrice ?? 0).filter(v => v > 0));

  const acreage = aggregateNullable(active.map(p => p.totalPropertyAcreage));
  const sqft = aggregateNullable(active.map(p => p.totalBuildingSqft));
  const seats = aggregateNullable(active.map(p => p.fbSeats));
  const eventSqft = aggregateNullable(active.map(p => p.eventSpaceSqft));
  const venues = aggregateNullable(active.map(p => p.fbVenues));

  const fbShares = active.map(p => p.revShareFB).filter((v): v is number => v != null && v > 0);
  const evtShares = active.map(p => p.revShareEvents).filter((v): v is number => v != null && v > 0);

  const qualityTiers = countMap(active.map(p => p.qualityTier));
  const businessModels = countMap(active.map(p => p.businessModel));
  const countries = Array.from(new Set(active.map(p => p.country).filter((c): c is string => c != null)));

  const regions: string[] = [];
  const locations: Array<{ city?: string; state?: string; country: string }> = [];
  for (const p of active) {
    if (p.stateProvince) regions.push(p.stateProvince);
    if (p.city) regions.push(p.city);
    locations.push({
      city: p.city ?? undefined,
      state: p.stateProvince ?? undefined,
      country: p.country ?? "US",
    });
  }

  // F&B rating: 1-5 based on venues and seats
  let fbRating = 1;
  const avgVenues = venues ? venues.mean : 0;
  const avgSeats = seats ? seats.mean : 0;
  if (avgVenues >= 3 && avgSeats >= 60) fbRating = 5;
  else if (avgVenues >= 2 && avgSeats >= 40) fbRating = 4;
  else if (avgVenues >= 1 && avgSeats >= 20) fbRating = 3;
  else if (avgSeats > 0) fbRating = 2;

  return {
    propertyCount: active.length,
    rooms,
    adr,
    occupancy: occ,
    maxOccupancy: maxOcc,
    purchasePrice: price,
    acreage,
    buildingSqft: sqft,
    fbSeats: seats,
    eventSpaceSqft: eventSqft,
    fbVenues: venues,
    revShareFB: fbShares.length > 0 ? { min: Math.min(...fbShares), max: Math.max(...fbShares), mean: fbShares.reduce((s, v) => s + v, 0) / fbShares.length } : null,
    revShareEvents: evtShares.length > 0 ? { min: Math.min(...evtShares), max: Math.max(...evtShares), mean: evtShares.reduce((s, v) => s + v, 0) / evtShares.length } : null,
    qualityTiers,
    businessModels,
    countries,
    regions: Array.from(new Set(regions)),
    locations,
    dominantQualityTier: dominant(qualityTiers) || "upscale",
    dominantBusinessModel: dominant(businessModels) || "hotel",
    isInternational: countries.length > 1 || (countries.length === 1 && countries[0] !== "US" && countries[0] !== "United States"),
    hasFB: (venues?.mean ?? 0) > 0 || fbShares.length > 0,
    hasEvents: (eventSqft?.mean ?? 0) > 0 || evtShares.length > 0,
    fbRating,
  };
}

function emptyPortfolioAnalysis(): PortfolioAnalysis {
  const zero = { min: 0, max: 0, median: 0, mean: 0 };
  return {
    propertyCount: 0,
    rooms: zero, adr: zero, occupancy: zero, maxOccupancy: zero, purchasePrice: zero,
    acreage: null, buildingSqft: null, fbSeats: null, eventSpaceSqft: null, fbVenues: null,
    revShareFB: null, revShareEvents: null,
    qualityTiers: {}, businessModels: {}, countries: [], regions: [], locations: [],
    dominantQualityTier: "upscale", dominantBusinessModel: "hotel",
    isInternational: false, hasFB: false, hasEvents: false, fbRating: 1,
  };
}

// ─── Phase 2: Build ICP Config from Portfolio ───────────────────────────

/** Sensible defaults used when portfolio has no data for a dimension */
const FALLBACK = {
  roomsMin: 5, roomsMax: 20, masterSuitesMin: 1, masterSuiteSqFt: 350,
  bedroomsMin: 5, bedroomsMax: 25, bathroomsMin: 5, bathroomsMax: 25, halfBaths: 2,
  landAcresMin: 2, landAcresMax: 50, builtSqFtMin: 5000, builtSqFtMax: 25000, livingAreas: 2,
  diningCapacityMin: 20, diningCapacityMax: 60, indoorEventMin: 30, indoorEventMax: 100,
  outdoorEventMin: 50, outdoorEventMax: 150, parkingMin: 15, parkingMax: 50,
  kitchenSqFt: 800, maintenanceSqFt: 600, staffQuartersMin: 2, staffQuartersMax: 6, staffHousingUnits: 2,
  maxRoofAge: 15, minElectricalAmps: 200, maxRenovationBudget: 3000000,
  minSetbackFt: 150, minDrivewayFt: 300,
  maxAirportMin: 90, prefAirportMin: 45, maxIntlAirportMin: 150, prefIntlAirportMin: 90,
  maxHospitalMin: 30, prefHospitalMin: 15,
  ffePerRoomMin: 12000, ffePerRoomMax: 30000,
  occupancyRampMonths: 18,
  spaShareMin: 5, spaShareMax: 15, otherShareMin: 3, otherShareMax: 10,
  targetIrr: 18, equityMultipleMin: 2.0, equityMultipleMax: 3.0,
  holdYearsMin: 7, holdYearsMax: 10,
};

export function buildIcpConfigFromPortfolio(
  analysis: PortfolioAnalysis,
  ga: GlobalAssumptions | null,
): { config: GeneratedIcpConfig; fieldsFromPortfolio: number; fieldsFromDefaults: number } {
  let fromPortfolio = 0;
  let fromDefaults = 0;

  /** Use portfolio data if available, else fallback */
  function fromAgg(agg: { min: number; max: number; median?: number; mean?: number } | null, fallbackMin: number, fallbackMax: number, padPct = 0.2): { lo: number; hi: number } {
    if (agg && agg.max > 0) {
      fromPortfolio += 2;
      const span = agg.max - agg.min;
      const meanVal = agg.mean ?? (agg.min + agg.max) / 2;
      const pad = Math.max(span * padPct, meanVal * 0.1);
      return {
        lo: Math.max(0, Math.round(agg.min - pad)),
        hi: Math.round(agg.max + pad),
      };
    }
    fromDefaults += 2;
    return { lo: fallbackMin, hi: fallbackMax };
  }

  function _fromAggSingle(agg: { mean: number } | null, fallback: number): number {
    if (agg && agg.mean > 0) { fromPortfolio++; return Math.round(agg.mean); }
    fromDefaults++;
    return fallback;
  }

  // Rooms
  const rooms = fromAgg(analysis.rooms, FALLBACK.roomsMin, FALLBACK.roomsMax, 0.15);
  const roomsSweet = analysis.rooms.max > 0
    ? { lo: Math.round(analysis.rooms.median * 0.85), hi: Math.round(analysis.rooms.median * 1.15) }
    : { lo: Math.round((FALLBACK.roomsMin + FALLBACK.roomsMax) * 0.4), hi: Math.round((FALLBACK.roomsMin + FALLBACK.roomsMax) * 0.6) };

  // ADR
  const adr = fromAgg(analysis.adr, 150, 400, 0.15);

  // Occupancy (stored as 0-1, ICP uses 0-100)
  const occPct = analysis.occupancy.max > 0
    ? {
        lo: Math.round((analysis.occupancy.min > 1 ? analysis.occupancy.min : analysis.occupancy.min * 100) * 0.9),
        hi: Math.round((analysis.occupancy.max > 1 ? analysis.occupancy.max : analysis.occupancy.max * 100) * 1.05),
      }
    : { lo: 55, hi: 80 };
  if (analysis.occupancy.max > 0) fromPortfolio += 2; else fromDefaults += 2;

  // RevPAR derived from ADR × occupancy
  const avgOcc = analysis.occupancy.mean > 0
    ? (analysis.occupancy.mean > 1 ? analysis.occupancy.mean / 100 : analysis.occupancy.mean)
    : 0.65;
  const revPar = { lo: Math.round(adr.lo * avgOcc * 0.9), hi: Math.round(adr.hi * avgOcc * 1.05) };

  // Purchase price / acquisition
  const acq = fromAgg(analysis.purchasePrice, 1000000, 5000000, 0.2);
  const acqTarget = analysis.purchasePrice.max > 0
    ? { lo: Math.round(analysis.purchasePrice.median * 0.8), hi: Math.round(analysis.purchasePrice.median * 1.2) }
    : { lo: 1500000, hi: 4000000 };

  // Renovation estimate (30-60% of acquisition as rule of thumb for conversions)
  const renMin = Math.round(acq.lo * 0.25);
  const renMax = Math.round(acq.hi * 0.5);

  // Total investment
  const totalInvMin = acq.lo + renMin;
  const totalInvMax = acq.hi + renMax;

  // Land & building
  const land = fromAgg(analysis.acreage, FALLBACK.landAcresMin, FALLBACK.landAcresMax, 0.25);
  const sqft = fromAgg(analysis.buildingSqft, FALLBACK.builtSqFtMin, FALLBACK.builtSqFtMax, 0.2);

  // Dining & events
  const dining = fromAgg(analysis.fbSeats, FALLBACK.diningCapacityMin, FALLBACK.diningCapacityMax, 0.2);
  const eventSqft = analysis.eventSpaceSqft;
  const indoorEvent = eventSqft
    ? { lo: Math.round(eventSqft.min * 0.6 * 0.8), hi: Math.round(eventSqft.max * 0.6 * 1.2) }
    : { lo: FALLBACK.indoorEventMin, hi: FALLBACK.indoorEventMax };
  const outdoorEvent = eventSqft
    ? { lo: Math.round(eventSqft.min * 0.4 * 0.8), hi: Math.round(eventSqft.max * 0.4 * 1.2) }
    : { lo: FALLBACK.outdoorEventMin, hi: FALLBACK.outdoorEventMax };

  // Revenue shares (stored as 0-1, ICP uses 0-100)
  const fbShare = analysis.revShareFB
    ? { lo: Math.round((analysis.revShareFB.min > 1 ? analysis.revShareFB.min : analysis.revShareFB.min * 100) * 0.9), hi: Math.round((analysis.revShareFB.max > 1 ? analysis.revShareFB.max : analysis.revShareFB.max * 100) * 1.1) }
    : { lo: 25, hi: 50 };
  const evtShare = analysis.revShareEvents
    ? { lo: Math.round((analysis.revShareEvents.min > 1 ? analysis.revShareEvents.min : analysis.revShareEvents.min * 100) * 0.9), hi: Math.round((analysis.revShareEvents.max > 1 ? analysis.revShareEvents.max : analysis.revShareEvents.max * 100) * 1.1) }
    : { lo: 15, hi: 40 };
  const totalAncillary = { lo: fbShare.lo + evtShare.lo + FALLBACK.spaShareMin, hi: Math.min(fbShare.hi + evtShare.hi + FALLBACK.spaShareMax, 85) };

  // Fees from global assumptions
  const baseFeeMin = ga?.baseManagementFee != null ? Math.round((ga.baseManagementFee as number) * 100 * 0.8) : 3;
  const baseFeeMax = ga?.baseManagementFee != null ? Math.round((ga.baseManagementFee as number) * 100 * 1.2) : 5;
  const incFeeMin = ga?.incentiveManagementFee != null ? Math.round((ga.incentiveManagementFee as number) * 100 * 0.8) : 8;
  const incFeeMax = ga?.incentiveManagementFee != null ? Math.round((ga.incentiveManagementFee as number) * 100 * 1.2) : 15;

  // Exit cap rate from global
  const exitCapMin = ga?.exitCapRate != null ? Math.round((ga.exitCapRate as number) * 100 * 0.85) : 7;
  const exitCapMax = ga?.exitCapRate != null ? Math.round((ga.exitCapRate as number) * 100 * 1.15) : 10;

  // Amenities: ranked by description/quality tier (since we don't have per-property amenity booleans)
  const isLuxury = analysis.dominantQualityTier === "luxury" || analysis.dominantQualityTier === "premium";
  const isWellness = (ga?.assetDescription || "").toLowerCase().includes("wellness");

  const config: GeneratedIcpConfig = {
    roomsMin: rooms.lo,
    roomsMax: rooms.hi,
    roomsSweetSpotMin: roomsSweet.lo,
    roomsSweetSpotMax: roomsSweet.hi,
    masterSuitesMin: FALLBACK.masterSuitesMin,
    masterSuiteSqFt: FALLBACK.masterSuiteSqFt,
    bedroomsMin: rooms.lo,
    bedroomsMax: Math.round(rooms.hi * 1.2),
    bathroomsMin: rooms.lo,
    bathroomsMax: Math.round(rooms.hi * 1.1),
    halfBaths: FALLBACK.halfBaths,

    landAcresMin: land.lo,
    landAcresMax: land.hi,
    builtSqFtMin: sqft.lo,
    builtSqFtMax: sqft.hi,
    livingAreas: FALLBACK.livingAreas,

    diningCapacityMin: dining.lo,
    diningCapacityMax: dining.hi,
    indoorEventMin: indoorEvent.lo,
    indoorEventMax: indoorEvent.hi,
    outdoorEventMin: outdoorEvent.lo,
    outdoorEventMax: outdoorEvent.hi,
    parkingMin: Math.max(rooms.lo * 2, 10),
    parkingMax: Math.max(rooms.hi * 3, 30),

    kitchenSqFt: analysis.hasFB ? Math.max(FALLBACK.kitchenSqFt, dining.hi * 15) : FALLBACK.kitchenSqFt,
    maintenanceSqFt: FALLBACK.maintenanceSqFt,
    staffQuartersMin: FALLBACK.staffQuartersMin,
    staffQuartersMax: FALLBACK.staffQuartersMax,
    staffHousingUnits: FALLBACK.staffHousingUnits,

    // Amenity priorities — intelligent based on quality tier and business model
    pool: isLuxury ? "must" : "major",
    poolSqFt: 400,
    secondPool: isLuxury ? "nice" : "no",
    hotTub: isLuxury ? "major" : "nice",
    spa: isWellness ? "must" : isLuxury ? "major" : "nice",
    spaTreatmentRooms: isWellness ? 4 : isLuxury ? 2 : 1,
    sauna: isWellness ? "must" : "nice",
    steamRoom: isWellness ? "major" : "nice",
    coldPlunge: isWellness ? "must" : "nice",
    yogaStudio: isWellness ? "must" : "nice",
    gym: isLuxury ? "major" : "nice",
    gymSqFtMin: 400,
    gymSqFtMax: 1200,
    tennis: "nice",
    tennisCourts: 1,
    pickleball: "nice",
    pickleballCourts: 1,
    basketball: "no",
    hikingTrails: analysis.dominantBusinessModel === "lodge" ? "major" : "nice",
    horseFacilities: "nice",
    horseStalls: 4,
    pastureAcres: 5,
    garden: isLuxury ? "major" : "nice",
    vineyard: "nice",
    casitas: analysis.dominantBusinessModel === "lodge" ? "major" : "nice",
    casitasCount: 3,
    barn: analysis.hasEvents ? "major" : "nice",
    glamping: "nice",
    greenhouse: "nice",
    chapel: analysis.hasEvents ? "nice" : "no",
    firePit: "major",
    wineCellar: isLuxury ? "nice" : "no",
    gameRoom: "nice",
    library: isLuxury ? "nice" : "no",
    outdoorKitchen: analysis.hasFB ? "major" : "nice",
    garageBays: 4,

    maxRoofAge: FALLBACK.maxRoofAge,
    minElectricalAmps: FALLBACK.minElectricalAmps,
    maxRenovationBudget: renMax,
    minSetbackFt: FALLBACK.minSetbackFt,
    minDrivewayFt: FALLBACK.minDrivewayFt,
    maxAirportMin: analysis.isInternational ? 120 : FALLBACK.maxAirportMin,
    prefAirportMin: FALLBACK.prefAirportMin,
    maxIntlAirportMin: analysis.isInternational ? 180 : FALLBACK.maxIntlAirportMin,
    prefIntlAirportMin: FALLBACK.prefIntlAirportMin,
    maxHospitalMin: FALLBACK.maxHospitalMin,
    prefHospitalMin: FALLBACK.prefHospitalMin,

    acquisitionMin: acq.lo,
    acquisitionMax: acq.hi,
    acquisitionTargetMin: acqTarget.lo,
    acquisitionTargetMax: acqTarget.hi,
    totalInvestmentMin: totalInvMin,
    totalInvestmentMax: totalInvMax,
    renovationMin: renMin,
    renovationMax: renMax,
    ffePerRoomMin: FALLBACK.ffePerRoomMin,
    ffePerRoomMax: FALLBACK.ffePerRoomMax,
    adrMin: adr.lo,
    adrMax: adr.hi,
    occupancyMin: occPct.lo,
    occupancyMax: Math.min(occPct.hi, 95),
    occupancyRampMonths: FALLBACK.occupancyRampMonths,
    revParMin: revPar.lo,
    revParMax: revPar.hi,
    fbShareMin: fbShare.lo,
    fbShareMax: fbShare.hi,
    eventsShareMin: evtShare.lo,
    eventsShareMax: evtShare.hi,
    spaShareMin: FALLBACK.spaShareMin,
    spaShareMax: FALLBACK.spaShareMax,
    otherShareMin: FALLBACK.otherShareMin,
    otherShareMax: FALLBACK.otherShareMax,
    totalAncillaryMin: totalAncillary.lo,
    totalAncillaryMax: totalAncillary.hi,
    baseMgmtFeeMin: baseFeeMin,
    baseMgmtFeeMax: baseFeeMax,
    incentiveFeeMin: incFeeMin,
    incentiveFeeMax: incFeeMax,
    exitCapRateMin: exitCapMin,
    exitCapRateMax: exitCapMax,
    targetIrr: FALLBACK.targetIrr,
    equityMultipleMin: FALLBACK.equityMultipleMin,
    equityMultipleMax: FALLBACK.equityMultipleMax,
    holdYearsMin: FALLBACK.holdYearsMin,
    holdYearsMax: FALLBACK.holdYearsMax,
    fbRating: analysis.fbRating,
  };

  return { config, fieldsFromPortfolio: fromPortfolio, fieldsFromDefaults: fromDefaults };
}

// ─── Phase 2: AI-Generated Qualitative Sections ─────────────────────────

/**
 * Build the LLM prompt that generates the qualitative ICP sections.
 * This is a SINGLE call that produces all 9 descriptive fields + the ICP essay.
 */
export function buildIcpGenerationPrompt(
  analysis: PortfolioAnalysis,
  ga: GlobalAssumptions | null,
  config: GeneratedIcpConfig,
): string {
  const companyName = ga?.companyName || "Management Company";
  const description = ga?.assetDescription || "";
  const propertyLabel = ga?.propertyLabel || "Hotel";

  const locationList = analysis.locations.map(l =>
    [l.city, l.state, l.country].filter(Boolean).join(", ")
  ).join("; ");

  const tierList = Object.entries(analysis.qualityTiers).map(([k, v]) => `${k}: ${v}`).join(", ");
  const modelList = Object.entries(analysis.businessModels).map(([k, v]) => `${k}: ${v}`).join(", ");

  return `You are a hospitality investment analyst writing the Ideal Customer Profile (ICP) for a boutique hospitality management company.

## COMPANY CONTEXT
- **Company:** ${companyName}
- **Description:** ${description || "Boutique hospitality management company"}
- **Property Label:** ${propertyLabel}

## PORTFOLIO ANALYSIS (${analysis.propertyCount} properties)
- **Rooms:** ${analysis.rooms.min}–${analysis.rooms.max} (median ${analysis.rooms.median})
- **ADR:** $${analysis.adr.min}–$${analysis.adr.max} (median $${analysis.adr.median})
- **Purchase Price:** $${fmtK(analysis.purchasePrice.min)}–$${fmtK(analysis.purchasePrice.max)}
- **Quality Tiers:** ${tierList || "not classified"}
- **Business Models:** ${modelList || "hotel"}
- **Locations:** ${locationList || "not specified"}
- **Countries:** ${analysis.countries.join(", ") || "US"}
- **International:** ${analysis.isInternational ? "Yes" : "No"}
- **F&B Operations:** ${analysis.hasFB ? "Yes" : "No"}${analysis.fbSeats ? ` (${analysis.fbSeats.min}–${analysis.fbSeats.max} seats)` : ""}
- **Event Capability:** ${analysis.hasEvents ? "Yes" : "No"}${analysis.eventSpaceSqft ? ` (${analysis.eventSpaceSqft.min}–${analysis.eventSpaceSqft.max} sqft)` : ""}
- **Acreage:** ${analysis.acreage ? `${analysis.acreage.min}–${analysis.acreage.max} acres` : "not recorded"}
- **Building Size:** ${analysis.buildingSqft ? `${fmtK(analysis.buildingSqft.min)}–${fmtK(analysis.buildingSqft.max)} sqft` : "not recorded"}
- **Revenue Mix (F&B):** ${analysis.revShareFB ? `${pctDisplay(analysis.revShareFB.min)}–${pctDisplay(analysis.revShareFB.max)}` : "not set"}
- **Revenue Mix (Events):** ${analysis.revShareEvents ? `${pctDisplay(analysis.revShareEvents.min)}–${pctDisplay(analysis.revShareEvents.max)}` : "not set"}

## DERIVED ICP PARAMETERS
- **Target Rooms:** ${config.roomsMin}–${config.roomsMax} (sweet spot ${config.roomsSweetSpotMin}–${config.roomsSweetSpotMax})
- **Target ADR:** $${config.adrMin}–$${config.adrMax}
- **Target Acquisition:** $${fmtK(config.acquisitionMin)}–$${fmtK(config.acquisitionMax)}
- **F&B Rating:** ${config.fbRating}/5
- **Dominant Quality:** ${analysis.dominantQualityTier}
- **Dominant Model:** ${analysis.dominantBusinessModel}

## TASK

Generate the following 10 sections for this company's ICP. Each section should be specific to THIS company's portfolio, markets, and strategy — NOT generic hospitality copy. Reference actual locations, property types, and financial parameters from the portfolio above.

Return a JSON object with these exact keys:

\`\`\`json
{
  "propertyTypes": "<2-3 sentences describing ideal property types based on the portfolio pattern>",
  "fbLevel": "<2-3 sentences describing F&B operations requirements based on portfolio>",
  "locationCharacteristics": "<2-3 sentences describing ideal location traits based on where current properties are>",
  "locationDetails": "<Paragraph per geographic region where the company operates or targets, with evocative descriptions of each market. Include current portfolio locations AND 2-3 logical expansion markets.>",
  "conditionNotes": "<2-3 sentences on property condition requirements>",
  "groundsTopography": "<2-3 sentences on grounds/landscape preferences based on portfolio>",
  "vendorServices": "<Brief bullet list of vendor service categories the management company coordinates>",
  "regulatoryNotes": "<2-3 sentences on regulatory requirements based on the markets the company operates in>",
  "exclusions": "<Bulleted list of property types and situations to exclude, based on what the company does NOT do>",
  "icpEssay": "<A 3-5 paragraph investment-ready narrative essay summarizing the complete ICP. This goes into investor presentations. Professional, specific, data-backed.>"
}
\`\`\`

Do not output any text outside the JSON code block.`;
}

function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

function pctDisplay(v: number): string {
  // Handle both 0-1 and 0-100 formats
  const pct = v > 1 ? v : v * 100;
  return `${Math.round(pct)}%`;
}

// ─── Phase 3: Full Generation Orchestrator ──────────────────────────────

export interface IcpGenerateOptions {
  /** If provided, call the LLM for qualitative sections. Otherwise portfolio-only. */
  llmCallback?: (prompt: string) => Promise<string>;
}

/**
 * Generate the complete ICP from portfolio + global assumptions + optional AI.
 * This is the main entry point.
 */
export async function generateIcp(
  properties: Property[],
  ga: GlobalAssumptions | null,
  options: IcpGenerateOptions = {},
): Promise<IcpGenerationResult> {
  const startTime = Date.now();

  // Phase 1: Portfolio analysis (deterministic)
  const analysis = analyzePortfolio(properties);
  logger.info(`ICP: Portfolio analysis complete — ${analysis.propertyCount} properties`, "icp");

  // Phase 2: Build numeric config from portfolio
  const { config, fieldsFromPortfolio, fieldsFromDefaults } = buildIcpConfigFromPortfolio(analysis, ga);
  logger.info(`ICP: Config built — ${fieldsFromPortfolio} from portfolio, ${fieldsFromDefaults} from defaults`, "icp");

  // Phase 3: AI-generated qualitative sections (optional)
  let descriptive: GeneratedIcpDescriptive;
  let fieldsFromAi = 0;
  let source: "portfolio" | "portfolio+ai" = "portfolio";

  if (options.llmCallback && analysis.propertyCount > 0) {
    try {
      const prompt = buildIcpGenerationPrompt(analysis, ga, config);
      const rawResponse = await options.llmCallback(prompt);

      // Extract JSON from response
      const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)```/) || rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        descriptive = {
          propertyTypes: parsed.propertyTypes || buildFallbackPropertyTypes(analysis, ga),
          fbLevel: parsed.fbLevel || buildFallbackFbLevel(analysis),
          locationCharacteristics: parsed.locationCharacteristics || buildFallbackLocationCharacteristics(analysis),
          locationDetails: parsed.locationDetails || buildFallbackLocationDetails(analysis),
          conditionNotes: parsed.conditionNotes || "Good to excellent structural condition. Cosmetic renovation acceptable.",
          groundsTopography: parsed.groundsTopography || "Gentle terrain, mature landscaping, privacy from public roads.",
          vendorServices: parsed.vendorServices || "IT, housekeeping, grounds, professional services, F&B purveyors.",
          regulatoryNotes: parsed.regulatoryNotes || "Must have clear zoning path for hospitality/commercial use.",
          exclusions: parsed.exclusions || "Urban high-rises, chain hotels, properties above 50 rooms.",
          additionalContext: "",
        };
        // Store the essay separately — it goes into icpConfig._definition
        if (parsed.icpEssay) {
          (descriptive as unknown as Record<string, unknown>)._icpEssay = parsed.icpEssay;
        }
        fieldsFromAi = Object.keys(parsed).length;
        source = "portfolio+ai";
        logger.info(`ICP: AI enhancement complete — ${fieldsFromAi} sections generated`, "icp");
      } else {
        throw new Error("No JSON found in LLM response");
      }
    } catch (err: unknown) {
      logger.warn(`ICP: AI enhancement failed, using portfolio-only fallbacks — ${err instanceof Error ? err.message : err}`, "icp");
      descriptive = buildFallbackDescriptive(analysis, ga);
    }
  } else {
    descriptive = buildFallbackDescriptive(analysis, ga);
  }

  const elapsed = Date.now() - startTime;
  logger.info(`ICP: Generation complete in ${elapsed}ms (source: ${source})`, "icp");

  return {
    config,
    descriptive,
    portfolioAnalysis: analysis,
    generatedAt: new Date().toISOString(),
    source,
    fieldsFromPortfolio,
    fieldsFromDefaults,
    fieldsFromAi,
  };
}

// ─── Fallback Descriptive Builders (no AI needed) ───────────────────────

function buildFallbackDescriptive(analysis: PortfolioAnalysis, ga: GlobalAssumptions | null): GeneratedIcpDescriptive {
  return {
    propertyTypes: buildFallbackPropertyTypes(analysis, ga),
    fbLevel: buildFallbackFbLevel(analysis),
    locationCharacteristics: buildFallbackLocationCharacteristics(analysis),
    locationDetails: buildFallbackLocationDetails(analysis),
    conditionNotes: "Property in good to excellent structural condition. Cosmetic renovation acceptable but no major structural remediation required. Unique architectural character preferred.",
    groundsTopography: "Gentle rolling hills, flat meadows, or terraced hillside. Mature landscaping preferred. Water features valued. Mountain, valley, or pastoral views.",
    vendorServices: "The management company coordinates: IT/PMS, housekeeping, grounds maintenance, professional services (accounting, legal, insurance), F&B purveyors, marketing/PR.",
    regulatoryNotes: "Clear zoning for hospitality/commercial use or demonstrable path to re-zoning. Building permits must allow conversion within 6–18 months. Fire, ADA, and health department compliance required.",
    exclusions: `Properties requiring more than $${fmtK(analysis.purchasePrice.max * 0.5)} in structural renovation\nUrban high-rise or mid-rise buildings\nProperties below ${Math.max(analysis.rooms.min - 2, 3)} rooms or above ${analysis.rooms.max + 20} rooms\nChain-affiliated or conventional box hotels\nTimeshare, fractional ownership, or condo-hotel structures`,
    additionalContext: "",
  };
}

function buildFallbackPropertyTypes(analysis: PortfolioAnalysis, ga: GlobalAssumptions | null): string {
  const tier = analysis.dominantQualityTier;
  const model = analysis.dominantBusinessModel;
  const label = ga?.propertyLabel || "hotel";
  const parts: string[] = [];
  parts.push(`${capitalize(tier)} boutique ${label}`);
  if (model === "lodge") parts.push("lodge, manor, or large private estate");
  else parts.push("estate hotel, hacienda, or large private residence");
  parts.push("suitable for conversion into a full-service hospitality operation");
  return parts.join(", ") + ". Properties must convey exclusivity, architectural character, and a strong sense of place.";
}

function buildFallbackFbLevel(analysis: PortfolioAnalysis): string {
  if (analysis.fbRating >= 4) return "Full-service F&B operation with chef-driven restaurant, bar/lounge program, room service, and event catering. Farm-to-table or locally sourced menus preferred.";
  if (analysis.fbRating >= 3) return "Full breakfast service with dinner offerings. Capacity for private dining and event catering.";
  if (analysis.fbRating >= 2) return "Limited food and beverage with light meal options. Breakfast included in rate.";
  return "Continental breakfast only. No on-site restaurant required.";
}

function buildFallbackLocationCharacteristics(analysis: PortfolioAnalysis): string {
  const parts: string[] = ["Secluded or estate-like setting with near-total privacy"];
  if (analysis.isInternational) parts.push("International markets with strong tourism demand");
  else parts.push("Proximity to tourism demand generators");
  parts.push("Accessible by paved road year-round");
  return parts.join(". ") + ".";
}

function buildFallbackLocationDetails(analysis: PortfolioAnalysis): string {
  if (analysis.locations.length === 0) return "Geographic targets to be determined based on portfolio growth.";
  const byCountry: Record<string, string[]> = {};
  for (const loc of analysis.locations) {
    const key = loc.country;
    if (!byCountry[key]) byCountry[key] = [];
    const label = [loc.city, loc.state].filter(Boolean).join(", ");
    if (label) byCountry[key].push(label);
  }
  return Object.entries(byCountry)
    .map(([country, locs]) => `${country}: ${Array.from(new Set(locs)).join("; ")}`)
    .join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── ICP Narrative for Research Prompts ─────────────────────────────────

/**
 * Build a rich ICP narrative for injection into research prompts.
 * Replaces the weak 5-field buildIcpNarrative() in company-pack.ts.
 */
export function buildFullIcpNarrative(
  config: GeneratedIcpConfig | Record<string, any>,
  descriptive: GeneratedIcpDescriptive | Record<string, any>,
  companyName: string,
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic field access for narrative template
  const c = config as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic field access for narrative template
  const d = descriptive as Record<string, any>;

  const sections: string[] = [];

  sections.push(`## Ideal Customer Profile — ${companyName}`);

  // Property targeting
  sections.push(`### Target Property Profile
- **Rooms:** ${c.roomsMin ?? "?"}–${c.roomsMax ?? "?"} (sweet spot ${c.roomsSweetSpotMin ?? "?"}–${c.roomsSweetSpotMax ?? "?"})
- **Land:** ${c.landAcresMin ?? "?"}–${c.landAcresMax ?? "?"} acres
- **Building:** ${fmtK(c.builtSqFtMin ?? 0)}–${fmtK(c.builtSqFtMax ?? 0)} sqft
- **ADR Target:** $${c.adrMin ?? "?"}–$${c.adrMax ?? "?"}
- **Occupancy Target:** ${c.occupancyMin ?? "?"}%–${c.occupancyMax ?? "?"}%
- **F&B Rating:** ${c.fbRating ?? "?"}/5
- **Property Types:** ${d.propertyTypes || "Not specified"}`);

  // Financial targets
  sections.push(`### Financial Criteria
- **Acquisition:** $${fmtK(c.acquisitionMin ?? 0)}–$${fmtK(c.acquisitionMax ?? 0)} (target $${fmtK(c.acquisitionTargetMin ?? 0)}–$${fmtK(c.acquisitionTargetMax ?? 0)})
- **Total Investment:** $${fmtK(c.totalInvestmentMin ?? 0)}–$${fmtK(c.totalInvestmentMax ?? 0)}
- **Renovation:** $${fmtK(c.renovationMin ?? 0)}–$${fmtK(c.renovationMax ?? 0)}
- **Target IRR:** ${c.targetIrr ?? "?"}%
- **Equity Multiple:** ${c.equityMultipleMin ?? "?"}x–${c.equityMultipleMax ?? "?"}x
- **Hold Period:** ${c.holdYearsMin ?? "?"}–${c.holdYearsMax ?? "?"} years
- **Exit Cap Rate:** ${c.exitCapRateMin ?? "?"}%–${c.exitCapRateMax ?? "?"}%`);

  // Revenue mix
  sections.push(`### Revenue Mix Targets
- **F&B Share:** ${c.fbShareMin ?? "?"}%–${c.fbShareMax ?? "?"}%
- **Events Share:** ${c.eventsShareMin ?? "?"}%–${c.eventsShareMax ?? "?"}%
- **Total Ancillary:** ${c.totalAncillaryMin ?? "?"}%–${c.totalAncillaryMax ?? "?"}%
- **Management Fee:** ${c.baseMgmtFeeMin ?? "?"}%–${c.baseMgmtFeeMax ?? "?"}% base, ${c.incentiveFeeMin ?? "?"}%–${c.incentiveFeeMax ?? "?"}% incentive`);

  // Key amenities
  const mustHave = [];
  const majorPlus = [];
  for (const [key, val] of Object.entries(c)) {
    if (val === "must") mustHave.push(key);
    else if (val === "major") majorPlus.push(key);
  }
  if (mustHave.length > 0 || majorPlus.length > 0) {
    sections.push(`### Amenity Requirements
- **Must Have:** ${mustHave.join(", ") || "none specified"}
- **Major Plus:** ${majorPlus.join(", ") || "none specified"}`);
  }

  // Location
  if (d.locationCharacteristics || d.locationDetails) {
    sections.push(`### Location Strategy
${d.locationCharacteristics || ""}
${d.locationDetails ? `\n**Markets:**\n${d.locationDetails}` : ""}`);
  }

  // Exclusions
  if (d.exclusions) {
    sections.push(`### Exclusions
${d.exclusions}`);
  }

  return sections.join("\n\n");
}
