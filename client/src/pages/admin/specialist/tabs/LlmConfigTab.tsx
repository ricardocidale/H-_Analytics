/**
 * LlmConfigTab — per-Specialist LLM/orchestrator/workflow override panel
 * (Task #495). Replaces the prior "model + prompt + embedded global pipeline"
 * card with a five-section editor:
 *
 *   1. Primary model + prompt template
 *   2. N+1 Multi-model synthesis
 *        (Analyst A model, Analyst B model, Synthesis model, enable toggle)
 *   3. N+2 Fallback model + relaxation max level
 *   4. Workflow policy (staleness, concurrency, token budgets,
 *      evidence/comp thresholds, auto-refresh interval)
 *   5. Other (change summary + Save)
 *
 * Every override field is independently nullable and renders an
 * "Inheriting global default — <value>" placeholder when unset, with a
 * "Reset to global" button to clear the override. Resolution order is
 * specialist override → global pipeline policy / N+1 default → hardcoded
 * fallback (resolved server-side and surfaced via `globalLlmDefaults`).
 *
 * The tab issues a single PUT to `/llm-config` per Save, which writes one
 * versioned row to `specialist_config_versions`. Per-field "edited X, Y, Z"
 * labels are rendered by the Audit tab from that snapshot diff.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ResourcePublicView } from "@shared/schema";
import type {
  SpecialistConfigView,
  SpecialistWorkflowOverrides,
} from "../types";
import { navigateToResources } from "../constants";

// "none" sentinel is used by the Select component to represent the cleared
// (= inherit global) state, since RadixSelect cannot have a value of "".
const INHERIT_SENTINEL = "__inherit__";

type ModelFieldKey =
  | "modelResourceId"
  | "analystAModelResourceId"
  | "analystBModelResourceId"
  | "synthesisModelResourceId"
  | "fallbackModelResourceId";

/** Workflow knob keys + their labels / units / step / range for the form. */
const WORKFLOW_FIELDS: Array<{
  key: keyof SpecialistWorkflowOverrides;
  label: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  formatGlobal: (n: number | null) => string;
}> = [
  { key: "stalenessThresholdHours", label: "Staleness threshold", unit: "hours", min: 1, max: 8760, formatGlobal: (n) => n == null ? "—" : `${n}h` },
  { key: "maxConcurrentRuns",       label: "Max concurrent runs",  min: 1,  max: 20,    formatGlobal: (n) => n == null ? "—" : String(n) },
  { key: "dailyTokenBudget",        label: "Daily token budget",   min: 0,  max: 10_000_000, formatGlobal: (n) => n == null ? "—" : n.toLocaleString() },
  { key: "monthlyTokenBudget",      label: "Monthly token budget", min: 0,  max: 100_000_000, formatGlobal: (n) => n == null ? "—" : n.toLocaleString() },
  { key: "minEvidenceScore",        label: "Min evidence score",   step: 0.01, min: 0, max: 1, formatGlobal: (n) => n == null ? "—" : n.toFixed(2) },
  { key: "minCompCount",            label: "Min comp count",       min: 0, max: 50,    formatGlobal: (n) => n == null ? "—" : String(n) },
  { key: "autoRefreshIntervalHours",label: "Auto-refresh interval",unit: "hours", min: 1, max: 8760, formatGlobal: (n) => n == null ? "—" : `${n}h` },
];

export function LlmConfigTab({
  specialistId,
  config,
}: {
  specialistId: string;
  config: SpecialistConfigView;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  // ── Local state mirrors every overridable field ─────────────────
  const [prompt, setPrompt] = useState(config.promptTemplate);
  const [primaryModelId, setPrimaryModelId] = useState<string>(toSelectValue(config.modelResourceId));
  const [analystAModelId, setAnalystAModelId] = useState<string>(toSelectValue(config.analystAModelResourceId));
  const [analystBModelId, setAnalystBModelId] = useState<string>(toSelectValue(config.analystBModelResourceId));
  const [synthesisModelId, setSynthesisModelId] = useState<string>(toSelectValue(config.synthesisModelResourceId));
  const [fallbackModelId, setFallbackModelId] = useState<string>(toSelectValue(config.fallbackModelResourceId));
  const [multiModelEnabled, setMultiModelEnabled] = useState<boolean | null>(config.multiModelEnabled);
  const [workflow, setWorkflow] = useState<SpecialistWorkflowOverrides>(config.workflowOverrides ?? {});
  const [summary, setSummary] = useState("");

  const { data: models } = useQuery<ResourcePublicView[]>({ queryKey: ["/api/admin/resources?kind=model"] });

  // ── Save: single PUT, single versioned audit row ────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        promptTemplate: prompt,
        modelResourceId: fromSelectValue(primaryModelId),
        analystAModelResourceId: fromSelectValue(analystAModelId),
        analystBModelResourceId: fromSelectValue(analystBModelId),
        synthesisModelResourceId: fromSelectValue(synthesisModelId),
        fallbackModelResourceId: fromSelectValue(fallbackModelId),
        multiModelEnabled,
        workflowOverrides: hasAnyOverride(workflow) ? workflow : null,
        changeSummary: summary || undefined,
      };
      const res = await apiRequest("PUT", `/api/admin/specialists/${specialistId}/llm-config`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LLM config updated" });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}`] });
      qc.invalidateQueries({ queryKey: [`/api/admin/specialists/${specialistId}/audit`] });
      // Task #502 — keep the catalog list's hasLlmOverrides flag in
      // sync so the AI Intelligence sidebar's per-row "Overrides"
      // badge and the LLM Defaults summary count refresh on the same
      // tick. Without this, an admin who toggles a knob from default
      // to overridden (or back) sees stale drift state until the
      // next refocus/remount.
      qc.invalidateQueries({ queryKey: ["/api/admin/specialists"] });
      setSummary("");
    },
    onError: (e: unknown) =>
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });

  const modelOptions = useMemo(() => models ?? [], [models]);

  // ── Override summary banner ─────────────────────────────────────
  // Counts every overridable knob (5 model fields + multi-model toggle +
  // 8 workflow knobs = 14 total) and reports how many are currently set
  // by this Specialist vs inheriting the global default. Recomputed
  // on every state change so the banner stays in sync with edits.
  const overrideStats = useMemo(() => {
    const knobs: boolean[] = [
      primaryModelId !== INHERIT_SENTINEL,
      analystAModelId !== INHERIT_SENTINEL,
      analystBModelId !== INHERIT_SENTINEL,
      synthesisModelId !== INHERIT_SENTINEL,
      fallbackModelId !== INHERIT_SENTINEL,
      multiModelEnabled !== null,
      ...WORKFLOW_FIELDS.map((f) => workflow[f.key] !== undefined && workflow[f.key] !== null),
      // The relaxation max level is a workflow knob too, kept separate from
      // WORKFLOW_FIELDS for layout reasons.
      workflow.relaxationMaxLevel !== undefined && workflow.relaxationMaxLevel !== null,
    ];
    const overridden = knobs.filter(Boolean).length;
    return { overridden, total: knobs.length, inheriting: knobs.length - overridden };
  }, [
    primaryModelId, analystAModelId, analystBModelId, synthesisModelId,
    fallbackModelId, multiModelEnabled, workflow,
  ]);

  // Helper: render one model dropdown with the inherit/reset affordance.
  const renderModelField = (
    fieldKey: ModelFieldKey,
    label: string,
    value: string,
    setValue: (v: string) => void,
    globalLabel: string | null,
  ) => {
    const isOverridden = value !== INHERIT_SENTINEL;
    return (
      <div className="space-y-2" data-testid={`field-${fieldKey}`}>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{label}</label>
          {isOverridden ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => setValue(INHERIT_SENTINEL)}
              data-testid={`button-reset-${fieldKey}`}
            >
              Reset to global
            </Button>
          ) : (
            <Badge variant="outline" className="text-xs" data-testid={`badge-inherit-${fieldKey}`}>
              Inheriting global default
            </Badge>
          )}
        </div>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger data-testid={`select-${fieldKey}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT_SENTINEL}>
              — Inherit global ({globalLabel ?? "uses Specialist primary"}) —
            </SelectItem>
            {modelOptions.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.displayName ?? m.slug}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  // Helper: render one numeric workflow knob with the inherit/reset
  // affordance. Empty string ⇒ inherit; numeric ⇒ overridden.
  const renderWorkflowField = (
    spec: typeof WORKFLOW_FIELDS[number],
  ) => {
    const value = workflow[spec.key];
    const isOverridden = value !== undefined && value !== null;
    const globalRaw = config.globalLlmDefaults.workflow[spec.key];
    return (
      <div className="space-y-2" data-testid={`field-workflow-${spec.key}`}>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            {spec.label}{spec.unit ? ` (${spec.unit})` : ""}
          </label>
          {isOverridden ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() =>
                setWorkflow((w) => {
                  const next = { ...w };
                  delete next[spec.key];
                  return next;
                })
              }
              data-testid={`button-reset-workflow-${spec.key}`}
            >
              Reset to global
            </Button>
          ) : (
            <Badge variant="outline" className="text-xs" data-testid={`badge-inherit-workflow-${spec.key}`}>
              Inheriting global default ({spec.formatGlobal(globalRaw)})
            </Badge>
          )}
        </div>
        <Input
          type="number"
          step={spec.step}
          min={spec.min}
          max={spec.max}
          value={value ?? ""}
          placeholder={spec.formatGlobal(globalRaw)}
          onChange={(e) => {
            const raw = e.target.value;
            setWorkflow((w) => {
              const next = { ...w };
              if (raw === "") {
                delete next[spec.key];
              } else {
                const n = Number(raw);
                if (!Number.isFinite(n)) return w;
                next[spec.key] = n;
              }
              return next;
            });
          }}
          data-testid={`input-workflow-${spec.key}`}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Override summary banner ───────────────────────────── */}
      <div
        className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3 text-sm"
        data-testid="banner-override-summary"
      >
        <div>
          <span className="font-medium" data-testid="text-overridden-count">
            {overrideStats.overridden} overridden
          </span>
          <span className="text-muted-foreground"> · </span>
          <span data-testid="text-inheriting-count">
            {overrideStats.inheriting} inheriting global
          </span>
          <span className="text-muted-foreground"> (of {overrideStats.total} total)</span>
        </div>
        {overrideStats.overridden > 0 && (
          <Badge variant="secondary" data-testid="badge-has-overrides">Custom overrides active</Badge>
        )}
      </div>

      {/* ── Section 1 · Primary model + prompt ─────────────────── */}
      <Card data-testid="card-llm-primary">
        <CardHeader>
          <CardTitle>Primary model &amp; prompt</CardTitle>
          <p className="text-xs text-muted-foreground">
            The single-model path used when multi-model synthesis is disabled.
            Models are managed in{" "}
            <a
              className="underline"
              data-testid="link-resources-models"
              onClick={(e) => {
                e.preventDefault();
                navigateToResources(setLocation, "resources-models");
              }}
              href="#"
            >
              Resources · Models →
            </a>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderModelField(
            "modelResourceId",
            "Primary model",
            primaryModelId,
            setPrimaryModelId,
            // Primary model has no separate "global default" — it IS the
            // Specialist's local default. The placeholder labels what the
            // runtime would do if cleared: fall through to the system-wide
            // hardcoded primary resolved server-side via the Synthesis
            // model label (the canonical Tier-1 cognitive model).
            config.globalLlmDefaults.synthesisModelLabel,
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt template</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              data-testid="textarea-prompt-template"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2 · N+1 Multi-model synthesis ──────────────── */}
      <Card data-testid="card-llm-multimodel">
        <CardHeader>
          <CardTitle>N+1 multi-model synthesis</CardTitle>
          <p className="text-xs text-muted-foreground">
            Two analyst panels run in parallel and are reconciled by a
            synthesis model. Disable to bypass and use the primary model
            single-shot.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Enable multi-model synthesis</label>
              <p className="text-xs text-muted-foreground">
                {multiModelEnabled === null
                  ? `Inheriting global default (${config.globalLlmDefaults.multiModelEnabled ? "enabled" : "disabled"})`
                  : multiModelEnabled
                    ? "Override: enabled"
                    : "Override: disabled"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {multiModelEnabled !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground"
                  onClick={() => setMultiModelEnabled(null)}
                  data-testid="button-reset-multiModelEnabled"
                >
                  Reset to global
                </Button>
              )}
              <Switch
                checked={multiModelEnabled ?? config.globalLlmDefaults.multiModelEnabled}
                onCheckedChange={(v) => setMultiModelEnabled(v)}
                data-testid="switch-multiModelEnabled"
              />
            </div>
          </div>
          {renderModelField(
            "analystAModelResourceId",
            "Analyst A model (quantitative)",
            analystAModelId,
            setAnalystAModelId,
            config.globalLlmDefaults.analystAModelLabel,
          )}
          {renderModelField(
            "analystBModelResourceId",
            "Analyst B model (market strategy)",
            analystBModelId,
            setAnalystBModelId,
            config.globalLlmDefaults.analystBModelLabel,
          )}
          {renderModelField(
            "synthesisModelResourceId",
            "Synthesis model (+1 reconciler)",
            synthesisModelId,
            setSynthesisModelId,
            config.globalLlmDefaults.synthesisModelLabel,
          )}
        </CardContent>
      </Card>

      {/* ── Section 3 · N+2 Fallback ───────────────────────────── */}
      <Card data-testid="card-llm-fallback">
        <CardHeader>
          <CardTitle>N+2 fallback</CardTitle>
          <p className="text-xs text-muted-foreground">
            Used when both analyst panels fail. Relaxation max level caps
            how aggressively the comparable resolver loosens its criteria.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderModelField(
            "fallbackModelResourceId",
            "Fallback model",
            fallbackModelId,
            setFallbackModelId,
            config.globalLlmDefaults.fallbackModelLabel,
          )}
          {renderWorkflowField(WORKFLOW_FIELDS.find((f) => f.key === "minEvidenceScore")!)}
          {/* Relaxation max level — slider per spec (0–5 steps) */}
          {(() => {
            const value = workflow.relaxationMaxLevel;
            const isOverridden = value !== undefined && value !== null;
            const globalRaw = config.globalLlmDefaults.workflow.relaxationMaxLevel;
            const effective = (value ?? globalRaw ?? 5) as number;
            return (
              <div className="space-y-2" data-testid="field-workflow-relaxationMaxLevel">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Relaxation max level</label>
                  {isOverridden ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() =>
                        setWorkflow((w) => {
                          const next = { ...w };
                          delete next.relaxationMaxLevel;
                          return next;
                        })
                      }
                      data-testid="button-reset-workflow-relaxationMaxLevel"
                    >
                      Reset to global
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-xs" data-testid="badge-inherit-workflow-relaxationMaxLevel">
                      Inheriting global default ({globalRaw ?? "—"})
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    min={0}
                    max={5}
                    step={1}
                    value={[effective]}
                    onValueChange={(vals) =>
                      setWorkflow((w) => ({ ...w, relaxationMaxLevel: vals[0] }))
                    }
                    className="flex-1"
                    data-testid="slider-workflow-relaxationMaxLevel"
                  />
                  <span className="w-10 text-right text-sm tabular-nums" data-testid="text-relaxation-value">
                    L{effective}
                  </span>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── Section 4 · Workflow policy ────────────────────────── */}
      <Card data-testid="card-llm-workflow">
        <CardHeader>
          <CardTitle>Workflow policy overrides</CardTitle>
          <p className="text-xs text-muted-foreground">
            Per-Specialist overrides for the global pipeline policy. Leave a
            field blank to inherit the global value shown as placeholder.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {WORKFLOW_FIELDS.filter((f) => f.key !== "minEvidenceScore").map((spec) => (
            <div key={spec.key}>{renderWorkflowField(spec)}</div>
          ))}
        </CardContent>
      </Card>

      {/* ── Section 5 · Other (summary + Save) ─────────────────── */}
      <Card data-testid="card-llm-save">
        <CardHeader>
          <CardTitle>Save</CardTitle>
          <p className="text-xs text-muted-foreground">
            One Save writes a single audited revision; the Audit tab shows
            per-field "edited X, Y, Z" labels for the diff.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Change summary (optional, recorded in audit)"
            data-testid="input-change-summary-llm"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              data-testid="button-save-llm-config"
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function toSelectValue(id: number | null): string {
  return id == null ? INHERIT_SENTINEL : String(id);
}
function fromSelectValue(v: string): number | null {
  return v === INHERIT_SENTINEL ? null : Number(v);
}
function hasAnyOverride(w: SpecialistWorkflowOverrides): boolean {
  return Object.values(w).some((v) => v !== undefined && v !== null);
}
