---
name: str-properties
description: Short-term rental (STR/VRBO) property model. Covers how STR properties use the same formulas with different assumption values and expense categories. Use when working on VRBO/STR property features or business model differences.
---

# Short-Term Rental (STR) Property Model

Properties in the HBG portfolio are not exclusively boutique hotels. Some properties operate under a short-term rental (STR) model similar to Airbnb or VRBO. The financial engine uses the same formulas for all property types — the difference lies in which assumption values are meaningful and how expense categories are configured.

**Related skills:** `business-model/` (USALI waterfall, revenue streams), `finance/` (property engine), `icp-research/` (ICP targeting)

---

## Property Type Spectrum

| Type | Examples | ADR Range | Typical Occupancy |
|------|----------|-----------|-----------------|
| **Boutique Hotel** | Independent lifestyle hotels | $150–$500 | 60–80% |
| **Boutique Resort** | Wellness retreats, destination resorts | $250–$800 | 50–75% (seasonal) |
| **Bed & Breakfast** | Inn-style properties, 5–20 rooms | $120–$350 | 55–75% |
| **Short-Term Rental (STR)** | Airbnb, VRBO properties | $100–$600 | 50–85% (high variance) |
| **Hybrid / Serviced Apartment** | Extended stay with hotel services | $150–$400 | 65–85% |

All types use the same revenue formula:
```
Room Revenue = Room Count × 30.5 × ADR × Occupancy
```

---

## STR vs. Full-Service Hotel — Key Assumption Differences

### Revenue Assumptions

| Revenue Stream | Boutique Hotel Default | STR Typical Setting |
|---------------|----------------------|-------------------|
| F&B (% of Room Rev) | 18% | 0–2% |
| Events & Functions (% of Room Rev) | 30% | 0% |
| Other / Ancillary (% of Room Rev) | 5% | 3–8% (cleaning fees, etc.) |

STR properties typically generate revenue from cleaning fees and add-on services (early check-in, late check-out, local experiences). These are captured in the Other/Ancillary revenue stream.

### Expense Assumptions

| Expense Category | Boutique Hotel | STR Adjustment |
|-----------------|---------------|----------------|
| Rooms / Housekeeping | 20% of room rev | 15–25% (contracted per-turn, no permanent staff) |
| F&B expenses | ~9% of F&B rev | Near $0 (no restaurant) |
| Events expenses | ~65% of events rev | Near $0 (no event space) |
| Admin & General | 8% of total rev | 5–7% (lower overhead, no front desk) |
| Marketing | 1% of total rev | 2–4% (platform listing fees + paid promotion) |
| Other Operating | 5% of total rev | 6–10% (platform distribution fees + STR-specific costs) |

### STR-Specific Expense Line Items (modeled under Other Operating)

| Item | Typical Rate | Notes |
|------|-------------|-------|
| **Platform distribution fees** | 3–5% of room revenue | Airbnb host fee (~3%) or VRBO subscription/commission |
| **Dynamic pricing tool** | $0.5–2/unit/month | PriceLabs, Wheelhouse, Beyond Pricing |
| **STR permit / license** | $500–$5,000/year | Varies widely by municipality |
| **Short-term rental tax** | 1–15% of revenue | Local TOT / STR tax, separate from income tax |
| **Channel manager** | $50–$200/month | Multi-platform listing management |

---

## STR Operational Characteristics

### Occupancy Patterns
STR properties have **higher occupancy volatility** than traditional hotels:
- Strong seasonality (summer peaks, holiday spikes)
- Weekday vs. weekend ADR spread can be 30–100%
- Minimum stay requirements affect effective occupancy
- Last-minute bookings common — dynamic pricing tools are essential

**Assumption guidance:** Use a lower `startOccupancy` and set `maxOccupancy` conservatively (60–75% annualized). Let the research engine provide market comps.

### Staffing
STR properties typically have **no permanent on-site staff**:
- Housekeeping: contracted per-turn (cost-per-clean basis)
- Maintenance: on-call contracted handymen
- Guest communications: automated or virtual assistant
- Property management: ManCo or local co-host

ManCo's role for STR properties shifts toward:
- Platform optimization and listing management
- Guest communication systems
- Cleaning and maintenance vendor coordination
- Revenue management (dynamic pricing)
- Regulatory compliance monitoring

### Regulatory Risk
STR properties carry regulatory risk that traditional hotels do not:
- Some municipalities restrict or ban STRs outright
- Permit requirements change frequently
- HOA restrictions may apply to condo-style STR properties

Model regulatory costs as a fixed Other Operating expense. Flag properties in high-restriction markets in the ICP notes.

---

## ManCo Fee Model for STR Properties

ManCo earns fees on STR properties the same way as hotel properties — Base Fee + Incentive Fee or granular Service Fee Categories. However, the service delivery model differs:

| Service Category | Hotel Delivery | STR Delivery |
|-----------------|---------------|-------------|
| Marketing | Brand + digital campaigns | Airbnb/VRBO listing optimization, photography |
| Technology & Reservations | PMS + booking engine | Channel manager + dynamic pricing tool |
| Accounting | Standard hotel bookkeeping | STR-specific revenue reporting (platform statements) |
| Revenue Management | RevPAR optimization | Dynamic pricing algorithm calibration |
| General Management | GM + front desk oversight | Virtual co-host + vendor coordination |

All services are still subject to the Make-vs-Buy analysis — STR properties often benefit from more pass-through services since specialized STR platforms and tools outperform in-house solutions for small portfolios.

---

## ICP Targeting for STR Properties

When configuring the ICP to target STR acquisition opportunities:
- Set property type to "Short-Term Rental" or "Vacation Rental"
- Lower room count range (1–20 units typical)
- Higher ADR tolerance (STR ADR can exceed comparable hotels in leisure markets)
- Emphasize location over amenities — proximity to demand drivers (beach, ski, city center) matters more than on-site amenities
- Note: F&B and Events amenity weights should be set to "Not Applicable"

---

## Research Engine Guidance for STR Properties

When running AI research on a STR property's assumptions:
- The research engine should recognize the property type and adjust its benchmark sources (AirDNA, Rabbu, AllTheRooms data rather than STR/hotel benchmarks)
- F&B and Events research should return "N/A — STR property" rather than hotel benchmarks
- Occupancy comps should come from short-term rental market data for the specific submarket
- Platform fee rates should be sourced from current Airbnb/VRBO host fee schedules
