# Phase 5A — Promote `citations.ts` to `shared/` + server-side adoption

**Status:** Ready to execute.
**Owner:** Replit Agent.
**Prerequisites:** Phase 4 merged (`c34fb96f` and earlier). Verification green as of `806dfe87`.

---

## Why

`client/src/components/company-assumptions/citations.ts` centralizes citation
strings for Analyst guidance badges. Three server surfaces still contain the
same literal strings, so a citation rename in the client module silently drifts
from server-emitted data. Promoting the module to `shared/` and adopting it on
the server closes **D-2** from the audit inventory.

See `.claude/audit-inventory.md` lines 174–183 for the drift analysis.

---

## Task list (one commit per task)

### Task 5A-1 — Move the module to `shared/`

**File to create:** `shared/citations.ts`
**File to delete:** `client/src/components/company-assumptions/citations.ts`

Copy the file verbatim. No content changes. Update the JSDoc header's reference
to section names if helpful, but the `CITATIONS` object must stay identical.

The `tsconfig.json` already has `"@shared/*": ["./shared/*"]` mapped, so
`import { CITATIONS } from "@shared/citations";` will work from anywhere in
the repo (client, server, calc).

### Task 5A-2 — Update 9 client imports

Replace `import { CITATIONS } from "./citations";` with
`import { CITATIONS } from "@shared/citations";` in these files:

```
client/src/components/company-assumptions/CompensationSection.tsx:28
client/src/components/company-assumptions/PropertyExpenseRatesSection.tsx:29
client/src/components/company-assumptions/CostOfEquityCard.tsx:16
client/src/components/company-assumptions/PartnerCompSection.tsx:26
client/src/components/company-assumptions/VariableCostsSection.tsx:25
client/src/components/company-assumptions/FixedOverheadSection.tsx:24
client/src/components/company-assumptions/TaxSection.tsx:30
client/src/components/company-assumptions/PropertyExitDefaultsCard.tsx:25
client/src/components/company-assumptions/ManagementFeesSection.tsx:29
```

Pure path rename. Values unchanged. TypeScript will fail if anything is missed.

**Combine 5A-1 and 5A-2 into a single commit** — the client imports must land
with the module move or TS breaks. Commit message:

> `audit phase 5a: promote citations.ts to shared/ (client-only, no behavior change)`
>
> `Surfaces: S4, S12`

### Task 5A-3 — Server-side adoption: exact-match sites

Three seed data rows contain citation strings that are an **exact match** for
existing `CITATIONS` entries. Replace the literals with imports so future
renames propagate.

**File:** `server/data/researchSeeds.ts`

| Line | Before | After |
|---|---|---|
| 343 | `capRate: "CBRE Cap Rate Survey",` | `capRate: CITATIONS.cbreCapRateSurvey,` |
| 353 | `costIT: "HFTP Technology Survey",` | `costIT: CITATIONS.hftpTechnologySurvey,` |
| 364 | `saleCommission: "NAR transaction data",` | `saleCommission: CITATIONS.narTransactionData,` |

Add `import { CITATIONS } from "@shared/citations";` at the top of the file.

No other server files have exact-match citation strings. Do **not** touch:
- `server/ai/research-prompt-builders.ts` — `RESEARCH_SOURCES` array is its own
  registry (superset of client CITATIONS, includes URLs + categories). Different
  purpose. Leave as-is.
- `server/ai/research-tool-prompts.ts` — citations are prose inside LLM prompts.
  Different purpose (instruction to the model, not a badge label). Leave as-is.
- `server/seeds/hospitality-benchmarks.ts` — uses short `"HVS 2024"` label,
  semantically distinct from `CITATIONS.hvsFeeSurvey` (`"HVS 2024 Fee Survey"`).
  See 5A-5 below.
- `server/ai/ambient/fetchers.ts` — same short `"HVS 2024"` label. See 5A-5.
- `server/ai/kb/19-financial-formulas.md` — KB markdown. Change would require
  Pinecone re-indexing. Defer to a later phase.

Commit message:

> `audit phase 5a: adopt shared/citations.ts in server research seeds`
>
> `Replaces three exact-match citation literals in server/data/researchSeeds.ts`
> `with CITATIONS imports. No runtime value change. Closes server-side drift`
> `for the three matching keys (capRate, costIT, saleCommission).`
>
> `Surfaces: S3, S10`

### Task 5A-4 — Deferred: short "HVS 2024" label

Two sites use a shorter `"HVS 2024"` label that is **not** an exact match for
any current `CITATIONS` entry:

- `server/seeds/hospitality-benchmarks.ts:134, 141` — `sourceName: "HVS 2024"`
- `server/ai/ambient/fetchers.ts:93, 94` — `source: "HVS 2024"`

**Don't execute this task.** Instead, file a `BLOCKED.md` sibling to this
handoff with the question: "Should we (a) add a `CITATIONS.hvsShort` entry
with value `"HVS 2024"` for server-facing data rows, or (b) upgrade these
seed rows to use the longer `CITATIONS.hvsFeeSurvey` so the badge reads the
same as client UI?"

Claude Code will decide with the user on the next session.

### Task 5A-5 — Deferred: KB markdown

`server/ai/kb/19-financial-formulas.md` contains three inline "HVS 2024
Specialty Fee Survey" citations (lines 32, 117, 118) plus two numeric defaults
(`8.5%`, `12%`) at lines 117–118. Changing the KB requires Pinecone
re-indexing. Out of scope for Phase 5A — tracked separately as Phase 5B.

---

## Verification (run after 5A-1/5A-2 commit AND after 5A-3 commit)

Run both verification passes — once after the client-only move commit,
and once after the server seed adoption commit. Don't batch them.

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
- Vocabulary test: 11/11 pass
- test:summary: all pass
- verify:summary: **UNQUALIFIED**

If any check fails on the 5A-1/5A-2 commit, the most likely cause is a missed
client import. `rg "from ['\"]\\./citations['\"]"` should return zero hits
after the move.

If any check fails on the 5A-3 commit, the most likely cause is a missed
import of `CITATIONS` at the top of `researchSeeds.ts`, or a typo on the
`CITATIONS.*` key name. The three keys must be exact: `cbreCapRateSurvey`,
`hftpTechnologySurvey`, `narTransactionData`.

---

## Manual smoke (optional but recommended)

Only if you want to visually confirm no badge text regressed:

1. Open the Company Assumptions page.
2. Hover an Analyst range badge in each sub-section with a citation
   (ManagementFeesSection, PropertyExitDefaultsCard, TaxSection,
   FixedOverheadSection, VariableCostsSection, CompensationSection,
   PartnerCompSection, PropertyExpenseRatesSection, CostOfEquityCard).
3. Confirm the source-name text renders as before. No text change is
   expected — this is a path-rename + literal-replacement pass only.

---

## Anti-patterns / gotchas

1. **Don't "improve" the CITATIONS keys or values while moving the file.**
   Any rename breaks all 9 client call sites simultaneously. Rename is a
   separate exercise after promotion lands.

2. **Don't import from `@/lib/citations` or `@/components/company-assumptions/citations`.**
   The only valid path after 5A-1 is `@shared/citations`.

3. **Don't touch the server KB markdown or the RESEARCH_SOURCES array.**
   Those are out of scope — see 5A-4 and 5A-5 deferrals.

4. **Don't merge 5A-1/5A-2 with 5A-3 in one commit.** Keep the client-only
   move isolated from server adoption for reviewability. One logical change
   per commit.

5. **The `step` deviation lesson from Phase 4 #9 applies here too:** if
   TypeScript rejects a refactor you expected it to accept, stop and flag.
   Don't add `as any` or `// @ts-ignore` to push through.

---

## After completion

1. Update `.claude/audit-inventory.md`:
   - Mark D-2 as **✅ closed** for exact-match sites (add commit SHAs)
   - Leave 5A-4 and 5A-5 as open sub-items
2. Append a ≤5-line note to `.claude/session-memory.md` under the current
   Apr 18 session entry with the two commit SHAs and final verification
   result.
3. Ping Claude Code: "Phase 5A done, see `audit-inventory.md` D-2 status.
   Awaiting Phase 5B (KB templating) / Phase 5C (remaining 2026-06-01
   literals) handoffs."
