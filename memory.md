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

### Task #293: Lodge Business Model & Lakeview Haven Update (April 2026) — COMPLETED
- **"lodge" added** to both BUSINESS_MODEL_TYPES and HOSPITALITY_TYPES arrays in schema
- **BusinessModelSelector** updated: 3 options — Hotel, Lodge ("Large vacation lodge — whole-property rental, premium amenities, no F&B or events departments"), VRBO/STR
- **EngineDashboard** PortfolioProfile updated to display "Lodge" label for lodge business model
- **Lakeview Haven Lodge seed** updated: roomCount 8, businessModel "lodge", hospitalityType "lodge", real address (5597 Utah-39 Scenic), real description from website, real OwnerRez photos (15 photos from uc.orez.io — 6 building exteriors, 3 interior, 6 amenities/views), revShareFB 25% (breakfast, meals, drinks, picnics), revShareEvents 0% (no events dept)
- **Research methodology skill** updated: new §2.3 Lodge Business Model section with comparison table, expense structure, positioned between Hotel and VRBO
- **hbg-business-model skill** updated: Business Models table added, Lodge described alongside Hotel/VRBO

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
- All 3976 tests passing, 0 TS errors, lint clean, verification UNQUALIFIED

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
- All 3976 tests passing, 0 TS errors, lint clean, verification UNQUALIFIED

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
- 3976 tests across 170 files — ALL PASSING
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
