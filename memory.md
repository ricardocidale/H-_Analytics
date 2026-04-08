# H+ Analytics — Memory & Session State

## Project Identity
- **App Name**: H+ Analytics App
- **Brand**: H+ Analytics by Norfolk AI
- **AI Assistant**: Rebecca (text chat analytics AI)
- **Admin**: ricardo.cidale@norfolkgroup.io / admin456

## Architecture Decisions Log

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
- Always update replit.md AND claude.md after changes (Doc Harmony Rule)
- useResearchQueue.getState() pattern for fresh Zustand reads
