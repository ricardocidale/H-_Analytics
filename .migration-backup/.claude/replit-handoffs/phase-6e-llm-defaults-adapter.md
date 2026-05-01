# Phase 6e: LLM Defaults Tab — N+1 Orchestrator Model Defaults Section

## Doctrine Freeze Gate Check

- **Governing ADR(s):** ADR-006 (Resources control plane, P6 scope)
- **ADR status:** Accepted
- **Last ADR edit:** prior session (stable ≥2 sessions)
- **Gate decision:** ✅ Cleared to execute

## Context

Commit `5524c70a` (P6e-a) wired four nullable FK columns
(`analyst_a_model_resource_id`, `analyst_b_model_resource_id`,
`synthesis_model_resource_id`, `fallback_model_resource_id`) onto the
`pipeline_policies` table (via migration `pipeline_n1_global_models_001`).
The PATCH `/api/admin/pipeline-policies/tier1_property` route now accepts
these four fields, and `GET /api/admin/pipeline-policies` returns the
`tier1_property` row with the new columns.

This packet adds the UI: a new "N+1 Orchestrator Defaults" section in
`LlmDefaultsTab.tsx` with four model dropdowns (one per pipeline role),
each populated from `GET /api/admin/resources?kind=model` and saved via
the existing PATCH endpoint.

## Atomic-budget check

- **Sub-step count:** 1
- **File count:** 1 (`client/src/components/admin/model-defaults/LlmDefaultsTab.tsx`)
- **Capability domains touched:** UI
- **Gate:** ✅ Within budget

## Task

### S1: N+1 Orchestrator section in `LlmDefaultsTab.tsx`

**File:** `client/src/components/admin/model-defaults/LlmDefaultsTab.tsx`

#### Data fetching additions

Add two new queries near the top of the `LlmDefaultsTab()` component body
(after the existing `specialists` query):

```tsx
// Fetch the tier1_property pipeline policy to read current N+1 model IDs.
const { data: pipelinePolicies } = useQuery<PipelinePolicy[]>({
  queryKey: ["/api/admin/pipeline-policies"],
});
const tier1Policy = pipelinePolicies?.find(
  (p) => p.policyKey === "tier1_property" || p.tier === 1,
) ?? null;

// Fetch available model resources to populate the four dropdowns.
const { data: modelResources } = useQuery<ResourcePublicView[]>({
  queryKey: ["/api/admin/resources?kind=model"],
});
const modelOptions = modelResources ?? [];
```

Add local state for the four N+1 model overrides (initialize from `tier1Policy`):

```tsx
const [n1ModelIds, setN1ModelIds] = useState<{
  analystAModelResourceId: number | null;
  analystBModelResourceId: number | null;
  synthesisModelResourceId: number | null;
  fallbackModelResourceId: number | null;
}>({ analystAModelResourceId: null, analystBModelResourceId: null,
     synthesisModelResourceId: null, fallbackModelResourceId: null });
const [n1Initialized, setN1Initialized] = useState(false);
```

Initialize from server values once the tier1 policy loads:

```tsx
useEffect(() => {
  if (tier1Policy && !n1Initialized) {
    setN1ModelIds({
      analystAModelResourceId: tier1Policy.analystAModelResourceId ?? null,
      analystBModelResourceId: tier1Policy.analystBModelResourceId ?? null,
      synthesisModelResourceId: tier1Policy.synthesisModelResourceId ?? null,
      fallbackModelResourceId: tier1Policy.fallbackModelResourceId ?? null,
    });
    setN1Initialized(true);
  }
}, [tier1Policy, n1Initialized]);
```

Add a save mutation for the N+1 section:

```tsx
const qc = useQueryClient();
const n1SaveMutation = useMutation({
  mutationFn: (ids: typeof n1ModelIds) =>
    apiRequest("PATCH", "/api/admin/pipeline-policies/tier1_property", ids),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/pipeline-policies"] });
    toast({ title: "N+1 model defaults saved" });
    setN1Dirty(false);
  },
  onError: () => toast({ title: "Failed to save N+1 model defaults", variant: "destructive" }),
});
const [n1Dirty, setN1Dirty] = useState(false);
```

#### Import additions

```tsx
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PipelinePolicy, ResourcePublicView } from "@shared/schema";
```

#### Render: new N+1 section

Insert **before** the existing `<div className="grid grid-cols-1...">` grid
(the four LLM_TAB_ITEMS section), so it appears at the top of the tab
body (after the drift summary):

```tsx
{/* N+1 Orchestrator Defaults — P6e */}
<div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-4">
  <div className="flex items-center justify-between">
    <div>
      <h4 className="text-sm font-semibold">N+1 Orchestrator Defaults</h4>
      <p className="text-xs text-muted-foreground mt-0.5">
        Global model assignment for the multi-model research pipeline.
        Specialists can override these on their LLM Config tab.
      </p>
    </div>
    <Button
      size="sm"
      variant="outline"
      disabled={!n1Dirty || n1SaveMutation.isPending}
      onClick={() => n1SaveMutation.mutate(n1ModelIds)}
      data-testid="button-n1-save"
    >
      {n1SaveMutation.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <IconSave className="w-4 h-4" />
      )}
      Save
    </Button>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    {(
      [
        { key: "analystAModelResourceId", label: "Quantitative Panel (Analyst A)", placeholder: "gemini-2.5-flash (hardcoded default)" },
        { key: "analystBModelResourceId", label: "Market Panel (Analyst B)", placeholder: "claude-sonnet-4-5 (hardcoded default)" },
        { key: "synthesisModelResourceId", label: "Synthesis (Verdict)", placeholder: "claude-opus-4-6 (hardcoded default)" },
        { key: "fallbackModelResourceId", label: "Fallback (N+2)", placeholder: "uses Specialist primary (hardcoded default)" },
      ] as const
    ).map(({ key, label, placeholder }) => {
      const currentId = n1ModelIds[key];
      return (
        <div key={key} className="space-y-1.5">
          <Label className="text-xs font-medium">{label}</Label>
          <Select
            value={currentId != null ? String(currentId) : "__unset__"}
            onValueChange={(val) => {
              setN1ModelIds((prev) => ({
                ...prev,
                [key]: val === "__unset__" ? null : Number(val),
              }));
              setN1Dirty(true);
            }}
          >
            <SelectTrigger className="h-8 text-xs" data-testid={`select-n1-${key}`}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset__">
                <span className="text-muted-foreground">{placeholder}</span>
              </SelectItem>
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    })}
  </div>
</div>
```

#### Type notes

- `PipelinePolicy` — already exported from `@shared/schema` (includes
  `analystAModelResourceId`, `analystBModelResourceId`,
  `synthesisModelResourceId`, `fallbackModelResourceId` as `number | null`
  after P6e-a commit `5524c70a`).
- `ResourcePublicView` — already exported from `@shared/schema`.

#### Acceptance criteria

- [ ] `tsc --noEmit` returns 0 errors.
- [ ] "N+1 Orchestrator Defaults" section appears above the existing
  tab-function cards.
- [ ] Each of the 4 dropdowns is populated with the model list from
  `/api/admin/resources?kind=model`.
- [ ] Selecting a model marks the section dirty and activates the Save button.
- [ ] Clicking Save sends `PATCH /api/admin/pipeline-policies/tier1_property`
  with the four model resource IDs (Network tab: 200 OK).
- [ ] After save, the section shows the selected models (not placeholder text).
- [ ] Selecting the blank option (`__unset__`) reverts the field to `null`
  (server stores null → resolver falls back to hardcoded default slug).
- [ ] No new lint warnings on the file.
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11.

## Verification

### Gate commands

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run lint` — 0 errors, 0 warnings on `LlmDefaultsTab.tsx`
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11

### Behavioral verification

- [ ] Open Admin → Defaults → LLM defaults tab.
- [ ] "N+1 Orchestrator Defaults" section is visible above the existing cards.
- [ ] Dropdowns load the model registry (same list as on Specialist LLM Config tabs).
- [ ] Save button activates on selection change, sends PATCH, clears dirty state.
- [ ] Network tab shows `PATCH /api/admin/pipeline-policies/tier1_property`.

## Out of scope

- Per-Specialist LLM Config UI changes (separate P6g packet).
- Displaying the new N+1 global defaults as "Inheriting global default"
  placeholders on Specialist LLM Config tabs — that behavior already works
  via `globalLlmDefaults.analystAModelLabel` etc., which the resolver
  now reads from the DB (P6e-a).
- Any changes to `server/` — this packet is UI-only.

## Surfaces footer template

```
Surfaces: S4
Packet: .claude/replit-handoffs/phase-6e-llm-defaults-adapter.md
```

## Completion report (filled by Replit on exit)

- **Commits:** `<sha1>`
- **Sub-steps PASSED:** S1
- **Sub-steps SKIPPED with reason:** —
- **Verification gates PASSED:** TS, Lint, test:summary, verify:summary, vocab
- **Verification gates SKIPPED with reason:** —
- **Out-of-scope items discovered:** —
- **Session-memory entry added:** ✅
