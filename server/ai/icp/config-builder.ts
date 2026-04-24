/**
 * server/ai/icp/config-builder.ts — Phase 2 of ICP generation.
 *
 * Builds the structured numeric `GeneratedIcpConfig` from the deterministic
 * portfolio analysis and the global financial assumptions. Returns the count
 * of fields sourced from the portfolio vs. fallback defaults so the caller
 * can attribute the result. No LLM calls.
 */

import type { GlobalAssumptions } from "@shared/schema";
import type {
  GeneratedIcpConfig,
  PortfolioAnalysis,
} from "@shared/icp-types";

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
