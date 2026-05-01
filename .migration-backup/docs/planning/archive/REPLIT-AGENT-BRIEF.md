# Replit Agent Brief — Remaining UI Tasks

> **CRITICAL: Read these files first, in order:**
> 1. `docs/MASTER-PLAN.md` — Full product context, all phases, dependency ordering
> 2. `.claude/skills/business-model/SKILL.md` — Business model (two entities, two property types, vertical communities)
> 3. `.claude/skills/business-model/comparable-companies.md` — Ennismore, Nobu, Selina lessons
> 4. `.claude/skills/product-vision/product-direction.md` — Admin redesign, product vision

---

## What's Already Done (CLI completed — do NOT redo or modify)

| Phase | What Was Done | Files Changed |
|-------|---------------|---------------|
| 0 | Cleanup: feature flags reduced, VRBO F&B fix, verification retention | `server/feature-flags.ts`, `shared/constants-business-models.ts`, `server/storage/activity.ts` |
| 1 | Schema: 15+ property fields, business_brands table, user groups removed | `shared/schema/properties.ts`, `shared/schema/core.ts`, `shared/schema/auth.ts`, `engine/types.ts` |
| 2.1-2.2 | Admin sidebar → 10 blocks, 7 orphan components deleted | `AdminSidebar.tsx`, `Admin.tsx`, deleted DesignTab, GroupsTab, IntegrationsTab, LLMsTab, RebeccaTab, ResearchCenterTab, ServicesTab |
| 3.1 | F&B revenue: shares now "% of total" not "% of room" | `property-engine.ts`, `resolve-assumptions.ts`, `constants.ts`, `constants-business-models.ts` |
| 3.2 | Luxury rental: `pricingModel: "per_property"` + `nightlyPropertyRate` | Same engine files |
| 3.3 | Seasonality: `seasonalityProfile: number[12]` monthly factors | Same engine files |
| 3.4 | Occupancy ramp: `occupancyRampCurve: number[]` annual curve | Same engine files |
| 3.5 | Owner priority return: hurdle-gated incentive fees | Same engine files |
| 3.6 | Fee subordination: full/partial deferral when cash < debt | Same engine files |
| 4.1-4.3 | FRED API (11 series), Damodaran (7 countries), FX rates, source management | `server/seeds/market-rates.ts`, `server/services/FREDService.ts`, `server/data/marketRates.ts` |
| 4.5 | Entity-aware research: 20+ context fields in research prompts | `server/ai/research-prompt-builders.ts`, `server/routes/research.ts` |
| 5.1-5.2 | Golden scenarios (27 tests) + edge case tests (16 tests) = 2,437 total | `tests/golden/four-property-types-golden.test.ts`, `tests/golden/phase3-features-golden.test.ts` |
| Docs | All tooltips, checker manual, glossary, 10 skill files updated | 22 files across `client/src/pages/checker-manual/`, `client/src/components/admin/`, `.claude/skills/` |

---

## Step 0: DB Migration (DO THIS FIRST)

```bash
git pull origin main
npm install
npm run db:push
```

This applies schema changes from Phase 1. If `db:push` fails on column removal (userGroupId), you may need to manually drop the FK constraint first or run `npx drizzle-kit push` with `--force` flag.

**New tables:**
- `business_brands` — id, name, description, logoUrl, websiteUrl, createdAt, updatedAt

**New property columns** (all nullable, existing data unaffected):
- qualityTier, serviceLevel, locationType, marketTier
- fbVenues, fbSeats, eventSpaceSqft
- totalPropertyAcreage, totalBuildingSqft
- yearBuilt, lastRenovationYear, managementType, onMunicipalSewer
- conversionCost, roomAdditionCost, eventVenueCost, commercialKitchenCost
- zoningPermitCost, fireCodeAdaCost, liquorLicenseCost
- operatingDeficitReserve, estimatedConversionMonths
- brandId (FK → business_brands), ownerPriorityReturn, feeSubordination, performanceTestEnabled

**New global_assumptions columns:**
- defaultOwnerPriorityReturn, defaultFeeSubordination

**Removed columns:**
- users.userGroupId, users.companyId (FKs dropped)
- user_groups and user_group_properties tables dropped

---

## Task 1: Property Edit Page — New Engine Fields

**Priority: HIGH** — These fields exist in `engine/types.ts` and `shared/schema/properties.ts` but have NO UI controls yet.

### 1A. Pricing Model Toggle (Luxury Rental Support)

**Where:** `client/src/components/property-edit/BasicInfoSection.tsx` — add after the business model selector

**What to build:**
```tsx
// When businessModel === "vrbo", show pricing model toggle
{draft.businessModel === "vrbo" && (
  <div className="space-y-4">
    <div>
      <Label>Pricing Model</Label>
      <Select value={draft.pricingModel || "per_room"} onValueChange={(v) => onChange("pricingModel", v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="per_room">Per Room (hotel-style ADR × rooms)</SelectItem>
          <SelectItem value="per_property">Per Property (whole-property nightly rate)</SelectItem>
        </SelectContent>
      </Select>
    </div>
    
    {draft.pricingModel === "per_property" && (
      <>
        <div>
          <Label>Nightly Property Rate ($) <InfoTooltip text="The per-night rate for renting the entire property. Revenue = rate × days × occupancy. Room count is tracked for capacity only." /></Label>
          <Input type="number" value={draft.nightlyPropertyRate || ""} onChange={(e) => onNumberChange("nightlyPropertyRate", e.target.value)} />
        </div>
        <div>
          <Label>Max Guests <InfoTooltip text="Maximum guest capacity for the whole property. Used by research engines to calibrate comparable properties." /></Label>
          <Input type="number" value={draft.maxGuests || ""} onChange={(e) => onNumberChange("maxGuests", e.target.value)} />
        </div>
      </>
    )}
  </div>
)}
```

**Schema field:** `pricingModel` in `shared/schema/properties.ts` — add it if not there yet (it's in `engine/types.ts` but may need schema column)

### 1B. Property Descriptors Section

**Where:** New section in property edit, OR extend `BasicInfoSection.tsx` with a collapsible "Property Details" subsection

**Fields to add (all dropdowns or number inputs):**

```tsx
// Quality Tier
<Select value={draft.qualityTier || ""} onValueChange={(v) => onChange("qualityTier", v)}>
  <SelectItem value="luxury">Luxury</SelectItem>
  <SelectItem value="upper_upscale">Upper Upscale</SelectItem>
  <SelectItem value="upscale">Upscale</SelectItem>
  <SelectItem value="upper_midscale">Upper Midscale</SelectItem>
  <SelectItem value="midscale">Midscale</SelectItem>
  <SelectItem value="economy">Economy</SelectItem>
</Select>

// Service Level
<Select value={draft.serviceLevel || ""} onValueChange={(v) => onChange("serviceLevel", v)}>
  <SelectItem value="full_service">Full Service</SelectItem>
  <SelectItem value="select_service">Select Service</SelectItem>
  <SelectItem value="limited_service">Limited Service</SelectItem>
  <SelectItem value="all_inclusive">All Inclusive</SelectItem>
</Select>

// Location Type
<Select value={draft.locationType || ""} onValueChange={(v) => onChange("locationType", v)}>
  <SelectItem value="urban">Urban</SelectItem>
  <SelectItem value="suburban">Suburban</SelectItem>
  <SelectItem value="resort">Resort</SelectItem>
  <SelectItem value="rural">Rural</SelectItem>
  <SelectItem value="airport">Airport</SelectItem>
</Select>

// Market Tier
<Select value={draft.marketTier || ""} onValueChange={(v) => onChange("marketTier", v)}>
  <SelectItem value="primary">Primary (Top 25 MSA)</SelectItem>
  <SelectItem value="secondary">Secondary</SelectItem>
  <SelectItem value="tertiary">Tertiary</SelectItem>
</Select>

// F&B Capacity
<Input type="number" label="F&B Venues" value={draft.fbVenues} field="fbVenues" />
<Input type="number" label="F&B Seats (total)" value={draft.fbSeats} field="fbSeats" />
<Input type="number" label="Event Space (sq ft)" value={draft.eventSpaceSqft} field="eventSpaceSqft" />

// Physical
<Input type="number" label="Total Acreage" value={draft.totalPropertyAcreage} field="totalPropertyAcreage" />
<Input type="number" label="Building (sq ft)" value={draft.totalBuildingSqft} field="totalBuildingSqft" />
<Input type="number" label="Year Built" value={draft.yearBuilt} field="yearBuilt" />
<Input type="number" label="Last Renovated" value={draft.lastRenovationYear} field="lastRenovationYear" />
```

### 1C. Seasonality Profile

**Where:** `client/src/components/property-edit/RevenueAssumptionsSection.tsx` — add after the occupancy fields

**What to build:** A visual 12-month factor editor:
```tsx
// 12 months, each with a slider or number input
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Default: all 1.0 (flat)
const profile = draft.seasonalityProfile || [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

<div className="grid grid-cols-6 gap-2">
  {MONTH_LABELS.map((label, i) => (
    <div key={i} className="text-center">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step="0.1" min="0" max="2" className="text-center text-sm"
        value={profile[i]} 
        onChange={(e) => {
          const newProfile = [...profile];
          newProfile[i] = parseFloat(e.target.value) || 1;
          onChange("seasonalityProfile", newProfile);
        }} 
      />
    </div>
  ))}
</div>
```

**Tooltip:** "Monthly multipliers applied to occupancy and ADR. 1.0 = normal, 1.5 = 50% above normal (peak season), 0.5 = 50% below (trough). Research engines suggest profiles based on location and property type."

### 1D. Occupancy Ramp Curve

**Where:** `client/src/components/property-edit/RevenueAssumptionsSection.tsx` — add near occupancy ramp fields

**What to build:** List of annual percentages:
```tsx
// Example: [0.55, 0.75, 0.90, 1.0] means Year 1=55%, Year 2=75%, etc.
const curve = draft.occupancyRampCurve || [];

<div>
  <Label>Occupancy Ramp Curve <InfoTooltip text="Annual percentages of stabilized occupancy. Year 1 = 55% means occupancy is 55% of your max in year 1. Overrides the step-function ramp when set. Leave empty to use the default step function." /></Label>
  {curve.map((val, i) => (
    <div key={i} className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground w-16">Year {i + 1}</span>
      <Input type="number" step="0.05" min="0" max="1" value={val}
        onChange={(e) => { const c = [...curve]; c[i] = parseFloat(e.target.value) || 0; onChange("occupancyRampCurve", c); }} />
      <span className="text-sm text-muted-foreground">{(val * 100).toFixed(0)}%</span>
    </div>
  ))}
  <Button variant="outline" size="sm" onClick={() => onChange("occupancyRampCurve", [...curve, curve.length === 0 ? 0.55 : 1.0])}>
    + Add Year
  </Button>
</div>
```

### 1E. Owner Priority Return & Fee Subordination

**Where:** `client/src/components/property-edit/ManagementFeesSection.tsx` — add after the incentive fee fields

```tsx
// Owner's Priority Return
<div>
  <Label>Owner Priority Return (%) <InfoTooltip text="Minimum annual return on equity the owner must receive before incentive fees are charged. Industry standard investor protection. Set to 0 to disable." /></Label>
  <Input type="number" step="1" min="0" max="50" 
    value={(draft.ownerPriorityReturn || 0) * 100}
    onChange={(e) => onChange("ownerPriorityReturn", parseFloat(e.target.value) / 100 || 0)} />
</div>

// Fee Subordination
<div>
  <Label>Fee Subordination <InfoTooltip text="When cash flow cannot cover debt service: 'Full' defers all management fees. 'Partial' defers only incentive fees. 'None' means fees are always charged." /></Label>
  <Select value={draft.feeSubordination || "none"} onValueChange={(v) => onChange("feeSubordination", v)}>
    <SelectItem value="none">None (fees always charged)</SelectItem>
    <SelectItem value="partial">Partial (defer incentive fee only)</SelectItem>
    <SelectItem value="full">Full (defer all fees when cash &lt; debt service)</SelectItem>
  </Select>
</div>
```

---

## Task 2: Per-User Default Scenario Assignment (Admin 2.3)

**Where:** `client/src/components/admin/users/` — new component `DefaultScenarioAssignment.tsx`

**Existing patterns to follow:**
- `client/src/components/admin/scenarios/ScenarioAccessDialog.tsx` — already manages scenario access per user
- `client/src/components/admin/users/UserCardGrid.tsx` — existing user list with card layout

**Backend needed:**
1. New API endpoint: `GET /api/admin/users/:userId/default-properties` → returns list of property IDs toggled ON
2. New API endpoint: `PUT /api/admin/users/:userId/default-properties` → body: `{ propertyIds: number[] }`
3. Storage: New table `user_default_properties` with `userId` + `propertyId` + `isActive` boolean, or extend scenario_access

**UI flow:**
1. Admin navigates to Users section (already exists in admin sidebar)
2. Clicks a user → opens a dialog or panel
3. Shows ALL properties with toggle switches:
   ```
   ┌─────────────────────────────────────────────────┐
   │ Default Properties for: John Smith               │
   ├─────────────────────────────────────────────────┤
   │ ▸ Catskill Estate Hotel (NY, Hotel) ───── [ON]  │
   │ ▸ Obra Pía Cartagena (Colombia, Hotel) ── [ON]  │
   │ ▸ Hudson Valley Lodge (NY, Hotel) ─────── [OFF] │
   │ ▸ Medellín Duplex (Colombia, VRBO) ───── [OFF]  │
   │                                                   │
   │                              [Save] [Cancel]      │
   └─────────────────────────────────────────────────┘
   ```
4. Each row shows: property name, location, business model, and ON/OFF toggle (use shadcn Switch component)
5. Chevron (▸) expands to show property details (room count, ADR, status)
6. Properties are NEVER deleted — only toggled
7. Save persists the assignment via the PUT endpoint

---

## Task 3: Required Fields Configuration (Admin 2.4)

**Where:** Admin → Properties section → new "Required Fields" subsection

**The admin sidebar already has a redirect alias:**
```ts
// In AdminSidebar.tsx, SECTION_REDIRECTS:
"required-fields": "model-defaults",
```
So this should live within the model-defaults section, or create a new canonical section.

**Backend:**
- Add JSONB column `requiredFieldsConfig` to `global_assumptions` table
- Default value: `{ "name": true, "location": true, "roomCount": true, "startAdr": true, "purchasePrice": true }`
- New API: `GET /api/admin/required-fields` and `PUT /api/admin/required-fields`

**UI:**
```
┌─────────────────────────────────────────────────────┐
│ Required Fields Before Research Can Run              │
│ (Toggle ON = field must have a value)                │
├─────────────────────────────────────────────────────┤
│ Property Name ──────────────────────────── [ON]  ✅  │
│ Location ────────────────────────────────── [ON]  ✅  │
│ Country ─────────────────────────────────── [ON]  ✅  │
│ Room Count ──────────────────────────────── [ON]  ✅  │
│ Starting ADR ────────────────────────────── [ON]  ✅  │
│ Starting Occupancy ──────────────────────── [OFF] ⬜  │
│ Purchase Price ──────────────────────────── [ON]  ✅  │
│ Quality Tier ────────────────────────────── [OFF] ⬜  │
│ Business Model ──────────────────────────── [OFF] ⬜  │
│ Service Level ───────────────────────────── [OFF] ⬜  │
│ Location Type ───────────────────────────── [OFF] ⬜  │
│                                                       │
│                                        [Save Changes] │
└─────────────────────────────────────────────────────┘
```

---

## Task 4: Range Badge UX (Task 4.4)

**Existing infrastructure:**
- `client/src/components/research/ResearchContextFieldLabel.tsx` — already renders research badges
- `badgeProps={{ entry: researchValues.revShareFB }}` — already used in RevenueAssumptionsSection
- Research values come from `researchValues` object with `{ low, mid, high, confidence, source }` per field

**What to enhance:**
1. Create `<RangeIndicator value={currentValue} range={{ low, mid, high }} confidence="high" />` component
2. Color coding: 
   - Green: `value >= low && value <= high` (within range)
   - Yellow: within 20% of range boundaries
   - Red: outside range entirely
3. Tooltip shows: "Research suggests $280-$420, mid $350. Source: STR/CoStar, confidence: high"
4. "Accept" button: `onClick={() => onChange(field, range.mid)}`
5. "Research needed" state: when no range data exists, show a muted badge

**Integration:** Wrap existing `ResearchContextFieldLabel` or create alongside it. Apply to ALL assumption fields in:
- `RevenueAssumptionsSection.tsx` (ADR, occupancy, revenue shares)
- `OperatingCostRatesSection.tsx` (all USALI cost rates)
- `CapitalStructureSection.tsx` (LTV, interest rate, cap rate)
- `ManagementFeesSection.tsx` (base fee, incentive fee)

---

## Key Technical Context

### Revenue Model (affects all revenue displays)
```
totalRevenue = roomRevenue / (1 - eventsShare - fbShare - otherShare)
```
- Hotel defaults: Events 18%, F&B 30%, Other 3% → Rooms = 49%
- Catering boost is deprecated (0%). The field exists but isn't used in revenue calc.
- Revenue shares are now "% of total revenue" everywhere.

### Admin Sidebar Structure (10 blocks, already implemented)
```
Management Company → model-defaults, companies
Properties → model-defaults (hotel + rental + required fields)  
AI Research Engines → data-sources, pipeline-config, engine-dashboard
Users → users
Scenarios → scenarios (+ default-assignments redirect)
Rebecca → ai-agents
Themes & Appearance → brand
App Settings → notifications
Testing & Verification → verification
Reports & Exports → exports
```

### Component Patterns
- Use shadcn/ui components: `Select`, `Switch`, `Input`, `Label`, `Button`, `Slider`
- Follow `PropertyEditSectionProps` pattern: `{ draft, onChange, onNumberChange }`
- Use `InfoTooltip` for field help text
- Use `ResearchContextFieldLabel` for research badge integration
- Follow existing code style in `BasicInfoSection.tsx` and `RevenueAssumptionsSection.tsx`

### Server Route Patterns
- All admin routes are in `server/routes/admin/`
- Use Drizzle ORM for DB access (`import { db } from "../db"`)
- Validate with Zod schemas from `shared/schema/`
- Return JSON responses

### Testing
After each task: `npm run test` — 2,437 engine tests must continue passing.
Pull latest first: `git pull origin main`

---

## Priority Order
1. **DB Migration** (npm run db:push)
2. **Property Edit Fields** (Task 1) — highest user value, unblocks research
3. **Range Badge UX** (Task 4) — core product differentiator
4. **Per-User Defaults** (Task 2) — admin workflow
5. **Required Fields** (Task 3) — admin config
6. **Testing Dashboard** (Task 5.4) — admin visibility
7. **Rebecca** (Phase 6) — chatbot enhancements
8. **Exports** (Phase 7) — report templates
