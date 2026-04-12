---
name: business-model
description: Foundational business domain for H+ Analytics. Covers dual-entity model (ManCo + SPVs), TWO property business models (hotel + luxury rental), vertical community targeting, 50/50 F&B revenue split goal, conversion pipeline, management fees with brand component, and international operations (US + Colombia). This is a FUNDRAISING tool for sophisticated investors.
---

# H+ Analytics Business Model

## Core Purpose
H+ Analytics is a **fundraising and capital-raising tool**, NOT a business operations system. It helps a hospitality management company build credible, defensible financial models to raise capital from sophisticated investors (PE, family offices, HNWIs). The AI research engines are what make this app valuable — without them it's just Excel with a nicer UI.

**Related skills:** `finance/`, `proof-system/`, `architecture/`, `product-vision/`, `rebecca-chatbot/`, `research/`

---

## The Two Businesses

### Business 1: The Brand/Management Company (ManCo)
- Builds an increasingly valuable hospitality brand focused on **vertical communities** (wellness, sexual wellness, corporate retreats, health/healing)
- Markets worldwide to these communities, bringing ICPs directly to properties
- Earns **management fees** (base + incentive) + **service fees** from every property
- The brand's value grows with each property as the community network grows
- Commands higher fees over time because the brand delivers — good value, real experiences
- **The competitive advantage:** Most small vertical-focused hotels charge premium prices but deliver mediocre experiences. This brand delivers better quality at fair prices.
- Single brand for now. Architecture must support multiple brands in future (use `business_brand` entity).
- SAFE is just ONE of many funding vehicles for ManCo. Properties are funded separately.

### Business 2: Each Property (SPV)
- Each property has its OWN set of investors operating under a **Special Purpose Vehicle (SPV)**
- SPV funds acquisition + conversion, receives economic benefits, exits at end of hold period
- Some investors may invest in multiple SPVs — app doesn't track cross-SPV overlap
- These are **mature real estate hospitality transactions**, NOT tech investments
- SPV pays management/brand fees to ManCo and keeps the rest

### Intercompany Elimination (ASC 810)
Management fees paid by SPVs cancel against fee revenue received by ManCo on consolidation.

---

## TWO Property Business Models

### Model 1: Boutique Hotel (all properties except Medellín duplex)
- Converted from large residential estates on acreage
- Main house → common areas (restaurant, bar, lobby, event space)
- Rooms in additions: A-frame cabins, glamping units, converted outbuildings
- Barn/outbuilding → event venue
- **Revenue:** ADR × rooms × occupancy + F&B + events + other
- **Target revenue split: 50% rooms / 35-50% F&B / 5-15% other**
- Targets specific verticals: wellness, sexual wellness, corporate retreats, healing
- **Quality tier** (not star rating): Luxury, Upper Upscale, Upscale, Upper Midscale, Midscale, Economy

### Model 2: Luxury Rental (Medellín duplex type)
- Whole-property rental at per-night rate (~$2,500/day for Medellín duplex)
- Revenue is per-property-per-night, NOT per-room
- Capacity measured in beds/people (4 bedrooms, 8-10 guests), not room count
- Additional revenue from F&B events, receptions, parties, creative experiences
- Guests invite others for events — increases F&B revenue beyond staying guests
- Simpler cost structure, fewer services from ManCo
- Located in premium areas: sky areas, beach, upscale urban neighborhoods
- **Needs better name than "VRBO"** — consider "luxury residence" or "estate rental"

---

## F&B Revenue Is Central — NOT an Afterthought

**ALL property models must include F&B revenue.** Even the luxury rental has F&B from events, welcome baskets, catering, experience programming.

- Target: **50% rooms / 50% F&B** (Ennismore/Accor model, Obra Pía Cartagena)
- Current DEFAULT_REV_SHARE_FB = 0.18 (18% of room revenue ≈ 12% of total) is **WAY too low**
- To achieve 50/50: F&B must attract non-hotel guests (destination dining, events, local community)
- All-inclusive or MAP packaging captures 3 meals/day from in-house guests
- Event/banquet revenue from estate properties can be 20-30% of total
- The VRBO model with costRateFB=0 and revShareFB=0 is **WRONG**

---

## Management Fee Structure

### Service Fees (Base Management)
Properties pay the management company for centralized services:
| Category | Default Rate | Notes |
|----------|-------------|-------|
| Marketing & Brand | 2.0% | Includes franchise/brand component — MANDATORY |
| Technology & Reservations | 2.5% | PMS, booking engine, CRS |
| Accounting | 1.5% | Bookkeeping, reporting, audit prep |
| Revenue Management | 1.0% | Dynamic pricing, demand forecasting |
| General Management | 1.5% | Executive oversight, HR |
| Procurement | 1.0% | Group purchasing, vendor management |
| **Total** | **8.5%** | Of total revenue |

Marketing & Brand and Performance Fee are **mandatory** — non-optional for branded properties.

### Incentive Management Fee (Performance-Based)
- Default: **12% of GOP** (industry standard for boutique operators: 5-12%)
- Rewards ManCo when property performs well
- Should include **owner's priority return hurdle** (8-10% of equity) — currently missing
- Should include **fee subordination** option to debt service — currently missing

### What's Missing in Current Model
- Owner's priority return hurdle before incentive fee kicks in
- Fee subordination to debt service (investor protection)
- Performance test provisions (owner termination right if underperformance)
- "Marketing" should be renamed "Marketing & Brand" to reflect franchise component

---

## Property Conversion Pipeline

Properties are NOT acquisitions of existing hotels. The pipeline:
1. Buy large home on large lot (estate, ranch, farm)
2. Convert: main house → common areas, add rooms via A-frames/cabins/outbuildings
3. Convert barn → event venue, expand kitchen to commercial grade
4. Handle zoning, permitting, fire code, ADA, liquor licensing
5. Pre-opening: staffing, training, marketing
6. Start operations

### Cost Categories to Model
- Acquisition price + Conversion/renovation + Room additions + Event venue + Commercial kitchen
- Fire safety/ADA + Zoning/permitting + FF&E + Technology + Pre-opening + Operating deficit reserve
- Liquor licensing varies: NY ~$10-25K, Utah $15-40K+, Colombia $2-8K

### Key Constraints Research Must Flag
- Septic capacity (binding constraint on rural room count)
- Corridor width (36" residential vs 44" commercial minimum)
- Utah water rights + liquor license quotas (40+ room threshold for hotel license)
- Cartagena heritage zones (24-36+ month timelines)
- Properties under 12-15 rooms struggle to cover fixed costs

---

## Current Portfolio
- **Medellín, Colombia** — duplex (luxury rental model)
- **Cartagena, Colombia** — Obra Pía (hotel model, 50/50 rooms/F&B)
- **New York State** — 2 properties (hotel model, estate conversions)
- **Utah** — 1 property (hotel model, NOTE: restricted liquor environment)
- **Potential:** Asheville NC, Austin TX, others fitting the model

---

## Vertical Communities & Scheduling

### Target Verticals
- Wellness (yoga, meditation, detox)
- Sexual wellness (tantra, intimacy workshops — NOT swinger/lifestyle coded)
- Corporate retreats (team offsites, strategic planning)
- Health and healing
- Group experiences and events

### Scheduling Conflict Rule
A corporate team and a sexual wellness retreat CANNOT be at the same property simultaneously. Properties either dedicate to verticals or implement calendar-based separation. This reduces effective capacity.

### Practitioner-Led Marketing
Facilitators (yoga teachers, tantra educators, corporate coaches) bring their audiences. The brand provides venue + operational excellence. The app should consider practitioner partnerships as a demand driver.

---

## Financial Constants — NO Magic Numbers

**Only truly universal math constants may be hardcoded:** MONTHS_PER_YEAR=12, DAYS_PER_MONTH=30.5

**Everything else follows a hierarchy:**
1. **Country-level** (set by law): depreciation years, income tax, inflation benchmarks
2. **State/province-level**: property tax, state income tax
3. **City/municipal-level**: hotel/tourism taxes, some cost of capital
4. **Research-engine-driven** (per property): ADR, occupancy, cost rates, cap rates, revenue shares — NEVER in defaults tables

If research hasn't run for a property, market-driven fields should be EMPTY, not pre-filled with guesses.

---

## Key Files

| File | Purpose |
|------|---------|
| `shared/constants.ts` | Financial defaults — NEEDS MAJOR REVISION per no-magic-numbers rule |
| `shared/constants-business-models.ts` | Hotel/lodge/VRBO model defaults — VRBO F&B=0 is WRONG |
| `shared/countryDefaults.ts` | Country-level regulatory defaults (12 countries) |
| `shared/countryRiskPremiums.ts` | Damodaran CRP data (54 countries) |
| `engine/types.ts` | PropertyInput, GlobalInput, MonthlyFinancials interfaces |
| `engine/property/property-engine.ts` | Single-property pro forma generator |
| `engine/company/company-engine.ts` | Management company financials |
| `calc/dispatch.ts` | 37 computation tools via single dispatch |
| `server/feature-flags.ts` | 4 flags, all default true — likely dead code |
