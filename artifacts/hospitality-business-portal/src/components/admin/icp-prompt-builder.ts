import type { IcpConfig, IcpDescriptive, IcpLocation, Priority, UnitType } from "./icp-types";
import { dualUnit } from "./icp-units";

function fmt$(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

interface CustomAmenityForPrompt {
  label: string;
  priority: Priority;
}

interface GeneratePromptOptions {
  locations?: IcpLocation[];
  customAmenities?: CustomAmenityForPrompt[];
}

function buildAmenityTiers(c: IcpConfig, du: (v: number, ut: UnitType) => string, customAmenities?: CustomAmenityForPrompt[]): { required: string[]; majorPlus: string[]; niceToHave: string[] } {
  const all: { name: string; priority: Priority; detail?: string }[] = [
    { name: "Swimming pool", priority: c.pool, detail: `min ${du(c.poolSqFt, "area")} surface area` },
    { name: "Second pool / plunge pool", priority: c.secondPool },
    { name: "Hot tub / jacuzzi", priority: c.hotTub },
    { name: "Spa facility", priority: c.spa, detail: `${c.spaTreatmentRooms} treatment rooms` },
    { name: "Sauna", priority: c.sauna },
    { name: "Steam room", priority: c.steamRoom },
    { name: "Cold plunge", priority: c.coldPlunge },
    { name: "Yoga / meditation studio", priority: c.yogaStudio },
    { name: "Gym / fitness center", priority: c.gym, detail: `${du(c.gymSqFtMin, "area")}–${du(c.gymSqFtMax, "area")}` },
    { name: "Tennis court", priority: c.tennis, detail: `${c.tennisCourts} court(s)` },
    { name: "Pickleball court", priority: c.pickleball, detail: `${c.pickleballCourts} court(s)` },
    { name: "Basketball half-court", priority: c.basketball },
    { name: "Hiking / walking trails", priority: c.hikingTrails },
    { name: "Equestrian facilities", priority: c.horseFacilities, detail: `${c.horseStalls} stalls, ${du(c.pastureAcres, "land")} pasture` },
    { name: "Vegetable / herb garden", priority: c.garden },
    { name: "Vineyard / orchard / olive grove", priority: c.vineyard },
    { name: "Casitas / cottages", priority: c.casitas, detail: `${c.casitasCount} units` },
    { name: "Barn (events/dining)", priority: c.barn },
    { name: "Glamping / A-frames / treehouses", priority: c.glamping },
    { name: "Greenhouse / conservatory", priority: c.greenhouse },
    { name: "Chapel / ceremony structure", priority: c.chapel },
    { name: "Fire pit areas", priority: c.firePit },
    { name: "Wine cellar / tasting room", priority: c.wineCellar },
    { name: "Game room / media room", priority: c.gameRoom },
    { name: "Library / reading room", priority: c.library },
    { name: "Outdoor cooking area", priority: c.outdoorKitchen },
  ];

  if (customAmenities) {
    for (const ca of customAmenities) {
      all.push({ name: ca.label, priority: ca.priority });
    }
  }

  const fmt = (a: { name: string; detail?: string }) => a.detail ? `• ${a.name} — ${a.detail}` : `• ${a.name}`;
  return {
    required: all.filter(a => a.priority === "must").map(fmt),
    majorPlus: all.filter(a => a.priority === "major").map(fmt),
    niceToHave: all.filter(a => a.priority === "nice").map(fmt),
  };
}

function buildLocationSection(loc: IcpLocation, index: number, c: IcpConfig, d: IcpDescriptive, propertyLabel: string, amenityTiers: { required: string[]; majorPlus: string[]; niceToHave: string[] }): string[] {
  const lines: string[] = [];
  const label = loc.country || `Location ${index + 1}`;
  const states = Array.isArray(loc.states) ? loc.states : [];
  const cities = Array.isArray(loc.cities) ? loc.cities : [];
  const stateList = states.length > 0 ? states.join(", ") : "All regions";
  const cityList = cities.length > 0
    ? cities.map(c => `${c.name} (${c.radius}-mile radius)`).join(", ")
    : null;

  lines.push(`┌─── LOCATION ${index + 1}: ${label.toUpperCase()} ───┐`);
  lines.push(`Country: ${loc.country} (${loc.countryCode})`);
  lines.push(`States/Provinces: ${stateList}`);
  if (cityList) lines.push(`Target Cities: ${cityList}`);
  if (loc.notes?.trim()) lines.push(`Location Notes: ${loc.notes.trim()}`);
  lines.push(``);

  lines.push(`RESEARCH DIRECTIVES FOR ${label.toUpperCase()}:`);
  lines.push(`For each state/city listed above, research and report on:`);
  lines.push(``);

  lines.push(`1. MARKET ANALYSIS`);
  lines.push(`   • Current boutique/luxury hotel supply within the target areas`);
  lines.push(`   • Average ADR for comparable ${propertyLabel.toLowerCase()} properties ($${c.adrMin}–$${c.adrMax} target)`);
  lines.push(`   • Occupancy rates for luxury independents (${c.occupancyMin}%–${c.occupancyMax}% target)`);
  lines.push(`   • RevPAR benchmarks ($${c.revParMin}–$${c.revParMax} target)`);
  lines.push(`   • Seasonality patterns and peak/off-peak demand drivers`);
  lines.push(`   • Tourism volume trends and growth trajectory`);
  lines.push(``);

  lines.push(`2. COMPETITIVE LANDSCAPE`);
  lines.push(`   • Existing boutique/luxury properties with ${c.roomsMin}–${c.roomsMax} rooms`);
  lines.push(`   • Comparable properties on ${dualUnit(c.landAcresMin, "land", false)}–${dualUnit(c.landAcresMax, "land", false)} parcels`);
  lines.push(`   • Properties offering similar amenity packages (see REQUIRED amenities below)`);
  lines.push(`   • Recent property sales and acquisition prices in the ${fmt$(c.acquisitionMin)}–${fmt$(c.acquisitionMax)} range`);
  lines.push(`   • New supply pipeline and planned developments`);
  lines.push(``);

  lines.push(`3. REQUIRED AMENITIES — these MUST be available or feasible in this market:`);
  if (amenityTiers.required.length > 0) {
    lines.push(...amenityTiers.required.map(a => `   ${a}`));
  } else {
    lines.push(`   (No amenities marked as required)`);
  }
  lines.push(`   → Research: Which of these required amenities are standard vs. differentiating in ${label}?`);
  lines.push(`   → Research: What is the cost to add/build each required amenity in this market?`);
  lines.push(`   → Research: Do any local regulations restrict these amenities (pool permits, liquor licenses, etc.)?`);
  lines.push(``);

  lines.push(`4. MAJOR PLUS AMENITIES — strong value-adds that significantly enhance the property:`);
  if (amenityTiers.majorPlus.length > 0) {
    lines.push(...amenityTiers.majorPlus.map(a => `   ${a}`));
  } else {
    lines.push(`   (No amenities marked as major plus)`);
  }
  lines.push(`   → Research: Which major-plus amenities would command the highest ADR premium in ${label}?`);
  lines.push(`   → Research: What comparable properties in this market offer these amenities?`);
  lines.push(``);

  lines.push(`5. NICE-TO-HAVE AMENITIES — desirable but not deal-breaking:`);
  if (amenityTiers.niceToHave.length > 0) {
    lines.push(...amenityTiers.niceToHave.map(a => `   ${a}`));
  } else {
    lines.push(`   (No amenities marked as nice-to-have)`);
  }
  lines.push(`   → Research: Which nice-to-have amenities align with guest expectations in ${label}?`);
  lines.push(`   → Research: ROI potential for adding these amenities in this specific market?`);
  lines.push(``);

  lines.push(`6. EVENT & F&B MARKET`);
  lines.push(`   • Wedding and social event demand in the area`);
  lines.push(`   • Corporate retreat/team-building market potential`);
  lines.push(`   • F&B revenue opportunity (target: ${c.fbShareMin}%–${c.fbShareMax}% of total revenue)`);
  lines.push(`   • Events revenue potential (target: ${c.eventsShareMin}%–${c.eventsShareMax}% of total revenue)`);
  if (c.spa !== "no") {
    lines.push(`   • Spa & wellness market demand (target: ${c.spaShareMin}%–${c.spaShareMax}% of total revenue)`);
  }
  lines.push(`   • Local F&B scene quality and farm-to-table sourcing availability`);
  lines.push(``);

  lines.push(`7. REGULATORY & FEASIBILITY`);
  lines.push(`   • Zoning requirements for hospitality/commercial use in target areas`);
  lines.push(`   • Permitting timeline and renovation regulations`);
  lines.push(`   • Liquor licensing availability and process`);
  lines.push(`   • Short-term rental and hospitality regulations`);
  lines.push(`   • Environmental or historic preservation considerations`);
  lines.push(``);

  lines.push(`8. ACCESSIBILITY & INFRASTRUCTURE`);
  lines.push(`   • Nearest regional airport (max ${c.maxAirportMin} min, prefer ${c.prefAirportMin} min)`);
  lines.push(`   • Nearest international airport (max ${c.maxIntlAirportMin} min, prefer ${c.prefIntlAirportMin} min)`);
  lines.push(`   • Nearest hospital/urgent care (max ${c.maxHospitalMin} min, prefer ${c.prefHospitalMin} min)`);
  lines.push(`   • Rideshare/transportation availability`);
  lines.push(`   • Year-round road access and weather considerations`);
  lines.push(``);

  lines.push(`9. INVESTMENT CONTEXT`);
  lines.push(`   • Real estate price trends for estate/luxury properties`);
  lines.push(`   • Construction and renovation costs per sq ft in this market`);
  lines.push(`   • Labor market for hospitality staff`);
  lines.push(`   • Property tax rates and incentives`);
  lines.push(`   • Insurance costs and risk factors (flood, wildfire, hurricane)`);
  lines.push(`└─── END LOCATION ${index + 1} ───┘`);
  lines.push(``);

  return lines;
}

export function generateIcpPrompt(c: IcpConfig, d: IcpDescriptive, propertyLabel: string, opts?: GeneratePromptOptions): string {
  const du = (v: number, ut: UnitType) => dualUnit(v, ut, false);
  const locations = opts?.locations ?? [];
  const customAmenities = opts?.customAmenities;

  const amenityTiers = buildAmenityTiers(c, du, customAmenities);

  const lines = [
    `IDEAL CUSTOMER PROFILE — ${propertyLabel.toUpperCase()} TARGET DEFINITION`,
    ``,
    `This profile defines the ideal property acquisition target for a boutique luxury hospitality investment. Each attribute is classified by priority: REQUIRED (must-have, deal-breaker if absent), MAJOR PLUS (strong value-add, significant impact on underwriting), or NICE TO HAVE (desirable but not deal-breaking). Use this profile for per-location market analysis, ADR estimation, revenue mix projection, cost benchmarking, and competitive positioning.`,
    ``,
    `━━━ PROPERTY TYPE & POSITIONING ━━━`,
    d.propertyTypes,
    ``,
    `━━━ FOOD & BEVERAGE ━━━`,
    `F&B Rating: ${c.fbRating}/5`,
    ``,
    d.fbLevel,
    ``,
    `━━━ SIZE, CAPACITY & PHYSICAL DIMENSIONS ━━━`,
    ``,
    `Guest Rooms & Suites:`,
    `• ${c.roomsMin}–${c.roomsMax} guest rooms or suites (sweet spot: ${c.roomsSweetSpotMin}–${c.roomsSweetSpotMax}) [REQUIRED]`,
    `• Minimum ${c.masterSuitesMin} master suites (${du(c.masterSuiteSqFt, "area")}+ each) with en-suite bathrooms [REQUIRED]`,
    ``,
    `Bedrooms & Bathrooms (Total Property):`,
    `• ${c.bedroomsMin}–${c.bedroomsMax} total bedrooms [REQUIRED]`,
    `• ${c.bathroomsMin}–${c.bathroomsMax} total bathrooms (at least 1:1 ratio to bedrooms) [REQUIRED]`,
    `• ${c.halfBaths} additional half-baths in public/common areas [NICE TO HAVE]`,
    ``,
    `Land & Built Area:`,
    `• ${du(c.landAcresMin, "land")}–${du(c.landAcresMax, "land")}+ total land area [REQUIRED]`,
    `• ${du(c.builtSqFtMin, "area")}–${du(c.builtSqFtMax, "area")} usable interior space [REQUIRED]`,
    ``,
    `Living & Common Areas:`,
    `• ${c.livingAreas}+ distinct living/lounge areas for guest use [REQUIRED]`,
    `• Dining area seating ${c.diningCapacityMin}–${c.diningCapacityMax} guests [REQUIRED]`,
    ``,
    `Event Capacity:`,
    `• Indoor: ${c.indoorEventMin}–${c.indoorEventMax} guests [REQUIRED]`,
    `• Outdoor: ${c.outdoorEventMin}–${c.outdoorEventMax} guests [REQUIRED]`,
    `• Parking: ${c.parkingMin}–${c.parkingMax}+ spaces [REQUIRED]`,
    ``,
    `━━━ OPERATIONAL FACILITIES ━━━`,
    ``,
    `• Commercial/semi-commercial kitchen: ${du(c.kitchenSqFt, "area")}+ with hood ventilation, grease trap, walk-in cooler/freezer, prep area, dish pit, dry storage, receiving dock [REQUIRED]`,
    `• Maintenance workshop and general storage: ${du(c.maintenanceSqFt, "area")}+ [REQUIRED]`,
    `• Staff quarters or break room: on-site capacity for ${c.staffQuartersMin}–${c.staffQuartersMax} key staff [REQUIRED]`,
    `• Staff housing: ${c.staffHousingUnits} separate units [NICE TO HAVE]`,
    `• Administrative office space (front desk, back office, manager's office) [REQUIRED]`,
    `• Housekeeping storage, laundry room with commercial washers/dryers [REQUIRED]`,
    `• Receiving/loading area for vendor deliveries [REQUIRED]`,
    ``,
    `━━━ AMENITIES & GUEST FACILITIES (BY PRIORITY) ━━━`,
    ``,
    `IMPORTANT: Amenity priority directly impacts property valuation and underwriting.`,
    `Properties MUST have all REQUIRED amenities or clear feasibility to add them.`,
    `MAJOR PLUS amenities significantly improve ADR potential and competitive positioning.`,
    `NICE TO HAVE amenities enhance the guest experience but do not drive acquisition decisions.`,
    ``,
  ];

  if (amenityTiers.required.length > 0) {
    lines.push(`── REQUIRED (deal-breaker if absent) ──`);
    lines.push(...amenityTiers.required);
    lines.push(``);
  }

  if (amenityTiers.majorPlus.length > 0) {
    lines.push(`── MAJOR PLUS (strong value-add, impacts underwriting) ──`);
    lines.push(...amenityTiers.majorPlus);
    lines.push(``);
  }

  if (amenityTiers.niceToHave.length > 0) {
    lines.push(`── NICE TO HAVE (desirable, enhances guest experience) ──`);
    lines.push(...amenityTiers.niceToHave);
    lines.push(``);
  }

  lines.push(
    `• Garage: ${c.garageBays}+ bays [NICE TO HAVE]`,
    ``,
    `━━━ PROPERTY CONDITION ━━━`,
    ``,
    `• Roof age: less than ${c.maxRoofAge} years [REQUIRED]`,
    `• Electrical: ${c.minElectricalAmps}+ amp service [REQUIRED]`,
    `• Renovation/FF&E budget must stay under ${fmt$(c.maxRenovationBudget)} [REQUIRED]`,
    d.conditionNotes,
    ``,
    `━━━ GROUNDS & TOPOGRAPHY ━━━`,
    ``,
    d.groundsTopography,
    ``,
    `━━━ PRIVACY & SECURITY ━━━`,
    ``,
    `• Minimum ${du(c.minSetbackFt, "distance")} setback from public roads [REQUIRED]`,
    `• Private driveway: ${du(c.minDrivewayFt, "distance")}+ approach [NICE TO HAVE]`,
    `• Perimeter fencing, walls, hedgerows, or natural tree line for visual/acoustic screening [REQUIRED]`,
    ``,
    `━━━ LOCATION & ACCESSIBILITY ━━━`,
    ``,
    `• Within ${c.maxAirportMin} minutes of a regional airport (${c.prefAirportMin} min preferred) [REQUIRED]`,
    `• Within ${c.maxIntlAirportMin} minutes of an international airport (${c.prefIntlAirportMin} min preferred) [REQUIRED]`,
    `• Within ${c.maxHospitalMin} minutes of a hospital/urgent care (${c.prefHospitalMin} min preferred) [REQUIRED]`,
    d.locationCharacteristics,
    ``,
  );

  if (locations.length > 0) {
    lines.push(`━━━ TARGET LOCATIONS — PER-LOCATION RESEARCH ━━━`);
    lines.push(``);
    lines.push(`The following ${locations.length} target location(s) define where research must be conducted.`);
    lines.push(`For EACH location, provide granular, location-specific analysis.`);
    lines.push(`Do NOT generalize across locations — each market has unique dynamics.`);
    lines.push(``);

    for (let i = 0; i < locations.length; i++) {
      lines.push(...buildLocationSection(locations[i], i, c, d, propertyLabel, amenityTiers));
    }
  } else {
    lines.push(`━━━ LOCATION DETAILS ━━━`);
    lines.push(``);
    lines.push(d.locationDetails);
    lines.push(``);
  }

  lines.push(
    `━━━ FINANCIAL PARAMETERS ━━━`,
    ``,
    `Acquisition & Investment:`,
    `• Acquisition price: ${fmt$(c.acquisitionMin)}–${fmt$(c.acquisitionMax)} (target: ${fmt$(c.acquisitionTargetMin)}–${fmt$(c.acquisitionTargetMax)})`,
    `• Total investment: ${fmt$(c.totalInvestmentMin)}–${fmt$(c.totalInvestmentMax)}`,
    `• Renovation/conversion: ${fmt$(c.renovationMin)}–${fmt$(c.renovationMax)}`,
    `• FF&E per room: ${fmt$(c.ffePerRoomMin)}–${fmt$(c.ffePerRoomMax)}`,
    ``,
    `Revenue Benchmarks:`,
    `• Target ADR: $${c.adrMin}–$${c.adrMax}/night`,
    `• Stabilized occupancy: ${c.occupancyMin}%–${c.occupancyMax}% (${c.occupancyRampMonths}-month ramp)`,
    `• RevPAR target: $${c.revParMin}–$${c.revParMax}/night`,
    ``,
    `Revenue Mix (as % of Total Revenue):`,
    `• Food & Beverage: ${c.fbShareMin}%–${c.fbShareMax}%`,
    `• Events (weddings, retreats, corporate): ${c.eventsShareMin}%–${c.eventsShareMax}%`,
    `• Spa & Wellness: ${c.spaShareMin}%–${c.spaShareMax}%`,
    `• Other (activities, tours, retail): ${c.otherShareMin}%–${c.otherShareMax}%`,
    `• Total ancillary target: ${c.totalAncillaryMin}%–${c.totalAncillaryMax}% of total revenue`,
    ``,
    `Fee Structure & Returns:`,
    `• Base management fee: ${c.baseMgmtFeeMin}%–${c.baseMgmtFeeMax}% of total revenue`,
    `• Incentive fee: ${c.incentiveFeeMin}%–${c.incentiveFeeMax}% of GOP`,
    `• Exit cap rate: ${c.exitCapRateMin}%–${c.exitCapRateMax}%`,
    `• Target IRR: ${c.targetIrr}%+`,
    `• Equity multiple: ${c.equityMultipleMin}x–${c.equityMultipleMax}x over ${c.holdYearsMin}–${c.holdYearsMax} year hold`,
    ``,
    `━━━ VENDOR & MANAGED SERVICES ━━━`,
    ``,
    d.vendorServices,
    ``,
    `━━━ REGULATORY & COMPLIANCE ━━━`,
    ``,
    d.regulatoryNotes,
    ``,
    `━━━ EXCLUSIONS ━━━`,
    ``,
    d.exclusions,
  );

  if (d.additionalContext.trim()) {
    lines.push(``, `━━━ ADDITIONAL CONTEXT ━━━`, ``, d.additionalContext);
  }

  return lines.join("\n");
}
