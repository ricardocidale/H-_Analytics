import type { ParameterSection, DescriptiveSection } from "./icp-types";

export const PARAMETER_SECTIONS: ParameterSection[] = [
  {
    title: "Guest Rooms & Suites",
    fields: [
      { key: "roomsMin", label: "Rooms", type: "number", pair: "roomsMax", pairLabel: "to", defaultPriority: "must", help: "Total number of bookable guest rooms and suites. Range reflects minimum acceptable to maximum manageable inventory." },
      { key: "roomsSweetSpotMin", label: "Sweet spot", type: "number", pair: "roomsSweetSpotMax", pairLabel: "to", defaultPriority: "must", help: "Ideal room count for optimal operations — small enough for boutique feel, large enough for financial viability." },
      { key: "masterSuitesMin", label: "Master suites", type: "number", defaultPriority: "must", help: "Minimum count. Large premium suites with separate living areas, walk-in closets, and luxury en-suite bathrooms." },
      { key: "masterSuiteSqFt", label: "Master suite size", type: "number", unitType: "area", defaultPriority: "must", help: "Minimum floor area per master suite including bedroom, sitting area, and en-suite bathroom." },
    ],
  },
  {
    title: "Bedrooms, Bathrooms & Areas",
    fields: [
      { key: "bedroomsMin", label: "Bedrooms", type: "number", pair: "bedroomsMax", pairLabel: "to", defaultPriority: "must", help: "Total bedrooms across the property including guest rooms, owner/staff quarters, and auxiliary spaces." },
      { key: "bathroomsMin", label: "Bathrooms", type: "number", pair: "bathroomsMax", pairLabel: "to", defaultPriority: "must", help: "Full bathrooms (toilet, sink, shower/tub). Target at least 1:1 ratio with bedrooms." },
      { key: "halfBaths", label: "Half-baths", type: "number", defaultPriority: "nice", help: "Powder rooms in public and common areas (toilet and sink only). Reduces guest traffic through private wings." },
      { key: "livingAreas", label: "Living/lounge areas", type: "number", defaultPriority: "must", help: "Minimum count. Distinct living rooms, lounges, or sitting areas available for guest use. Multiple areas allow programming variety." },
      { key: "diningCapacityMin", label: "Dining capacity", type: "number", pair: "diningCapacityMax", pairLabel: "to", suffix: "guests", defaultPriority: "must", help: "Number of guests the main dining area can seat for a formal meal service." },
    ],
  },
  {
    title: "Land & Built Area",
    fields: [
      { key: "landAcresMin", label: "Land area", type: "number", pair: "landAcresMax", pairLabel: "to", unitType: "land", defaultPriority: "must", help: "Total property land including buildings, gardens, parking, and undeveloped areas." },
      { key: "builtSqFtMin", label: "Built area", type: "number", pair: "builtSqFtMax", pairLabel: "to", unitType: "area", defaultPriority: "must", help: "Total usable interior space across all structures — main building, outbuildings, staff quarters." },
    ],
  },
  {
    title: "Event Capacity & Parking",
    fields: [
      { key: "indoorEventMin", label: "Indoor event capacity", type: "number", pair: "indoorEventMax", pairLabel: "to", suffix: "guests", defaultPriority: "must", help: "Maximum guests for indoor events such as weddings, corporate retreats, and galas." },
      { key: "outdoorEventMin", label: "Outdoor event capacity", type: "number", pair: "outdoorEventMax", pairLabel: "to", suffix: "guests", defaultPriority: "must", help: "Maximum guests for outdoor events on lawns, terraces, or courtyards." },
      { key: "parkingMin", label: "Parking spaces", type: "number", pair: "parkingMax", pairLabel: "to", defaultPriority: "must", help: "On-site parking spots including standard, accessible, and overflow areas." },
    ],
  },
  {
    title: "Food & Beverage",
    fields: [
      { key: "fbRating", label: "F&B Rating", type: "number", defaultPriority: "must", help: "Rated on a 1–5 scale. 1 = continental breakfast only, 2 = limited F&B, 3 = full breakfast + light dinner, 4 = full-service restaurant + bar, 5 = destination dining with celebrity chef and extensive wine program." },
    ],
  },
  {
    title: "Operational Facilities",
    fields: [
      { key: "kitchenSqFt", label: "Kitchen", type: "number", unitType: "area", defaultPriority: "must", help: "Minimum area. Commercial or semi-commercial kitchen with hood ventilation, grease trap, walk-in cooler/freezer, prep and dish areas." },
      { key: "maintenanceSqFt", label: "Maintenance/storage", type: "number", unitType: "area", defaultPriority: "must", help: "Minimum area. Workshop and general storage for maintenance equipment, supplies, and seasonal items." },
      { key: "staffQuartersMin", label: "Staff quarters capacity", type: "number", pair: "staffQuartersMax", pairLabel: "to", suffix: "staff", defaultPriority: "must", help: "On-site break room or quarters capacity for key operational staff during shifts." },
      { key: "staffHousingUnits", label: "Staff housing units", type: "number", defaultPriority: "nice", help: "Separate residential units for live-in staff (manager, chef, groundskeeper). Critical for rural locations." },
    ],
  },
  {
    title: "Aquatic & Wellness",
    fields: [
      { key: "pool", label: "Swimming pool", type: "priority", help: "Primary swimming pool for guest use. Heated pools extend seasonal availability." },
      { key: "poolSqFt", label: "Pool area", type: "number", unitType: "area", linkedPriority: "pool", help: "Minimum surface area of the main pool deck and water area combined." },
      { key: "secondPool", label: "Second pool / plunge", type: "priority", help: "Additional pool, plunge pool, or children's pool. Adds programming flexibility." },
      { key: "hotTub", label: "Hot tub / jacuzzi", type: "priority", help: "Outdoor or indoor hot tub for guest relaxation. Often paired with pool." },
      { key: "spa", label: "Spa facility", type: "priority", help: "Dedicated spa with treatment rooms, relaxation areas. Major ancillary revenue driver." },
      { key: "spaTreatmentRooms", label: "Treatment rooms", type: "number", linkedPriority: "spa", help: "Individual rooms for massage, facials, and body treatments. 2–4 rooms typical for boutique operations." },
      { key: "sauna", label: "Sauna", type: "priority", help: "Dry heat sauna (traditional Finnish or infrared). Enhances wellness offering." },
      { key: "steamRoom", label: "Steam room", type: "priority", help: "Wet steam room for therapeutic use. Often paired with sauna and cold plunge." },
      { key: "coldPlunge", label: "Cold plunge", type: "priority", help: "Cold water immersion pool or tub. Trending wellness amenity for recovery." },
      { key: "yogaStudio", label: "Yoga / meditation studio", type: "priority", help: "Dedicated indoor or covered outdoor space for yoga, meditation, and mindfulness classes." },
    ],
  },
  {
    title: "Fitness & Recreation",
    fields: [
      { key: "gym", label: "Gym / fitness center", type: "priority", help: "On-site fitness facility with cardio and strength equipment. Guest expectation at luxury properties." },
      { key: "gymSqFtMin", label: "Gym area", type: "number", pair: "gymSqFtMax", pairLabel: "to", unitType: "area", linkedPriority: "gym", help: "Floor area for fitness equipment, free weights, and stretching space." },
      { key: "tennis", label: "Tennis court", type: "priority", help: "Regulation or half-size tennis court. Hard court, clay, or grass surface." },
      { key: "tennisCourts", label: "Tennis courts", type: "number", linkedPriority: "tennis", help: "Quantity of tennis courts. One court is typical for boutique properties." },
      { key: "pickleball", label: "Pickleball court", type: "priority", help: "Fastest-growing racket sport. Can share space with tennis courts or be standalone." },
      { key: "pickleballCourts", label: "Pickleball courts", type: "number", linkedPriority: "pickleball", help: "Quantity of dedicated pickleball courts. Increasingly requested by guests." },
      { key: "basketball", label: "Basketball half-court", type: "priority", help: "Half-court basketball area for recreation. Can double as multi-sport surface." },
      { key: "hikingTrails", label: "Hiking / walking trails", type: "priority", help: "On-property trails through natural areas, gardens, or meadows. Enhances the estate experience." },
    ],
  },
  {
    title: "Equestrian & Agricultural",
    fields: [
      { key: "horseFacilities", label: "Horse facilities", type: "priority", help: "Stables, paddocks, riding arena, and trail access. Major differentiator for estate properties." },
      { key: "horseStalls", label: "Horse stalls", type: "number", linkedPriority: "horseFacilities", help: "Number of individual horse stalls in the stable building." },
      { key: "pastureAcres", label: "Pasture area", type: "number", unitType: "land", linkedPriority: "horseFacilities", help: "Fenced grazing land for horses or livestock." },
      { key: "garden", label: "Vegetable / herb garden", type: "priority", help: "Farm-to-table garden for restaurant use. Guest engagement opportunity." },
      { key: "vineyard", label: "Vineyard / orchard / olive grove", type: "priority", help: "Working vineyard, fruit orchard, or olive grove. Revenue and experience asset." },
    ],
  },
  {
    title: "Outbuildings & Structures",
    fields: [
      { key: "casitas", label: "Casitas / cottages", type: "priority", help: "Detached guest accommodations with private entrances. Premium ADR potential." },
      { key: "casitasCount", label: "Casitas", type: "number", linkedPriority: "casitas", help: "Quantity of individual casitas, cottages, or cabins on property." },
      { key: "barn", label: "Barn", type: "priority", help: "Used for events and dining. Restored barn for events, private dining, or entertainment. Rustic luxury appeal." },
      { key: "glamping", label: "Glamping / A-frames", type: "priority", help: "Luxury camping structures: safari tents, A-frame cabins, treehouses. Unique inventory." },
      { key: "greenhouse", label: "Greenhouse", type: "priority", help: "Greenhouse or conservatory for growing, events, or dining. Year-round use." },
      { key: "chapel", label: "Chapel / ceremony structure", type: "priority", help: "Dedicated ceremony space for weddings, vow renewals, and spiritual events." },
      { key: "firePit", label: "Fire pit areas", type: "priority", help: "Outdoor fire pit with seating for evening gatherings, s'mores, stargazing." },
      { key: "wineCellar", label: "Wine cellar / tasting room", type: "priority", help: "Temperature-controlled wine storage with tasting area for curated experiences." },
      { key: "gameRoom", label: "Game room / media room", type: "priority", help: "Indoor recreation space with billiards, board games, home theater, or arcade." },
      { key: "library", label: "Library / reading room", type: "priority", help: "Quiet reading room or library with curated collection. Classic estate amenity." },
      { key: "outdoorKitchen", label: "Outdoor cooking area", type: "priority", help: "Outdoor kitchen with grill, pizza oven, prep area for alfresco dining and cooking classes." },
      { key: "garageBays", label: "Garage bays", type: "number", help: "Enclosed parking bays for owner vehicles, equipment, or guest use." },
    ],
  },
  {
    title: "Condition Thresholds",
    fields: [
      { key: "maxRoofAge", label: "Max roof age", type: "number", suffix: "years", defaultPriority: "must", help: "Maximum acceptable roof age in years. Older roofs require costly replacement ($50K–$200K+)." },
      { key: "minElectricalAmps", label: "Min electrical service", type: "number", suffix: "amps", defaultPriority: "must", help: "Minimum electrical panel amperage. Commercial kitchens and HVAC require 200+ amps." },
      { key: "maxRenovationBudget", label: "Max renovation budget", type: "currency", defaultPriority: "must", help: "Hard cap on total renovation and conversion costs. Properties exceeding this are excluded." },
    ],
  },
  {
    title: "Privacy & Security",
    fields: [
      { key: "minSetbackFt", label: "Min setback from roads", type: "number", unitType: "distance", defaultPriority: "must", help: "Minimum distance from the main building to the nearest public road for visual and acoustic privacy." },
      { key: "minDrivewayFt", label: "Min driveway approach", type: "number", unitType: "distance", defaultPriority: "nice", help: "Length of private driveway from the property entrance to the main building. Longer driveways enhance exclusivity." },
    ],
  },
  {
    title: "Location & Accessibility",
    fields: [
      { key: "maxAirportMin", label: "Max to regional airport", type: "number", suffix: "min", defaultPriority: "must", help: "Maximum drive time to the nearest regional/domestic airport. Beyond this, guest convenience drops sharply." },
      { key: "prefAirportMin", label: "Preferred to regional airport", type: "number", suffix: "min", defaultPriority: "nice", help: "Preferred drive time to regional airport. Shorter times allow for weekend trips and easy access." },
      { key: "maxIntlAirportMin", label: "Max to intl airport", type: "number", suffix: "min", defaultPriority: "must", help: "Maximum drive time to the nearest international airport. Critical for overseas guests and long-haul travelers." },
      { key: "prefIntlAirportMin", label: "Preferred to intl airport", type: "number", suffix: "min", defaultPriority: "nice", help: "Preferred drive time to international airport. Properties closer to international hubs command higher ADR from global clientele." },
      { key: "maxHospitalMin", label: "Max to hospital", type: "number", suffix: "min", defaultPriority: "must", help: "Maximum drive time to nearest hospital or urgent care. Critical for guest safety and insurance." },
      { key: "prefHospitalMin", label: "Preferred to hospital", type: "number", suffix: "min", defaultPriority: "nice", help: "Preferred proximity to medical facilities for added peace of mind." },
    ],
  },
  {
    title: "Acquisition & Investment",
    fields: [
      { key: "acquisitionMin", label: "Acquisition price", type: "currency", pair: "acquisitionMax", pairLabel: "to", defaultPriority: "must", help: "Purchase price range for the property. Excludes renovation and FF&E costs." },
      { key: "acquisitionTargetMin", label: "Target sweet spot", type: "currency", pair: "acquisitionTargetMax", pairLabel: "to", defaultPriority: "must", help: "Preferred acquisition price range within the broader acceptable range." },
      { key: "totalInvestmentMin", label: "Total investment", type: "currency", pair: "totalInvestmentMax", pairLabel: "to", defaultPriority: "must", help: "All-in cost: acquisition + renovation + FF&E + soft costs + working capital." },
      { key: "renovationMin", label: "Renovation/conversion", type: "currency", pair: "renovationMax", pairLabel: "to", defaultPriority: "must", help: "Budget for structural renovation, cosmetic updates, and hospitality conversion." },
      { key: "ffePerRoomMin", label: "FF&E per room", type: "currency", pair: "ffePerRoomMax", pairLabel: "to", defaultPriority: "must", help: "Furniture, fixtures, and equipment budget per guest room. Industry range: $15K–$50K." },
    ],
  },
  {
    title: "Revenue Benchmarks",
    fields: [
      { key: "adrMin", label: "Target ADR", type: "currency", pair: "adrMax", pairLabel: "to", suffix: "/night", defaultPriority: "must", help: "Average Daily Rate — the average revenue per occupied room per night." },
      { key: "occupancyMin", label: "Stabilized occupancy", type: "number", suffix: "%", pair: "occupancyMax", pairLabel: "to", defaultPriority: "must", help: "Expected occupancy rate at stabilization (after ramp-up period). Boutique hotels: 55%–75%." },
      { key: "occupancyRampMonths", label: "Occupancy ramp", type: "number", suffix: "months", defaultPriority: "must", help: "Months from opening to reach stabilized occupancy. Typical: 12–24 months for new operations." },
      { key: "revParMin", label: "RevPAR target", type: "currency", pair: "revParMax", pairLabel: "to", suffix: "/night", defaultPriority: "must", help: "Revenue Per Available Room = ADR × Occupancy. Key performance metric." },
    ],
  },
  {
    title: "Revenue Mix (% of Room Revenue)",
    fields: [
      { key: "fbShareMin", label: "Food & Beverage", type: "number", suffix: "%", pair: "fbShareMax", pairLabel: "to", defaultPriority: "must", help: "F&B revenue as a percentage of room revenue. Includes restaurant, bar, room service, catering." },
      { key: "eventsShareMin", label: "Events", type: "number", suffix: "%", pair: "eventsShareMax", pairLabel: "to", defaultPriority: "must", help: "Event revenue from weddings, corporate retreats, and private functions as % of room revenue." },
      { key: "spaShareMin", label: "Spa & Wellness", type: "number", suffix: "%", pair: "spaShareMax", pairLabel: "to", defaultPriority: "nice", help: "Spa and wellness service revenue as % of room revenue. Includes treatments, memberships." },
      { key: "otherShareMin", label: "Other services", type: "number", suffix: "%", pair: "otherShareMax", pairLabel: "to", defaultPriority: "nice", help: "Other ancillary revenue: activities, tours, retail, equestrian, experiences." },
      { key: "totalAncillaryMin", label: "Total ancillary", type: "number", suffix: "%", pair: "totalAncillaryMax", pairLabel: "to", defaultPriority: "must", help: "Sum of all non-room revenue as % of room revenue. Higher = more diversified income." },
    ],
  },
  {
    title: "Fee Structure & Returns",
    fields: [
      { key: "baseMgmtFeeMin", label: "Base management fee", type: "number", suffix: "%", pair: "baseMgmtFeeMax", pairLabel: "to", defaultPriority: "must", help: "Management fee as % of total revenue. Industry range: 3%–12% depending on services." },
      { key: "incentiveFeeMin", label: "Incentive fee", type: "number", suffix: "%", pair: "incentiveFeeMax", pairLabel: "to", defaultPriority: "must", help: "Based on Gross Operating Profit (GOP). Incentive fee as % of GOP. Aligns manager and owner interests." },
      { key: "exitCapRateMin", label: "Exit cap rate", type: "number", suffix: "%", pair: "exitCapRateMax", pairLabel: "to", defaultPriority: "must", help: "Capitalization rate assumed at disposition. Lower cap rate = higher property value." },
      { key: "targetIrr", label: "Target IRR", type: "number", suffix: "%", defaultPriority: "must", help: "Minimum threshold. Minimum Internal Rate of Return required for the investment to meet hurdle rate." },
      { key: "equityMultipleMin", label: "Equity multiple", type: "number", suffix: "x", pair: "equityMultipleMax", pairLabel: "to", defaultPriority: "must", help: "Total return on invested equity. 2.0x means investors double their money." },
      { key: "holdYearsMin", label: "Hold period", type: "number", suffix: "years", pair: "holdYearsMax", pairLabel: "to", defaultPriority: "must", help: "Planned investment hold period from acquisition to disposition." },
    ],
  },
];

export const DESCRIPTIVE_SECTIONS: DescriptiveSection[] = [
  { key: "propertyTypes", label: "Property Type & Positioning", rows: 4, help: "Target property types, architectural character, exclusions" },
  { key: "fbLevel", label: "Food & Beverage Level", rows: 5, help: "Describe the expected F&B operation level: restaurant concept, service style, cuisine direction, bar program, event catering, and revenue expectations" },
  { key: "locationCharacteristics", label: "Location Characteristics", rows: 4, help: "Privacy requirements, accessibility, tourism demand generators" },
  { key: "locationDetails", label: "Details about Location", rows: 12, help: "Rich descriptive details about what makes each target location desirable — ambiance, scenery, unique natural features, guest arrival experience, seasonal flora, and other location-specific character notes" },
  { key: "conditionNotes", label: "Property Condition Notes", rows: 3, help: "Structural condition, historic designation, architectural style" },
  { key: "groundsTopography", label: "Grounds & Topography", rows: 3, help: "Terrain, landscaping, water features, views" },
  { key: "vendorServices", label: "Vendor & Managed Services", rows: 6, help: "Third-party services coordinated through the management company" },
  { key: "regulatoryNotes", label: "Regulatory & Compliance", rows: 4, help: "Zoning, permits, fire code, ADA, licensing requirements" },
  { key: "exclusions", label: "Exclusions", rows: 5, help: "Property types, conditions, or situations that disqualify a target" },
  { key: "additionalContext", label: "Additional Context", rows: 3, help: "Any other context to include in the ICP prompt" },
];
