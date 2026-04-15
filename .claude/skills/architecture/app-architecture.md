---
name: app-architecture
description: Unified architecture map — navigation, all variables/assumptions, file injection points, external dependencies, and codebase health trends. The single reference for understanding the full system.
---

# H+ Analytics — Unified Architecture Map

> Compiled from comprehensive codebase audit. This is the definitive reference for navigation structure, all editable variables, file injection points, external service dependencies, and structural health patterns.

---

## 1. Navigation Structure

### User Navigation (Sidebar)

```
Dashboard                    /dashboard
  Overview Tab               (default)
  Financial Charts Tab
  KPI Grid Tab
  Export Tab

Properties                   /properties
  Property List              /properties
  Property Detail            /properties/:id
    Overview Tab
    Financial Statements Tab
    Returns & Analysis Tab
    Research Tab
    Photos Tab
    Documents Tab
  Property Edit              /properties/:id/edit
    General Info Section
    Location Section
    Financial Assumptions Section
    Revenue Assumptions Section
    Expense Assumptions Section
    Financing Section
    Returns Section

Scenarios                    /scenarios
  Scenario List
  Scenario Detail            /scenarios/:id
  Scenario Compare           /scenarios/compare

Management Company           /company
  Company Overview           /company
  Company Assumptions        /company/assumptions
  Company Financials         /company/financials
  Fee Structure              /company/fees

Portfolio                    /portfolio
  Consolidated View
  Property Comparison
  Risk Analysis              /portfolio/risk

Ask the Analyst              /research
  Research Dashboard
  Research History
  Regenerate Intelligence

Rebecca (Chat)               /chat
  Conversation View
  Knowledge Base Access

Settings                     /settings
  Profile Tab
  Preferences Tab
  Notifications Tab

Exports                      /exports
  PDF Export
  Excel Export
  PowerPoint Export
```

### Admin Navigation (Sidebar — `requireAdmin`)

```
Admin Dashboard              /admin
  System Overview

Users                        /admin/users
  User List
  User Edit                  /admin/users/:id
  Role Assignment
  Property Assignment (userDefaultProperties)

Properties                   /admin/properties
  All Properties (cross-user)
  Bulk Process Photos
  Property Seeding

Management Company           /admin/company
  Company Settings
  Fee Categories
  Global Assumptions

Scenarios                    /admin/scenarios
  Default Scenarios per User
  Golden Scenarios

AI Engines                   /admin/ai
  Research Engine Config
  Source Registry
  Pipeline Policies
  Agent Personas (The Analyst, Rebecca)

Intelligence                 /admin/intelligence
  Engine Dashboard
  Research Scheduler
  Confidence Scoring Config

Render Settings              /admin/render
  Style Management
  Model Config (Replicate)
  Rate Limits

Design Themes                /admin/themes
  Theme List
  Theme Editor
  Preset Themes

Notifications                /admin/notifications
  Alert Rules
  Notification Settings

Testing                      /admin/testing
  Verification Runner
  Golden Scenario Tests
  Audit Results

System                       /admin/system
  Health Check
  Activity Logs
  API Cost Tracking
```

---

## 2. All Variables & Assumptions

### 2A. Property-Level Fields (86 fields)

**Base Info (always required)**
| Field | Type | Editable By | Source |
|-------|------|-------------|--------|
| name | string | admin/owner | manual |
| location | string | admin/owner | manual |
| streetAddress | string | admin/owner | manual/autocomplete |
| city | string | admin/owner | manual/autocomplete |
| stateProvince | string | admin/owner | manual/autocomplete |
| zipPostalCode | string | admin/owner | manual/autocomplete |
| country | string | admin/owner | manual |
| latitude | number | system | geocode API |
| longitude | number | system | geocode API |
| qualityTier | enum | admin/owner | manual |
| businessModel | enum | admin/owner | manual |
| propertyType | string | admin/owner | manual |
| roomCount | number | admin/owner | manual |
| totalSquareFootage | number | admin/owner | manual |
| lotSize | number | admin/owner | manual |
| yearBuilt | number | admin/owner | manual |
| purchasePrice | number | admin/owner | manual |
| closingCostPercent | number | admin/owner | seed/research |
| renovationBudget | number | admin/owner | manual |
| renovationContingency | number | admin/owner | seed |

**Revenue Assumptions**
| Field | Type | Default Source |
|-------|------|---------------|
| startAdr | number | benchmark by quality tier |
| startOccupancy | number | benchmark by quality tier |
| maxOccupancy | number | benchmark (capped ~85%) |
| adrGrowthRate | number | CPI + market premium |
| occupancyGrowthRate | number | ramp schedule |
| rampUpMonths | number | 12-18 default |
| revShareRooms | number | business model default |
| revShareFB | number | business model default |
| revShareEvents | number | business model default |
| revShareOther | number | business model default |
| fbRevenuePercent | number | 50% target |
| eventsRevenuePercent | number | varies |
| otherRevenuePercent | number | varies |
| ancillaryRevenue | number | manual |
| seasonalityFactor | object | seasonal calendar lookup |

**Expense Assumptions**
| Field | Type | Default Source |
|-------|------|---------------|
| costRateRooms | number | benchmark by tier |
| costRateFB | number | benchmark (~35%) |
| costRateEvents | number | benchmark |
| costRateOther | number | benchmark |
| adminGeneralPercent | number | benchmark |
| marketingPercent | number | benchmark |
| propertyOpsPercent | number | benchmark |
| utilitiesPercent | number | benchmark |
| insurancePercent | number | benchmark |
| propertyTaxRate | number | country/state default |
| managementFeePercent | number | 3-5% industry standard |
| franchiseFeePercent | number | business rule (mandatory) |
| ffAndEReservePercent | number | 4% industry standard |
| itTelecomPercent | number | benchmark |
| staffingCostPerRoom | number | labor rate lookup |

**Financing Assumptions**
| Field | Type | Default Source |
|-------|------|---------------|
| loanAmount | number | calculated from LTV |
| ltvRatio | number | 65-75% default |
| interestRate | number | FRED + spread |
| loanTermYears | number | 25-30 default |
| amortizationYears | number | 25-30 default |
| interestOnlyMonths | number | 0-24 default |
| debtServiceCoverageMin | number | 1.25x covenant |
| exitCapRate | number | research range |
| holdPeriodYears | number | 5-10 default |
| refinanceYear | number | optional |
| refinanceRate | number | optional |

**Country-Driven Defaults**
| Field | Type | Default Source |
|-------|------|---------------|
| taxRate | number | country_defaults table |
| depreciationYears | number | country_defaults (39 US, varies) |
| depreciationMethod | enum | country_defaults |
| inflationRate | number | country_defaults + FRED |
| countryRiskPremium | number | country_defaults |
| currencyCode | string | country_defaults |

### 2B. Global Assumptions (107 fields across `global_assumptions`)

These apply at the management company level:

**Company Revenue**
- managementFeePercent, incentiveFeePercent, techFeePercent
- brandLicenseFeePercent, developmentFeePercent
- consultingFeePercent, preopeningFeePercent

**Company Expenses**
- executiveCompensation, officeRent, officeSundries
- legalAndAccounting, technologyCost, insuranceCost
- marketingAndBD, travelAndEntertainment, contingency

**Company Financing**
- fundingSourceLabel (admin-set, NOT hardcoded "SAFE")
- safeValuationCap, safeDiscount, equityRaiseAmount
- equityRoundSize, preMoneyValuation

**Projection Settings**
- projectionYears, monthlyGranularity
- startMonth, startYear, fiscalYearEnd

### 2C. Country Defaults (18 countries seeded)

Countries: US, CO, MX, BR, AR, CL, PE, EC, GB, FR, DE, ES, IT, PT, CR, PA, DO, UY

Per-country fields: taxRate, depreciationYears, depreciationMethod, inflationRate, countryRiskPremium, currencyCode, currencySymbol, dateFormat, fiscalYearEnd

**US state-level overrides** (10 states seeded): NY, CA, TX, FL, UT, CO, HI, TN, SC, AZ — each with state income tax rate, property tax modifier, specific regulations.

### 2D. Scenario Overrides

`scenarioPropertyOverrides` table: Any property assumption field can be overridden per-scenario per-property. The override takes precedence over the property base value. This is how users model "what if ADR is 10% higher?" without changing the base property.

---

## 3. File Injection Points

### Upload Endpoints

| Endpoint | Auth | Content | Max Size | Rate Limit | Storage |
|----------|------|---------|----------|------------|---------|
| `POST /api/uploads/request-url` | user | presigned URL | 10 MB | none | Object Storage |
| `POST /api/uploads/direct` | user | raw buffer | 10 MB | 10/min/user | Object Storage |
| `POST /api/uploads/process-image` | user | crop+variants | N/A | 5/min/user | Object Storage |
| `POST /api/admin/bulk-process-photos` | admin | batch reprocess | N/A | none | Object Storage |
| `POST /api/properties/:id/photos` | user | photo metadata | N/A | none | PostgreSQL |
| `POST /api/logos` | admin | logo image | 10 MB | none | Object Storage |
| `POST /api/admin/document-extraction` | admin | PDF/image | 30 MB | none | Object Storage → Document AI |

### Storage Paths

| Path Pattern | Content | Lifecycle |
|-------------|---------|-----------|
| `uploads/{uuid}` | Raw uploaded images | Permanent |
| `properties/{id}/photos/{uuid}` | Property photos | Permanent |
| `properties/{id}/photos/{uuid}/thumb` | Thumbnail variant | Generated |
| `properties/{id}/photos/{uuid}/medium` | Medium variant | Generated |
| `properties/{id}/photos/{uuid}/large` | Large variant | Generated |
| `logos/{uuid}` | Company/brand logos | Permanent |
| `exports/{uuid}.pdf` | Generated PDF exports | Temp (24h) |
| `renders/{uuid}` | AI-generated images (Replicate) | Permanent |

### Image Processing Pipeline

```
Upload → Buffer validation → Content-type check → Size check
  → Object Storage write → processImage() pipeline:
    → Sharp resize (thumb: 200px, medium: 800px, large: 1600px)
    → Optional crop (CropRegion)
    → WebP conversion
    → Object Storage write (3 variants)
    → DB update (variants JSON)
```

---

## 4. External Dependencies

### LLM Providers (4)

| Service | Env Var | Use | Fallback |
|---------|---------|-----|----------|
| Anthropic Claude | `ANTHROPIC_API_KEY` | Research synthesis (Opus), general intelligence | Required |
| Google Gemini | `GOOGLE_AI_API_KEY` | Parallel research generation | OpenAI fallback |
| OpenAI GPT | `OPENAI_API_KEY` | Parallel research generation | Gemini fallback |
| Perplexity Sonar | `PERPLEXITY_API_KEY` | Real-time web research | Tavily fallback |

### Market Data APIs

| Service | Env Var | Data |
|---------|---------|------|
| FRED | `FRED_API_KEY` | Interest rates, CPI, unemployment, GDP |
| Frankfurter | (none) | ECB exchange rates |
| RapidAPI Primary | `RAPIDAPI_KEY` | Weather, realty data |
| RapidAPI Secondary | `RAPIDAPI_KEY_2` | Booking data, weather |
| RapidAPI Tertiary | `RAPIDAPI_KEY_3` | Airbnb data, Alpha Vantage |
| CoStar | `COSTAR_API_KEY` | Commercial real estate analytics |
| Walk Score | `WALK_SCORE_API_KEY` | Walkability scores |
| Tavily | `TAVILY_API_KEY` | Web search (research fallback) |

### Infrastructure Services

| Service | Env Var | Purpose |
|---------|---------|---------|
| Pinecone | `PINECONE_API_KEY` | Vector DB — 7 namespaces (knowledge-base, market-data, regulatory, research-cache, property-comps, financial-benchmarks, user-preferences) |
| Upstash Redis | `UPSTASH_REDIS_URL` | Caching layer |
| Google Maps | `GOOGLE_MAPS_API_KEY` | Geocoding, autocomplete, nearby POI |
| Resend | `RESEND_API_KEY` | Transactional email |
| Sentry | `SENTRY_DSN` | Error monitoring |
| PostHog | `POSTHOG_KEY` | Product analytics |
| Replicate | `REPLICATE_API_TOKEN` | AI image generation (7 styles) |
| Apify | `APIFY_API_TOKEN` | Web scraping |
| Document AI | `GOOGLE_CLOUD_PROJECT` + `DOCUMENT_AI_PROCESSOR_ID` | PDF/document parsing |

### Database

| Service | Connection | Tables |
|---------|-----------|--------|
| PostgreSQL (Neon) | `DATABASE_URL` | 35+ core tables + 13 intelligence tables + 7 pre-collected data tables |

---

## 5. Admin vs User Field Overlap

### Fields Editable in BOTH Admin and User Views

| Field Category | Admin Path | User Path | Risk |
|---------------|-----------|-----------|------|
| Company assumptions | `/admin/company/assumptions` | `/company/assumptions` | User can overwrite admin-seeded values |
| Property base fields | `/admin/properties/:id` | `/properties/:id/edit` | Shared property, one overwrites other |
| Fee categories | `/admin/company/fees` | `/company/fees` | Fee structure affects all properties |

**Required Fix**: `/company/assumptions` API routes need `requireAdmin` enforcement. Regular users should only edit via scenario overrides, never base values on shared properties.

---

## 6. Pre-Collected Data Tables (7)

| Table | Records | Data | Update Frequency |
|-------|---------|------|-----------------|
| `market_adr_index` | ~60 | ADR by market/segment/quality | Quarterly |
| `seasonal_calendars` | ~96 | Monthly occupancy factors by market | Annual |
| `event_calendars` | ~60 | Major events by market with ADR impact | Annual |
| `labor_rate_tables` | ~50 | Hourly labor rates by market/role | Annual |
| `fb_benchmark_tables` | ~48 | F&B cost ratios by segment/tier | Annual |
| `airport_distance_tables` | ~40 | Airport proximity by market | Static |
| `hospitality_benchmarks` | ~120 | STR-style benchmarks by segment | Quarterly |

These are **Priority 0** in the Smart Data Router — checked before any external API call.

---

## 7. Codebase Health Trends

### Pattern: Type Safety Erosion
- **365 `as any` casts** across 97 files
- 65% in tests (fixture types), 17% server (JSONB columns), 17% client (API responses)
- **Fix**: Typed JSONB accessors + test fixture factories

### Pattern: Silent Error Swallowing
- **152 empty catch blocks** across codebase
- 40% justified (graceful fallback), 35% swallowed (bugs hiding), 25% fire-and-forget
- **Fix**: Enforce `logAndSendError()` or `logger.warn()` in all server catches

### Pattern: Storage Layer Bypass
- **9 direct `db.` calls** outside storage abstraction
- 7 in `benchmark-lookups.ts`, 2 in `source-health-checker.ts`
- **Fix**: Move to storage layer with proper audit trail

### Pattern: Input Validation Gaps
- **14 raw `parseInt(req.params)`** — 9 in `rebecca.ts`, rest scattered
- **7 `req.body` without Zod** — page-visits, properties, research routes
- **Fix**: Extend `parseRouteId()` and Zod middleware coverage

### Pattern: Frontend Debt
- **119 `useEffect([], [])`** — potential stale closure risks in 72 files
- **89 direct `fetch()`** — should use TanStack Query or api layer
- **3 components > 600 lines** — PropertyEdit, Dashboard, IcpStudio need splitting

### Root Cause
"Local fixes without structural constraints." Developers add routes, reach for `as any`, skip Zod, and no automated gate catches it. The audit test infrastructure works — it needs broader coverage.

### Automated Guards (10 test files, 209 tests)
| Test File | Checks |
|-----------|--------|
| `endpoint-security.test.ts` | All routes have auth middleware |
| `fetch-timeout-audit.test.ts` | All fetch calls use `fetchWithTimeout` |
| `route-params-audit.test.ts` | All route params use `parseRouteId` |
| `strip-fields-audit.test.ts` | All DB writes use `stripToColumns` |
| `typescript-safety.test.ts` | No `as any` in critical paths |
| `vocabulary-compliance.test.ts` | No forbidden terms in UI |
| `error-handling-audit.test.ts` | Server catches have logging |
| Plus 3 more | Various structural checks |

---

## 8. Intelligence Pipeline (7 Stages)

```
[Property Base Info] → [computePropertyDefaults] → [Base assumptions seeded]
                                ↓
[User clicks "Ask the Analyst"] → [Smart Data Router]
                                        ↓
                    ┌──── Priority 0: Pre-collected DB tables (7)
                    ├──── Priority 1: Pinecone vector search (7 namespaces)
                    ├──── Priority 2: FRED / Frankfurter / Walk Score
                    ├──── Priority 3: RapidAPI market data
                    └──── Priority 4: LLM web research (Perplexity/Tavily)
                                        ↓
                    [N+1 Multi-Model Synthesis]
                    Gemini + Claude parallel → Claude Opus synthesis
                                        ↓
                    [Range badges at every assumption field]
                    "The Analyst suggests: $285-$340 ADR (High conviction)"
                                        ↓
                    [User adjusts, accepts, or overrides]
                                        ↓
                    [Save → Recalculate financial statements]
```

---

## 9. Key Architectural Rules

1. **No hard deletes** — Properties use `archivedAt` soft delete
2. **No magic numbers** — All defaults DB-backed, admin-editable
3. **No LLM for math** — Financial calculations are deterministic engine code
4. **No hardcoded "SAFE"** — Funding source label is admin-configurable
5. **All models need F&B revenue** — Business rule, never optional
6. **All properties need franchise fees** — Operating under the brand
7. **Country-configurable everything** — Tax, depreciation, inflation, CRP per country
8. **Research = ranges, not answers** — The Analyst suggests ranges; user decides
9. **Storage abstraction** — All DB access through `server/storage/` layer
10. **Timeout everything** — All external calls use `fetchWithTimeout`
