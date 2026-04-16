# Master Fix List — April 16, 2026

> Prioritized by user impact. Fix in order. Do not build new features.

---

## CRITICAL (app broken)

### 1. Schema Migration — Causes Calculation Error
New columns not in DB. Run:
```bash
npx drizzle-kit push
```
Or SQL:
```sql
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending_validation',
  ADD COLUMN IF NOT EXISTS last_validated_at timestamp,
  ADD COLUMN IF NOT EXISTS flagged_field_count integer NOT NULL DEFAULT 0;
```
Also check `assumption_change_log` table exists.

### 2. Research Stuck on Step 1
"Analyzing company context" never completes. Check:
- Server logs for LLM errors or timeouts
- Which model `companyLlm.primaryLlm` is set to in `research_config`
- If the model is unreachable through Replit's proxy, switch to `gemini-2.5-flash`
- Add 120-second timeout to the research SSE stream

---

## HIGH (bad UX, user confused)

### 3. Research Step Labels — Developer Jargon
In `CompanyAssumptions.tsx` lines 369-373, rename:
- "Analyzing company context" → "Studying your management company structure"
- "Processing ICP profile" → "Reviewing your target property profile"
- "Benchmarking fee structures" → "Comparing fees against industry standards"
- "Analyzing compensation data" → "Researching compensation benchmarks"
- "Calculating operating ratios" → "Analyzing operating efficiency"
Also: "Consulting sources" title → "The Analyst is reviewing [company name]"

### 4. Button Deduplication — "Ask the Analyst" 2-3 times per page
Three components show the button simultaneously on first visit:
- `FirstVisitBanner` (blue banner)
- `IntelligenceStatusBar` (green/amber bar)  
- Page header button

**Rule:** Only ONE trigger visible:
- If FirstVisitBanner showing → hide IntelligenceStatusBar button and header button
- If IntelligenceStatusBar shows stale → hide header button
- Otherwise → header button only

### 5. Contradictory Banners
Green "Up to date" and blue "hasn't reviewed" showing at same time.
Fix: When `intelligenceStatus === "current"`, hide FirstVisitBanner entirely.
```tsx
const showFirstVisitBanner = isFirstVisit && intelligenceStatus !== "current";
```

### 6. Rename "Partner Compensation" → "Management Compensation"
Throughout the Company Assumptions page. "Partner" is confusing in a fundraising context — investors think LP, not managing director.

---

## MEDIUM (wrong data, architecture)

### 7. Depreciation Years: 27.5 → 39
The Model Constants section shows 27.5 years. US commercial real property (hotels) is 39 years per IRS Publication 946. 27.5 is for residential rental. Fix the seed default.

### 8. Move Model Constants to Admin
"Depreciation Years" and "Days Per Month (30.5)" are engine constants, not user assumptions. Move to Admin > System Constants. No investor should see "30.5 days per month."

### 9. Per-Property Fee Summary — Move to Admin or Report
The table showing per-property service rates doesn't belong on the Management Company Assumptions page mixed with editable fields. It's a read-only report. Move to:
- Admin > Properties > Fee Overview, or
- A dedicated "Portfolio Fee Matrix" report accessible from the sidebar

### 10. Wire AnalystWorkingView for Company Research
`CompanyAssumptions.tsx` still uses the old `ResearchTheater` with byte-count progress tracking. The new `AnalystWorkingView` component exists and handles SSE phases correctly. Replace.

---

## LOW (cosmetic, branding)

### 11. Company Name in Seeds
Update any remaining "L+B Hospitality Co" references to current brand.

### 12. Research Animation Redesign
Full spec in `.claude/replit-instructions/2026-04-16-analyst-animation.md`. Lower priority — fix the research stall and jargon labels first, then make it beautiful.

---

## WHAT CLAUDE CODE WILL DO (no conflicts with Replit)

- Fix seed default for depreciation (27.5 → 39) in property-data.ts
- Rename "partnerComp" labels in shared constants if they exist server-side
- Update architecture docs with today's findings
- NOT add any more schema columns until Replit confirms DB is synced
