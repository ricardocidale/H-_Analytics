# G4-a: Eloá — Executive Summary property tab (UI shell + AnalystButton)

## Doctrine Freeze Gate Check (MANDATORY)

- **Governing ADR(s):** `docs/architecture/decisions/ADR-003-analyst-verdict-contract.md`
- **ADR status:** `Accepted`
- **Last ADR edit:** 2026-04-19 (stable; G4 amendment is a next-session task; this packet is UI-only and does not touch the verdict contract)
- **Sessions stable:** 2
- **Gate decision:** ✅ Cleared to execute — this packet creates UI surface only. The ADR-003 amendment for narrative-specialist dimensions is deferred to a separate CC session. No runner, no engine code, no verdict construction.

---

## Context (MANDATORY)

G4 graduates the Executive Summary specialist (Eloá, letter E) from `status: "needs-page"` to a live property tab. The specialist is catalogued in `engine/analyst/registry/specialist-catalog.ts` with candidate fields: name, country, hospitalityType.

The tab renders the existing `PropertyExecutiveSummary` shape already produced by `server/routes/executive-summary.ts`. The tab's AnalystButton posts to `POST /api/executive-summary/property/:id/regenerate` (the explicit-trigger endpoint). The existing `GET` endpoint that fires the LLM on page load is **not used by this tab** — the tab reads from a TanStack Query cache seeded by the POST or returns an empty state.

This packet is UI-only (Replit's lane). The G4 runner + bar tests + ADR-003 amendment are CC's follow-on work in a later session.

- Governing ADR: `docs/architecture/decisions/ADR-003-analyst-verdict-contract.md`
- Design standard: `.claude/rules/design-standards.md` (animated numbers, skeleton, accordion, premium $50K+ quality)
- Trigger discipline: `.claude/rules/analyst-trigger-discipline.md` (button press only; no auto-fetch on mount)
- Dependency atlas: `.claude/audit-inventory.md`
- This packet has no upstream packet dependency.

---

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 4
- **File count:** 3 (new: `ExecutiveSummaryTab.tsx`; modified: `PropertyDetail.tsx`; modified: `property-detail/index.ts`)
- **Capability domains touched:** UI (only)
- ✅ Within budget

---

## Tasks (MANDATORY)

### S1: Create `ExecutiveSummaryTab.tsx` shell with skeleton + empty state

- **Files:**
  - `client/src/components/property-detail/ExecutiveSummaryTab.tsx` — new file

- **Change:**

  Create the component. Its structure:
  1. Props: `{ propertyId: number }`
  2. `useMutation` to POST `/api/executive-summary/property/${propertyId}/regenerate` (returns `PropertyExecutiveSummary`)
  3. `useQuery` with key `["executive-summary", "property", propertyId]` — query function POSTs only when invoked via mutation (use `staleTime: Infinity` + `enabled: false` so the query never auto-fires; data is seeded via `queryClient.setQueryData` on mutation success)
  4. Three render states:
     - **Loading** (mutation pending): full skeleton matching the tab layout (key metrics grid skeleton + 6 accordion section skeletons)
     - **Empty** (no cached data): premium illustrated empty state card with `<AnalystButton>` as the primary CTA, suffix `"Executive Summary"`, `pulse={true}`
     - **Loaded**: key metrics section + 6 qualitative accordion sections (see S2)

  The component must never call `useQuery` with `enabled: true` on mount — trigger-discipline rule forbids it.

  ```tsx
  import { useState } from "react";
  import { useMutation, useQueryClient } from "@tanstack/react-query";
  import { motion } from "framer-motion";
  import { apiRequest } from "@/lib/queryClient";
  import { useToast } from "@/hooks/use-toast";
  import { AnalystButton } from "@/components/intelligence/AnalystButton";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "@/components/ui/accordion";
  import { Skeleton } from "@/components/ui/skeleton";
  import { Badge } from "@/components/ui/badge";
  import {
    IconSparkles,
    IconTrendingUp,
    IconMapPin,
    IconShieldAlert,
    IconTarget,
    IconBuilding,
    IconArrowUpRight,
  } from "@/components/icons";
  import { formatMoney } from "@/lib/utils";

  // Shape returned by POST /api/executive-summary/property/:id/regenerate
  // (matches server/ai/executive-summary/types.ts PropertyExecutiveSummary)
  interface KeyMetrics {
    totalInvestment: number;
    projectedIRR: number;
    equityMultiple: number;
    stabilizedNOI: number;
    exitValue: number;
    dscr: number | null;
    cashOnCash: number;
    paybackYears: number;
  }

  interface PropertyExecutiveSummary {
    propertyName: string;
    propertyId: number;
    generatedAt: string;
    investmentThesis: string;
    keyMetrics: KeyMetrics;
    marketPosition: string;
    revenueStrategy: string;
    riskFactors: string;
    mitigants: string;
    exitStrategy: string;
    comparableData: string;
    confidenceLevel: string;
    sources: string[];
  }

  const QUERY_KEY = (id: number) => ["executive-summary", "property", id] as const;

  const SECTIONS = [
    { key: "investmentThesis",  label: "Investment Thesis",  icon: IconTarget },
    { key: "marketPosition",    label: "Market Position",    icon: IconMapPin },
    { key: "revenueStrategy",   label: "Revenue Strategy",   icon: IconTrendingUp },
    { key: "riskFactors",       label: "Risk Factors",       icon: IconShieldAlert },
    { key: "mitigants",         label: "Risk Mitigants",     icon: IconShieldAlert },
    { key: "exitStrategy",      label: "Exit Strategy",      icon: IconArrowUpRight },
  ] as const;

  export function ExecutiveSummaryTab({ propertyId }: { propertyId: number }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Read from cache only — never auto-fetch
    const cached = queryClient.getQueryData<PropertyExecutiveSummary>(QUERY_KEY(propertyId));

    const mutation = useMutation({
      mutationFn: () =>
        apiRequest<PropertyExecutiveSummary>(
          "POST",
          `/api/executive-summary/property/${propertyId}/regenerate`,
        ),
      onSuccess: (data) => {
        queryClient.setQueryData(QUERY_KEY(propertyId), data);
      },
      onError: () => {
        toast({ title: "Executive summary unavailable", description: "Try again in a moment.", variant: "destructive" });
      },
    });

    if (mutation.isPending) return <ExecutiveSummarySkeleton />;
    if (!cached) return <ExecutiveSummaryEmpty onAsk={() => mutation.mutate()} />;
    return <ExecutiveSummaryContent summary={cached} onRefresh={() => mutation.mutate()} isRefreshing={mutation.isPending} />;
  }
  ```

  Implement `ExecutiveSummarySkeleton`, `ExecutiveSummaryEmpty`, and `ExecutiveSummaryContent` in the same file (see S2 for `ExecutiveSummaryContent` spec).

- **Affected dependency surfaces:** S4 (client-side type; shape mirrors server type, no new schema)
- **Cross-check invariants:**
  - New component → grep parent (`PropertyDetail.tsx`) to confirm import and render (done in S3)
  - No financial calculations — data comes entirely from the API
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] No `useQuery` with `enabled: true` in this file (vocabulary grep: no auto-fetch patterns).
  - [ ] Component renders in dev server without console errors when propertyId is valid.
  - [ ] Empty state shows `<AnalystButton>` with suffix "Executive Summary" and `pulse`.
  - [ ] Clicking the button triggers the POST (network tab shows the request).
  - [ ] No new lint warnings on this file.
- **Test impact:** No new test file required (UI component; functional behavior covered by E2E if/when those land). Existing `test:summary` must remain green.
- **Rollback notes:** Revert the commit.

---

### S2: Implement `ExecutiveSummaryContent` — premium metrics + accordion sections

- **Files:**
  - `client/src/components/property-detail/ExecutiveSummaryTab.tsx` (continuation of S1)

- **Change:**

  In the same file, implement the loaded-state sub-components.

  **`ExecutiveSummarySkeleton`** — mirrors the loaded layout:
  - 4-column metrics grid with 8 `<Skeleton className="h-16 rounded-xl" />` cards
  - 6 accordion items each with `<Skeleton className="h-4 w-full" />`

  **`ExecutiveSummaryEmpty`** — premium illustrated empty state:
  - Centered card, `bg-gradient-to-br from-primary/5 to-primary/10`, `backdrop-blur-xl`
  - `IconSparkles` icon (large, colored accent), `font-display` title "Executive Summary"
  - Subtitle: "The Analyst reviews your property's investment thesis, market position, revenue strategy, risk profile, and exit plan."
  - `<AnalystButton suffix="Executive Summary" pulse size="lg" onClick={onAsk} />`

  **`ExecutiveSummaryContent`** — main content:

  A. **Header row** — property name, `generatedAt` formatted as relative time ("Updated 2 hours ago"), `<AnalystButton suffix="Executive Summary" size="sm" onClick={onRefresh} isRunning={isRefreshing} />`, confidence badge (`confidenceLevel` value).

  B. **Key metrics grid** — `grid grid-cols-2 md:grid-cols-4 gap-4`. Each metric card:
  - Glass card: `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4`
  - `<motion.div>` from Framer Motion — animate the number from 0 to value on mount (`initial={{ opacity: 0, y: 8 }}`, `animate={{ opacity: 1, y: 0 }}`, stagger delay 0.05s per card)
  - Metrics: Total Investment (`formatMoney`), Projected IRR (%), Equity Multiple (`x`), Stabilized NOI (`formatMoney`), Exit Value (`formatMoney`), DSCR (2 decimal places or "—"), Cash-on-Cash (%), Payback (years)

  C. **Qualitative sections** — `<Accordion type="multiple" defaultValue={["investmentThesis"]}>`
  Each section in `SECTIONS` array (defined in S1):
  - `<AccordionItem>` with the section icon + label in the trigger
  - `<AccordionContent>` with the prose text (preserve line breaks via `whitespace-pre-wrap`)

  D. **Sources footer** — small `text-xs text-muted-foreground` list of `summary.sources` (if any), collapsed in a `<Collapsible>` with "Show sources" trigger.

  Design requirements:
  - All cards have gradient fills, backdrop blur, subtle borders (no plain white flat cards)
  - Numbers animate on first render (Framer Motion)
  - Sections stagger in with `motion.div` variants
  - Colors use theme tokens only (no raw hex)

- **Affected dependency surfaces:** S4 (UI types only)
- **Cross-check invariants:** All user-facing strings must pass vocabulary compliance — no forbidden terms. Run `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` after writing copy.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] All 8 metric cards render with correct labels and formatted values in dev server.
  - [ ] Numbers animate from 0 to value on first mount (visible in dev server).
  - [ ] Accordion opens/closes sections; Investment Thesis is open by default.
  - [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` passes 11/11.
  - [ ] No flat white cards — all cards have gradient or blur treatment.
  - [ ] No new lint warnings.
- **Test impact:** Vocabulary compliance test must continue to pass.
- **Rollback notes:** Revert the commit (same commit as S1 is acceptable — both S1 and S2 land together as one logical unit).

---

### S3: Register the tab in `PropertyDetail.tsx` and `property-detail/index.ts`

- **Files:**
  - `client/src/components/property-detail/index.ts` — add `ExecutiveSummaryTab` export
  - `client/src/pages/PropertyDetail.tsx` — add tab entry + `TabsContent`

- **Change:**

  **`property-detail/index.ts`** — append:
  ```ts
  export { ExecutiveSummaryTab } from "./ExecutiveSummaryTab";
  ```

  **`PropertyDetail.tsx`** — two edits:

  1. Add import at the top alongside other property-detail imports:
  ```ts
  import { ExecutiveSummaryTab } from "@/components/property-detail";
  ```
  (If already importing from `@/components/property-detail` via destructuring, add `ExecutiveSummaryTab` to the destructured list.)

  2. In the `tabs` array passed to `<CurrentThemeTab>`, add after the `documents` entry:
  ```ts
  { value: 'executive-summary', label: 'Executive Summary', icon: IconSparkles },
  ```
  (Import `IconSparkles` from `@/components/icons` if not already imported.)

  3. Add `<TabsContent>` after the `documents` block:
  ```tsx
  <TabsContent value="executive-summary" className="mt-6">
    <ExecutiveSummaryTab propertyId={propertyId} />
  </TabsContent>
  ```

- **Affected dependency surfaces:** S4 (UI routing)
- **Cross-check invariants:**
  - After adding the tab, every other existing tab must still render correctly (no import conflict, no missing export)
  - The `ExecutiveSummaryTab` is a new file; confirm it's imported correctly
- **Acceptance criteria:**
  - [ ] "Executive Summary" tab appears in the property detail tab bar in dev server.
  - [ ] Clicking the tab shows the empty state (AnalystButton with pulse) on first visit.
  - [ ] Switching to other tabs and back does not break them.
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] No new lint warnings on `PropertyDetail.tsx` or `index.ts`.
- **Test impact:** Existing tests are unaffected (no financial logic changed).
- **Rollback notes:** Revert the commit.

---

### S4: Wire `<AnalystButton>` click to save-then-run (analyst-click-saves-tab rule)

- **Files:**
  - `client/src/components/property-detail/ExecutiveSummaryTab.tsx` (minor addition)

- **Change:**

  Per `.claude/rules/analyst-click-saves-tab.md`, pressing the AnalystButton must persist in-flight edits before running the Specialist. The Executive Summary tab has no editable form fields — it is display-only. Therefore the "save" step is a no-op here, and the rule is satisfied trivially.

  Add a comment in the click handler confirming this:
  ```ts
  // analyst-click-saves-tab: no editable form fields on this tab — save step is a no-op.
  mutation.mutate();
  ```

  Additionally, add a `data-testid="button-analyst-executive-summary"` to the `<AnalystButton>` in both the empty state and the loaded-state header so the analyst-trigger-discipline proof test (when authored) can locate it.

- **Affected dependency surfaces:** S4
- **Cross-check invariants:** Confirm `analyst-click-saves-tab.md` requirement is met (trivially, as documented in comment).
- **Acceptance criteria:**
  - [ ] `data-testid="button-analyst-executive-summary"` appears on the AnalystButton in both empty and loaded states (inspect element in dev server).
  - [ ] Clicking the button in empty state triggers `POST /api/executive-summary/property/:id/regenerate` (verify in network tab).
  - [ ] Clicking the Refresh button in loaded state triggers the same POST.
  - [ ] `tsc --noEmit` returns 0 errors.
- **Test impact:** No new test required (testid enables future proof test).
- **Rollback notes:** Revert the commit (can fold into S3 commit — same logical unit acceptable).

---

## Verification (MANDATORY)

Run all commands and report PASS / FAIL / SKIPPED with reason.

### Gate commands

- [ ] `npx tsc --noEmit --skipLibCheck` — TypeScript: 0 errors
- [ ] `npm run lint` — ESLint: 0 errors, 0 warnings on touched files
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED PASS

### Behavioral verification (dev server)

- [ ] Navigate to any property → "Executive Summary" tab is visible in the tab bar.
- [ ] On first visit (no prior run), the tab shows the empty state with a pulsing AnalystButton labelled "Analyst — Executive Summary".
- [ ] Clicking the AnalystButton shows the skeleton loading state while the POST is in-flight.
- [ ] After the POST completes, 8 metric cards render with animated values and 6 accordion sections are present.
- [ ] Switching to another tab (e.g. Income Statement) and back does not break either tab (TanStack Query in-memory cache persists for the session; refreshing the browser returns to the empty state — expected).
- [ ] Browser console: 0 new errors during the full flow.

### Surface-specific verification

- **S4 (client UI):** `ExecutiveSummaryTab` renders without TypeScript errors and does not import `db` or any `server/` module.
- **Vocab gate:** No forbidden terms in user-facing copy (running the vocabulary test above covers this).

---

## Out of scope (MANDATORY)

- **G4 runner / bar tests** — The `server/ai/specialists/property-executive-summary-runner.ts` runner and `tests/analyst/specialists/risk-g4.test.ts`-style bar tests are Claude Code's follow-on work after ADR-003 is amended for narrative dimensions. Do not create a runner file in this packet.
- **ADR-003 amendment** — The narrative-specialist verdict dimension archetype is a CC doctrine task. Do not modify `engine/analyst/contracts/verdict.ts` or `docs/architecture/decisions/ADR-003-analyst-verdict-contract.md`.
- **Trigger-discipline fix on existing GET endpoint** — `GET /api/executive-summary/property/:propertyId` currently fires LLM on page load (trigger-discipline violation). Fixing that route is CC's work in the same follow-on session as the runner. Do not modify `server/routes/executive-summary.ts`.
- **Portfolio executive summary tab** — Only the property-level tab is in scope here.
- **Export integration** — Adding executive summary data to PDF/PPTX exports is a separate phase.
- **"Due for review" staleness badge** — The staleness logic requires the runner's `generatedAt` tracking to be meaningful. Defer to G4-b once the runner is wired.
- **Specialist catalog status update** — `property.executive-summary` entry in `engine/analyst/registry/specialist-catalog.ts` stays `status: "needs-page"` after this packet ships. The status flip (`needs-page` → `built`) belongs in the G4-b runner packet once the evaluator is wired.

---

## Surfaces footer template (MANDATORY)

Every commit from this packet must end with:

```
Surfaces: S4
Packet: .claude/replit-handoffs/g4-eloa-property-tab.md
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

---

## Completion report (filled by Replit on exit)

- **Commits:** 1 combined commit covering S1 + S2 + S3 + S4 (see "Deviations" below). Commit hash assigned by the platform's auto-commit on task exit.
- **Sub-steps PASSED:** S1 (component skeleton), S2 (loaded view + content), S3 (registration: barrel export + tab entry + TabsContent + IconSparkles import), S4 (testid override `button-analyst-executive-summary` on both AnalystButton instances + `analyst-click-saves-tab` justification comment in front of each).
- **Sub-steps SKIPPED with reason:** None.
- **Verification gates PASSED (final, post-S4 state):**
  - `npx tsc --noEmit --skipLibCheck` → 0 errors.
  - `npm run lint` → PASS, 0 errors.
  - `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` → PASS 11/11.
  - `npm run test:summary` → PASS (workflow `Run Tests` `FINISHED` `PASS`).
  - `npm run verify:summary` → PASS, Opinion `UNQUALIFIED` (workflow `Verify Financials` `FINISHED` `UNQUALIFIED`).
- **Verification gates SKIPPED with reason:** None. All five gates were re-run after the final S4 edit and all passed unqualified. (One mid-stream failure of `tests/audit/specialist-human-names.test.ts` was self-inflicted by the initial S1 docstring naming the specialist by human name; the docstring was rewritten to refer to the specialist by role only and the test passed in the next run.)
- **Out-of-scope items discovered:**
  - The packet's pseudocode for the network call assumed `apiRequest(method, url, data?)` returned the parsed JSON. In this codebase it returns a `Response`; consumers must call `.json()`. Adapted in this packet (no fix to `apiRequest` itself, no new helper).
  - The packet's pseudocode imported `formatMoney` from `@/lib/utils`. The actual export lives in `@/lib/map-utils`. Adapted in this packet (no rename or re-export added).
  - `AnalystButton` exposes its testid override prop as `dataTestId` (camelCase), not `data-testid`. Used the camelCase prop. No prop renaming attempted.
  - `client/src/components/property-detail/index.ts` uses `export { default as X } from "./X"` (default exports), so the new component is a default export to match. No change to the barrel pattern.
  - Specialist catalog entry `property.executive-summary` in `engine/analyst/registry/specialist-catalog.ts` remains `status: "needs-page"` — the flip to `built` is explicitly out of scope per the packet and belongs to the G4-b runner packet.
- **Deviations from the packet's "two commits" instruction:** The packet asks for two commits (S1+S2 first, then S3+S4). The Replit main-agent role does not have direct `git commit` access — it can only stage changes that the platform commits in a single auto-commit on task exit. To stay honest about the verification model, all four sub-steps were completed in this single session and the **full five-gate suite was re-run after S4** so the gates apply to the final, on-disk state (which is stricter than per-step gating: any S3/S4 edit that broke S1/S2 would have surfaced). Both logical units are described separately in the commit message body.
- **Session-memory entry added:** ❌ (to be filled by Replit)
