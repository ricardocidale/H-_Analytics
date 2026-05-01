import type { IcpConfig, IcpDescriptive, Priority } from "./icp-types";

export const PRIORITY_LABELS: Record<Priority, string> = {
  must: "Required",
  major: "Major Plus",
  nice: "Nice to Have",
  no: "Exclude",
};

export const DEFAULT_ICP_CONFIG: IcpConfig = {
  roomsMin: 10,
  roomsMax: 50,
  roomsSweetSpotMin: 20,
  roomsSweetSpotMax: 30,
  masterSuitesMin: 2,
  masterSuiteSqFt: 400,
  bedroomsMin: 15,
  bedroomsMax: 55,
  bathroomsMin: 15,
  bathroomsMax: 55,
  halfBaths: 3,
  landAcresMin: 5,
  landAcresMax: 100,
  builtSqFtMin: 8000,
  builtSqFtMax: 40000,
  livingAreas: 2,
  diningCapacityMin: 30,
  diningCapacityMax: 60,
  indoorEventMin: 50,
  indoorEventMax: 150,
  outdoorEventMin: 80,
  outdoorEventMax: 200,
  parkingMin: 30,
  parkingMax: 80,

  kitchenSqFt: 1000,
  maintenanceSqFt: 1000,
  staffQuartersMin: 4,
  staffQuartersMax: 8,
  staffHousingUnits: 3,

  pool: "must",
  poolSqFt: 400,
  secondPool: "nice",
  hotTub: "nice",
  spa: "nice",
  spaTreatmentRooms: 3,
  sauna: "nice",
  steamRoom: "nice",
  coldPlunge: "nice",
  yogaStudio: "nice",
  gym: "nice",
  gymSqFtMin: 500,
  gymSqFtMax: 1500,
  tennis: "nice",
  tennisCourts: 1,
  pickleball: "nice",
  pickleballCourts: 2,
  basketball: "nice",
  hikingTrails: "nice",
  horseFacilities: "nice",
  horseStalls: 6,
  pastureAcres: 10,
  garden: "nice",
  vineyard: "nice",
  casitas: "nice",
  casitasCount: 4,
  barn: "nice",
  glamping: "nice",
  greenhouse: "nice",
  chapel: "nice",
  firePit: "nice",
  wineCellar: "nice",
  gameRoom: "nice",
  library: "nice",
  outdoorKitchen: "nice",
  garageBays: 6,

  maxRoofAge: 15,
  minElectricalAmps: 200,
  maxRenovationBudget: 3000000,

  minSetbackFt: 200,
  minDrivewayFt: 500,

  maxAirportMin: 60,
  prefAirportMin: 30,
  maxIntlAirportMin: 120,
  prefIntlAirportMin: 60,
  maxHospitalMin: 30,
  prefHospitalMin: 15,

  acquisitionMin: 2000000,
  acquisitionMax: 8000000,
  acquisitionTargetMin: 3000000,
  acquisitionTargetMax: 5000000,
  totalInvestmentMin: 3000000,
  totalInvestmentMax: 12000000,
  renovationMin: 500000,
  renovationMax: 3000000,
  ffePerRoomMin: 15000,
  ffePerRoomMax: 30000,
  adrMin: 200,
  adrMax: 500,
  occupancyMin: 55,
  occupancyMax: 75,
  occupancyRampMonths: 15,
  revParMin: 130,
  revParMax: 350,
  fbShareMin: 35,
  fbShareMax: 60,
  eventsShareMin: 25,
  eventsShareMax: 50,
  spaShareMin: 8,
  spaShareMax: 15,
  otherShareMin: 5,
  otherShareMax: 12,
  totalAncillaryMin: 40,
  totalAncillaryMax: 70,
  baseMgmtFeeMin: 8,
  baseMgmtFeeMax: 10,
  incentiveFeeMin: 10,
  incentiveFeeMax: 15,
  exitCapRateMin: 8,
  exitCapRateMax: 10,
  targetIrr: 15,
  equityMultipleMin: 2.0,
  equityMultipleMax: 3.0,
  holdYearsMin: 7,
  holdYearsMax: 10,
  fbRating: 4,
};

export const DEFAULT_ICP_DESCRIPTIVE: IcpDescriptive = {
  propertyTypes: "Luxury boutique hotel, estate hotel, hacienda, lodge, manor, or large private estate suitable for conversion into a full-service hospitality operation. Properties must convey exclusivity, architectural character, and a strong sense of place. Chain-affiliated or conventional box hotels are excluded.",
  fbLevel: "Full-service F&B operation with chef-driven restaurant, bar/lounge program, room service, and event catering. Farm-to-table or locally sourced menus preferred. Breakfast included in rate or available à la carte. Dinner service minimum 5 nights/week. Private dining and wine pairing experiences for up to 20 guests. Commercial kitchen capable of supporting 60+ covers per service. Liquor license required or transferable. Seasonal menus and local partnerships encouraged. F&B revenue target: 25%–35% of total revenue.",
  locationCharacteristics: "Near-total privacy: secluded or estate-like setting, ideally not visible from public roads. Proximity to tourism demand generators (wine regions, mountains, beaches, cultural landmarks, national parks). Walkable or short drive to dining, shopping, and recreation. Rideshare services (Uber/Lyft) must be available in the area. Property accessible by paved road year-round.",
  locationDetails: `United States — Northeast
Hudson Valley NY: rolling meadows with wildflower borders, stone walls, and seasonal foliage; properties often feature heritage gardens and creek-side walking paths. Guests arrive via tree-lined country lanes with views of the Catskill escarpment.
Berkshires MA: mist-draped hills, mature birch and maple canopy, spring-fed ponds; estate settings with manicured lawns, sculpture gardens, and covered bridges. Autumn foliage draws peak-season visitors.
Catskills NY: forested mountain slopes with rushing creeks, hemlock groves, and wide valley views; rustic-luxe appeal with firepit clearings and trout streams on-property.
Litchfield Hills CT: pastoral horse country with white-fenced paddocks, colonial stone walls, and gentle hills; village greens and covered bridges within a short drive.

United States — Southeast
Asheville NC: Blue Ridge panoramas, rhododendron-lined drives, and cool mountain air; properties sit among old-growth hardwoods with long-range layered mountain views.
Charleston SC: live-oak allées draped in Spanish moss, tidal marshes, and warm coastal breezes; historic brick and ironwork lend timeless architectural character.
Savannah GA: garden squares, fountain courtyards, and jasmine-scented walkways; properties benefit from the city's walkable historic district and coastal island proximity.
Charlottesville VA: rolling Piedmont countryside, vineyard-studded hills, and Blue Ridge foothills; estates often feature boxwood gardens, spring houses, and farm-to-table orchards.

United States — Southwest
Austin TX Hill Country: limestone bluffs, spring-fed swimming holes, and live-oak savannas; sunset views over the Pedernales River valley with wildflower meadows in spring.
Sedona AZ: red-rock buttes, juniper-dotted mesas, and dramatic canyon light at golden hour; properties framed by Cathedral Rock or Boynton Canyon vistas.
Santa Fe NM: high-desert light, adobe architecture, piñon-pine hillsides, and distant Sangre de Cristo peaks; aromatic sage and lavender gardens surround courtyard estates.
Fredericksburg TX: peach orchards, rolling ranchland, and German-heritage stone farmsteads; wildflower-season draws visitors to hillside estates with panoramic views.

United States — West
Napa/Sonoma CA: vineyard-framed estates with lavender-lined drives, mature olive groves, and sunset views over rolling hills; morning fog burns off to reveal orderly vine rows and distant coastal ridges.
Park City/Eden UT: alpine meadows, aspen groves that shimmer gold in autumn, and ski-in/ski-out proximity; summer wildflower trails and mountain-lake reflections.
Jackson Hole WY: Grand Teton backdrop, sage-covered flats, and Snake River corridor; properties offer big-sky drama with elk and moose sightings at dawn.
Bend OR: Cascade peaks, ponderosa-pine forests, and high-desert river canyons; year-round outdoor culture with mountain views from nearly every vantage.

Latin America
Medellín, Colombia: eternal-spring climate in a lush Andean valley; properties perched on hillsides with coffee-farm panoramas and flowering bougainvillea terraces.
Cartagena, Colombia: Caribbean sea breezes, coral-stone ramparts, and bougainvillea-draped colonial courtyards; rooftop terraces overlook the old walled city and harbor.
Coffee Triangle, Colombia: emerald-green coffee plantations cascading down volcanic slopes; hacienda estates with hummingbird gardens and mountain-mist mornings.
San Miguel de Allende, Mexico: cobblestone streets, baroque-colonial facades, and rooftop views of the Parroquia; terraced gardens with fountain courtyards and jacaranda canopy.
Oaxaca, Mexico: Sierra Madre valleys, agave fields, and ancient Zapotec ruins nearby; courtyard haciendas with bougainvillea walls and mezcal-tasting patios.
Guanacaste, Costa Rica: Pacific-coast dry forest transitioning to tropical beach; howler monkeys, sunset surf breaks, and open-air estate living year-round.

Europe, Middle East & Africa
Provence, France: lavender fields, cypress-lined lanes, and honey-stone mas farmhouses; cicada-song summers with views of Mont Ventoux or the Luberon ridge.
Tuscany, Italy: undulating hills striped with olive groves and vineyards, medieval stone villas, and golden-hour light that painters have chased for centuries.
Douro Valley, Portugal: terraced vineyards cascading to the river, quintas with azulejo-tiled facades, and port-wine heritage lending old-world romance.
Mallorca, Spain: Serra de Tramuntana mountain backdrop, turquoise coves, and centuries-old finca estates surrounded by almond and citrus orchards.
Dubai, UAE (Al Barari): lush desert-garden enclave with over 1,200 species of tropical plants, private lagoons, and spa-resort tranquility minutes from the city center.`,
  conditionNotes: "Property in good to excellent structural condition; cosmetic renovation acceptable but no major structural remediation. No active pest infestation, mold, asbestos, or lead paint issues. Historic or heritage designation acceptable if renovation flexibility exists. Unique architectural provenance preferred (colonial, farmhouse, mid-century modern, Mediterranean).",
  groundsTopography: "Gentle rolling hills, flat meadows, or terraced hillside; no extreme slopes requiring retaining walls. Mature landscaping preferred (established trees, manicured gardens, hedgerows for privacy). Water features valued (pond, creek, lake frontage, fountain). Mountain, valley, ocean, vineyard, or pastoral views. Irrigation system for landscaping preferred.",
  vendorServices: "The management company coordinates third-party vendor services to each property:\n• IT: PMS, channel manager, booking engine, Wi-Fi, POS, security/surveillance, smart room technology\n• Housekeeping: daily staffing, commercial laundry, deep cleaning crews, pest control\n• Grounds: landscaping, pool/spa maintenance, HVAC/mechanical, painting/carpentry\n• Professional: accounting, legal, insurance, marketing/PR, revenue management\n• F&B: food purveyors, beverage distributors, kitchen equipment maintenance",
  regulatoryNotes: "Clear zoning for hospitality/commercial use, or demonstrable path to re-zoning within 6 months. Building permits and renovation regulations must allow conversion within 6–18 months. Fire code compliance or clear path to compliance (sprinklers, exits, alarms). ADA/accessibility compliance or feasible retrofit plan. Health department and food service licensing achievable. Liquor license available or transferable preferred.",
  exclusions: "Properties requiring more than $3M in structural renovation\nUrban high-rise or mid-rise buildings\nProperties in flood zones, wildfire extreme zones, or with unresolved environmental issues\nLocations more than 2 hours from a commercial airport\nProperties below 5 rooms or above 80 rooms\nTimeshare, fractional ownership, or condo-hotel structures\nProperties with active litigation, liens, or title disputes\nGated communities with HOA restrictions on commercial use\nProperties without year-round road access",
  additionalContext: "",
};

export const FB_RATING_LABELS: Record<number, string> = {
  1: "continental breakfast only",
  2: "limited food and beverage with light meal options",
  3: "full breakfast service with light dinner offerings",
  4: "full-service restaurant with bar and lounge program",
  5: "destination dining with chef-driven cuisine, extensive wine program, and private dining experiences",
};
