# PRIORITY: Stabilize Before Building More

> The app has a Calculation Error and research is stuck. Stop building new features. Fix these in order.

---

## FIX 1: Schema Migration (causes Calculation Error)

Claude Code added 3 new columns to the `properties` table schema that don't exist in the actual database yet:
- `validation_status` (text, not null, default "pending_validation")
- `last_validated_at` (timestamp, nullable)
- `flagged_field_count` (integer, not null, default 0)

**Run schema push:**
```bash
npx drizzle-kit push
```

If that fails, run this SQL directly:
```sql
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending_validation',
  ADD COLUMN IF NOT EXISTS last_validated_at timestamp,
  ADD COLUMN IF NOT EXISTS flagged_field_count integer NOT NULL DEFAULT 0;
```

Also add the new `assumption_change_log` table if it doesn't exist:
```sql
-- Check if it exists first:
SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'assumption_change_log');
```

If not, run `npx drizzle-kit push` which will create all missing tables.

**Verify:** After migration, the Calculation Error should resolve. Reload the Dashboard.

---

## FIX 2: Research Stuck on First Step

Company research gets stuck on "Analyzing company context" — the LLM call either times out or stalls.

**Check server logs** for errors when research triggers. Look for:
- API key errors (ANTHROPIC_API_KEY, AI_INTEGRATIONS_GEMINI_API_KEY)
- Timeout errors
- 429 rate limit errors

**Quick fix:** Add a 120-second timeout to the research orchestrator. In the SSE handler, if no content arrives within 60 seconds, emit an error event and close the stream.

**Check which model is being used:**
```sql
SELECT research_config FROM global_assumptions LIMIT 1;
```
Look at `companyLlm.primaryLlm` — if it's set to a model that's not reachable through Replit's proxy, that's the problem. Try hardcoding to `gemini-2.5-flash` temporarily.

---

## FIX 3: Wire AnalystWorkingView for Company Research

CompanyAssumptions.tsx still uses the old ResearchTheater (byte-count progress). The new AnalystWorkingView exists but isn't connected.

Replace ResearchTheater usage in CompanyAssumptions.tsx with AnalystWorkingView. The component reads SSE phases from useCompanyResearchStream and maps them to discoveries via phaseToDiscovery.ts.

---

## FIX 4: Contradictory Banners

When IntelligenceStatusBar shows "Up to date" (green), hide the FirstVisitBanner ("hasn't reviewed yet"). They check different sources — IntelligenceStatusBar checks `researchUpdatedAt`, FirstVisitBanner checks `isFirstVisit`. Add:

```tsx
const showFirstVisitBanner = isFirstVisit && intelligenceStatus !== "current";
```

---

## FIX 5: Button Deduplication

"Ask the Analyst" / "Refresh Intelligence" appears in multiple places per page:
- Page header button
- IntelligenceStatusBar button (when stale/missing)
- FirstVisitBanner button

**Rule:** Only ONE visible trigger per page. Priority:
1. If FirstVisitBanner is showing → it has the button, hide others
2. If IntelligenceStatusBar is showing stale → it has the button, hide header button
3. Otherwise → header button only

---

## ORDER

1. Fix 1 (schema migration) — 2 min, unblocks everything
2. Fix 2 (research stuck) — 15 min, check logs + model config
3. Fix 3 (AnalystWorkingView) — 20 min
4. Fix 4 (banner logic) — 5 min
5. Fix 5 (button dedup) — 5 min

**Do NOT build new features until all 5 are resolved and the Dashboard loads without errors.**
