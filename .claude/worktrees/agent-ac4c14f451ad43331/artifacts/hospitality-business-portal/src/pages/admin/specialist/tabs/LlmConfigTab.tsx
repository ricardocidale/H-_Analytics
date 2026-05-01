/**
 * LlmConfigTab — read-only display of the per-Specialist LLM/orchestrator/
 * workflow configuration. Per `.claude/rules/specialists-are-dev-defined-only.md`
 * §3, admins cannot edit Specialist prompts, models, or workflow knobs at
 * runtime — the catalog (engine/analyst/registry/specialist-catalog.ts)
 * and the global pipeline policy own these values, and changes happen in
 * source code + redeploy.
 *
 * The previous editor's mutation, save button, prompt textarea, model
 * Select dropdowns, multi-model Switch, relaxation Slider, workflow
 * numeric Inputs, change-summary Input, and the refresh-models button
 * have all been removed. The tab now renders five Cards mirroring the
 * old layout with the resolved values rendered as static text + badges.
 *
 * The model list query is kept so model resource IDs can be rendered as
 * human-readable names ("Override · GPT-4o (slug: gpt-4o)") instead of
 * raw integers. If it fails to load, the fields fall back to "#<id>".
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ResourcePublicView } from "@shared/schema";
import type {
  SpecialistConfigView,
  SpecialistWorkflowOverrides,
} from "../types";
import { navigateToResources } from "../constants";

type ModelFieldKey =
  | "modelResourceId"
  | "analystAModelResourceId"
  | "analystBModelResourceId"
  | "synthesisModelResourceId"
  | "fallbackModelResourceId";

/** Workflow knob keys + their labels / units / formatting for display. */
const WORKFLOW_FIELDS: Array<{
  key: keyof SpecialistWorkflowOverrides;
  label: string;
  unit?: string;
  format: (n: number | null | undefined) => string;
}> = [
  { key: "stalenessThresholdHours",  label: "Staleness threshold",  unit: "hours", format: (n) => n == null ? "—" : `${n}h` },
  { key: "maxConcurrentRuns",        label: "Max concurrent runs",  format: (n) => n == null ? "—" : String(n) },
  { key: "dailyTokenBudget",         label: "Daily token budget",   format: (n) => n == null ? "—" : n.toLocaleString() },
  { key: "monthlyTokenBudget",       label: "Monthly token budget", format: (n) => n == null ? "—" : n.toLocaleString() },
  { key: "minEvidenceScore",         label: "Min evidence score",   format: (n) => n == null ? "—" : n.toFixed(2) },
  { key: "minCompCount",             label: "Min comp count",       format: (n) => n == null ? "—" : String(n) },
  { key: "autoRefreshIntervalHours", label: "Auto-refresh interval",unit: "hours", format: (n) => n == null ? "—" : `${n}h` },
];

export function LlmConfigTab({
  config,
}: {
  specialistId: string;
  config: SpecialistConfigView;
}) {
  const [, setLocation] = useLocation();
  const { data: models } = useQuery<ResourcePublicView[]>({ queryKey: ["/api/admin/resources?kind=model"] });
  const modelOptions = useMemo(() => models ?? [], [models]);

  // ── Override summary banner ─────────────────────────────────────
  // Reports how many of the 14 overridable knobs are currently set vs
  // inheriting global. Read-only display; if the count drifts upward,
  // CC's follow-up endpoint-removal commit will be the one to truncate
  // the override row.
  const overrideStats = useMemo(() => {
    const w = config.workflowOverrides ?? {};
    const knobs: boolean[] = [
      config.modelResourceId != null,
      config.analystAModelResourceId != null,
      config.analystBModelResourceId != null,
      config.synthesisModelResourceId != null,
      config.fallbackModelResourceId != null,
      config.multiModelEnabled !== null,
      ...WORKFLOW_FIELDS.map((f) => w[f.key] !== undefined && w[f.key] !== null),
      w.relaxationMaxLevel !== undefined && w.relaxationMaxLevel !== null,
    ];
    const overridden = knobs.filter(Boolean).length;
    return { overridden, total: knobs.length, inheriting: knobs.length - overridden };
  }, [config]);

  // Helper: format a model resource id as a human-readable label, or
  // "Inheriting global default (<global-label>)" when null.
  const renderModelValue = (
    fieldKey: ModelFieldKey,
    resourceId: number | null,
    globalLabel: string | null,
  ) => {
    if (resourceId == null) {
      return (
        <div className="flex items-center gap-2" data-testid={`value-${fieldKey}`}>
          <Badge variant="outline" className="text-xs" data-testid={`badge-inherit-${fieldKey}`}>
            Inheriting global default
          </Badge>
          <span className="text-sm text-muted-foreground">{globalLabel ?? "—"}</span>
        </div>
      );
    }
    const m = modelOptions.find((mm) => mm.id === resourceId);
    const display = m?.displayName ?? m?.slug ?? `#${resourceId}`;
    return (
      <div className="flex items-center gap-2" data-testid={`value-${fieldKey}`}>
        <Badge variant="secondary" className="text-xs" data-testid={`badge-override-${fieldKey}`}>
          Override active
        </Badge>
        <span className="text-sm font-medium">{display}</span>
      </div>
    );
  };

  const renderWorkflowValue = (spec: typeof WORKFLOW_FIELDS[number]) => {
    const w = config.workflowOverrides ?? {};
    const overrideRaw = w[spec.key];
    const isOverridden = overrideRaw !== undefined && overrideRaw !== null;
    const globalRaw = config.globalLlmDefaults.workflow[spec.key];
    const effective = isOverridden ? (overrideRaw as number) : globalRaw;
    return (
      <div className="space-y-1" data-testid={`value-workflow-${spec.key}`}>
        <div className="text-sm font-medium">
          {spec.label}{spec.unit ? ` (${spec.unit})` : ""}
        </div>
        <div className="flex items-center gap-2">
          {isOverridden ? (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-override-workflow-${spec.key}`}>
              Override active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs" data-testid={`badge-inherit-workflow-${spec.key}`}>
              Inheriting global default
            </Badge>
          )}
          <span className="text-sm">{spec.format(effective)}</span>
        </div>
      </div>
    );
  };

  const multiModelEffective =
    config.multiModelEnabled === null
      ? config.globalLlmDefaults.multiModelEnabled
      : config.multiModelEnabled;
  const multiModelInherits = config.multiModelEnabled === null;

  const w = config.workflowOverrides ?? {};
  const relaxOverride = w.relaxationMaxLevel;
  const relaxIsOverridden = relaxOverride !== undefined && relaxOverride !== null;
  const relaxGlobal = config.globalLlmDefaults.workflow.relaxationMaxLevel;
  const relaxEffective = relaxIsOverridden ? (relaxOverride as number) : relaxGlobal;

  return (
    <div className="space-y-6">
      <Alert data-testid="llm-config-readonly-banner">
        <AlertTitle>Read-only — dev-defined</AlertTitle>
        <AlertDescription>
          Specialist LLM, prompt, and workflow configuration is defined in
          source code per <code>specialists-are-dev-defined-only.md</code>.
          To change prompts, models, or workflow knobs, edit the Specialist
          catalog (or the global pipeline policy) and redeploy.
        </AlertDescription>
      </Alert>

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
            Models are listed in{" "}
            <a
              className="underline"
              data-testid="link-resources-models"
              onClick={(e) => {
                e.preventDefault();
                navigateToResources(setLocation, "resources");
              }}
              href="#"
            >
              Resources · Models →
            </a>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2" data-testid="field-modelResourceId">
            <div className="text-sm font-medium">Primary model</div>
            {renderModelValue(
              "modelResourceId",
              config.modelResourceId,
              config.globalLlmDefaults.synthesisModelLabel,
            )}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Prompt template</div>
            <pre
              className="text-xs font-mono bg-muted/40 border rounded-md p-3 overflow-auto max-h-96 whitespace-pre-wrap"
              data-testid="text-prompt-template"
            >
              {config.promptTemplate}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2 · N+1 Multi-model synthesis ──────────────── */}
      <Card data-testid="card-llm-multimodel">
        <CardHeader>
          <CardTitle>N+1 multi-model synthesis</CardTitle>
          <p className="text-xs text-muted-foreground">
            Two analyst panels run in parallel and are reconciled by a
            synthesis model. Disabled means the primary model runs single-shot.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Multi-model synthesis</div>
              <p className="text-xs text-muted-foreground">
                {multiModelInherits
                  ? `Inheriting global default (${config.globalLlmDefaults.multiModelEnabled ? "enabled" : "disabled"})`
                  : `Override active`}
              </p>
            </div>
            <Badge
              variant={multiModelEffective ? "default" : "outline"}
              data-testid="badge-multiModelEnabled"
            >
              {multiModelEffective ? "Synthesis: enabled" : "Synthesis: disabled"}
            </Badge>
          </div>
          <div className="space-y-2" data-testid="field-analystAModelResourceId">
            <div className="text-sm font-medium">Analyst A model (quantitative)</div>
            {renderModelValue(
              "analystAModelResourceId",
              config.analystAModelResourceId,
              config.globalLlmDefaults.analystAModelLabel,
            )}
          </div>
          <div className="space-y-2" data-testid="field-analystBModelResourceId">
            <div className="text-sm font-medium">Analyst B model (market strategy)</div>
            {renderModelValue(
              "analystBModelResourceId",
              config.analystBModelResourceId,
              config.globalLlmDefaults.analystBModelLabel,
            )}
          </div>
          <div className="space-y-2" data-testid="field-synthesisModelResourceId">
            <div className="text-sm font-medium">Synthesis model (+1 reconciler)</div>
            {renderModelValue(
              "synthesisModelResourceId",
              config.synthesisModelResourceId,
              config.globalLlmDefaults.synthesisModelLabel,
            )}
          </div>
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
          <div className="space-y-2" data-testid="field-fallbackModelResourceId">
            <div className="text-sm font-medium">Fallback model</div>
            {renderModelValue(
              "fallbackModelResourceId",
              config.fallbackModelResourceId,
              config.globalLlmDefaults.fallbackModelLabel,
            )}
          </div>
          {renderWorkflowValue(WORKFLOW_FIELDS.find((f) => f.key === "minEvidenceScore")!)}
          <div className="space-y-1" data-testid="value-workflow-relaxationMaxLevel">
            <div className="text-sm font-medium">Relaxation max level</div>
            <div className="flex items-center gap-2">
              {relaxIsOverridden ? (
                <Badge variant="secondary" className="text-xs" data-testid="badge-override-workflow-relaxationMaxLevel">
                  Override active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs" data-testid="badge-inherit-workflow-relaxationMaxLevel">
                  Inheriting global default
                </Badge>
              )}
              <span className="text-sm tabular-nums" data-testid="text-relaxation-value">
                L{relaxEffective ?? "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4 · Workflow policy ────────────────────────── */}
      <Card data-testid="card-llm-workflow">
        <CardHeader>
          <CardTitle>Workflow policy</CardTitle>
          <p className="text-xs text-muted-foreground">
            Per-Specialist effective values for the global pipeline policy.
            "Inheriting global default" means the Specialist uses whatever
            the global policy says today.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {WORKFLOW_FIELDS.filter((f) => f.key !== "minEvidenceScore").map((spec) => (
            <div key={spec.key}>{renderWorkflowValue(spec)}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
