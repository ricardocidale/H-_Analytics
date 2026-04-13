---
name: research-methodology
description: Definitive research and intelligence methodology for H+ Analytics. Covers property classification (STR chain scales, star ratings, service levels), business model types (Hotel vs VRBO/STR), comp set selection, revenue mix benchmarks, USALI expense ratios by segment, management fee structures, geography-driven cost adjustments, and the full AI research pipeline. Use whenever building, modifying, or debugging the research engine, property assumptions, default seeding, badge recommendations, or intelligence attribution.
---

# H+ Analytics — Research & Intelligence Methodology

## Purpose

This skill defines **how the H+ Analytics app derives, validates, and presents financial intelligence** for hospitality properties and the management company. It answers the foundational question: *Given a property's characteristics, what are credible, industry-benchmarked ranges for every financial assumption the user must configure?*

The methodology must be:
1. **Credible** — grounded in named, verifiable industry sources (STR, HVS, CBRE, PKF, AAHOA, AHLA, HFTP, USALI)
2. **Explainable** — every badge must trace back to a methodology the user can understand
3. **Practical** — uses only property characteristics that are readily available or derivable from minimal input
4. **Adaptive** — handles Hotel, VRBO/STR, and future business models with the same framework

---

## Part 1: Property Classification Framework

### 1.1 The Industry Standard: STR Chain Scales

Smith Travel Research (STR, now CoStar) classifies every branded hotel globally into **7 chain scale segments** based on the prior year's system-wide ADR. This is the definitive industry segmentation:

| # | Segment | Typical ADR Range (US) | Service Level | Example Brands |
|---|---------|----------------------|---------------|----------------|
| 1 | **Luxury** | $313+ | Full-Service | Ritz-Carlton, St. Regis, Park Hyatt, Four Seasons, Aman |
| 2 | **Upper Upscale** | $173–$312 | Full-Service | Marriott, Hilton, Westin, Hyatt Regency, Renaissance |
| 3 | **Upscale** | $131–$172 | Select/Full | Courtyard, Hilton Garden Inn, Hyatt Place, AC Hotels |
| 4 | **Upper Midscale** | $107–$130 | Select/Limited | Hampton Inn, Holiday Inn Express, Fairfield, Comfort Inn |
| 5 | **Midscale** | $82–$106 | Limited | La Quinta, Baymont, Best Western, Wyndham |
| 6 | **Economy** | $55–$81 | Limited | Days Inn, Super 8, Motel 6, Red Roof Inn |
| 7 | **Independent** | Varies | Varies | Unbranded properties — classified by ADR into equivalent tier |

**Key insight for H+ Analytics**: Independent/boutique properties (our primary use case) don't belong to a chain, so we classify them into an **equivalent STR tier** using their ADR, star rating, and service level. This is standard industry practice.

### 1.2 Star Ratings — What They Mean

There is **no universal global standard** for star ratings. In the US, there is no government-regulated system. The two authoritative rating bodies are:

#### Forbes Travel Guide (Formerly Mobil)
- Uses 900+ attributes evaluated by anonymous inspectors
- Rates: **5-Star** (exceptional), **4-Star** (outstanding), **Recommended**
- Focuses on service quality, luxury amenities, and attention to detail

#### AAA Diamond Rating
- Uses 27 criteria across housekeeping, maintenance, and amenities
- 1 Diamond (basic) through 5 Diamond (ultimate luxury)

#### Star Rating Characteristics (Industry Consensus)

| Star Level | Room Quality | F&B | Amenities | Service | Staffing Ratio |
|-----------|-------------|-----|-----------|---------|---------------|
| **5-Star** | Luxury furnishings, premium linens, smart room tech | Multiple restaurants incl. fine dining, 24h room service, sommelier | Full spa, pool, concierge, valet, butler service, business center | Highly personalized, anticipatory | 2.0–3.0 staff/room |
| **4-Star** | High-quality furnishings, upgraded bath amenities | At least 1 full-service restaurant, room service, lounge/bar | Fitness center, pool (often), concierge, business services | Attentive, consistent | 1.2–2.0 staff/room |
| **3-Star** | Comfortable, well-maintained | Restaurant or breakfast included, limited room service | Fitness room, possible pool, meeting rooms | Competent, responsive | 0.6–1.2 staff/room |
| **2-Star** | Clean, functional | Continental breakfast, vending | Basic amenities | Front desk assistance | 0.3–0.6 staff/room |
| **1-Star** | Basic, clean | None or minimal | Minimal | Self-service | <0.3 staff/room |

### 1.3 Service Level Classification

Beyond stars, the industry classifies hotels by **service model**:

| Service Level | Characteristics | Typical Departments |
|--------------|-----------------|-------------------|
| **Full-Service** | Restaurant(s), room service, meeting space, concierge, valet, bellhop | Rooms, F&B, Events, Spa, Other |
| **Select-Service** | Lobby bar/restaurant, limited meeting space, no room service | Rooms, Limited F&B, Limited Events |
| **Limited-Service** | Breakfast included, no restaurant, no room service | Rooms only (F&B minimal) |
| **Extended-Stay** | Kitchen suites, weekly rates, grocery service | Rooms, minimal amenities |
| **All-Inclusive** | All F&B, activities, entertainment bundled into rate | Rooms, F&B, Activities (bundled) |

### 1.4 How H+ Analytics Should Classify Properties

The app should derive the **equivalent STR tier** from these property fields:
1. **Star Rating** (1–5) — primary classifier
2. **Hospitality Type** — hotel, resort, boutique_hotel, business_hotel, wellness_resort, conference_hotel, extended_stay, **vrbo** (NEW)
3. **ADR** — validates star rating alignment (a 5-star at $100 ADR is misclassified)
4. **Room Count** — affects operational scale
5. **Location** — gateway city vs secondary vs tertiary market
6. **Amenity Indicators** — hasFB, hasEvents, hasWellness (derived from revenue shares)

#### Tier Derivation Rules

```
IF starRating = 5 AND startAdr >= $300 → Luxury
IF starRating = 4 AND startAdr >= $150 → Upper Upscale
IF starRating = 3 AND startAdr >= $100 → Upscale
IF starRating = 2 AND startAdr >= $70  → Upper Midscale
IF starRating = 1                       → Midscale/Economy

Hospitality type adjustments:
  wellness_resort, boutique_hotel → bump UP one tier (premium positioning)
  extended_stay → bump DOWN one tier (lower ADR per night, longer stays)
  conference_hotel → no adjustment (varies by market)
  vrbo → separate business model (see Part 2)
```

---

## Part 2: Business Model Types

### 2.1 Hotel Business Model (Current Default)

The traditional hotel model uses the USALI framework:
- Revenue driven by ADR × Occupancy × Room Count
- Departmental expenses (Rooms, F&B, Events, Other)
- Undistributed operating expenses (Admin, Marketing, Property Ops, Utilities, IT)
- Management fees (Base + Incentive)
- Fixed charges → NOI → FF&E → ANOI → Debt Service → Net Income

### 2.2 VRBO/STR Business Model (NEW — Must Be Added)

Short-term rental (STR) properties operate fundamentally differently:

| Dimension | Hotel Model | VRBO/STR Model |
|-----------|------------|----------------|
| **Revenue Source** | Room revenue + F&B + Events + Other | Nightly rental rate only |
| **Occupancy Pattern** | 60–85% stabilized | 50–75% (seasonal, shorter booking windows) |
| **ADR Dynamics** | Brand/segment-driven, relatively stable | Highly dynamic (weekday vs weekend, season, events) |
| **Staffing** | On-site team (0.3–3.0 staff/room) | Minimal (remote management + cleaning crews) |
| **F&B Revenue** | 12–28% of total | 0% (no F&B operations) |
| **Event Revenue** | 3–25% of total | 0% (no event space) |
| **Platform Fees** | OTA commissions 15–25% | Airbnb 15.5%, VRBO 8% host-side |
| **Management Fee** | 2–10% of revenue (professional HMC) | 20–35% of revenue (STR manager) |
| **Cleaning** | Housekeeping dept (daily service) | Per-turnover cleaning ($75–$300/turn) |
| **Marketing** | Brand + direct + OTA mix | Platform listings + direct booking site |
| **Maintenance** | Property ops department | On-call handyman, seasonal maintenance |
| **Guest Services** | Concierge, front desk, bellhop | Digital check-in, messaging, guidebook |
| **Insurance** | Commercial hospitality policy | Short-term rental policy (higher per-unit) |
| **Property Tax** | Commercial assessment | Residential or mixed-use assessment |
| **Depreciation** | 39-year (commercial RE) | 27.5-year (residential RE, IRS) |

#### VRBO/STR Expense Structure (% of Revenue)

| Category | % of Revenue | Notes |
|----------|-------------|-------|
| Platform fees (Airbnb/VRBO) | 8–16% | Host-only fee model |
| Cleaning/turnover | 10–15% | Per-guest turnover cost |
| Management fee | 20–35% | If using professional manager |
| Maintenance/repairs | 3–5% | Ongoing upkeep |
| Utilities | 5–8% | Owner-paid (higher per-night vs hotel) |
| Insurance | 2–4% | STR-specific policy |
| Property taxes | 1–3% | Varies by jurisdiction |
| Supplies/amenities | 2–3% | Consumables restocking |
| Marketing (direct) | 1–3% | Beyond platform listings |
| **Total Expenses** | **52–92%** | Wide range based on market |

#### Management Company Services for VRBO Properties

A management company serving VRBO/STR properties provides a **narrower** set of services:

| Service | Included | Notes |
|---------|----------|-------|
| Listing optimization & marketing | Yes | Primary value-add |
| Dynamic pricing/revenue management | Yes | Critical for STR performance |
| Guest communication & screening | Yes | 24/7 messaging, review management |
| Cleaning coordination | Yes | Scheduling, quality control |
| Maintenance coordination | Yes | Vendor management |
| Accounting & reporting | Yes | Owner statements, tax docs |
| Channel management | Yes | Multi-platform distribution |
| Revenue management (full-service) | No | Typically simpler algorithms |
| HR/staffing | No | No on-site staff |
| F&B operations | No | No food service |
| Event sales | No | No event space |
| Procurement/purchasing | No | Minimal purchasing |

### 2.3 Lodge Business Model (Midpoint Between Hotel & VRBO)

Lodges are larger STR-style properties (typically 8–20 rooms) that operate on a whole-property rental basis. They offer hotel-like premium amenities (gym, sauna, hot tub, sports courts, media rooms) but lack F&B departments, events staff, or a front desk. Financially, lodges sit between Hotel and VRBO models.

| Dimension | Hotel Model | Lodge Model | VRBO/STR Model |
|-----------|------------|-------------|----------------|
| **Property Size** | 20–500+ rooms | 8–20 rooms | 1–6 rooms |
| **Rental Basis** | Per-room, per-night | Whole-property rental | Per-property, per-night |
| **Revenue Source** | Room + F&B + Events + Other | Nightly rental rate only | Nightly rental rate only |
| **F&B Revenue** | 12–28% of total | 15–25% of room rev (breakfast, meals, drinks, picnics) | 0% (no F&B operations) |
| **Event Revenue** | 3–25% of total | 0% (no event space staffing) | 0% (no event space) |
| **Amenities** | Full-service (restaurant, spa, concierge) | Premium (gym, sauna, hot tub, courts, media room) | Basic (kitchen, WiFi, parking) |
| **Staffing** | On-site team (0.3–3.0 staff/room) | Minimal on-site (caretaker + cleaning crews) | Minimal (remote management + cleaning) |
| **Management Fee** | 2–10% of revenue (HMC) | 15–25% of revenue | 20–35% of revenue (STR manager) |
| **Cleaning** | Housekeeping dept (daily) | Per-turnover ($150–$500/turn, larger property) | Per-turnover ($75–$300/turn) |
| **Maintenance** | Property ops department | Higher than VRBO (premium amenity upkeep) | On-call handyman |
| **Utilities** | 5–8% of revenue | 6–10% of revenue (larger property, amenities) | 5–8% of revenue |
| **Insurance** | Commercial hospitality policy | Commercial or mixed-use policy | STR-specific policy |
| **Depreciation** | 39-year (commercial RE) | 27.5-year (residential RE) or 39-year | 27.5-year (residential RE) |
| **Platform Fees** | OTA commissions 15–25% | Airbnb/VRBO 8–16% + direct booking site | Airbnb 15.5%, VRBO 8% |
| **Occupancy** | 60–85% stabilized | 45–70% (seasonal, group bookings) | 50–75% (seasonal) |

#### Lodge Expense Structure (% of Revenue)

| Category | % of Revenue | Notes |
|----------|-------------|-------|
| Platform fees (Airbnb/VRBO) | 8–16% | Host-only fee model, plus direct bookings |
| Cleaning/turnover | 8–12% | Higher per-turn cost but fewer turns (whole-property) |
| Management fee | 15–25% | Between hotel HMC and full STR manager |
| Maintenance/repairs | 5–8% | Premium amenity upkeep (hot tub, sauna, courts, gym) |
| Utilities | 6–10% | Larger property, more amenities |
| Insurance | 2–4% | Commercial or mixed-use policy |
| Property taxes | 1–3% | Varies by jurisdiction |
| Supplies/amenities | 2–4% | Gym equipment, sauna supplies, court maintenance |
| Marketing (direct) | 2–4% | Direct booking site + platform listings |
| **Total Expenses** | **49–85%** | Midpoint between hotel and VRBO ranges |

### 2.4 Architecture for Business Model Variable

The property schema includes a `businessModel` field:

```typescript
businessModel: text("business_model").notNull().default("hotel"),
// Allowed values: "hotel" | "lodge" | "vrbo"
// Future: "serviced_apartment" | "glamping" | "coliving"
```

This field determines:
1. Which expense categories apply
2. Which revenue streams are active
3. What management services are relevant
4. Which depreciation schedule to use (39yr vs 27.5yr)
5. Which comparable data sources to query
6. What fee structure benchmarks to reference

---

## Part 3: Revenue Mix Benchmarks by Segment

### 3.1 Hotel Revenue Mix (% of Total Revenue)

| Revenue Stream | Select-Service | Boutique/Lifestyle | Business/Convention | Full-Service Resort | Wellness Resort |
|---------------|---------------|-------------------|-------------------|-------------------|----------------|
| **Rooms** | 85–95% | 70–80% | 55–65% | 55–65% | 50–60% |
| **Food & Beverage** | 2–5% | 12–18% | 20–28% | 20–28% | 15–22% |
| **Events/Meetings** | 1–3% | 3–8% | 15–25% | 8–15% | 3–8% |
| **Spa/Wellness** | — | 2–5% | 1–3% | 5–10% | 12–20% |
| **Other** | 2–5% | 3–7% | 4–8% | 5–10% | 5–10% |
| **Typical GOP Margin** | 40–50% | 25–35% | 35–40% | 35–40% | 30–38% |

**Source attribution**: CBRE Hotels *Trends in the Hotel Industry* 2024, PKF Hospitality Research *Hotel Horizons*, STR/CoStar benchmarking data.

### 3.2 Mapping to App Fields

The app's `revShareEvents`, `revShareFB`, `revShareOther` are expressed as **% of Room Revenue** (not total revenue). Conversion:

```
revShareFB_of_rooms = (F&B % of total) / (Rooms % of total)
Example for Full-Service Resort: 
  F&B = 25% of total, Rooms = 60% of total
  revShareFB = 0.25 / 0.60 = 0.417 (41.7% of room revenue)
```

### 3.3 VRBO/STR Revenue Mix

| Revenue Stream | % of Total Revenue |
|---------------|-------------------|
| **Nightly rental** | 85–95% |
| **Cleaning fees** | 5–12% |
| **Pet/additional guest fees** | 0–3% |
| **Experience add-ons** | 0–2% |

---

## Part 4: Operating Expense Ratios by Segment

### 4.1 USALI Departmental Expenses (% of Total Revenue)

| Department | Luxury (5★) | Upper Upscale (4★) | Upscale (3★) | Upper Midscale | Midscale/Economy |
|-----------|------------|-------------------|-------------|---------------|-----------------|
| **Rooms** | 18–22% | 20–25% | 22–27% | 25–30% | 28–35% |
| **Food & Beverage** | 65–75%* | 60–70%* | 55–65%* | N/A or minimal | N/A |
| **Events/Meetings** | 50–60%* | 55–65%* | 55–65%* | N/A | N/A |
| **Other Operated** | 40–60%* | 45–55%* | 50–60%* | 50–60%* | N/A |

*F&B, Events, Other: expressed as % of their own departmental revenue*

### 4.2 Undistributed Operating Expenses (% of Total Revenue)

| Category | Luxury (5★) | Upper Upscale (4★) | Upscale (3★) | Upper Midscale | Midscale |
|----------|------------|-------------------|-------------|---------------|---------|
| **Admin & General** | 7–10% | 7–9% | 8–10% | 8–11% | 9–12% |
| **Marketing & Sales** | 5–8% | 4–7% | 3–5% | 2–4% | 1–3% |
| **Property Operations** | 4–6% | 4–5% | 4–5% | 3–5% | 3–5% |
| **Utilities** | 3–5% | 4–6% | 4–6% | 5–7% | 5–8% |
| **IT & Telecom** | 1–2% | 1–2% | 0.5–1.5% | 0.5–1% | 0.3–0.8% |
| **Insurance** | 1–2% | 1–2% | 1.5–2.5% | 1.5–2.5% | 1.5–3% |
| **Total Undistributed** | 21–33% | 21–31% | 21–30% | 20–30% | 20–32% |

**Source attribution**: CBRE *Trends* 2024, HotStats *Profit Matters*, PKF Hospitality Research, AAHOA industry surveys. Note: USALI 12th Edition provides the *structure* for reporting; actual benchmark ratios come from these third-party data providers using USALI-compliant data.

### 4.3 GOP and NOI Margins by Segment

| Segment | GOP Margin | NOI Margin | Notes |
|---------|-----------|-----------|-------|
| **Luxury** | 32–38% | 22–30% | Higher revenue offsets higher costs |
| **Upper Upscale** | 35–40% | 25–32% | Best balance of rate and efficiency |
| **Upscale** | 33–38% | 24–30% | Growing segment |
| **Upper Midscale** | 38–44% | 28–35% | Lean operations, strong margins |
| **Midscale/Economy** | 38–41% | 28–33% | Lowest costs, lowest revenue |
| **VRBO/STR** | 30–50% | 20–40% | High variance by market/management |

---

## Part 5: Management Fee Structures

### 5.1 Base Management Fee (% of Total Revenue)

| Operator Type | Fee Range | Most Common | Notes |
|--------------|-----------|------------|-------|
| **Non-Branded / Third-Party** | 1.5–3.0% | 2.0–2.5% | Increasingly below 2.5% |
| **Branded (Marriott, Hilton, etc.)** | 2.5–4.0% | 3.0% | Brand premium |
| **Luxury/Specialty Operator** | 3.0–5.0% | 4.0% | Higher expertise premium |
| **International (Large Hotels)** | 1.0–2.0% | 1.5% | Scale economies |
| **VRBO/STR Manager** | 20–35% | 25% | All-in management fee |

**Source**: HVS *A New Approach to Hotel Management Fees* (2024), DLA Piper HMA Intelligence, CBRE Trends.

### 5.2 Incentive Management Fee (% of GOP)

| Context | Fee Range | Notes |
|---------|-----------|-------|
| **Standard HMA** | 8–15% of GOP | Only paid when GOP > 0 |
| **Luxury/Specialty** | 10–20% of GOP | Premium for expertise |
| **Owner's Priority Return** | Fee subordinated | IMF only paid after owner hits target IRR |
| **VRBO/STR** | N/A | Incentive not typical; flat % model instead |

### 5.3 Service Category Fee Breakdown

When the base management fee is itemized into service categories, industry norms are:

| Service Category | Typical Rate (% of Revenue) | Service Model |
|-----------------|---------------------------|---------------|
| **Marketing & Sales** | 0.5–1.5% | Centralized |
| **Technology & Reservations** | 0.5–1.2% | Centralized |
| **Accounting & Finance** | 0.3–0.8% | Centralized |
| **Revenue Management** | 0.5–1.5% | Centralized |
| **General Management** | 1.0–2.5% | Direct |
| **Procurement** | 0.3–0.8% | Centralized |
| **HR & Training** | 0.3–0.8% | Direct |
| **Total** | 3.4–9.1% | — |

### 5.4 Fee Adjustment by Property Characteristics

| Property Factor | Effect on Fees | Rationale |
|----------------|---------------|-----------|
| **Room count < 50** | +1–2% base fee | Higher per-unit management cost |
| **Room count > 200** | -0.5–1% base fee | Scale economies |
| **Full-service (F&B + Events)** | +0.5–1% base fee | More complex operations |
| **Select-service / Limited** | -0.5–1% base fee | Simpler operations |
| **VRBO/STR** | 20–35% all-in | Completely different model |
| **New/Pre-opening** | +1–3% first 2 years | Higher startup effort |
| **Wellness/Spa** | +0.5–1% base fee | Specialized expertise required |

---

## Part 6: Geography-Driven Cost Adjustments

### 6.1 Labor Cost Geography

Labor is the single largest hotel expense (33–43% of total expenses) and is **most sensitive to geography**.

| Region/Market | Labor CPOR* | vs National Median | Key Driver |
|--------------|------------|-------------------|-----------|
| **NYC / San Francisco** | $65–$85 | +35–75% above | Unions, min wage $16–$18/hr |
| **Miami / LA** | $50–$65 | +5–35% above | Market competition |
| **National Median (US)** | $48.32 | Baseline | — |
| **Southeast / Midwest** | $35–$45 | -7–27% below | Lower cost of living |
| **Latin America** | $15–$30 | -40–70% below | Emerging market wages |
| **Southeast Asia** | $8–$20 | -60–85% below | Low labor costs |

*Cost Per Occupied Room (2025 data)*

**Unionized vs Non-Union**: Unionized properties see labor at ~43% of total expenses vs ~33.5% for non-union properties.

### 6.2 Property Tax Variation

| Jurisdiction | Effective Tax Rate (of Assessed Value) | Notes |
|-------------|--------------------------------------|-------|
| **Texas** | 1.5–2.5% | No state income tax, high property tax |
| **California** | 1.0–1.25% (Prop 13 limit) | Capped at acquisition value |
| **New York** | 1.5–3.0% | City + county assessments |
| **Florida** | 0.8–1.5% | Favorable for commercial |
| **Colombia** | 0.3–1.0% | Varies by municipality |
| **Mexico** | 0.1–0.3% | Relatively low |

### 6.3 Insurance Cost Variation

| Factor | Effect on Insurance Rate |
|--------|------------------------|
| **Coastal / Hurricane zone** | +50–200% premium |
| **Earthquake zone (CA)** | +30–100% premium |
| **Flood zone** | +25–75% premium |
| **Urban crime area** | +10–30% premium |
| **Fire risk (wildfire)** | +20–80% premium |

### 6.4 Utility Cost Variation

| Factor | Effect |
|--------|--------|
| **Cold climate** | Higher heating costs (+15–40%) |
| **Hot/humid climate** | Higher HVAC costs (+10–30%) |
| **Hawaii / Islands** | +40–80% (fuel import costs) |
| **Solar/renewable available** | -10–25% potential savings |

---

## Part 7: Research Engine Methodology

### 7.1 Property Research Profile (Auto-Derived from Assumptions)

Instead of requiring a separate ICP, the research engine should **automatically derive a research profile** from each property's existing assumptions. This is the key insight: the property's own data IS its research profile.

#### Derivable Research Profile Fields

| Research Profile Field | Derived From | Logic |
|-----------------------|-------------|-------|
| **Equivalent STR Tier** | starRating + startAdr + hospitalityType | See §1.4 Tier Derivation Rules |
| **Service Level** | revShareFB, revShareEvents | If revShareFB > 0.10 → Full-Service; if 0.03-0.10 → Select; else Limited |
| **Has F&B Operations** | revShareFB | > 0.05 = yes |
| **Has Event/Meeting Space** | revShareEvents | > 0.05 = yes |
| **Has Wellness/Spa** | hospitalityType + description | wellness_resort type, or keyword detection |
| **Market Type** | city + stateProvince + country | Gateway / Secondary / Tertiary / Resort / Rural classification |
| **Property Scale** | roomCount | Boutique (<50), Small (50-100), Mid (100-200), Large (200+) |
| **Target Guest Profile** | hospitalityType + starRating + location | Leisure/Business/Group/Mixed |
| **Business Model** | businessModel field | Hotel vs VRBO determines entire research approach |
| **Post-Improvement State** | buildingImprovements + description + amenity indicators | Research should reflect the property AS IT WILL OPERATE, not as-acquired |

#### The Post-Improvement Principle

**Critical**: Research must reflect the property's **operating state after improvements**, not its acquisition state. If a property is being acquired as a tired 3-star and $2M in improvements will add a pool, spa, and upgraded F&B, the research comparables should target 4-star boutique/wellness hotels — because that's what the property will compete against.

The app derives this from:
1. `buildingImprovements` amount (signals renovation scope)
2. `starRating` (set by user to reflect target, not current state)
3. Revenue share assumptions (user sets F&B/Event/Other shares reflecting planned amenities)
4. `hospitalityType` (user selects target type)
5. `description` field (may contain improvement details)

### 7.2 Comparable Selection Criteria (Comp Set)

Following STR/CBRE/HVS methodology, a valid comp set requires matching on these criteria (in priority order):

1. **Location proximity** — same submarket or demand zone (5–15 mile radius for urban, broader for resort)
2. **Star rating / chain scale** — within ±1 tier of target property
3. **Room count** — within ±50% of target (a 20-room boutique cannot comp against a 500-room convention hotel)
4. **Service level** — same service category (full vs select vs limited)
5. **Demand generators** — shared demand sources (business district, airport, beach, convention center)
6. **Age/condition** — similar vintage or renovation state
7. **F&B presence** — both have or both lack restaurant operations
8. **Amenity profile** — similar amenity tiers (pool, spa, fitness, meeting space)

The research engine should use **progressive relaxation** if insufficient comps are found: first loosen geography (submarket → MSA → state), then room count range, then star rating.

### 7.3 Research Attribution & Credibility

Every research value presented to users must carry:

| Field | Purpose | Example |
|-------|---------|---------|
| **Source Name** | Named authority | "STR/CoStar 2024", "CBRE Trends", "HVS Fee Survey" |
| **Source Type** | Category | "industry", "government", "market_data", "ai_synthesis" |
| **Confidence Level** | Data quality | "high" (verified API data), "medium" (industry benchmark), "low" (AI estimate) |
| **Date/Vintage** | Currency | "2024 Q4", "2025 Annual" |
| **Methodology** | How derived | "STR chain-scale weighted average for Upper Upscale segment in Southeast US" |

### 7.4 Property URLs as Research Sources

User-provided property URLs (managed via the `property_urls` table) serve as first-party source material for the research engine. This enriches AI research with real-world data specific to the property being analyzed.

#### URL Categories & Research Value

| URL Type | Examples | Research Value |
|----------|----------|----------------|
| **OTA Listings** | Airbnb, VRBO, Booking.com | Live ADR, occupancy signals, guest reviews, amenity list |
| **Property Website** | Direct booking site | Brand positioning, target market, rate card |
| **Review Sites** | TripAdvisor, Google Reviews | Guest sentiment, service quality, comp positioning |
| **Market Reports** | STR, HVS, CBRE links | Market data, comp set performance |
| **Competitor Sites** | Nearby hotel websites | Competitive landscape, rate benchmarking |

#### How URLs Feed Research

1. **Context Pack Inclusion**: Property `sourceUrls` (text array on the properties table) are included in the property context pack narrative sent to the research engine
2. **Relevance Scoring**: AI-based relevance scoring (via LLM analysis of page content) with heuristic domain fallback for known hospitality sites. URLs with relevanceScore >= 0.6 are flagged as relevant
3. **Validation Gate**: Only URLs that pass GET-request validation (response.ok = 2xx status, 15s timeout) are marked valid
4. **SSRF Protection**: URL validation includes hostname/IP pattern checks (RFC1918 blocking, metadata IP blocking, internal TLD blocking, protocol restriction)

#### URL Lifecycle in Research

```
URL Added → Validation (GET request, 15s timeout) → AI Relevance Scoring
  ↓                                                        ↓
  ↓                                              Status badge (Valid/Relevant/Broken)
  ↓                                                        ↓
sourceUrls array on properties table → Context Pack Builder
  ↓
Research Engine (N+1 pipeline) sees URLs as reference sources
  ↓
AI can extract: property details, photos, amenities, location info, pricing signals
```

#### Pinecone Indexing

Validated, relevant URLs are indexed into the `properties` Pinecone namespace for retrieval during research:

| Aspect | Detail |
|--------|--------|
| **Vector ID format** | `prop-url:{propertyId}:{urlId}` |
| **Upsert trigger** | After batch validation, relevant URLs (relevanceScore >= 0.6) are upserted via `upsertChunks("properties", chunks)` |
| **Delete trigger** | Stale/invalid URLs are removed via `deleteVectors("properties", staleIds)` |
| **Text content** | `"Property {name} ({location}) reference link: {url} {title}"` |
| **Metadata** | `{ propertyId, propertyName, location, url, title, relevanceScore, type: "property-url" }` |
| **Consumer** | `server/ai/research-orchestrator.ts` queries Pinecone for `prop-url:{propertyId}` chunks, filters by ID prefix, and appends matched URLs as "Property Reference URLs" section in the research prompt |
| **Max results** | 10 URL chunks per property per research run |

#### Key Files
- Schema: `shared/schema/properties.ts` (`property_urls` table)
- Storage: `server/storage/property-urls.ts` (PropertyUrlStorage CRUD)
- Routes: `server/routes/properties.ts` (5 URL endpoints + Pinecone upsert/delete after validation)
- Research consumer: `server/ai/research-orchestrator.ts` (URL retrieval during N+1 pipeline)
- Pinecone service: `server/ai/pinecone-service.ts` (`upsertChunks`, `deleteVectors`, `queryChunks`)
- UI: `client/src/components/property-edit/PropertyLinksSection.tsx`

### 7.5 The N+1 Synthesis Pipeline

The research engine uses a multi-model parallel synthesis approach:

```
Phase 1 — Parallel Analyst Panels (2 independent LLMs)
├─ Analyst A (Gemini Flash): Quantitative focus — numbers, ranges, statistical evidence
├─ Analyst B (Claude Sonnet): Market Strategy focus — narrative, risk, positioning
└─ Memory Retrieval (Pinecone): Historical research for temporal context

Phase 2 — API Validation
├─ Live market data: Xotelo (OTA rates), STR/CoStar (ADR/Occ/RevPAR)
├─ Economic indicators: FRED (CPI, SOFR, Treasury yields)
├─ Risk data: Moody's/S&P Global (credit risk, economic outlook)
└─ Cross-reference: Flag contradictions between AI estimates and API data

Phase 3 — Synthesis (+1 Model)
├─ High-reasoning model (Claude Opus) reconciles all inputs
├─ Widens ranges if analysts disagree significantly
├─ Assigns confidence levels per metric
└─ Outputs structured JSON with attribution
```

---

## Part 8: Default Value Seeding Strategy

### 8.1 Tier-Based Default Cascading

When a new property is created, defaults should be seeded based on its derived STR tier:

| Assumption | Luxury | Upper Upscale | Upscale | Upper Midscale | Midscale | VRBO/STR |
|-----------|--------|---------------|---------|---------------|---------|----------|
| **Starting ADR** | $350+ | $200 | $150 | $120 | $90 | $180 |
| **Start Occupancy** | 50% | 55% | 60% | 60% | 55% | 50% |
| **Max Occupancy** | 75% | 80% | 82% | 85% | 80% | 70% |
| **Stabilization (mo)** | 48 | 36 | 30 | 24 | 18 | 12 |
| **ADR Growth** | 4% | 3% | 3% | 2.5% | 2% | 3% |
| **Rev Share F&B** | 35% | 25% | 15% | 5% | 0% | 0% |
| **Rev Share Events** | 25% | 30% | 20% | 5% | 0% | 0% |
| **Rev Share Other** | 10% | 7% | 5% | 3% | 2% | 5% |
| **Cost Rate Rooms** | 18% | 20% | 23% | 26% | 30% | 15% |
| **Cost Rate F&B** | 12% | 10% | 7% | 2% | 0% | 0% |
| **Cost Rate Admin** | 8% | 8% | 9% | 10% | 11% | 5% |
| **Cost Rate Marketing** | 5% | 3% | 2% | 2% | 1% | 3% |
| **Cost Rate Prop Ops** | 5% | 4% | 4% | 4% | 3% | 4% |
| **Cost Rate Utilities** | 4% | 5% | 5% | 6% | 6% | 7% |
| **Base Mgmt Fee** | 4% | 3.5% | 3% | 2.5% | 2% | 25% |
| **Incentive Fee** | 15% | 12% | 10% | 10% | 8% | 0% |

### 8.2 Geography Adjustments to Defaults

After tier-based seeding, apply geography multipliers:

```
IF country = "Colombia" OR country = "Mexico":
  laborCosts × 0.40  (60% lower labor)
  propertyTax × 0.50 (50% lower tax)
  ADR × 0.50–0.70    (lower rate markets)
  
IF state = "Hawaii":
  utilities × 1.50   (50% higher)
  insurance × 1.30   (30% higher)
  
IF city = "New York" OR city = "San Francisco":
  laborCosts × 1.50  (50% higher)
  insurance × 1.20   (20% higher)
```

---

## Part 9: Management Company Research Profile

### 9.1 Auto-Derived Company Profile

The management company's research profile should be derived from its **portfolio composition**:

| Profile Dimension | Derived From | Logic |
|------------------|-------------|-------|
| **Portfolio Mix** | Active properties' hospitalityTypes | "3 boutique hotels, 1 wellness resort, 2 VRBOs" |
| **Average Tier** | Weighted avg starRating of portfolio | Determines comparable management companies |
| **Service Breadth** | Which service categories are active | Full-service vs select-service operator |
| **Geographic Footprint** | Properties' locations | Single-market vs multi-market vs international |
| **Portfolio Scale** | Total room count across properties | Small (<200), Medium (200-1000), Large (1000+) |
| **Revenue Per Key** | Portfolio total revenue / total rooms | Determines overhead allocation efficiency |

### 9.2 Fee Calibration by Portfolio

The management company's fees should be benchmarked against operators with similar portfolios:

```
Small boutique operator (3–5 luxury properties, <200 rooms total):
  Base Fee: 3.5–5.0% (higher per-property management intensity)
  Incentive Fee: 12–20% (aligned with luxury segment)
  Service markup: 15–25%
  
Mid-size operator (10–20 properties, 500–2000 rooms):
  Base Fee: 2.5–3.5%
  Incentive Fee: 10–15%
  Service markup: 15–20%
  
Large operator (50+ properties, 5000+ rooms):
  Base Fee: 1.5–2.5%
  Incentive Fee: 8–12%
  Service markup: 10–15% (volume purchasing power)
```

---

## Part 10: Industry KPIs and Metrics

### 10.1 Core Operating Metrics

| Metric | Formula | What It Tells You |
|--------|---------|------------------|
| **ADR** | Room Revenue ÷ Rooms Sold | Average price per occupied room |
| **Occupancy** | Rooms Sold ÷ Rooms Available | Utilization rate |
| **RevPAR** | ADR × Occupancy | Revenue efficiency per available room |
| **TRevPAR** | Total Revenue ÷ Available Rooms | Total revenue intensity |
| **GOPPAR** | GOP ÷ Available Rooms | Profit per available room |
| **GOP Margin** | GOP ÷ Total Revenue | Operating profitability |
| **NOI Margin** | NOI ÷ Total Revenue | Net operating profitability |
| **DSCR** | NOI ÷ Total Debt Service | Debt coverage ability |
| **Flow-Through** | Δ GOP ÷ Δ Revenue | How much incremental revenue drops to profit |
| **CPOR** | Total Labor Cost ÷ Rooms Sold | Labor efficiency |
| **RevPAR Index (RGI)** | Property RevPAR ÷ Comp Set RevPAR | Market share performance |

### 10.2 Investment Metrics

| Metric | Formula | What It Tells You |
|--------|---------|------------------|
| **Cap Rate** | NOI ÷ Property Value | Yield on investment |
| **IRR** | Internal Rate of Return on equity cash flows | Total return including time value |
| **Equity Multiple** | Total Cash Returned ÷ Total Equity Invested | Cash-on-cash return |
| **WACC** | Weighted cost of debt + equity | Discount rate for DCF |
| **Price Per Key** | Purchase Price ÷ Room Count | Per-room acquisition cost |
| **Cost Per Key** | (Purchase + Improvements) ÷ Room Count | Total per-room investment |

---

## Part 11: Data Sources & Credibility Hierarchy

### 11.1 Source Ranking

| Tier | Source | Data Type | Credibility |
|------|--------|----------|-------------|
| **Tier 1 — Gold Standard** | STR/CoStar | ADR, Occupancy, RevPAR, Supply | Industry definitive |
| **Tier 1** | FRED (Federal Reserve) | CPI, Interest Rates, GDP | Government data |
| **Tier 1** | IRS Publications | Depreciation, Tax Rules | Legal authority |
| **Tier 2 — Industry Authority** | HVS | Fee surveys, Feasibility | Leading advisory |
| **Tier 2** | CBRE Hotels (*Trends*) | Expense ratios, Operating stats | Largest RE services firm |
| **Tier 2** | PKF Hospitality | Financial benchmarks | Established consultancy |
| **Tier 2** | HotStats | Real-time P&L benchmarks | Granular hotel data |
| **Tier 3 — Industry Surveys** | AAHOA | Owner surveys, benchmarks | Hotel owners association |
| **Tier 3** | AHLA | Industry trends, labor data | Industry trade group |
| **Tier 3** | HFTP | Technology cost benchmarks | Hospitality finance/tech |
| **Tier 4 — Market Data** | Xotelo / OTA scraping | Live rates, availability | Real-time pricing |
| **Tier 4** | Airbnb/VRBO (Apify) | STR rates, occupancy | Platform data |
| **Tier 5 — AI Synthesis** | LLM-derived estimates | Gap-filling, narrative | Lowest confidence |

### 11.2 Attribution Requirements

Every research badge displayed in the app must show:
1. **Range value** (e.g., "3%–5%")
2. **Source name** (e.g., "HVS Fee Survey 2024")
3. **Source type icon** (industry / government / market / AI)
4. When clicked: **methodology explanation** in popover

---

## Part 12: Guardrails and Validation Rules

### 12.1 Reasonableness Checks

The research engine should flag values that fall outside these guardrails:

| Metric | Minimum | Maximum | Action if Violated |
|--------|---------|---------|-------------------|
| ADR | $30 | $2,000 | Warning + explanation required |
| Occupancy | 20% | 98% | Hard reject if outside |
| RevPAR | $15 | $1,500 | Warning |
| Base Mgmt Fee (Hotel) | 1% | 8% | Warning |
| Base Mgmt Fee (VRBO) | 15% | 40% | Warning |
| Incentive Fee | 5% | 25% | Warning |
| GOP Margin | 15% | 65% | Warning |
| Cap Rate | 3% | 15% | Warning |
| Room Count | 1 | 2,000 | Hard reject if outside |

### 12.2 Cross-Validation Rules

| Rule | Check | Rationale |
|------|-------|-----------|
| ADR vs Star Rating | 5★ ADR should be > $200 | Star-rate consistency |
| Occupancy vs Market Type | Gateway city should support > 60% stabilized | Market demand validation |
| F&B Revenue vs Service Level | Limited-service should have < 10% F&B | Service model consistency |
| GOP Margin vs Segment | Luxury GOP should be 28–42% | Segment norm validation |
| Total Cost Rates | Sum should be 50–85% of revenue | Completeness check |
| Mgmt Fee vs Portfolio Size | Small portfolios command higher fees | Scale economics |

---

## Part 13: Implementation Roadmap

### 13.1 Schema Changes Required

1. **Add `businessModel` field** to `properties` table: `"hotel" | "vrbo"` (default: "hotel")
2. **Add hospitality type**: `"vrbo"` to `HOSPITALITY_TYPES` array
3. **Add derived fields** (computed, not stored):
   - `equivalentStrTier`: derived from starRating + ADR + hospitalityType
   - `serviceLevel`: derived from revenue share assumptions
   - `marketType`: derived from location

### 13.2 Research Engine Changes

1. **Auto-derive research profile** from property assumptions (no separate ICP needed per property)
2. **Branch research prompts** by businessModel (Hotel vs VRBO)
3. **Adjust comp set selection** for VRBO properties (use Airbnb/VRBO data instead of STR)
4. **Adjust fee benchmarks** by business model type
5. **Tier-based default seeding** on property creation

### 13.3 Badge Intelligence Changes

1. **Adjust badge ranges** based on derived STR tier
2. **Show business-model-appropriate badges** (no F&B badges for VRBO properties)
3. **Geography-adjusted ranges** for labor-sensitive metrics
4. **Attribution trail** for every badge value

---

## Appendix A: Case Studies

### A.1 Four Seasons vs Holiday Inn — Why Costs Differ

| Metric | Four Seasons (Luxury) | Holiday Inn (Upper Midscale) | Why |
|--------|----------------------|----------------------------|-----|
| **ADR** | $600+ | $130 | Brand positioning, amenity level |
| **Occupancy** | 70% | 72% | Both strong, different demand |
| **Rooms Expense** | 18% of revenue | 28% of revenue | Luxury has higher revenue base diluting fixed costs |
| **F&B Expense** | 70% of F&B revenue | N/A | Fine dining has high COGS |
| **Labor % of Total** | 40–45% | 30–35% | More staff per room |
| **GOP Margin** | 35% | 42% | Holiday Inn's lean model wins on margin |
| **GOP per Room** | $153K/yr | $20K/yr | Luxury wins on absolute dollars |
| **Mgmt Fee** | 3–4% base + 15% incentive | 2–3% base + 10% incentive | Complexity premium |

### A.2 Medellín Duplex — VRBO Model

For a 2-bedroom duplex in Medellín, Colombia managed via Airbnb:
- **ADR**: $80–$120/night (lower market, but tourist appeal)
- **Occupancy**: 55–65% (seasonal demand)
- **Platform Fee**: 15.5% (Airbnb host-only)
- **Cleaning**: $25–$40/turnover
- **Management Fee**: 25–30% of revenue (professional STR manager)
- **Annual Revenue**: ~$20K–$28K
- **Management Services**: Listing optimization, guest comms, pricing, cleaning coordination
- **NOT applicable**: F&B, events, spa, concierge, HR/staffing departments
- **Depreciation**: 20 years (Colombian tax code for residential)
- **Property Tax**: 0.4–0.8% of assessed value

---

## Appendix B: Glossary of Industry Terms

| Term | Definition |
|------|-----------|
| **ADR** | Average Daily Rate — room revenue divided by rooms sold |
| **AGOP** | Adjusted Gross Operating Profit — GOP minus management fees |
| **ANOI** | Adjusted Net Operating Income — NOI minus FF&E reserve |
| **CPOR** | Cost Per Occupied Room — departmental cost efficiency metric |
| **DSCR** | Debt Service Coverage Ratio — NOI divided by debt payments |
| **FF&E** | Furniture, Fixtures & Equipment — capital reserve for replacements |
| **GOP** | Gross Operating Profit — revenue minus all operating expenses |
| **HMA** | Hotel Management Agreement — contract between owner and operator |
| **IMF** | Incentive Management Fee — performance-based fee on GOP |
| **NOI** | Net Operating Income — GOP minus fixed charges |
| **OTA** | Online Travel Agency — Expedia, Booking.com, etc. |
| **RevPAR** | Revenue Per Available Room — ADR × Occupancy |
| **RGI** | Revenue Generation Index — RevPAR vs comp set |
| **STR** | Smith Travel Research (now CoStar) — industry benchmarking |
| **TRevPAR** | Total Revenue Per Available Room — all revenue, not just rooms |
| **USALI** | Uniform System of Accounts for the Lodging Industry |
