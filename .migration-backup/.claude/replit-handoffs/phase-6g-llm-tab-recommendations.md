# Phase 6g: LLM Tab — Recommended badges + Analyst refresh button

## Doctrine Freeze Gate Check

- **Governing ADR(s):** ADR-006 (Resources control plane), ADR-007 (Specialist Tier-1 Graduation)
- **ADR status:** Accepted
- **Last ADR edit:** prior session (stable)
- **Sessions stable:** 2
- **Gate decision:** ✅ Cleared to execute

## Context

The server now returns `recommendedModelSlugs` on every Specialist config
response (`b6f44d2c`). This is a map of role → model slug derived from
the vendor-roster recommendation matrix (`.claude/rules/llm-vendor-roster.md`,
refreshed 2026-04-25):

```
primary   → "claude-sonnet-4-6"   (Prompt Engineer pre-stage)
analystA  → "gemini-2.5-flash"    (Quantitative panel)
analystB  → "claude-sonnet-4-6"   (Market panel)
synthesis → "claude-opus-4-7"     (Final verdict)
fallback  → "claude-haiku-4-5-20251001"  (N+2 failover)
```

The `SpecialistConfigView` client type already has the field (`cab8b5e4`).

Two UI changes required:

1. **"Recommended" badge in model dropdowns** — each of the five
   `renderModelField` calls in `LlmConfigTab.tsx` should mark its
   recommended model slug with a `(Recommended)` suffix or a small
   `<Badge>` inside the `SelectItem`. Highlight the trigger too when
   the currently-selected resource's `slug` matches the recommendation.
2. **AnalystButton on the LLM tab** — clicking it refetches the models
   list (`/api/admin/resources?kind=model`) to pick up any newly-added
   model resources. This is **not** an LLM call — it's a server data
   refresh. Per `analyst-trigger-discipline.md`, reading cached/static
   data without firing a cognitive run is permitted.

## Atomic-budget check

- **Sub-step count:** 2
- **File count:** 1 (`client/src/pages/admin/specialist/tabs/LlmConfigTab.tsx`)
- **Capability domains touched:** UI
- **Gate:** ✅ Within budget

## Tasks

### S1: "Recommended" badge in model dropdowns

- **Files:**
  - `client/src/pages/admin/specialist/tabs/LlmConfigTab.tsx`

- **Change:** Update `renderModelField` to accept an optional
  `recommendedSlug: string | null` param. Inside the `modelOptions.map`
  loop, when `m.slug === recommendedSlug`, append a small
  `<Badge className="ml-1 text-[10px]">Recommended</Badge>` to the
  `SelectItem` label. Also show the same badge on the `SelectTrigger`
  when the currently selected resource's slug matches.

  Call-site changes for the five existing `renderModelField` invocations
  (lines ~325, ~391-409):

  ```tsx
  // Before
  renderModelField("modelResourceId", "Primary model", primaryModelId,
    setPrimaryModelId, config.globalLlmDefaults.synthesisModelLabel)

  // After
  renderModelField("modelResourceId", "Primary model", primaryModelId,
    setPrimaryModelId, config.globalLlmDefaults.synthesisModelLabel,
    config.recommendedModelSlugs.primary)

  // ... same pattern for analystA, analystB, synthesis, fallback
  ```

  Recommendation helper (add near the top of the component, after
  `modelOptions = useMemo(...)`):

  ```tsx
  const getRecommendedResource = (slug: string | null) =>
    slug ? modelOptions.find((m) => m.slug === slug) ?? null : null;
  ```

  Then in the trigger's `SelectValue`, add the badge if the
  currently-selected model matches:

  ```tsx
  const selectedModel = modelOptions.find((m) => String(m.id) === value);
  const isRecommended = selectedModel?.slug === recommendedSlug;
  // ...
  <SelectTrigger ...>
    <SelectValue />
    {isRecommended && (
      <Badge variant="secondary" className="ml-1 shrink-0 text-[10px]">
        Recommended
      </Badge>
    )}
  </SelectTrigger>
  ```

- **Affected dependency surfaces:** S4 (UI components)
- **Cross-check invariants:** none — no schema/server changes
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] Opening any Specialist's LLM Config tab shows "(Recommended)"
    next to the vendor-roster-recommended model in each dropdown.
  - [ ] When the dropdown's current selection IS the recommended model,
    the trigger also shows the "Recommended" badge.
  - [ ] No new lint warnings on `LlmConfigTab.tsx`.
- **Test impact:** No new tests required — visual/behavioral check.
- **Rollback notes:** Revert the commit.

### S2: AnalystButton → refresh models list

- **Files:**
  - `client/src/pages/admin/specialist/tabs/LlmConfigTab.tsx`

- **Change:** Add an `<AnalystButton>` to the section header of the
  Primary Model card (Section 1, inside the `<CardHeader>`), or as a
  standalone row above the card group. The button refetches the models
  list from the server; it does NOT invoke any LLM or cognitive engine
  — it just re-queries the existing REST endpoint to pick up
  newly-added model resources.

  Import addition:
  ```tsx
  import { AnalystButton } from "@/components/intelligence/AnalystButton";
  ```

  State addition:
  ```tsx
  const [isRefreshing, setIsRefreshing] = useState(false);
  ```

  Handler:
  ```tsx
  const handleRefreshModels = async () => {
    setIsRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["/api/admin/resources?kind=model"] });
    setIsRefreshing(false);
  };
  ```

  Render (in the LLM tab header area, before Section 1):
  ```tsx
  <div className="flex items-center justify-between mb-4">
    <p className="text-sm text-muted-foreground">
      Configure models for each pipeline role. Recommended selections
      reflect the vendor-roster matrix (refreshed quarterly).
    </p>
    <AnalystButton
      onClick={handleRefreshModels}
      isRunning={isRefreshing}
      suffix="Refresh models"
      size="sm"
      tooltip="Reload the available model list from the server and update recommendations"
      dataTestId="button-llm-refresh-models"
    />
  </div>
  ```

  Vocabulary note: the button label will render "Analyst — Refresh
  models". This is appropriate; clicking does nothing an LP sees, and
  the analyst-trigger-discipline rule allows reading cached static data.

- **Affected dependency surfaces:** S4 (UI components)
- **Cross-check invariants:** none — no server call, no LLM invocation
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] "Analyst — Refresh models" button appears at the top of the LLM
    Config tab.
  - [ ] Clicking the button triggers a loading state and refetches the
    models list (visible in Network tab as a GET to
    `/api/admin/resources?kind=model`).
  - [ ] After the refetch, any newly-added model resources appear in
    all five dropdowns without a page reload.
  - [ ] Browser console: 0 new errors during the interaction.
  - [ ] Vocabulary test passes (`npm run test:file -- tests/audit/vocabulary-compliance.test.ts`).
- **Test impact:** No new automated tests required — behavioral.
- **Rollback notes:** Revert the commit.

## Verification

### Gate commands

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run lint` — 0 errors, 0 warnings on `LlmConfigTab.tsx`
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass

### Behavioral verification

- [ ] Open Admin → AI Intelligence → any Specialist → LLM Config tab.
- [ ] Each model dropdown's recommended model has a "Recommended" badge.
- [ ] When the current selection IS the recommended model, the trigger
  itself also shows the badge.
- [ ] "Analyst — Refresh models" button is visible at top of tab.
- [ ] Clicking the button shows a brief loading state, then the model
  list refreshes.
- [ ] Browser console: 0 new errors.

## Out of scope

- Adding a new server endpoint — the existing `/api/admin/resources?kind=model`
  endpoint is sufficient.
- Persisting or changing recommendations — they come from `config.recommendedModelSlugs`
  which is server-side read-only.
- Any vendor-list management UI (add new vendor, edit provider credentials)
  — that lives in the Resources control-plane tab.
- Cognitive engine invocation — this packet has zero LLM calls.

## Surfaces footer template

Every commit from this packet must end with:

```
Surfaces: S4
Packet: .claude/replit-handoffs/phase-6g-llm-tab-recommendations.md
```

## Completion report (filled by Replit on exit)

- **Commits:** `<sha1>`, `<sha2>`
- **Sub-steps PASSED:** S1, S2
- **Sub-steps SKIPPED with reason:** —
- **Verification gates PASSED:** TS, Lint, test:summary, verify:summary, vocab
- **Verification gates SKIPPED with reason:** —
- **Out-of-scope items discovered:** —
- **Session-memory entry added:** ✅
