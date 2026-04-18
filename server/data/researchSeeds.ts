import type { ResearchValueMap, ResearchValueEntry } from "../../shared/schema";
import { CITATIONS } from "@shared/citations";

interface LocationContext {
  location: string;
  streetAddress?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  zipPostalCode?: string | null;
  country?: string | null;
  market: string;
}

type RegionProfile = {
  adr: [number, number, number];
  occupancy: [number, number, number];
  startOccupancy: [number, number, number];
  rampMonths: [number, number, number];
  capRate: [number, number, number];
  catering: [number, number, number];
  landValue: [number, number, number];
  costHousekeeping: [number, number, number];
  costFB: [number, number, number];
  costAdmin: [number, number, number];
  costPropertyOps: [number, number, number];
  costUtilities: [number, number, number];
  costFFE: [number, number, number];
  costMarketing: [number, number, number];
  costIT: [number, number, number];
  costOther: [number, number, number];
  costPropertyTaxes: [number, number, number];
  svcFeeMarketing: [number, number, number];
  svcFeeTechRes: [number, number, number];
  svcFeeAccounting: [number, number, number];
  svcFeeRevMgmt: [number, number, number];
  svcFeeGeneralMgmt: [number, number, number];
  svcFeeProcurement: [number, number, number];
  incentiveFee: [number, number, number];
  incomeTax: [number, number, number];
  saleCommission: [number, number, number];
  acqLtv: [number, number, number];
  acqRate: [number, number, number];
  refiLtv: [number, number, number];
  adrGrowth: [number, number, number];
  occupancyStep: [number, number, number];
  revShareEvents: [number, number, number];
  revShareFB: [number, number, number];
  revShareOther: [number, number, number];
};

const US_BASE: RegionProfile = {
  adr: [175, 193, 225],
  occupancy: [65, 69, 73],
  startOccupancy: [30, 40, 45],
  rampMonths: [12, 18, 24],
  capRate: [8.0, 8.5, 9.5],
  catering: [25, 30, 35],
  landValue: [15, 20, 25],
  costHousekeeping: [15, 20, 22],
  costFB: [7, 9, 12],
  costAdmin: [4, 5, 7],
  costPropertyOps: [3, 4, 5],
  costUtilities: [2.9, 3.3, 4.0],
  costFFE: [3, 4, 5],
  costMarketing: [1, 2, 3],
  costIT: [0.5, 1, 1.5],
  costOther: [3, 5, 6],
  costPropertyTaxes: [1.0, 1.5, 2.5],
  svcFeeMarketing: [0.5, 1.0, 1.5],
  svcFeeTechRes: [1.0, 2.0, 2.5],
  svcFeeAccounting: [0.5, 1.0, 1.5],
  svcFeeRevMgmt: [0.5, 1.0, 1.5],
  svcFeeGeneralMgmt: [0.7, 1.0, 1.2],
  svcFeeProcurement: [0.5, 0.8, 1.0],
  incentiveFee: [8, 10, 12],
  incomeTax: [24, 25, 28],
  saleCommission: [4, 5, 6],
  acqLtv: [60, 70, 75],
  acqRate: [7.5, 8.5, 9.5],
  refiLtv: [55, 65, 70],
  adrGrowth: [2, 3, 5],
  occupancyStep: [3, 5, 7],
  revShareEvents: [35, 43, 55],
  revShareFB: [18, 22, 28],
  revShareOther: [5, 7, 10],
};

function regionFromLocation(ctx: LocationContext): string {
  const loc = [ctx.location, ctx.city, ctx.stateProvince, ctx.country].filter(Boolean).join(" ").toLowerCase();

  if (/new york|nyc|manhattan|brooklyn|rhinebeck|hudson valley/i.test(loc)) return "ny_metro";
  if (/miami|fort lauderdale|palm beach|south florida|key west/i.test(loc)) return "south_florida";
  if (/los angeles|san francisco|san diego|california|napa|sonoma/i.test(loc)) return "california";
  if (/austin|dallas|houston|san antonio|texas/i.test(loc)) return "texas";
  if (/asheville|charleston|savannah|nashville|north carolina|tennessee|georgia|south carolina/i.test(loc)) return "southeast_resort";
  if (/eden|park city|utah|salt lake|moab/i.test(loc)) return "mountain_west";
  if (/hawaii|maui|oahu|kauai|big island/i.test(loc)) return "hawaii";
  if (/chicago|detroit|minneapolis|midwest|illinois|michigan|ohio|indiana|wisconsin/i.test(loc)) return "midwest";
  if (/boston|new england|maine|vermont|connecticut|massachusetts|new hampshire/i.test(loc)) return "new_england";
  if (/seattle|portland|oregon|washington/i.test(loc)) return "pacific_northwest";
  if (/colorado|aspen|vail|denver|telluride/i.test(loc)) return "colorado";
  if (/arizona|scottsdale|sedona|phoenix/i.test(loc)) return "arizona";

  if (/m[eé]dell[ií]n|bogot[aá]|cartagena|colombia/i.test(loc)) return "colombia";
  if (/mexico|cancun|tulum|cabo|playa del carmen|oaxaca|san miguel/i.test(loc)) return "mexico";
  if (/costa rica|guanacaste|monteverde|la fortuna/i.test(loc)) return "costa_rica";
  if (/panama|belize|guatemala|honduras|nicaragua/i.test(loc)) return "central_america";
  if (/brazil|rio|são paulo|bahia/i.test(loc)) return "brazil";
  if (/argentina|buenos aires|mendoza|patagonia/i.test(loc)) return "argentina";
  if (/caribbean|jamaica|bahamas|barbados|st\.|turks|caicos|antigua|dominican/i.test(loc)) return "caribbean";

  if (/europe|london|paris|rome|barcelona|lisbon|portugal|spain|france|italy|uk|united kingdom/i.test(loc)) return "europe";

  if (ctx.market?.toLowerCase().includes("latin america")) return "latam_generic";

  return "us_generic";
}

function applyRegionOverrides(base: RegionProfile, region: string): RegionProfile {
  const p = { ...base };
  const s = (field: keyof RegionProfile, lowOrTuple: number | [number, number, number], mid?: number, high?: number) => {
    p[field] = Array.isArray(lowOrTuple) ? lowOrTuple : [lowOrTuple, mid!, high!];
  };

  switch (region) {
    case "ny_metro":
      s("adr", 280, 350, 450);
      s("occupancy", 70, 76, 82);
      s("capRate", 6.5, 7.5, 8.5);
      s("landValue", 30, 40, 50);
      s("costUtilities", 3.5, 4.2, 5.0);
      s("costPropertyTaxes", 1.8, 2.5, 3.5);
      s("incomeTax", 29, 31, 34);
      break;

    case "south_florida":
      s("adr", 220, 275, 380);
      s("occupancy", 68, 74, 80);
      s("capRate", 7.0, 8.0, 9.0);
      s("landValue", 25, 30, 40);
      s("costPropertyTaxes", 1.2, 1.8, 2.5);
      s("incomeTax", 21, 21, 21);
      break;

    case "california":
      s("adr", 250, 320, 425);
      s("occupancy", 70, 75, 80);
      s("capRate", 6.5, 7.5, 8.5);
      s("landValue", 30, 38, 45);
      s("costUtilities", 3.5, 4.0, 5.0);
      s("costPropertyTaxes", 1.0, 1.1, 1.25);
      s("incomeTax", 29, 31, 35);
      break;

    case "texas":
      s("adr", 200, 260, 340);
      s("occupancy", 65, 70, 76);
      s("capRate", 8.0, 8.5, 9.5);
      s("costPropertyTaxes", 1.8, 2.2, 3.0);
      s("incomeTax", 21, 21, 21);
      break;

    case "southeast_resort":
      s("adr", 250, 340, 420);
      s("occupancy", 62, 68, 75);
      s("capRate", 8.0, 8.5, 9.5);
      s("catering", [30, 38, 45]);
      s("costPropertyTaxes", 0.8, 1.2, 1.8);
      s("incomeTax", 24, 26, 28);
      break;

    case "mountain_west":
      s("adr", 280, 370, 475);
      s("occupancy", [55, 62, 70]);
      s("capRate", 8.0, 8.5, 9.5);
      s("catering", [30, 36, 42]);
      s("costUtilities", 3.5, 4.2, 5.0);
      s("costPropertyTaxes", 0.6, 0.8, 1.2);
      s("incomeTax", 24, 25, 26);
      break;

    case "hawaii":
      s("adr", 350, 440, 600);
      s("occupancy", 72, 78, 84);
      s("capRate", 6.0, 7.0, 8.0);
      s("landValue", 35, 42, 50);
      s("costUtilities", 4.0, 5.0, 6.5);
      s("costPropertyTaxes", 1.0, 1.4, 1.8);
      s("incomeTax", 28, 31, 33);
      break;

    case "midwest":
      s("adr", 150, 185, 240);
      s("occupancy", [60, 65, 70]);
      s("capRate", 8.5, 9.5, 10.5);
      s("landValue", [10, 15, 20]);
      s("costPropertyTaxes", 1.5, 2.0, 3.0);
      s("incomeTax", 25, 27, 30);
      break;

    case "new_england":
      s("adr", 220, 280, 380);
      s("occupancy", [58, 65, 72]);
      s("capRate", 7.5, 8.5, 9.5);
      s("costUtilities", 3.5, 4.5, 5.5);
      s("costPropertyTaxes", 1.5, 2.0, 2.8);
      s("incomeTax", 26, 28, 31);
      break;

    case "pacific_northwest":
      s("adr", 200, 260, 340);
      s("occupancy", [64, 70, 76]);
      s("capRate", 7.5, 8.5, 9.5);
      s("costPropertyTaxes", 0.9, 1.2, 1.5);
      s("incomeTax", 21, 21, 21);
      break;

    case "colorado":
      s("adr", 280, 380, 500);
      s("occupancy", [58, 65, 73]);
      s("capRate", 7.5, 8.5, 9.5);
      s("catering", [28, 34, 40]);
      s("costUtilities", 3.0, 3.8, 4.5);
      s("costPropertyTaxes", 0.5, 0.7, 1.0);
      s("incomeTax", 25, 25.4, 26);
      break;

    case "arizona":
      s("adr", 250, 320, 420);
      s("occupancy", [60, 68, 75]);
      s("capRate", 7.5, 8.5, 9.5);
      s("costPropertyTaxes", 0.7, 1.0, 1.4);
      s("incomeTax", 23, 24, 25);
      break;

    case "colombia":
      s("adr", 120, 180, 260);
      s("occupancy", [55, 62, 70]);
      s("capRate", 9.0, 10.5, 12.0);
      s("landValue", [10, 15, 20]);
      s("costHousekeeping", [10, 14, 18]);
      s("costAdmin", [3, 4, 6]);
      s("costPropertyOps", [2, 3, 4]);
      s("costUtilities", [2.0, 2.5, 3.5]);
      s("costPropertyTaxes", [0.5, 1.0, 1.5]);
      s("incomeTax", [30, 35, 38]);
      break;

    case "mexico":
      s("adr", 150, 220, 350);
      s("occupancy", [60, 67, 75]);
      s("capRate", 8.5, 10.0, 11.5);
      s("landValue", [12, 18, 25]);
      s("costHousekeeping", [10, 14, 18]);
      s("costAdmin", [3, 4, 6]);
      s("costUtilities", [2.0, 2.8, 3.5]);
      s("costPropertyTaxes", [0.3, 0.5, 0.8]);
      s("incomeTax", [28, 30, 33]);
      break;

    case "costa_rica":
      s("adr", 180, 250, 380);
      s("occupancy", [58, 65, 73]);
      s("capRate", 8.5, 10.0, 11.5);
      s("landValue", [12, 18, 25]);
      s("costHousekeeping", [10, 14, 18]);
      s("costAdmin", [3, 4, 6]);
      s("costUtilities", [2.5, 3.0, 4.0]);
      s("costPropertyTaxes", [0.2, 0.3, 0.5]);
      s("incomeTax", [28, 30, 33]);
      break;

    case "caribbean":
      s("adr", 250, 380, 550);
      s("occupancy", [60, 68, 76]);
      s("capRate", 8.0, 9.5, 11.0);
      s("landValue", [20, 28, 35]);
      s("costUtilities", [4.0, 5.5, 7.0]);
      s("costPropertyTaxes", [0.3, 0.5, 1.0]);
      s("incomeTax", [20, 25, 30]);
      break;

    case "brazil":
      s("adr", 100, 160, 250);
      s("occupancy", [55, 62, 70]);
      s("capRate", 9.0, 11.0, 13.0);
      s("costHousekeeping", [10, 14, 18]);
      s("costAdmin", [3, 4, 6]);
      s("costUtilities", [2.0, 2.8, 3.5]);
      s("costPropertyTaxes", [1.0, 1.5, 2.5]);
      s("incomeTax", [30, 34, 38]);
      break;

    case "argentina":
      s("adr", 100, 150, 220);
      s("occupancy", [50, 58, 66]);
      s("capRate", 10.0, 12.0, 14.0);
      s("costHousekeeping", [10, 14, 18]);
      s("costAdmin", [3, 4, 6]);
      s("costUtilities", [2.5, 3.0, 4.0]);
      s("costPropertyTaxes", [0.5, 1.0, 1.5]);
      s("incomeTax", [30, 35, 38]);
      break;

    case "europe":
      s("adr", 200, 280, 400);
      s("occupancy", [65, 72, 78]);
      s("capRate", 5.5, 7.0, 8.5);
      s("costUtilities", [3.5, 4.5, 6.0]);
      s("costPropertyTaxes", [0.5, 1.0, 2.0]);
      s("incomeTax", [20, 25, 30]);
      break;

    case "central_america":
    case "latam_generic":
      s("adr", 120, 180, 280);
      s("occupancy", [55, 63, 72]);
      s("capRate", 9.0, 10.5, 12.0);
      s("landValue", [10, 15, 22]);
      s("costHousekeeping", [10, 14, 18]);
      s("costAdmin", [3, 4, 6]);
      s("costPropertyOps", [2, 3, 4]);
      s("costUtilities", [2.0, 2.8, 3.5]);
      s("costPropertyTaxes", [0.3, 0.6, 1.0]);
      s("incomeTax", [25, 30, 35]);
      break;
  }

  return p;
}

function formatDisplay(field: string, low: number, high: number): string {
  if (field === "adr") return `$${low}–$${high}`;
  if (field === "rampMonths") return `${low}–${high} mo`;
  if (field === "occupancyStep") return `${low}–${high} pp/yr`;
  return `${low}%–${high}%`;
}

const FIELD_SOURCES: Record<string, string> = {
  adr: "STR/CBRE market data",
  occupancy: "STR/CBRE market data",
  startOccupancy: "STR ramp-up benchmarks",
  rampMonths: "STR ramp-up benchmarks",
  capRate: CITATIONS.cbreCapRateSurvey,
  catering: "USALI F&B benchmarks",
  landValue: "Assessor/market comps",
  costHousekeeping: "USALI departmental",
  costFB: "USALI departmental",
  costAdmin: "USALI undistributed",
  costPropertyOps: "USALI undistributed",
  costUtilities: "USALI undistributed",
  costFFE: "USALI reserves",
  costMarketing: "USALI undistributed",
  costIT: CITATIONS.hftpTechnologySurvey,
  costOther: "USALI undistributed",
  costPropertyTaxes: "Local assessor data",
  svcFeeMarketing: "HVS Mgmt Agreement Study",
  svcFeeTechRes: "HVS Mgmt Agreement Study",
  svcFeeAccounting: "HVS Mgmt Agreement Study",
  svcFeeRevMgmt: "HVS Mgmt Agreement Study",
  svcFeeGeneralMgmt: "HVS Mgmt Agreement Study",
  svcFeeProcurement: "HVS Mgmt Agreement Study",
  incentiveFee: "HVS Mgmt Agreement Study",
  incomeTax: "IRS/jurisdiction rates",
  saleCommission: CITATIONS.narTransactionData,
  acqLtv: "CBRE lending benchmarks",
  acqRate: "CBRE lending benchmarks",
  refiLtv: "CBRE lending benchmarks",
  adrGrowth: "STR historical trends",
  occupancyStep: "STR ramp-up benchmarks",
  revShareEvents: "USALI F&B benchmarks",
  revShareFB: "USALI F&B benchmarks",
  revShareOther: "USALI departmental",
};

function buildEntry(field: string, triple: [number, number, number]): ResearchValueEntry {
  return {
    display: formatDisplay(field, triple[0], triple[2]),
    mid: triple[1],
    source: "seed",
    sourceName: FIELD_SOURCES[field],
  };
}

export function generateLocationAwareResearchValues(ctx: LocationContext): ResearchValueMap {
  const region = regionFromLocation(ctx);
  const profile = applyRegionOverrides({ ...US_BASE }, region);
  const map: ResearchValueMap = {};
  for (const [key, triple] of Object.entries(profile)) {
    map[key] = buildEntry(key, triple as [number, number, number]);
  }
  return map;
}

export { regionFromLocation };
