# Master Fix List — April 16, 2026 (Updated)

---

## CRITICAL — Do first

### 1. Schema Migration
```bash
npx drizzle-kit push
```
Creates: validation_status, last_validated_at, flagged_field_count, validation_reason columns.
Also creates assumption_change_log table if missing.

### 2. Research Stuck on Step 1
Check server logs for why LLM never responds. Check which model companyLlm.primaryLlm is set to.

---

## HIGH — After migration

### 3. Per-Tab Save
Each of the 7 Company Assumptions tabs needs its own Save button. When user saves a tab, only that tab's fields are committed. The Analyst validates immediately after save.

### 4. Pulsating Analyst Button Per Tab
Every tab with assumptions/variables gets a pulsating Analyst icon button. User presses it for deep research on that tab's domain. One button per tab, not multiple.

### 5. Post-Save Validation Messages
After save, if The Analyst finds values outside range, show inline message: "The Analyst notes [field] at [value] is outside expected range [low]-[high]. Adjust or keep?"

### 6. Rename "Partner Compensation" → "Management Compensation"

### 7. Depreciation Years 27.5 → Fix in DB (should be 39 for US, 20 for Colombia)

---

## DONE — Already fixed

- ~~Company Assumptions route: AdminRoute → ManagementRoute~~ ✓
- ~~PUT /api/global-assumptions: requireAdmin → requireManagementAccess~~ ✓
- ~~Days Per Month removed from user page~~ ✓ (Replit moved to Admin)
- ~~7-tab layout for Company Assumptions~~ ✓ (Replit built)
- ~~Auto-fire research removed from CompanyAssumptions~~ ✓ (Replit fixed)
- ~~Duplicate companyName check in research.ts~~ ✓ (cleaned up)
- ~~Export gate blocks on excluded properties~~ ✓
- ~~Analyst watchdog with excluded_data logic~~ ✓
- ~~Company pack filters excluded properties~~ ✓
