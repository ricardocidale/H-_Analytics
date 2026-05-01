import { db } from "../db";
import { properties, marketResearch } from "@shared/schema";
import { logger } from "../logger";

export function getHudsonEstateResearch() {
  return {
    marketOverview: {
      summary: "The Hudson Valley luxury hospitality market has experienced significant growth driven by weekend tourism from New York City. The region has seen a 15% increase in boutique hotel development over the past three years, with strong demand from affluent NYC residents seeking accessible rural retreats. The area benefits from a growing farm-to-table culinary scene, expanding arts and culture programming, and proximity to the metro area.",
      keyMetrics: [
        { label: "Tourism Volume", value: "4.2M annual visitors to Hudson Valley region", source: "Hudson Valley Tourism Board, 2025" },
        { label: "Hotel Supply", value: "32 boutique properties (under 50 rooms) within 30-mile radius", source: "STR Global, 2025" },
        { label: "RevPAR", value: "$136.40 market average, $245+ for boutique segment", source: "STR Global, 2025" },
        { label: "Market Growth", value: "8.2% YoY RevPAR growth in boutique segment", source: "CBRE Hotels Research, 2025" }
      ]
    },
    adrAnalysis: {
      marketAverage: "$220",
      boutiqueRange: "$280–$380",
      recommendedRange: "$310–$350",
      rationale: "The Hudson Estate's 20-room boutique positioning with partial catering supports ADR in the upper-mid range of the boutique segment. The property's estate setting and proximity to NYC justify premium pricing above market average while remaining competitive with established luxury peers.",
      comparables: [
        { name: "Hasbrouck House", adr: "$295", type: "Boutique Inn" },
        { name: "Hutton Brickyards", adr: "$350", type: "Luxury Boutique" },
        { name: "Troutbeck", adr: "$425", type: "Luxury Estate" },
        { name: "The Chatwal", adr: "$310", type: "Boutique Lodge" }
      ]
    },
    occupancyAnalysis: {
      marketAverage: "62%",
      seasonalPattern: [
        { season: "Summer (Jun–Aug)", occupancy: "80–85%", notes: "Peak season driven by NYC weekend getaways and outdoor activities" },
        { season: "Fall (Sep–Nov)", occupancy: "85–90%", notes: "Highest demand period due to foliage tourism and harvest events" },
        { season: "Winter (Dec–Feb)", occupancy: "40–50%", notes: "Trough season; holiday events and ski-adjacent demand provide a floor" },
        { season: "Spring (Mar–May)", occupancy: "60–70%", notes: "Shoulder season with gradual ramp driven by wedding bookings" }
      ],
      rampUpTimeline: "Expect 18–24 months to reach stabilized occupancy of 75–80%, with initial occupancy around 55–60% in the first six months of operations."
    },
    eventDemand: {
      corporateEvents: "Strong demand from NYC-based companies for executive retreats, off-site meetings, and team-building programs. The 2-hour drive from Manhattan makes it ideal for 1–2 night corporate bookings.",
      wellnessRetreats: "Growing segment driven by wellness tourism trends. Weekend yoga retreats, meditation workshops, and detox programs attract high-value guests willing to pay premium rates.",
      weddingsPrivate: "High demand for small, intimate weddings and celebrations. The Hudson Estate's setting provides a unique backdrop for destination events within reach of the NYC market.",
      estimatedEventRevShare: "28–35% of total revenue from events and F&B combined",
      keyDrivers: [
        "Proximity to NYC (2-hour drive) driving consistent weekend and mid-week corporate demand",
        "Growing reputation of Hudson Valley as a premier culinary and arts destination",
        "Limited supply of high-end boutique properties with event capabilities in the immediate area",
        "Strong wedding destination market for NYC-based couples seeking rural elegance",
        "Expansion of regional transit and infrastructure improving accessibility"
      ]
    },
    cateringAnalysis: {
      recommendedBoostPercent: "22%",
      marketRange: "18% - 28%",
      rationale: "The Hudson Estate's 20-room boutique scale supports a moderate catering boost. While the property targets high-end leisure and small corporate retreats, its catering penetration is limited by its physical event capacity compared to larger estate-style properties. A 22% boost reflects the premium nature of its culinary programming and strong capture from on-site guests, while remaining conservative relative to full-scale wedding venues. STR and CBRE data for Hudson Valley boutique hotels show F&B revenue typically adds 15–25% to room revenue in properties with active culinary programs.",
      factors: [
        "Small-scale event spaces (up to 40 guests) limit high-volume catering opportunities",
        "High capture rate (70%+) from on-site leisure guests for breakfast and dinner services",
        "Premium F&B pricing ($150+ per guest for catered events) leveraging local artisanal suppliers",
        "Mid-week corporate retreats typically include full-day catering packages for all attendees",
        "Seasonal wedding demand (15–20 events annually) provides high-margin catering peaks"
      ],
      eventMixBreakdown: {
        fullyCatered: "25% of events (weddings, full-day corporate retreats)",
        partiallyCatered: "45% of events (corporate meetings with lunch, partial retreat packages)",
        noCatering: "30% of events (room-only group bookings, small social gatherings)"
      }
    },
    capRateAnalysis: {
      marketRange: "7.0%–8.5%",
      boutiqueRange: "7.0%–8.0%",
      recommendedRange: "7.2%–7.8%",
      rationale: "Hudson Valley boutique assets command premium pricing with lower cap rates due to proximity to NYC and proven resilience of the drive-to leisure market. The Hudson Estate's pipeline status and renovation requirements warrant a modest premium over stabilized assets while remaining within the tight range for high-quality regional boutique hospitality.",
      comparables: [
        { name: "Hasbrouck House", capRate: "7.2%", saleYear: "2023", notes: "Stabilized boutique, similar room count" },
        { name: "Hutton Brickyards", capRate: "7.5%", saleYear: "2024", notes: "Newer development, larger scale" },
        { name: "The Maker Hotel", capRate: "6.8%", saleYear: "2022", notes: "Prime Hudson location, high-design premium" },
        { name: "Wildflower Farms", capRate: "7.1%", saleYear: "2023", notes: "Luxury positioning, Auberge managed" }
      ]
    },
    competitiveSet: [
      { name: "Hasbrouck House", rooms: "25", adr: "$295", positioning: "Restored 18th-century stone mansion with high-end F&B and pool" },
      { name: "Hutton Brickyards", rooms: "31", adr: "$350", positioning: "Industrial-chic riverfront retreat with extensive outdoor event spaces" },
      { name: "Troutbeck", rooms: "37", adr: "$425", positioning: "Historic estate focusing on wellness, culture, and high-end retreats" },
      { name: "The Chatwal Lodge", rooms: "14", adr: "$310", positioning: "Rustic luxury lodge targeting ultra-high-net-worth weekend travelers" }
    ],
    landValueAllocation: {
      recommendedPercent: "25%",
      marketRange: "20% - 30%",
      assessmentMethod: "Dutchess County tax assessor data and recent land sales in Millbrook area",
      rationale: "The 25% allocation reflects Millbrook's premium land values as a premier equestrian and estate destination in the Hudson Valley. While building improvements represent the majority of value for a boutique hotel, the underlying estate acreage carries significant value and has shown consistent appreciation. This allocation aligns with local property tax assessments for similar commercial/residential estates which typically range from 22-28% for the land component.",
      factors: [
        "Millbrook is among the highest-value sub-markets in the Hudson Valley with limited large estate supply",
        "Consistent demand for 'gentleman farms' and equestrian estates provides a high floor for land values",
        "Local zoning restrictions on new hospitality development enhance the value of grandfathered or permitted land",
        "Proximity to NYC and high-net-worth demographic drives long-term land appreciation potential",
        "The property's estate setting is a core part of its value proposition and guest experience"
      ]
    },
    risks: [
      { risk: "Economic downturn impacting NYC luxury travel spending", mitigation: "Diversify guest base through regional corporate retreats; implement dynamic pricing to maintain occupancy during troughs; focus on high-margin event revenue" },
      { risk: "Increased competition from new boutique hotel supply", mitigation: "Maintain high service standards and unique estate programming; leverage early-mover advantage in the Millbrook sub-market; build strong local partnerships" },
      { risk: "Seasonal fluctuations in occupancy", mitigation: "Develop robust mid-week corporate retreat programming; create winter-specific wellness and culinary events; target 'shoulder season' wedding bookings" },
      { risk: "Renovation cost overruns and delays", mitigation: "Detailed pre-construction planning; maintain 15% contingency in capital budget; partner with experienced regional contractors" }
    ],
    sources: [
      "STR Global – Hudson Valley Market Report, 2025",
      "CBRE Hotels Research – North American Boutique Hotel Outlook, 2025",
      "Dutchess County Tourism – Economic Impact Study, 2024",
      "Hudson Valley Tourism Board – Annual Visitor Survey, 2024",
      "PKF Hospitality Research – Boutique and Lifestyle Hotel Performance Trends, 2025",
      "Highland Group – North American Hotel Cap Rate Survey, 2024"
    ]
  };
}

export function getEdenSummitResearch() {
  return {
    marketOverview: {
      summary: "The Ogden Valley/Eden market is an emerging outdoor adventure destination experiencing rapid growth as an alternative to Park City. The area benefits from year-round demand driven by Powder Mountain and Snowbasin ski resorts in winter, and Pineview Reservoir and mountain biking in summer. Significant investment in Powder Mountain's infrastructure and the 'Boutique' positioning of the market attract affluent, adventure-focused travelers seeking less crowded luxury experiences.",
      keyMetrics: [
        { label: "Tourism Volume", value: "1.2M annual visitors to Ogden Valley region", source: "Weber County Tourism Office, 2025" },
        { label: "Hotel Supply", value: "12 boutique properties (under 50 rooms) within 20-mile radius", source: "STR Global, 2025" },
        { label: "RevPAR", value: "$152.80 market average, $285+ for boutique segment", source: "STR Global, 2025" },
        { label: "Market Growth", value: "12.4% YoY RevPAR growth in boutique segment", source: "CBRE Hotels Research, 2025" }
      ]
    },
    adrAnalysis: {
      marketAverage: "$245",
      boutiqueRange: "$320–$480",
      recommendedRange: "$390–$440",
      rationale: "Eden Summit Lodge's 20-room positioning as a luxury adventure hub supports premium pricing. The market's high seasonality (winter peaks) and the lack of luxury boutique supply in the immediate area justify rates above the regional average, especially given the proximity to Powder Mountain's ongoing upscale transformation.",
      comparables: [
        { name: "Compass Rose Lodge", adr: "$385", type: "Boutique Lodge" },
        { name: "Snowberry Inn", adr: "$310", type: "Upscale B&B" },
        { name: "Lodge at Stillwater", adr: "$350", type: "Boutique Condo-Hotel" },
        { name: "Goldener Hirsch (Park City)", adr: "$850+", type: "Luxury Comparable" }
      ]
    },
    occupancyAnalysis: {
      marketAverage: "58%",
      seasonalPattern: [
        { season: "Winter Peak (Dec–Mar)", occupancy: "85–95%", notes: "Driven by ski demand; weekends often fully booked months in advance" },
        { season: "Summer Peak (Jun–Aug)", occupancy: "75–85%", notes: "High demand for mountain biking, hiking, and Pineview Reservoir activities" },
        { season: "Spring (Apr–May)", occupancy: "35–45%", notes: "Trough season (mud season); opportunity for wellness and corporate retreats" },
        { season: "Fall (Sep–Nov)", occupancy: "55–65%", notes: "Shoulder season with foliage tourism and growing event demand" }
      ],
      rampUpTimeline: "Expect 20–24 months to reach stabilized occupancy of 72–76%, with initial occupancy around 50–55% leveraging strong winter demand in the first year."
    },
    eventDemand: {
      corporateEvents: "Emerging demand from SLC and tech-focused companies for 'adventure retreats' and team building. The 1-hour drive from Salt Lake City International Airport makes it highly accessible for national groups.",
      wellnessRetreats: "Strong potential for high-altitude wellness, yoga, and outdoor meditation programs. The secluded mountain setting is ideal for the 'digital detox' market.",
      weddingsPrivate: "Growing destination wedding market for couples seeking mountain scenery without the crowds and pricing of Park City. Scenic backdrops and outdoor venue potential drive demand.",
      estimatedEventRevShare: "25–32% of total revenue from events and F&B combined",
      keyDrivers: [
        "Proximity to Salt Lake City (1-hour drive) and international airport access",
        "Ongoing $100M+ investment in Powder Mountain infrastructure and luxury branding",
        "Limited high-end boutique competition in the immediate Eden/Huntsville area",
        "Year-round adventure demand (Skiing, Biking, Water sports)",
        "Trend toward 'less crowded' luxury mountain destinations"
      ]
    },
    cateringAnalysis: {
      recommendedBoostPercent: "25%",
      marketRange: "20% - 32%",
      rationale: "Eden Summit Lodge's 25% catering boost reflects the high-capture mountain retreat model. Given its semi-remote location and the 'all-in' nature of luxury adventure stays, guests have a higher propensity to dine on-site. Mid-week corporate groups and adventure retreats typically book all-inclusive meal packages. Furthermore, the property's mountain-modern culinary focus and limited local fine-dining options support premium F&B pricing. STR and CBRE data for mountain-resort boutique hotels show F&B revenue typically adds 22–35% to room revenue, especially in properties with comprehensive event programming.",
      factors: [
        "Remote-adjacent location increases on-site dining capture (80%+) for all meals",
        "High-margin adventure retreat packages include full catering (Breakfast, Lunch, Dinner)",
        "Outdoor scenic venue space supports mid-sized weddings with full-service catering",
        "Limited local luxury dining competition allows for premium F&B positioning and pricing",
        "Seasonal peak demand (winter/summer) allows for high-volume, high-margin catering events"
      ],
      eventMixBreakdown: {
        fullyCatered: "35% of events (mountain weddings, adventure corporate retreats)",
        partiallyCatered: "40% of events (half-day retreats, social groups with dinner focus)",
        noCatering: "25% of events (small group meetings, self-organized social stays)"
      }
    },
    capRateAnalysis: {
      marketRange: "7.5%–9.0%",
      boutiqueRange: "7.5%–8.5%",
      recommendedRange: "7.8%–8.3%",
      rationale: "Eden/Ogden Valley is an emerging luxury market with higher growth potential but slightly higher risk profile than Park City. Cap rates reflect this emerging status with a modest premium, while being compressed by the significant institutional and private capital flowing into the region's resort infrastructure.",
      comparables: [
        { name: "Compass Rose Lodge", capRate: "7.8%", saleYear: "2023", notes: "Stabilized boutique, similar market positioning" },
        { name: "Zermatt Resort (Midway)", capRate: "8.2%", saleYear: "2023", notes: "Larger resort, comparable mountain market" },
        { name: "Washington School House", capRate: "7.1%", saleYear: "2022", notes: "Park City luxury benchmark, prime location" },
        { name: "Newpark Resort", capRate: "7.9%", saleYear: "2024", notes: "Lifestyle hotel, Utah mountain market" }
      ]
    },
    competitiveSet: [
      { name: "Compass Rose Lodge", rooms: "15", adr: "$385", positioning: "Astro-tourism focused boutique lodge with observatory and high-design" },
      { name: "Snowberry Inn", rooms: "8", adr: "$310", positioning: "Traditional upscale B&B with strong local reputation and cozy atmosphere" },
      { name: "Lodge at Stillwater", rooms: "85", adr: "$350", positioning: "Condo-style hospitality with lake views and large group capacity" },
      { name: "Goldener Hirsch", rooms: "68", adr: "$850", positioning: "Park City ultra-luxury benchmark for mountain boutique hospitality" }
    ],
    landValueAllocation: {
      recommendedPercent: "22%",
      marketRange: "18% - 28%",
      assessmentMethod: "Weber County tax assessor records and recent land sales in Eden/Huntsville area",
      rationale: "The 22% allocation reflects the rapid appreciation of land in the Ogden Valley while accounting for the high cost of mountain construction (improvements). Land values in Eden have seen 40-60% growth since 2021 due to the Powder Mountain expansion. Weber County commercial land-to-improvement ratios typically range from 18-25% for resort-area properties. This allocation positions the property at the upper end of that range to reflect the strategic value of its location relative to the resort expansion.",
      factors: [
        "Rapid land appreciation driven by institutional investment in Powder Mountain and Nordic Valley",
        "Limited inventory of developable commercial parcels in Eden and Huntsville",
        "High mountain construction costs (HVAC, insulation, materials) increase the relative value of improvements",
        "Water rights and infrastructure availability add significant value to the underlying land component",
        "Strategic location within minutes of two major ski resorts and Pineview Reservoir"
      ]
    },
    risks: [
      { risk: "Climate change and variable snowfall impacting winter demand", mitigation: "Develop robust summer and shoulder-season adventure programming; invest in diverse indoor amenities (spa, fitness); target non-ski corporate retreat market" },
      { risk: "Economic sensitivity of luxury travel market", mitigation: "Maintain lean operations; focus on drive-in SLC market as a recession-resistant base; offer diverse package types (adventure vs. relaxation)" },
      { risk: "Dependency on resort infrastructure (Powder Mountain)", mitigation: "Engage with resort management on joint marketing; support local infrastructure development; maintain high-quality on-site guest experience independent of resorts" },
      { risk: "Regional competition from Park City and Jackson Hole", mitigation: "Position as a 'less crowded, more authentic' adventure alternative; emphasize accessibility from SLC airport; leverage unique high-altitude branding" }
    ],
    sources: [
      "STR Global – Utah Mountain Market Report, 2025",
      "CBRE Hotels Research – Mountain Resort Investment Outlook, 2025",
      "Weber County Economic Development – Tourism Impact Study, 2024",
      "Utah Office of Tourism – Annual Visitor Research, 2024",
      "PKF Hospitality Research – Ski Resort Performance Trends, 2025",
      "Highland Group – Western U.S. Hotel Cap Rate Survey, 2024"
    ]
  };
}

export function getAustinHillsideResearch() {
  return {
    marketOverview: {
      summary: "The Austin hospitality market remains one of the most dynamic in the U.S., driven by the city's tech boom, vibrant music scene, and status as a major event destination (SXSW, ACL, F1). While downtown supply has increased, there is a growing demand for 'urban-adjacent' luxury retreats that offer Hill Country scenery with quick access to the city's amenities. The West Austin/Hill Country market benefits from affluent local demographics and a strong corporate retreat sector.",
      keyMetrics: [
        { label: "Tourism Volume", value: "30M+ annual visitors to Austin metro area", source: "Visit Austin, 2025" },
        { label: "Hotel Supply", value: "45 boutique/lifestyle properties within Austin metro", source: "STR Global, 2025" },
        { label: "RevPAR", value: "$165.20 market average, $295+ for boutique segment", source: "STR Global, 2025" },
        { label: "Market Growth", value: "6.8% YoY RevPAR growth in boutique segment", source: "CBRE Hotels Research, 2025" }
      ]
    },
    adrAnalysis: {
      marketAverage: "$235",
      boutiqueRange: "$300–$450",
      recommendedRange: "$340–$390",
      rationale: "Austin Hillside's 20-room positioning as a sophisticated urban retreat supports pricing in the upper tier of the boutique market. The unique Hill Country setting within 20 minutes of downtown allows for a premium over standard urban boutiques while remaining competitive with established luxury retreats like Hotel Saint Cecilia and Commodore Perry Estate.",
      comparables: [
        { name: "Hotel Saint Cecilia", adr: "$450", type: "Luxury Boutique" },
        { name: "Commodore Perry Estate", adr: "$550", type: "Luxury Estate" },
        { name: "Hotel Magdalena", adr: "$320", type: "Lifestyle Boutique" },
        { name: "Miraval Austin", adr: "$800+", type: "Wellness Resort" }
      ]
    },
    occupancyAnalysis: {
      marketAverage: "70%",
      seasonalPattern: [
        { season: "Spring Peak (Mar–May)", occupancy: "85–95%", notes: "Driven by SXSW, spring weather, and festival season" },
        { season: "Fall Peak (Sep–Nov)", occupancy: "80–90%", notes: "Driven by ACL, F1, and football season" },
        { season: "Winter (Dec–Feb)", occupancy: "50–60%", notes: "Shoulder season; holiday travel and corporate retreats provide stability" },
        { season: "Summer (Jun–Aug)", occupancy: "55–65%", notes: "Trough season due to heat; leisure and small group demand from cooler regions" }
      ],
      rampUpTimeline: "Expect 15–18 months to reach stabilized occupancy of 78–82%, leveraging Austin's high baseline demand and year-round event calendar."
    },
    eventDemand: {
      corporateEvents: "Exceptional demand from Austin's tech sector (Apple, Google, Tesla, Oracle) for executive retreats, team off-sites, and recruiting events. The city's status as a 'tech hub' drives significant mid-week corporate demand.",
      wellnessRetreats: "Growing market for urban wellness and day-retreats. The Hill Country setting is ideal for yoga, wellness, and holistic health programming without the travel time of more remote locations.",
      weddingsPrivate: "Strong demand for 'Hill Country Chic' weddings. High-net-worth local and destination couples seek unique, scenic venues with high-end F&B capabilities.",
      estimatedEventRevShare: "32–40% of total revenue from events and F&B combined",
      keyDrivers: [
        "Proximity to downtown Austin (20 minutes) and Austin-Bergstrom International Airport",
        "Concentration of major tech corporate headquarters and high-net-worth local residents",
        "Year-round event calendar driving compression nights and premium ADR",
        "Strong demand for outdoor/scenic event spaces in a private setting",
        "Trend toward 'staycation' luxury travel among Austin's growing affluent population"
      ]
    },
    cateringAnalysis: {
      recommendedBoostPercent: "28%",
      marketRange: "22% - 35%",
      rationale: "Austin Hillside's 28% catering boost reflects the city's sophisticated culinary culture and strong corporate event demand. Austin has one of the highest F&B capture rates in the country for boutique hotels, driven by both guest demand and a thriving local dining scene. The property's 'Hill Country' positioning supports premium catering packages ($175–$250 per guest) for corporate retreats and weddings. STR and CBRE data for Austin lifestyle properties show F&B revenue typically adds 25–40% to room revenue, especially in properties that leverage Austin's reputation as a top-tier food destination.",
      factors: [
        "Strong mid-week corporate retreat demand with full-day catering packages",
        "High local 'drive-in' demand for weekend brunch and dinner programming",
        "Premium catering pricing leveraging Austin's farm-to-table and BBQ reputation",
        "Strategic focus on high-margin social events (rehearsal dinners, private celebrations)",
        "Year-round outdoor event usability in Austin's climate maximizes catering opportunities"
      ],
      eventMixBreakdown: {
        fullyCatered: "40% of events (weddings, corporate off-sites, tech recruiting summits)",
        partiallyCatered: "35% of events (day meetings, social dinners, wellness workshops)",
        noCatering: "25% of events (small group meetings, leisure group stays)"
      }
    },
    capRateAnalysis: {
      marketRange: "6.5%–8.0%",
      boutiqueRange: "6.5%–7.5%",
      recommendedRange: "6.8%–7.3%",
      rationale: "Austin is a high-liquidity, high-demand market with significant institutional interest, leading to lower cap rates (compressed pricing). The property's West Austin/Hill Country location is highly desirable, commanding cap rates at the lower end of the market range, similar to stabilized premium assets.",
      comparables: [
        { name: "Hotel Saint Cecilia", capRate: "6.5%", saleYear: "2022", notes: "Stabilized luxury boutique, prime location" },
        { name: "Hotel San Jose", capRate: "6.7%", saleYear: "2023", notes: "Lifestyle boutique benchmark" },
        { name: "Arrive Austin", capRate: "7.2%", saleYear: "2023", notes: "East Austin lifestyle hotel" },
        { name: "South Congress Hotel", capRate: "6.9%", saleYear: "2024", notes: "Premium boutique, high F&B revenue" }
      ]
    },
    competitiveSet: [
      { name: "Hotel Saint Cecilia", rooms: "14", adr: "$450", positioning: "Ultra-private, high-design luxury boutique in South Congress area" },
      { name: "Commodore Perry Estate", rooms: "54", adr: "$550", positioning: "Auberge-managed luxury estate with extensive grounds and high-end F&B" },
      { name: "Hotel Magdalena", rooms: "89", adr: "$320", positioning: "Modern lifestyle boutique with focus on Austin's musical and cultural heritage" },
      { name: "Miraval Austin", rooms: "117", adr: "$800", positioning: "Destination wellness resort in the Hill Country (higher-end benchmark)" }
    ],
    landValueAllocation: {
      recommendedPercent: "30%",
      marketRange: "25% - 35%",
      assessmentMethod: "Travis County tax assessor data and recent West Austin land sales",
      rationale: "West Austin land values are among the highest in Texas, driven by scarcity and proximity to the city's economic engines. Land value as a percentage of total value is typically higher in Austin than in more remote or emerging markets. Travis County land allocations for hospitality properties in West Austin/South Congress often reach 28-35%. The 30% allocation reflects the significant underlying value of the Hill Country estate parcel while accounting for the high-end building improvements.",
      factors: [
        "Austin has experienced some of the highest land value appreciation in the U.S. since 2020",
        "West Austin/Hill Country parcels with scenic views and development potential are extremely rare",
        "Strong local and national institutional demand for Austin hospitality real estate compressed cap rates and lifted land values",
        "Local zoning and environmental protections (Edwards Aquifer) limit supply and increase the value of existing developable land",
        "The property's proximity to wealthy West Austin residential enclaves provides a high floor for land valuation"
      ]
    },
    risks: [
      { risk: "Oversupply of lifestyle/boutique hotels in the Austin market", mitigation: "Differentiate through unique Hill Country setting and private retreat branding; focus on corporate retreat market which is less saturated than leisure; maintain high guest loyalty through service excellence" },
      { risk: "Economic sensitivity of the tech sector", mitigation: "Diversify guest base through national corporate and local leisure demand; leverage Austin's diverse event calendar (Formula 1, festivals); maintain flexible operating model" },
      { risk: "Increasing property taxes in Travis County", mitigation: "Conservative tax budgeting; active management of property tax protests; leverage high ADR potential to offset rising costs" },
      { risk: "Competition for talent in Austin's tight labor market", mitigation: "Competitive compensation and benefits; strong employer branding; invest in training and career development to reduce turnover" }
    ],
    sources: [
      "STR Global – Austin Hotel Market Report, 2025",
      "CBRE Hotels Research – Texas Hospitality Market Outlook, 2025",
      "Visit Austin – Tourism Economic Impact & Visitor Profile, 2024",
      "Austin Board of Realtors (ABoR) – Commercial Real Estate Market Report, 2024",
      "PKF Hospitality Research – Urban Retreat Performance Trends, 2025",
      "Highland Group – Austin Hotel Cap Rate Survey, 2024"
    ]
  };
}

export function getCasaMedellinResearch() {
  return {
    marketOverview: {
      summary: "Medellín, Colombia has transformed into a global destination for digital nomads, tech entrepreneurs, and luxury travelers. El Poblado is the city's premier hospitality hub, known for its vibrant nightlife, high-end dining, and growing tech scene. The market has seen a 20% increase in international arrivals YoY, with a significant shift toward boutique and lifestyle hotels that cater to the 'bleisure' (business + leisure) segment.",
      keyMetrics: [
        { label: "Tourism Volume", value: "1.5M international visitors to Medellín in 2024", source: "ProColombia / Medellín Tourism Observatory, 2025" },
        { label: "Hotel Supply", value: "28 boutique properties (under 50 rooms) in El Poblado sub-market", source: "STR Global, 2025" },
        { label: "RevPAR", value: "$92.40 market average, $155+ for boutique segment (USD)", source: "STR Global, 2025" },
        { label: "Market Growth", value: "15.2% YoY RevPAR growth in boutique segment", source: "CBRE Hotels Research, 2025" }
      ]
    },
    adrAnalysis: {
      marketAverage: "$110",
      boutiqueRange: "$150–$280",
      recommendedRange: "$180–$230",
      rationale: "Casa Medellín's 30-room positioning in the heart of El Poblado supports pricing in the upper tier of the local boutique market. While lower in absolute USD terms than U.S. markets, these rates represent a significant premium over local averages and reflect the property's luxury positioning and international guest target. Comparable properties like Marquee and Click Clack demonstrate strong demand at these price points.",
      comparables: [
        { name: "The Marquee Medellín", adr: "$210", type: "Luxury Boutique" },
        { name: "Click Clack Hotel", adr: "$185", type: "Lifestyle Boutique" },
        { name: "Hotel Park 10", adr: "$145", type: "Traditional Luxury" },
        { name: "Cannua (Guatapé)", adr: "$350+", type: "Luxury Eco-Retreat" }
      ]
    },
    occupancyAnalysis: {
      marketAverage: "65%",
      seasonalPattern: [
        { season: "Peak (Dec–Jan, Jul–Aug)", occupancy: "85–95%", notes: "Driven by international holiday travel and Flower Festival (Feria de las Flores)" },
        { season: "Shoulder (Feb–Jun)", occupancy: "65–75%", notes: "Steady demand from digital nomads and business travelers" },
        { season: "Low (Sep–Nov)", occupancy: "50–60%", notes: "Increased rain; opportunity for corporate retreats and local events" }
      ],
      rampUpTimeline: "Expect 12–15 months to reach stabilized occupancy of 74–78%, leveraging Medellín's strong year-round digital nomad and business traveler appeal."
    },
    eventDemand: {
      corporateEvents: "High demand from the growing 'Tech Medellín' sector for coworking, off-sites, and networking events. Many international companies use Medellín as a regional hub for Latin American operations.",
      wellnessRetreats: "Growing interest in urban wellness and yoga. Medellín's 'City of Eternal Spring' climate is ideal for year-round rooftop wellness programming.",
      weddingsPrivate: "Emerging market for 'boutique city weddings' and private social celebrations among the city's affluent residents and international diaspora.",
      estimatedEventRevShare: "22–28% of total revenue from events and F&B combined",
      keyDrivers: [
        "Status as a premier global hub for digital nomads and 'remote work' tourism",
        "Medellín's transformation into a major Latin American tech and innovation center",
        "Year-round mild climate ('City of Eternal Spring') supporting consistent tourism",
        "High concentration of high-end culinary and nightlife options in El Poblado",
        "Improved international flight connectivity to the U.S. and Europe"
      ]
    },
    cateringAnalysis: {
      recommendedBoostPercent: "18%",
      marketRange: "15% - 25%",
      rationale: "Casa Medellín's 18% catering boost reflects the urban boutique model in a high-density dining district. While the property targets high-end travelers, El Poblado is famous for its independent culinary scene, which creates significant competition for on-site F&B. However, rooftop bars and event-led catering (networking events, social celebrations) command strong margins and high demand. The 18% boost captures the property's focus on premium social events and on-site guest F&B, while acknowledging the competitive local dining landscape. STR and regional data for Medellín boutiques show F&B revenue typically adds 15–22% to room revenue, primarily driven by bar and event sales.",
      factors: [
        "Strong rooftop bar and social event demand among guests and local residents",
        "Networking and 'tech mixer' events drive mid-week partial catering demand",
        "International guest base with higher USD spending power for on-site F&B services",
        "Competitive local El Poblado dining scene limits full-day leisure dining capture",
        "Growing social event market for intimate city celebrations with partial catering"
      ],
      eventMixBreakdown: {
        fullyCatered: "15% of events (small city weddings, formal corporate meetings)",
        partiallyCatered: "55% of events (networking mixers, tech off-sites, social gatherings)",
        noCatering: "30% of events (coworking groups, small leisure group meetings)"
      }
    },
    capRateAnalysis: {
      marketRange: "8.5%–10.5%",
      boutiqueRange: "8.5%–9.5%",
      recommendedRange: "9.0%–10.0%",
      rationale: "Latin American emerging markets command higher cap rates than U.S. markets to account for currency and country risk. However, Medellín's boutique hospitality segment has shown significant resilience and institutional interest, keeping cap rates for high-quality El Poblado assets at the lower end of the regional range.",
      comparables: [
        { name: "Click Clack Hotel", capRate: "8.8%", saleYear: "2023", notes: "Stabilized lifestyle boutique benchmark" },
        { name: "Marquee Medellín", capRate: "9.1%", saleYear: "2024", notes: "Luxury boutique, similar positioning" },
        { name: "Hotel Park 10", capRate: "9.5%", saleYear: "2022", notes: "Traditional luxury, core location" },
        { name: "Sofitel Calablanca (Cartagena)", capRate: "8.5%", saleYear: "2023", notes: "Regional luxury benchmark" }
      ]
    },
    competitiveSet: [
      { name: "The Marquee Medellín", rooms: "42", adr: "$210", positioning: "High-design luxury boutique with renowned rooftop bar and F&B" },
      { name: "Click Clack Hotel", rooms: "60", adr: "$185", positioning: "Art-focused lifestyle hotel with a strong social scene and creative branding" },
      { name: "Hotel Park 10", rooms: "55", adr: "$145", positioning: "Established traditional luxury hotel with high service standards" },
      { name: "Celestino Boutique Hotel", rooms: "22", adr: "$165", positioning: "Modern, minimalist boutique hotel in the heart of the social district" }
    ],
    landValueAllocation: {
      recommendedPercent: "20%",
      marketRange: "15% - 25%",
      assessmentMethod: "Medellín municipal tax records and recent El Poblado land transactions",
      rationale: "El Poblado land values have increased dramatically, but construction costs for high-rise or high-density boutique hotels remain a significant portion of total project value. In Medellín, land value allocations typically range from 15-22% for urban hospitality. The 20% allocation reflects the prime 'Gold Zone' location in El Poblado while recognizing the high quality and density of the improvements required for a luxury boutique hotel in this market.",
      factors: [
        "El Poblado is the most valuable real estate sub-market in Medellín with very limited developable land",
        "Recent rezoning and density increases in Medellín have boosted the value of 'buildable' land parcels",
        "Foreign direct investment (FDI) has specifically targeted El Poblado hospitality real estate",
        "Improvements for luxury urban hotels include significant investment in rooftop amenities and tech infrastructure",
        "The property's location within walking distance of prime dining and nightlife adds a significant location premium"
      ]
    },
    risks: [
      { risk: "Political and regulatory risk in Colombia", mitigation: "Engage local legal counsel for compliance; structure ownership through appropriate corporate vehicles; maintain relationships with local government and tourism authorities" },
      { risk: "Currency fluctuation (COP/USD)", mitigation: "Price rooms in USD for international guests; implement natural hedging through USD-denominated revenue streams; maintain operating reserves in hard currency" },
      { risk: "Infrastructure and utility reliability", mitigation: "Invest in backup power systems, water treatment, and internet redundancy; build relationships with reliable local service providers" },
      { risk: "Safety perception among international travelers", mitigation: "Implement robust security protocols; partner with reputable travel agencies and review platforms; invest in positive PR and influencer marketing to counter outdated perceptions" }
    ],
    sources: [
      "STR Global LATAM – Colombia Hotel Performance Report, 2025",
      "CBRE Hotels Americas – Latin America Boutique Hotel Investment Outlook, 2025",
      "HVS – Medellín Lodging Market Assessment, 2024",
      "ProColombia – International Tourism Statistics, 2025",
      "JLL Hotels & Hospitality – Colombia Hospitality Market Overview, 2025",
      "Highland Group – Emerging Market Hotel Cap Rate Survey, 2024"
    ]
  };
}

export function getBlueRidgeResearch() {
  return {
    marketOverview: {
      summary: "Asheville, North Carolina has established itself as one of the Southeast's premier arts, wellness, and culinary destinations. The Blue Ridge Mountains setting, combined with a thriving brewery and farm-to-table scene, attracts affluent visitors year-round with peak demand during fall foliage season. The boutique hotel segment has matured significantly, with strong demand from both leisure travelers and corporate retreat groups seeking mountain settings within driving distance of major Southeast metros.",
      keyMetrics: [
        { label: "Tourism Volume", value: "11.8M annual visitors to Buncombe County", source: "Explore Asheville Convention & Visitors Bureau, 2025" },
        { label: "Hotel Supply", value: "38 boutique/independent properties within Asheville metro", source: "STR Global, 2025" },
        { label: "RevPAR", value: "$140.70 market average, $258+ for boutique segment", source: "STR Global, 2025" },
        { label: "Market Growth", value: "7.4% YoY RevPAR growth in boutique segment", source: "CBRE Hotels Research, 2025" }
      ]
    },
    adrAnalysis: {
      marketAverage: "$210",
      boutiqueRange: "$275–$400",
      recommendedRange: "$325–$360",
      rationale: "Blue Ridge Manor's 30-room full-catering estate positioning in the Blue Ridge Mountains supports upper-mid boutique pricing. The larger room count enables group and event bookings at scale while the full F&B capability and mountain setting justify premium rates competitive with established luxury peers.",
      comparables: [
        { name: "The Omni Grove Park Inn", adr: "$350", type: "Historic Resort" },
        { name: "Inn on Biltmore Estate", adr: "$395", type: "Luxury" },
        { name: "Foundry Hotel", adr: "$320", type: "Boutique" },
        { name: "Grand Bohemian Hotel", adr: "$305", type: "Boutique" }
      ]
    },
    occupancyAnalysis: {
      marketAverage: "67%",
      seasonalPattern: [
        { season: "Fall Foliage (Sep–Nov)", occupancy: "90–95%", notes: "Highest demand period driven by Blue Ridge Parkway foliage tourism; October commands highest rates" },
        { season: "Summer (Jun–Aug)", occupancy: "75–85%", notes: "Strong family and leisure travel; music festivals and outdoor events drive demand" },
        { season: "Spring (Mar–May)", occupancy: "65–75%", notes: "Growing season with wildflower tourism, wedding bookings, and corporate retreats" },
        { season: "Winter (Dec–Feb)", occupancy: "45–55%", notes: "Holiday events and ski-adjacent demand from nearby slopes; wellness retreat programming provides a floor" }
      ],
      rampUpTimeline: "Expect 15–20 months to reach stabilized occupancy of 74–78%, with strong initial demand during fall season (80%+) and steady growth across other seasons."
    },
    eventDemand: {
      corporateEvents: "Growing demand from Charlotte, Atlanta, and Raleigh-Durham corporate markets for executive retreats and team building in a mountain setting. The 2–3 hour drive from multiple major metros creates an accessible yet removed retreat environment.",
      wellnessRetreats: "Asheville's established wellness community supports strong year-round demand for yoga retreats, meditation workshops, sound healing, and holistic health programming. The mountain setting and local wellness practitioners provide a deep talent pool.",
      weddingsPrivate: "Exceptional demand for mountain weddings and destination celebrations. Asheville consistently ranks among the top U.S. wedding destinations, with demand for venues accommodating 60–120 guests in scenic settings.",
      estimatedEventRevShare: "44–50% of total revenue from events and F&B combined",
      keyDrivers: [
        "Multiple major metro areas within 2–3 hour drive (Charlotte, Atlanta, Raleigh-Durham, Greenville)",
        "Asheville's established reputation as a top U.S. wellness and culinary destination",
        "Blue Ridge Parkway's status as the most-visited National Park Service site driving tourism",
        "Growing corporate retreat market among Southeast tech and finance companies",
        "Strong wedding destination market with year-round demand for mountain venues"
      ]
    },
    cateringAnalysis: {
      recommendedBoostPercent: "42%",
      marketRange: "35% - 50%",
      rationale: "Blue Ridge Manor's 30-room estate in Asheville commands the highest catering boost in the portfolio. Asheville is a top-tier U.S. wedding destination with exceptionally high full-catering penetration, and the property's mountain estate setting makes it a premier venue for fully catered celebrations. The city's nationally recognized culinary scene (farm-to-table, craft beverage) enhances F&B programming and justifies premium catering pricing. Comparable Asheville properties report F&B at 31–35% of room revenue including catering, versus a 22% base, implying a 40–50% boost for estate-style properties.",
      factors: [
        "Asheville ranks among top 10 U.S. wedding destinations — mountain estate weddings (40% of events) are almost always fully catered",
        "Nationally recognized culinary scene enables premium farm-to-table catering at $175–$300 per guest",
        "Corporate retreats from Charlotte/Atlanta (30% of events) book all-inclusive packages including 3 daily meals",
        "Wellness retreats (20% of events) include full meal programs leveraging local organic/artisanal food suppliers",
        "Property's remote mountain setting means guests dine on-site for nearly all meals, maximizing F&B capture"
      ],
      eventMixBreakdown: {
        fullyCatered: "50% of events (mountain weddings, corporate retreats with all meals, wellness programs)",
        partiallyCatered: "30% of events (day meetings with lunch, partial retreat packages)",
        noCatering: "20% of events (room-only leisure guests, small self-catered gatherings)"
      }
    },
    capRateAnalysis: {
      marketRange: "7.5%–9.0%",
      boutiqueRange: "7.5%–8.5%",
      recommendedRange: "7.5%–8.5%",
      rationale: "Asheville's established tourism market, strong brand recognition, and diverse demand drivers support attractive cap rates for boutique properties. The market's maturity and proven performance reduce risk premiums compared to emerging destinations, though seasonal concentration adds a modest premium.",
      comparables: [
        { name: "Foundry Hotel", capRate: "7.8%", saleYear: "2023", notes: "Boutique hotel, downtown Asheville" },
        { name: "Grand Bohemian Hotel", capRate: "7.5%", saleYear: "2022", notes: "Boutique hotel, Biltmore Village" },
        { name: "The Restoration", capRate: "8.2%", saleYear: "2024", notes: "Boutique hotel, Charleston SC (comparable market)" },
        { name: "Old Edwards Inn", capRate: "7.9%", saleYear: "2023", notes: "Luxury boutique, Highlands NC" }
      ]
    },
    competitiveSet: [
      { name: "The Omni Grove Park Inn", rooms: "510", adr: "$350", positioning: "Iconic historic resort with spa, golf, and Blue Ridge Mountain views" },
      { name: "Inn on Biltmore Estate", rooms: "210", adr: "$395", positioning: "Luxury hotel within Biltmore Estate with exclusive estate access" },
      { name: "Foundry Hotel", rooms: "87", adr: "$320", positioning: "Adaptive reuse boutique in Arts District with rooftop bar and local programming" },
      { name: "Grand Bohemian Hotel", rooms: "104", adr: "$305", positioning: "Art-focused boutique in Biltmore Village with gallery, spa, and dining" }
    ],
    landValueAllocation: {
      recommendedPercent: "28%",
      marketRange: "22% - 32%",
      assessmentMethod: "Buncombe County tax assessor records and comparable Blue Ridge estate sales",
      rationale: "Blue Ridge Manor's 18-acre mountain estate setting near Asheville sits in a market where land values have steadily appreciated due to the region's growing tourism economy and limited supply of large estate parcels. Buncombe County land-to-improvement ratios for hospitality properties average 24-30%, with larger acreage parcels trending higher. At 28%, the allocation reflects the property's substantial acreage and scenic Blue Ridge Mountain setting while recognizing that building improvements for a full-service boutique hotel represent the majority of total value.",
      factors: [
        "Buncombe County tax assessor records show land allocations of 24-30% for commercial hospitality properties in the greater Asheville area",
        "18-acre mountain estate parcels with views and privacy are increasingly scarce, commanding premium per-acre pricing of $80,000-$120,000",
        "Comparable Blue Ridge estate sales (Old Edwards Inn, Highlands NC; Blackberry Farm, TN) show land allocations of 25-32%",
        "Asheville's growing tourism market has driven 15-20% land value appreciation since 2021, supporting a higher land allocation",
        "Property's distance from downtown Asheville (30 minutes) moderates land values compared to in-town hospitality properties"
      ]
    },
    risks: [
      { risk: "Seasonal concentration in fall foliage period", mitigation: "Develop four-season programming including winter wellness retreats, spring wildflower packages, and summer music/culinary events; target corporate retreat market for year-round bookings" },
      { risk: "Short-term rental competition on platforms like Airbnb", mitigation: "Differentiate through full-service hospitality, curated experiences, and event capabilities that STRs cannot replicate; support local STR regulation efforts; emphasize service quality and consistency" },
      { risk: "Limited commercial airlift to Asheville Regional Airport", mitigation: "Partner with ground transportation services from Charlotte and Greenville-Spartanburg airports; develop packages that include transfer services; market to drive-in markets within 3-hour radius" },
      { risk: "Rising property costs in Asheville market", mitigation: "Lock in favorable acquisition terms early; implement efficiency-driven operations to maintain margins; explore phased renovation approach to manage capital expenditure" }
    ],
    sources: [
      "STR Global – Asheville Hotel Market Performance Report, 2025",
      "CBRE Hotels Research – Southeast Boutique Hotel Investment Outlook, 2025",
      "HVS – Western North Carolina Lodging Market Analysis, 2024",
      "PKF Hospitality Research – Mountain Resort Performance Trends, 2025",
      "Explore Asheville Convention & Visitors Bureau – Tourism Economic Impact Study, 2025",
      "Highland Group – Southeast Hotel Cap Rate Survey, 2024"
    ]
  };
}

export async function seedMissingMarketResearch() {
  try {
    const allProperties = await db.select().from(properties);
    if (allProperties.length === 0) return;

    const existingResearch = await db.select().from(marketResearch);
    const propertyIdsWithResearch = new Set(existingResearch.map(r => r.propertyId));

    const propertyMap: Record<string, number> = {};
    for (const p of allProperties) {
      propertyMap[p.name] = p.id;
    }

    const missingNames = allProperties
      .filter(p => !propertyIdsWithResearch.has(p.id))
      .map(p => p.name);

    if (missingNames.length === 0) return;

    const fullSeedValues = await getFullMarketResearchValues(propertyMap);
    const toInsert = fullSeedValues.filter(v => {
      const prop = allProperties.find(p => p.id === v.propertyId);
      return prop && missingNames.includes(prop.name);
    });

    if (toInsert.length > 0) {
      await db.insert(marketResearch).values(toInsert);
      logger.info(`Seeded market research for ${toInsert.length} properties: ${missingNames.join(", ")}`, "seed");
    }
  } catch (err: unknown) {
    logger.error(`Error seeding market research: ${err}`, "seed");
  }
}

async function getFullMarketResearchValues(propertyMap: Record<string, number>) {
  const values: any[] = [];

  if (propertyMap["The Hudson Estate"]) {
    values.push({
      userId: null, type: "property", propertyId: propertyMap["The Hudson Estate"],
      title: "Market Research: The Hudson Estate", llmModel: "seed-data",
      content: getHudsonEstateResearch(),
    });
  }
  if (propertyMap["Eden Summit Lodge"]) {
    values.push({
      userId: null, type: "property", propertyId: propertyMap["Eden Summit Lodge"],
      title: "Market Research: Eden Summit Lodge", llmModel: "seed-data",
      content: getEdenSummitResearch(),
    });
  }
  if (propertyMap["Austin Hillside"]) {
    values.push({
      userId: null, type: "property", propertyId: propertyMap["Austin Hillside"],
      title: "Market Research: Austin Hillside", llmModel: "seed-data",
      content: getAustinHillsideResearch(),
    });
  }
  if (propertyMap["Casa Medellín"]) {
    values.push({
      userId: null, type: "property", propertyId: propertyMap["Casa Medellín"],
      title: "Market Research: Casa Medellín", llmModel: "seed-data",
      content: getCasaMedellinResearch(),
    });
  }
  if (propertyMap["Blue Ridge Manor"]) {
    values.push({
      userId: null, type: "property", propertyId: propertyMap["Blue Ridge Manor"],
      title: "Market Research: Blue Ridge Manor", llmModel: "seed-data",
      content: getBlueRidgeResearch(),
    });
  }

  return values;
}
