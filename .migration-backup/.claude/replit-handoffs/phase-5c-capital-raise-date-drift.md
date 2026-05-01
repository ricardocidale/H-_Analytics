# Phase 5C — Promote `capitalRaise1Date` + `capitalRaise2Date` defaults

**Status:** Ready to execute.
**Owner:** Replit Agent.
**Prerequisites:** Phase 5A merged (`0c3ebc1b` and earlier).

---

## Why

Phase 2 closed D-1 by promoting `DEFAULT_COMPANY_OPS_START_DATE`. Two sibling
date fields — `capitalRaise1Date` (`"2026-06-01"`) and `capitalRaise2Date`
(`"2027-04-01"`) — remain as raw literals across schema, seeds, sync fallback,
and the user manual. They're the same drift pattern, just not the same field.
These are semantically distinct from the ops-start date (funding date vs
operations-start date), so each gets its own constant — even though
`capitalRaise1Date` shares the same value as `DEFAULT_COMPANY_OPS_START_DATE`
today. Accidental coupling would be a worse bug than minor value duplication.

---

## Task list (one commit)

### Step 1 — Add two constants

**File:** `shared/constants.ts`

Near line 222 (after `DEFAULT_COMPANY_OPS_START_DATE`) add:

```ts
// First funding tranche disbursement date. Drives schema column default,
// dev + production seed fallbacks, and the user-manual documentation row.
export const DEFAULT_CAPITAL_RAISE_1_DATE = "2026-06-01";

// Second funding tranche disbursement date. Same pattern as raise 1.
export const DEFAULT_CAPITAL_RAISE_2_DATE = "2027-04-01";
```

Keep them in the same "MODEL TIMELINE DEFAULTS" section. Match the comment
style of the existing constant above.

### Step 2 — Adopt in 4 files (8 literal → constant substitutions)

**File:** `shared/schema/config.ts`

| Line | Before | After |
|---|---|---|
| 121 | `.notNull().default("2026-06-01"),` | `.notNull().default(DEFAULT_CAPITAL_RAISE_1_DATE),` |
| 123 | `.notNull().default("2027-04-01"),` | `.notNull().default(DEFAULT_CAPITAL_RAISE_2_DATE),` |

Add imports at the top (extend the existing `shared/constants` import block
that already imports `DEFAULT_COMPANY_OPS_START_DATE`):

```ts
import {
  DEFAULT_COMPANY_OPS_START_DATE,
  DEFAULT_CAPITAL_RAISE_1_DATE,
  DEFAULT_CAPITAL_RAISE_2_DATE,
} from "@shared/constants";
```

**File:** `server/syncHelpers.ts`

| Line | Before | After |
|---|---|---|
| 58 | `capitalRaise1Date: "2026-06-01",` | `capitalRaise1Date: DEFAULT_CAPITAL_RAISE_1_DATE,` |
| 60 | `capitalRaise2Date: "2027-04-01",` | `capitalRaise2Date: DEFAULT_CAPITAL_RAISE_2_DATE,` |

Extend the existing constants import at the top of the file.

**File:** `server/seeds/properties.ts`

| Line | Before | After |
|---|---|---|
| 78 | `capitalRaise1Date: "2026-06-01",` | `capitalRaise1Date: DEFAULT_CAPITAL_RAISE_1_DATE,` |
| 80 | `capitalRaise2Date: "2027-04-01",` | `capitalRaise2Date: DEFAULT_CAPITAL_RAISE_2_DATE,` |

Extend the existing constants import at the top of the file.

**File:** `client/src/pages/checker-manual/sections/Section04GlobalAssumptions.tsx`

| Line | Before | After |
|---|---|---|
| 60 | `["capitalRaise1Date", "Disbursement date for first tranche", "2026-06-01", "date", "Mgmt Co."],` | `["capitalRaise1Date", "Disbursement date for first tranche", DEFAULT_CAPITAL_RAISE_1_DATE, "date", "Mgmt Co."],` |
| 62 | `["capitalRaise2Date", "Disbursement date for second tranche", "2027-04-01", "date", "Mgmt Co."],` | `["capitalRaise2Date", "Disbursement date for second tranche", DEFAULT_CAPITAL_RAISE_2_DATE, "date", "Mgmt Co."],` |

Extend the existing constants import at the top of the file.

### Commit message

One commit for all changes above:

> `audit phase 5c: promote capitalRaise1Date + capitalRaise2Date defaults`
>
> `Adds DEFAULT_CAPITAL_RAISE_1_DATE and DEFAULT_CAPITAL_RAISE_2_DATE to`
> `shared/constants.ts. Adopts them across schema column defaults, sync`
> `fallback, dev seed, and the user-manual row. No runtime value change.`
> `Closes the remaining capital-raise-date drift; 2026-06-01 / 2027-04-01`
> `literals in seed-manifest.json + SQL files stay (non-importable formats)`
> `and test fixtures stay (intentional inputs).`
>
> `Surfaces: S1, S2, S3, S5`

---

## Explicitly NOT in scope

Do **not** touch any of these — they're out of scope for Phase 5C:

1. `seed-manifest.json:44, 46` — JSON format, can't import TS constants.
2. `script/seed-production.sql` + `script/manual-sync/*.sql` — SQL, same reason.
3. `server/seeds/property-data.ts:53, 366` — per-property `acquisitionDate`;
   each property has its own date, not a drifting default.
4. Any `tests/**/*.ts` fixture using `"2026-06-01"` or `"2027-04-01"` — those
   are intentional test inputs, not drift.
5. `server/ai/kb/19-financial-formulas.md` — Phase 5B territory, not here.

If you feel the urge to touch any of these, stop and flag to Claude Code.

---

## Verification (after the single commit)

```bash
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
npm run verify:summary
```

Expected:
- TypeScript: 0 errors
- Lint: 0 warnings
- Vocabulary: 11/11 pass
- test:summary: all pass
- verify:summary: **UNQUALIFIED**

If `test:summary` fails, the most likely cause is a test that hardcoded
`"2026-06-01"` or `"2027-04-01"` as the expected seed value AND reads the
runtime value (not the fixture). Those are the only tests that could break
from a constant rename. Don't change those tests — escalate to Claude Code.

---

## Anti-patterns / gotchas

1. **Don't collapse the two constants into one** even if values were equal.
   Keep `DEFAULT_CAPITAL_RAISE_1_DATE` separate from `DEFAULT_CAPITAL_RAISE_2_DATE`
   and separate from `DEFAULT_COMPANY_OPS_START_DATE`.

2. **Don't change the values.** `"2026-06-01"` and `"2027-04-01"` stay exactly
   as-is. This is a pure literal-to-constant lift.

3. **Schema import path matters.** `shared/schema/config.ts` already imports
   from `@shared/constants` — extend the existing import block, don't add a
   second one.

4. **Manual row is JSX prop data.** The `ManualTable` `rows` prop is `(string
   | number)[][]` — `DEFAULT_CAPITAL_RAISE_1_DATE` is a string, so passing
   it directly works. No template interpolation needed.

---

## After completion

1. Update `.claude/audit-inventory.md`:
   - Under "Phase 2 — drift repair (status)" or below, add a new block:
     `### D-1-B: capitalRaise{1,2}Date drift ✅ closed (commit <SHA>)`
     listing the 4 files touched.
2. Append a ≤5-line note to `.claude/session-memory.md` under the current
   session entry with the commit SHA + verification result.
3. Ping Claude Code: "Phase 5C done. Awaiting product decision on Phase 5B
   options (1/2/3) from the KB templating question."
