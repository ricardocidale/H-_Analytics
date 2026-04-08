# H+ Analytics — Memory & Session State

## Project Identity
- **App Name**: H+ Analytics App
- **Brand**: H+ Analytics by Norfolk AI
- **AI Assistant**: Rebecca (text chat analytics AI)
- **Admin**: ricardo.cidale@norfolkgroup.io / admin456

## Architecture Decisions Log

### Admin Replan v3 (April 2026)
- **Full replan document**: `.local/replan-admin-intelligence-v3.md`
- **Admin restructured to 5 groups**: Business, Intelligence Engine, AI Assistant, Design, System
- **ICP page removed**: Auto-derived portfolio profile replaces manual ICP (per research methodology)
- **Data Sources card system**: 4-column responsive grid for APIs, Scrapers, Sources, Models — each card = report card with health metrics, toggle on/off, configure, test, logs
- **Engine Dashboard**: Unified intelligence observatory replacing Coverage Analytics + System Intelligence + API Dashboard + Cache & Services
- **Intelligence freshness system**: Page-level green/amber/red status bar on Property + Company assumptions pages
- **Auto-staleness detection**: Key assumption changes (starRating, ADR, hospitalityType, businessModel, roomCount, location, revShares) mark research as stale
- **Auto-refresh**: If estimated research time < 30s, auto-regenerate; otherwise notify admin
- **Financial Lines page**: New admin page for viewing/approving engine-suggested calculation additions
- **Brand page**: Merge Logos + Themes + Icons into single page
- **Skills to create**: help-documentation, intelligence-freshness, data-source-cards
- **Skills to update**: admin-configurator, hbg-business-model, integrations-infrastructure
- **Implementation phases**: 5 phases, 28 tasks total

### Task #298: Property URL Card with Validation (April 2026) — COMPLETED
- **Schema**: New `property_urls` table (`shared/schema/properties.ts`) — id, propertyId (FK cascade), url, label, isValid, isRelevant, relevanceScore, lastCheckedAt, metadata (jsonb), createdAt. Index on property_id. Insert schema with `.pick()`. Types exported: PropertyUrl, InsertPropertyUrl.
- **Storage module**: `server/storage/property-urls.ts` — PropertyUrlStorage class with getPropertyUrls, getPropertyUrlById, addPropertyUrl, updatePropertyUrl, deletePropertyUrl. Wired into DatabaseStorage via index.ts.
- **API routes** (`server/routes/properties.ts`): 5 new endpoints:
  - `GET /api/properties/:id/urls` — list all URLs for a property (requireAuth)
  - `POST /api/properties/:id/urls` — add URL with http/https-only validation + duplicate check (requireManagementAccess)
  - `PATCH /api/properties/:id/urls/:urlId` — update label/validity fields (requireManagementAccess)
  - `DELETE /api/properties/:id/urls/:urlId` — remove URL (requireManagementAccess)
  - `POST /api/properties/:id/urls/validate` — batch HEAD-request validation with SSRF protection (blocked hosts, private IPs, internal domains), auto-tags relevance for known hospitality domains (Airbnb, VRBO, Booking, etc.)
- **SSRF protection**: Blocked localhost, 127.0.0.1, 0.0.0.0, ::1, metadata.google.internal, 169.254.169.254, *.internal, *.local, 10.x, 172.16-31.x, 192.168.x private ranges
- **PropertyLinksSection.tsx** (`client/src/components/property-edit/`): Full CRUD UI card — add URL with optional label, status badges (Unchecked/Valid/Relevant/Broken), validate-all button, delete per URL. Uses react-query mutations.
- **PropertyDetail.tsx**: Link chips displayed between description card and map — color-coded (primary=relevant, destructive=broken, muted=valid), dot indicator, hostname fallback with safe URL parsing
- **PortfolioPropertyCard.tsx**: Compact link chips (max 3 shown, "+N" overflow) below description, stale-time query, stopPropagation on clicks
- Files: schema/properties.ts, storage/property-urls.ts, storage/index.ts, routes/properties.ts, PropertyLinksSection.tsx, property-edit/index.ts, PropertyDetail.tsx, PropertyEdit.tsx, PortfolioPropertyCard.tsx
- Health check: ALL CLEAR — 0 TS errors, 3978 tests pass, verification UNQUALIFIED

### Task #299: Hero Image AI Enhancement Pipeline (April 2026) — COMPLETED
- **Enhancement endpoint**: `POST /api/property-photos/:id/enhance` — sends photo to Replicate clarity-upscaler (photo-upscale model), saves enhanced base64 to `enhancedImageData` column
- **Enhanced image serving**: `GET /api/property-photos/:id/enhanced-image` — serves enhanced image binary from DB
- **Revert endpoint**: `DELETE /api/property-photos/:id/enhanced` — clears enhancedImageData
- **Schema**: Added `enhancedImageData` text column to `property_photos` (migration: enhanced-photo-001.ts)
- **EnhancePreviewDialog**: Side-by-side and slider compare modes, Accept/Reject buttons
- **PhotoCard**: Sparkles button on hero photos, "Enhanced" badge when enhanced data exists
- **PropertyHeader**: Prefers enhanced image for hero display, shows "AI Enhanced" badge
- **PortfolioPropertyCard**: Prefers enhanced hero image, shows "Enhanced" badge
- Health check: ALL CLEAR — 0 TS errors, 3978 tests pass, verification UNQUALIFIED

### Task #297: Property Description Card with AI Rewrite (April 2026) — COMPLETED
- **DescriptionSection enhanced** (`client/src/components/property-edit/DescriptionSection.tsx`): Read-only display mode (styled card with Edit button) when description exists; edit mode with textarea. Preview Dialog for AI rewrite — user can review improved vs original text side-by-side, then accept or dismiss. Frontend calls property-scoped `POST /api/properties/:id/rewrite-description`.
- **Server endpoint added** (`server/routes/properties.ts`): New `POST /api/properties/:id/rewrite-description` with `requireManagementAccess` + `checkPropertyAccess`, Zod validation (text 1-5000 chars), Gemini via `resolveLlm("aiUtilityLlm")`, cost logging.
- **PortfolioPropertyCard updated** (`client/src/components/portfolio/PortfolioPropertyCard.tsx`): Added `truncateWords(text, 60)` utility function; description shown as truncated text (max 60 words with ellipsis) below the location/date on the property card. Uses `line-clamp-3` for visual truncation.
- **PropertyDetail page updated** (`client/src/pages/PropertyDetail.tsx`): Added full description card between PropertyHeader and map section. Shows when `property.description` exists — styled card with "Property Description" label and full text with `whitespace-pre-wrap`.
- Files: DescriptionSection.tsx, PortfolioPropertyCard.tsx, PropertyDetail.tsx, server/routes/properties.ts
- Health check: ALL CLEAR — 0 TS errors, 3978 tests pass, verification UNQUALIFIED

### Task #296: Smart Address Autocomplete & Auto-Fill (April 2026) — COMPLETED
- **Existing AddressAutocomplete extended** (`client/src/components/AddressAutocomplete.tsx`): Added AbortController for stale-response protection, `countryBias` prop for country-scoped Google Places results, `disabled` prop, map pin icon (`IconMapPin`), proper `credentials: "include"` on fetch calls, cleanup on unmount (abort + debounce timer), proper `unknown` error type (no `any`)
- **BasicInfoSection updated**: Street address plain `<Input>` replaced with `<AddressAutocomplete>`, place selection auto-fills **only empty** fields (city, stateProvince, zipPostalCode, country, location) via `fillIfEmpty()` helper; street address always updated from selection; lat/lng stored in draft AND immediately persisted via `PATCH /api/properties/:id/coords`; `countryBias` passed from current geo selection; auto-fill badges ("auto-filled" green pill) + emerald ring highlights shown for 6s then fade
- **Server enhanced**: `placesAutocomplete()` now accepts optional `countryBias` parameter for country-scoped results (`&components=country:XX`); route passes `?country=` query param through; new `PATCH /api/properties/:id/coords` endpoint for immediate lat/lng persistence after place selection
- **Code review fixes**: (1) Extended existing component instead of creating duplicate, (2) Lat/lng persisted immediately via dedicated coords endpoint, (3) Country bias passed from frontend, (4) No `any` types — uses `unknown` + `instanceof`, (5) Only fills empty fields to preserve user-entered data
- Files: AddressAutocomplete.tsx (extended), BasicInfoSection.tsx, geospatial.ts, geospatial routes, properties.ts
- Health check: ALL CLEAR — 0 TS errors, 3978 tests pass, verification UNQUALIFIED

### Task #292: Skill Authoring & Updates (April 2026) — COMPLETED
- **3 new skills created**:
  - `help-documentation` — InfoTooltip patterns (benchmark citation format, STR chain scale reference, authoritative sources), manual section structure (SectionCard/ManualTable/Callout), glossary schema & categories, walkthrough step format (selector strategies), GuidanceSideSheet anatomy (tabs, attribution card, GuidanceRecord fields)
  - `intelligence-freshness` — State machine (missing→running→current→stale), computeFreshnessStatus logic (priority order), staleness triggers (7 assumption fields), IntelligenceStatusBar states (4-state with colors/icons), API contract (freshness-counts + avg-duration), sidebar badge pattern, auto-refresh guard logic
  - `data-source-cards` — Card report-card anatomy, health badge thresholds (90%/80%), category tabs (APIs/Scrapers/Sources/Models), full CRUD flow, toggle/test/logs actions, SSRF protection details, dependability rules, adding new source types
- **3 existing skills updated**:
  - `admin-configurator` — Rewritten for 5-group structure (Business/Intelligence Engine/AI Assistant/Design/System), section redirect system with full mapping table, merged pages (Brand/Pipeline Config/Engine Dashboard/Data Sources), Engine Dashboard anatomy, sidebar freshness badge, updated adding-new-section steps
  - `hbg-business-model` — Added comprehensive VRBO/STR section: excluded expense categories, platform fee structure (Airbnb 15.5%/VRBO 8%/Booking 15-18%), all-in management fee (20-35%), depreciation difference (27.5yr vs 39yr), revenue mix comparison table, full expense structure (52-92% of revenue), Lodge model details
  - `integrations-infrastructure` — Added Data Source Management section: source registry schema, card-based system replacing list-based, 4 category tabs, health badges, CRUD endpoints, call logging, SSRF protection, key files. Fixed "Marcela" references to "Rebecca"


### Task #291: Documentation & Help System Updates (April 2026) — COMPLETED
- **InfoTooltip benchmark citations**: All key assumption tooltips updated with STR chain scale ranges — Starting ADR (Luxury $396+, Upper Upscale $173–$312, etc.), ADR Growth (2–5% Upper Upscale, 3–6% Luxury), Starting Occupancy (40–55% Luxury, 50–65% Upscale), Stabilized Occupancy (65–75% Luxury, 70–80% Upper Upscale), Housekeeping (22–28% Luxury, 18–25% Upper Upscale), Management Fees (3–5% base Upper Upscale, 6–10% specialty), Compensation ($75K–$95K Upper Upscale, $85K–$120K Luxury)
- **User Manual Section18Research.tsx**: Added 4 new subsections — Research Badges (yellow pill/blue GAAP/guidance arrow), Freshness & Staleness (green/amber/red indicators with color dots), What Triggers Staleness (7 key assumption change types), Applying Research Recommendations (4-step workflow)
- **Checker Manual Section13AIResearch.tsx**: Added Intelligence Verification subsection with 6-step cross-reference workflow table + Key Verification Benchmarks table (chain scale × ADR/Occ/Fee/Source) + Callout for out-of-range flags
- **Glossary expanded**: 15 new terms — 6 STR chain scales (Luxury→Economy), 3 business models (Hotel/VRBO-STR/Lodge), 6 research terms (Freshness/Staleness/Context Pack/Guidance/STR/Chain Scale)
- **GuidedWalkthrough.tsx**: Added 2 new tour steps — Research Badges (target: badge-research) and Intelligence Status Bar (target: intelligence-status-bar)
- **GuidanceSideSheet.tsx RecommendationTab**: Enhanced attribution card — source name + date with Shield/Clock icons, relaxation level badge (amber), "Source attribution unavailable" fallback, Methodology label with FileText icon wrapping reasoning text
- Files changed: RevenueAssumptionsSection.tsx, OperatingCostRatesSection.tsx, ManagementFeesSection.tsx, CompensationSection.tsx, Section18Research.tsx, Section13AIResearch.tsx, glossary.ts, GuidedWalkthrough.tsx, GuidanceSideSheet.tsx

### Task #293: Lodge Business Model & Lakeview Haven Update (April 2026) — COMPLETED
- **"lodge" added** to both BUSINESS_MODEL_TYPES and HOSPITALITY_TYPES arrays in schema
- **BusinessModelSelector** updated: 3 options — Hotel, Lodge ("Large vacation lodge — whole-property rental, premium amenities, no F&B or events departments"), VRBO/STR
- **EngineDashboard** PortfolioProfile updated to display "Lodge" label for lodge business model
- **Lakeview Haven Lodge seed** updated: roomCount 8, businessModel "lodge", hospitalityType "lodge", real address (5597 Utah-39 Scenic), real description from website, real OwnerRez photos (15 photos from uc.orez.io — 6 building exteriors, 3 interior, 6 amenities/views), revShareFB 25% (breakfast, meals, drinks, picnics), revShareEvents 0% (no events dept)
- **Research methodology skill** updated: new §2.3 Lodge Business Model section with comparison table, expense structure, positioned between Hotel and VRBO
- **hbg-business-model skill** updated: Business Models table added, Lodge described alongside Hotel/VRBO

### Task #290: Financial Lines Admin Page (April 2026) — COMPLETED
- **engine_suggested_lines table**: statementType, category, lineName, formula, rationale, confidence, status (pending/approved/rejected), reviewedBy, reviewedAt, rejectionReason, propertyId, sourceId
- **Migration**: server/migrations/engine-suggested-lines-001.ts with idx_esl_status, idx_esl_statement_type indexes
- **Storage methods**: listEngineSuggestedLines (with status filter), getEngineSuggestedLineById, createEngineSuggestedLine, approveEngineSuggestedLine (+ Pinecone indexing), rejectEngineSuggestedLine, countEngineSuggestedLines
- **API routes**: GET /api/admin/intelligence/financial-lines?status=, POST /api/admin/intelligence/financial-lines/:id/approve, POST /api/admin/intelligence/financial-lines/:id/reject
- **FinancialLinesTab.tsx**: Count cards (total/pending/approved/rejected), status-filtered tabs, detail dialog, approve/reject with modal rejection reason, empty states
- **Icons added**: IconCheck, IconX added to status-icons.tsx + brand-icons.tsx + index.ts exports
- **Sidebar wired**: "Financial Lines" with IconCalculator in Intelligence Engine group
- **Admin.tsx wired**: sectionMeta + SectionContent switch case
- All tests passing, e2e verified, code review PASS

### Task #289: Data Sources Card CRUD (April 2026) — COMPLETED
- **sourceRegistry schema extended**: Added description, endpoint, apiKeyRef, rateLimitPerMin, successRate, avgLatencyMs, costPerCall, dataProvided (jsonb string[]) columns via direct SQL migration
- **source_call_logs table**: Real activity logging — id, sourceId, serviceKey, timestamp, httpStatus, latencyMs, success, errorMessage; cascading delete on source removal
- **Storage methods added**: getSourceRegistryEntry, createSourceRegistryEntry, updateSourceRegistryEntry, deleteSourceRegistryEntry, createSourceCallLog, getSourceCallLogs (server/storage/intelligence-v2.ts + index.ts)
- **API routes added**: POST /api/admin/source-registry (create), PATCH /api/admin/source-registry/:id (update), PATCH /api/admin/source-registry/:id/toggle, DELETE /api/admin/source-registry/:id, POST /api/admin/source-registry/:id/test (connectivity + logs call), GET /api/admin/source-registry/:id/logs (last 50 entries)
- **SSRF protection hardened**: Full RFC1918 CIDR blocking (10.0.0.0/8, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, 169.254.x.x), IPv6 private (fc/fd/fe80), metadata IPs (Google/AWS), .local/.internal TLDs, DNS resolution guard (resolve hostname → check resolved IPs against private ranges)
- **DataSourcesTab.tsx rewritten**: Full CRUD with API-driven data, toggle persistence, ConfigureDialog, delete with AlertDialog, inline Test results, **real LogsPanel** querying GET /api/admin/source-registry/:id/logs (no mock data), HealthBadge (amber <90%, red <80%)
- **SourceRegistryOverlay.tsx fixed**: Updated from serviceKey-based PATCH to ID-based toggle route
- **15 seed records**: 4 APIs, 4 scrapers, 4 sources, 3 models
- **`as any` cast removed**: lastHealthCheck update uses typed Date directly
- All 3978 tests passing, 0 TS errors, lint clean, verification UNQUALIFIED

### Phase 1 Schema Changes (April 2026) — COMPLETED
- **businessModel field added** to properties table: `text("business_model").notNull().default("hotel")`
- **"vrbo" added to HOSPITALITY_TYPES** array + BUSINESS_MODEL_TYPES enum
- **lastAssumptionChangeAt** timestamp added to both `properties` and `global_assumptions` tables
- **BusinessModelSelector** component created in PropertyTypeSelector.tsx with Hotel/Lodge/VRBO options
- **BasicInfoSection** updated with Business Model field + InfoTooltip
- **Auto-staleness detection** wired into property PATCH and global-assumptions PUT routes
  - Property triggers: starRating, startAdr, hospitalityType, businessModel, roomCount, city, stateProvince, country, revShareFB, revShareEvents, revShareOther, maxOccupancy, startOccupancy, adrGrowthRate
  - Company triggers: baseManagementFee, incentiveManagementFee, inflationRate, companyTaxRate, commissionRate, staffSalary, partnerCompYear1-10
- **Code review fix**: partnerComp1/2/3 → partnerCompYear1-10 (correct schema names)
- DB columns added via direct SQL (drizzle-kit push had stableKey constraint prompt)

### Phase 2 Admin Reorganization (April 2026) — COMPLETED
- **AdminSidebar restructured** to new 5-group layout:
  - Business: Users, Companies, Groups, Scenarios
  - Intelligence Engine: Engine Dashboard, Data Sources, Pipeline Config, QA Sandbox, Scheduled Research
  - AI Assistant: Configuration (Rebecca), Knowledge Base, Conversations
  - Design: Brand (merged Logos+Themes+Icons), Exports
  - System: App Defaults, Verification, Database, Notifications, Navigation
  - Logs: Activity (separate section at bottom)
- **Section redirects**: Old section IDs (icp, logos, themes, icons, llms, model-routing, cache-services, integrations, api-dashboard, coverage-analytics, pipeline-policies, source-registry, system-intelligence, research, sources) all redirect to their new locations via `resolveSection()`
- **New components created**:
  - `BrandTab.tsx` — sub-tabs for Logos, Themes, Icons
  - `EngineDashboard.tsx` — health bar + 4 stat cards + coverage heatmap + portfolio profile
  - `DataSourcesTab.tsx` — 4-column card grid (APIs/Scrapers/Sources/Models) with 15 seeded sources, toggle/configure/test/logs actions
  - `PipelineConfigTab.tsx` — sub-tabs for Pipeline Policies + Model Routing
  - `KnowledgeBaseTab.tsx` — wraps existing SourcesTab for Rebecca's training data
  - `ConversationsTab.tsx` — placeholder for chat history/analytics
- **No `adminIntelV2` feature flag dependency** — new sidebar always shows full structure
- **buildNavGroups()** no longer takes arguments
- Files: AdminSidebar.tsx, Admin.tsx, Layout.tsx, + 6 new component files

### Phase 3 Intelligence Freshness System (April 2026) — COMPLETED
- **IntelligenceStatusBar component** created: `client/src/components/intelligence/IntelligenceStatusBar.tsx`
  - 4 states: Current (green), Stale (amber), Missing (red), Running (blue pulse)
  - Unified `computeFreshnessStatus()` function — single source of truth for both the status bar AND the header dot indicators
  - Handles: research age > 7 days (stale), assumptions changed since last research (stale), no research (missing), actively generating (running)
  - Edge-case hardened: `safeTimestamp()` guard for invalid dates, `Math.max(0, ...)` clamp for future timestamps
  - Regenerate button appears on stale/missing states
- **PropertyEdit page** wired: Status bar below PageHeader, header dot uses `computeFreshnessStatus`
- **CompanyAssumptions page** wired: Status bar below PageHeader, header dot unified via `computeFreshnessStatus`
- **GlobalResponse type** updated: added `lastAssumptionChangeAt: string | null`
- All 3978 tests passing, 0 TS errors, lint clean, verification UNQUALIFIED

### Task #288: Freshness Infrastructure, Badges & Auto-Refresh (April 2026) — COMPLETED
- **Backend endpoint**: `GET /api/admin/intelligence/freshness-counts` (admin-only)
  - Queries `research_runs` table (DISTINCT ON per entity_id) + `properties.lastAssumptionChangeAt`
  - Returns: `{ total, current, stale, missing, running, avgDurationMs }`
  - New storage method: `getLatestCompletedRunsPerEntity(entityType)` in IntelligenceV2Storage
- **Admin sidebar badge**: Intelligence Engine group shows count badge when stale/missing > 0
  - Red badge (bg-red-500/15) when missing > 0, amber (bg-amber-500/15) when only stale
  - Polls freshness-counts API every 60s
- **Engine Dashboard fixed**: Replaced incorrect global `/api/research/last-full-refresh` derivation
  - Now uses `/api/admin/intelligence/freshness-counts` API for stat cards + health bar
  - Coverage heatmap uses `/api/research/status` for per-property status
  - Polls every 30s for real-time updates
- **Auto-refresh**: PropertyEdit + CompanyAssumptions auto-trigger research on stale/missing
  - One-shot `useRef` guard prevents re-triggering
  - Guards: `!autoRefreshFired.current && !isDirty && !isGenerating`
  - Fires `generateResearch()` automatically when status is stale or missing

### Source URLs Feature (April 2026) — COMPLETED
- **Schema**: `sourceUrls` text array column added to `properties` table
- **Frontend**: `SourceUrlsSection` component in `client/src/components/property-edit/SourceUrlsSection.tsx`
  - Add/remove URLs with validation (must be valid URL format)
  - Enter key support for adding URLs
  - Hover-to-reveal delete button per URL
  - "Research from URLs" button appears when URLs exist — triggers `generateResearch()`
  - Positioned after Description section, before Timeline in PropertyEdit page
- **Research integration**: Source URLs included in property context pack narrative
  - AI research prompt sees user-provided URLs as reference sources
  - Can extract property details, photos, amenities, location info from listed URLs
- **Data flow**: URLs saved as `text[]` → property record → context pack → research prompt
- **E2E tested**: Add/remove/validate/keyboard all verified via Playwright

### Research Intelligence System (April 2026)
- **Research methodology skill created**: `.agents/skills/research-methodology/SKILL.md` — exhaustive 500+ line document covering STR chain scales, star ratings, revenue mix benchmarks, USALI expense ratios by segment, management fee structures, geography-driven cost adjustments, VRBO/STR business model, comp set selection criteria, and the full N+1 AI research pipeline
- **Key architectural decision**: Properties should auto-derive their research profile from existing assumptions — NO separate ICP definition needed per property. The property's own starRating + ADR + hospitalityType + location + revenue shares IS its research profile.
- **Business model variable**: `businessModel` field to be added to properties schema: "hotel" | "vrbo" (default: "hotel"). This determines which expense categories, revenue streams, fee structures, and research approaches apply.
- **Post-improvement principle**: Research must target the property's OPERATING state after improvements, not its acquisition state. If $2M in improvements add a pool and spa, research should target 4-star wellness boutique comps.
- **Equivalent STR tier derivation**: starRating + startAdr + hospitalityType → maps to Luxury/Upper Upscale/Upscale/Upper Midscale/Midscale
- **Tier-based default seeding**: New properties get defaults calibrated to their derived tier (see skill §8.1)

### Badge System (April 2026)
- All company-side badges wired: ManagementFeesSection (incentive fee), CompanySetupSection (inflation), PartnerCompSection (partner comp), FixedOverheadSection (business insurance)
- Key name mismatches fixed: travelPerClient→travelCost, itLicensePerClient→itLicense, miscOpsRate→miscOps, salesCommission→dispositionCommission, baseFee→baseManagementFee, incentiveFee→incentiveManagementFee
- ResearchBadge uses `accent-pop` (gold/amber) styling
- 42 PROPERTY_ASSUMPTION_KEYS + 22 COMPANY_ASSUMPTION_KEYS defined in schemas.ts

### Research Queue System (April 2026)
- Zustand store in `research-queue.ts`: concurrency 2, 429 retry with getState() fresh reads, reindex() position normalization, auto-prune after 15s
- ResearchLoadingOverlay: 3 variants (property, company, global), rotating tips, pulsing orb animation
- ResearchQueueIndicator mounted in Layout header

## Current Admin Structure (Pre-Replan)
```
Business: Users, Companies, Groups, Scenarios
Intelligence: ICP Mgmt Co, Research Center, [V2: Coverage, Policies, QA, Sources, Scheduler, System]
Design: Logos, Themes, Icons, Exports
AI: AI Agents, LLMs, Model Routing, Sources
System: App Defaults, Notifications, Navigation, Verification, Database, API Dashboard, Cache/Services, Integrations, Activity
```

## Planned Admin Structure (Post-Replan)
```
Business: Users, Companies, Groups, Scenarios
Intelligence Engine: Engine Dashboard, Data Sources (APIs|Scrapers|Sources|Models), Pipeline Config, QA Sandbox, Financial Lines
AI Assistant: Configuration, Conversations, Knowledge Base
Design: Brand (Logos|Themes|Icons), Exports
System: App Defaults, Verification, Database, Notifications, Navigation, Activity
```

## External Data Sources Inventory
- **APIs**: FRED, Xotelo, RapidAPI Hospitality, CoStar/STR, Moody's, S&P Global, Alpha Vantage, Open Exchange Rates, Weather API, World Bank
- **Scrapers (Apify)**: airbnb-scraper, vrbo-scraper, booking-scraper, tripadvisor-scraper
- **LLMs**: OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet, Opus), Google Gemini Flash, Perplexity
- **Vector DB**: Pinecone (index: lb-hospitality, namespaces: knowledge-base, research-history, comparables, assumption-guidance, documents, scenarios, properties)
- **Health monitoring**: Circuit breaker (5 failures in 60s → open), BaseIntegrationService pattern, staleWhileRevalidate caching

## Help System Inventory
- InfoTooltip: primary contextual help pattern (i icon → hover → explanation + formula + manual link)
- GuidanceSideSheet: deep dive panel (P25/P50/P75, peer comps, relaxation trail, impact analysis)
- RebeccaPanel: AI assistant with contextual field awareness
- GuidedWalkthrough: 9-step spotlight tour (auto-prompts new users)
- Map Tour: cinematic fly-through of properties
- Help page: User Manual, Checker Manual, Architecture, Guided Tour tabs
- Glossary: shared data structure in `client/src/lib/glossary.ts`

## Industry Knowledge Reference

### STR Chain Scale ADR Ranges (US Market)
- Luxury: $313+
- Upper Upscale: $173–$312
- Upscale: $131–$172
- Upper Midscale: $107–$130
- Midscale: $82–$106
- Economy: $55–$81

### Management Fee Benchmarks
- Non-branded 3rd party: 1.5–3.0% base (2.0–2.5% most common)
- Branded (Marriott/Hilton): 2.5–4.0% base (3.0% most common)
- Luxury/specialty: 3.0–5.0% base
- VRBO/STR manager: 20–35% all-in
- Incentive: 8–15% of GOP standard, 10–20% luxury

### Revenue Mix by Segment
- Select-service: 85–95% rooms, 2–5% F&B
- Boutique: 70–80% rooms, 12–18% F&B
- Full-service resort: 55–65% rooms, 20–28% F&B
- VRBO: 85–95% rental, 5–12% cleaning fees

## Test State
- 3978 tests across 170 files — ALL PASSING
- TypeScript: 0 errors
- Lint: 0 errors
- Financial verification: UNQUALIFIED

## Feature Flags
- RI_V2_WRITE: ON
- RI_V2_READ: ON
- REBECCA_V2: OFF
- ADMIN_INTEL_V2: ON

## Critical Rules
- "Marcela" = "Rebecca" = text chat AI assistant
- drizzle-zod: NEVER use `.omit()` — only `.pick()`
- Domain boundary: Route files must NEVER import `db` or `drizzle-orm` directly
- Always update replit.md AND claude.md AND memory.md after changes (Doc Harmony Rule)
- useResearchQueue.getState() pattern for fresh Zustand reads
