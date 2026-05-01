export type {
  IcpLocationCity,
  IcpLocation,
  IcpConfig,
  Priority,
  UnitType,
  UnitDef,
  IcpDescriptive,
  ParameterSection,
  ParameterField,
  DescriptiveSection,
} from "./icp-types";

export { PRIORITY_LABELS, DEFAULT_ICP_CONFIG, DEFAULT_ICP_DESCRIPTIVE } from "./icp-defaults";
export { UNIT_DEFS, dualUnit } from "./icp-units";
export { PARAMETER_SECTIONS, DESCRIPTIVE_SECTIONS } from "./icp-sections";
export { generateIcpPrompt } from "./icp-prompt-builder";

import type { IcpConfig, IcpDescriptive, UnitType, Priority } from "./icp-types";
import { dualUnit } from "./icp-units";
import { FB_RATING_LABELS } from "./icp-defaults";

function fmt$(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

export function generateIcpEssay(c: IcpConfig, d: IcpDescriptive, propertyLabel: string): string {
  const du = (v: number, ut: UnitType) => dualUnit(v, ut, false);
  const fbDesc = FB_RATING_LABELS[c.fbRating] || FB_RATING_LABELS[4];

  const paragraphs: string[] = [];

  paragraphs.push(
    `The ideal acquisition target for ${propertyLabel} is a ${d.propertyTypes.split(".")[0].toLowerCase().trim()}. ` +
    `The property should offer between ${c.roomsMin} and ${c.roomsMax} guest rooms or suites, with a sweet spot of ${c.roomsSweetSpotMin} to ${c.roomsSweetSpotMax} rooms. ` +
    `At minimum, the property must include ${c.masterSuitesMin} master suites of at least ${du(c.masterSuiteSqFt, "area")} each, ` +
    `with a total of ${c.bedroomsMin} to ${c.bedroomsMax} bedrooms and ${c.bathroomsMin} to ${c.bathroomsMax} bathrooms across the property. ` +
    `The land should span ${du(c.landAcresMin, "land")} to ${du(c.landAcresMax, "land")}, ` +
    `with ${du(c.builtSqFtMin, "area")} to ${du(c.builtSqFtMax, "area")} of usable interior space.`
  );

  paragraphs.push(
    `Food and beverage operations are rated at ${c.fbRating} out of 5, reflecting ${fbDesc}. ` +
    `The dining area should seat ${c.diningCapacityMin} to ${c.diningCapacityMax} guests. ` +
    `F&B revenue is targeted at ${c.fbShareMin}% to ${c.fbShareMax}% of total revenue, ` +
    `with events contributing ${c.eventsShareMin}% to ${c.eventsShareMax}%, ` +
    `spa and wellness at ${c.spaShareMin}% to ${c.spaShareMax}%, ` +
    `and other ancillary services at ${c.otherShareMin}% to ${c.otherShareMax}%. ` +
    `Total ancillary revenue should reach ${c.totalAncillaryMin}% to ${c.totalAncillaryMax}% of total revenue.`
  );

  paragraphs.push(
    `The property must accommodate indoor events for ${c.indoorEventMin} to ${c.indoorEventMax} guests ` +
    `and outdoor events for ${c.outdoorEventMin} to ${c.outdoorEventMax} guests, ` +
    `with ${c.parkingMin} to ${c.parkingMax} parking spaces on site. ` +
    `Operational facilities include a commercial kitchen of at least ${du(c.kitchenSqFt, "area")}, ` +
    `maintenance and storage space of ${du(c.maintenanceSqFt, "area")}, ` +
    `and staff quarters for ${c.staffQuartersMin} to ${c.staffQuartersMax} key personnel.`
  );

  const amenityList: string[] = [];
  const amenityNames: [string, Priority][] = [
    ["swimming pool", c.pool], ["spa", c.spa], ["gym", c.gym],
    ["tennis", c.tennis], ["pickleball", c.pickleball],
    ["hiking trails", c.hikingTrails], ["equestrian facilities", c.horseFacilities],
    ["vineyard or orchard", c.vineyard], ["casitas", c.casitas],
  ];
  const required = amenityNames.filter(([, p]) => p === "must").map(([n]) => n);
  const preferred = amenityNames.filter(([, p]) => p === "major" || p === "nice").map(([n]) => n);
  if (required.length > 0 || preferred.length > 0) {
    let s = "";
    if (required.length > 0) s += `Required amenities include ${required.join(", ")}. `;
    if (preferred.length > 0) s += `Preferred amenities include ${preferred.join(", ")}.`;
    amenityList.push(s.trim());
  }
  if (amenityList.length > 0) paragraphs.push(amenityList.join(" "));

  paragraphs.push(
    `The property must be in good to excellent structural condition with a roof no older than ${c.maxRoofAge} years ` +
    `and electrical service of at least ${c.minElectricalAmps} amps. ` +
    `Total renovation budget must remain under ${fmt$(c.maxRenovationBudget)}. ` +
    `A minimum setback of ${du(c.minSetbackFt, "distance")} from public roads is required for privacy.`
  );

  paragraphs.push(
    `The property should be within ${c.maxAirportMin} minutes of a regional airport (preferably ${c.prefAirportMin} minutes) ` +
    `and within ${c.maxIntlAirportMin} minutes of an international airport (preferably ${c.prefIntlAirportMin} minutes). ` +
    `Access to a hospital or urgent care within ${c.maxHospitalMin} minutes is required.`
  );

  paragraphs.push(
    `From a financial perspective, the acquisition price range is ${fmt$(c.acquisitionMin)} to ${fmt$(c.acquisitionMax)}, ` +
    `with a target sweet spot of ${fmt$(c.acquisitionTargetMin)} to ${fmt$(c.acquisitionTargetMax)}. ` +
    `Total investment including renovation and FF&E ranges from ${fmt$(c.totalInvestmentMin)} to ${fmt$(c.totalInvestmentMax)}. ` +
    `The target ADR is $${c.adrMin} to $${c.adrMax} per night, ` +
    `with stabilized occupancy of ${c.occupancyMin}% to ${c.occupancyMax}% after a ${c.occupancyRampMonths}-month ramp-up. ` +
    `The management fee structure includes a base fee of ${c.baseMgmtFeeMin}% to ${c.baseMgmtFeeMax}% of total revenue ` +
    `and an incentive fee of ${c.incentiveFeeMin}% to ${c.incentiveFeeMax}% of GOP. ` +
    `The investment targets a minimum IRR of ${c.targetIrr}%, ` +
    `an equity multiple of ${c.equityMultipleMin}x to ${c.equityMultipleMax}x, ` +
    `over a ${c.holdYearsMin} to ${c.holdYearsMax}-year hold period, ` +
    `with an exit cap rate of ${c.exitCapRateMin}% to ${c.exitCapRateMax}%.`
  );

  if (d.exclusions.trim()) {
    const excl = d.exclusions.split("\n").filter(Boolean).map(e => e.trim().toLowerCase()).slice(0, 5);
    paragraphs.push(`Key exclusions: ${excl.join("; ")}.`);
  }

  return paragraphs.join("\n\n");
}
