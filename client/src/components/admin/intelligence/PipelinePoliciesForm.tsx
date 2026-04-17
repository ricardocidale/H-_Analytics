import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface PipelinePolicy {
  id: number;
  policyKey: string;
  tier: number;
  isEnabled: boolean;
  stalenessThresholdHours: number | null;
  maxConcurrentRuns: number | null;
  dailyTokenBudget: number | null;
  monthlyTokenBudget: number | null;
  relaxationMaxLevel: number | null;
  minEvidenceScore: number | null;
  minCompCount: number | null;
  autoRefreshIntervalHours: number | null;
}

const DEFAULT_POLICIES: Omit<PipelinePolicy, "id">[] = [
  { policyKey: "tier-0-deterministic", tier: 0, isEnabled: true, stalenessThresholdHours: 0, maxConcurrentRuns: 10, dailyTokenBudget: 0, monthlyTokenBudget: 0, relaxationMaxLevel: 0, minEvidenceScore: 0, minCompCount: 0, autoRefreshIntervalHours: null },
  { policyKey: "tier-1-multi-model", tier: 1, isEnabled: true, stalenessThresholdHours: 168, maxConcurrentRuns: 3, dailyTokenBudget: 100000, monthlyTokenBudget: 2000000, relaxationMaxLevel: 5, minEvidenceScore: 0.3, minCompCount: 3, autoRefreshIntervalHours: 168 },
  { policyKey: "tier-2-fast-single", tier: 2, isEnabled: true, stalenessThresholdHours: 72, maxConcurrentRuns: 5, dailyTokenBudget: 50000, monthlyTokenBudget: 1000000, relaxationMaxLevel: 3, minEvidenceScore: 0.5, minCompCount: 2, autoRefreshIntervalHours: 72 },
];

const TIER_META: Record<number, { label: string; desc: string; color: string }> = {
  0: { label: "Tier 0 — Deterministic", desc: "No LLM calls. Uses cached data, formulas, and lookup tables.", color: "border-emerald-500/30 bg-emerald-500/5" },
  1: { label: "Tier 1 — Multi-Model", desc: "N+1 LLM models with synthesis. Deep research with progressive relaxation.", color: "border-blue-500/30 bg-blue-500/5" },
  2: { label: "Tier 2 — Fast Single", desc: "Single fast LLM call. Quick refresh for time-sensitive assumptions.", color: "border-violet-500/30 bg-violet-500/5" },
};

function NumberField({ label, value, onChange, min, max, step, unit, disabled }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  min?: number; max?: number; step?: number; unit?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value ?? ""}
          onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
          min={min}
          max={max}
          step={step ?? 1}
          disabled={disabled}
          className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground disabled:opacity-50"
          data-testid={`input-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
        {unit && <span className="text-xs text-muted-foreground whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

function PolicyCard({ policy, onSave }: { policy: PipelinePolicy | Omit<PipelinePolicy, "id">; onSave: (key: string, updates: Partial<PipelinePolicy>) => void }) {
  const meta = TIER_META[policy.tier] ?? { label: `Tier ${policy.tier}`, desc: "", color: "border-border" };
  const [local, setLocal] = useState(policy);
  const [dirty, setDirty] = useState(false);

  const update = (updates: Partial<typeof local>) => {
    setLocal(prev => ({ ...prev, ...updates }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave(policy.policyKey, {
      isEnabled: local.isEnabled,
      stalenessThresholdHours: local.stalenessThresholdHours,
      maxConcurrentRuns: local.maxConcurrentRuns,
      dailyTokenBudget: local.dailyTokenBudget,
      monthlyTokenBudget: local.monthlyTokenBudget,
      relaxationMaxLevel: local.relaxationMaxLevel,
      minEvidenceScore: local.minEvidenceScore,
      minCompCount: local.minCompCount,
      autoRefreshIntervalHours: local.autoRefreshIntervalHours,
    });
    setDirty(false);
  };

  const isTier0 = policy.tier === 0;

  return (
    <div
      className={cn("rounded-xl border p-5 space-y-4", meta.color)}
      data-testid={`policy-card-${policy.policyKey}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{meta.label}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{local.isEnabled ? "Active" : "Disabled"}</span>
          <Switch
            checked={local.isEnabled}
            onCheckedChange={v => update({ isEnabled: v })}
            data-testid={`toggle-${policy.policyKey}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Staleness Threshold"
          value={local.stalenessThresholdHours}
          onChange={v => update({ stalenessThresholdHours: v })}
          min={0} max={8760} unit="hours"
          disabled={isTier0}
        />
        <NumberField
          label="Max Concurrent Runs"
          value={local.maxConcurrentRuns}
          onChange={v => update({ maxConcurrentRuns: v })}
          min={1} max={20}
          disabled={isTier0}
        />
        <NumberField
          label="Daily Token Budget"
          value={local.dailyTokenBudget}
          onChange={v => update({ dailyTokenBudget: v })}
          min={0} max={10000000} step={1000}
          disabled={isTier0}
        />
        <NumberField
          label="Monthly Token Budget"
          value={local.monthlyTokenBudget}
          onChange={v => update({ monthlyTokenBudget: v })}
          min={0} max={100000000} step={10000}
          disabled={isTier0}
        />
        <NumberField
          label="Relaxation Max Level"
          value={local.relaxationMaxLevel}
          onChange={v => update({ relaxationMaxLevel: v })}
          min={0} max={10}
          disabled={isTier0}
        />
        <NumberField
          label="Min Evidence Score"
          value={local.minEvidenceScore}
          onChange={v => update({ minEvidenceScore: v })}
          min={0} max={1} step={0.05}
          disabled={isTier0}
        />
        <NumberField
          label="Min Comparable Count"
          value={local.minCompCount}
          onChange={v => update({ minCompCount: v })}
          min={0} max={50}
          disabled={isTier0}
        />
        <NumberField
          label="Auto-Refresh Interval"
          value={local.autoRefreshIntervalHours}
          onChange={v => update({ autoRefreshIntervalHours: v })}
          min={1} max={8760} unit="hours"
          disabled={isTier0}
        />
      </div>

      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} data-testid={`save-${policy.policyKey}`}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PipelinePoliciesForm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: policies, isLoading } = useQuery<PipelinePolicy[]>({
    queryKey: ["admin-pipeline-policies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pipeline-policies");
      if (!res.ok) throw new Error("Failed to fetch policies");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ policyKey, updates }: { policyKey: string; updates: Partial<PipelinePolicy> }) => {
      const res = await fetch(`/api/admin/pipeline-policies/${encodeURIComponent(policyKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update policy");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pipeline-policies"] });
      toast({ title: "Policy updated", description: "Pipeline policy saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save policy.", variant: "destructive" });
    },
  });

  const handleSave = (policyKey: string, updates: Partial<PipelinePolicy>) => {
    updateMutation.mutate({ policyKey, updates });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="policies-loading">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const displayPolicies = policies && policies.length > 0
    ? policies.sort((a, b) => a.tier - b.tier)
    : DEFAULT_POLICIES;

  return (
    <div className="space-y-6" data-testid="pipeline-policies-form">
      <p className="text-sm text-muted-foreground">
        Configure how each research tier operates — staleness thresholds, token budgets, relaxation limits, and auto-refresh behavior.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {displayPolicies.map(policy => (
          <PolicyCard key={policy.policyKey} policy={policy} onSave={handleSave} />
        ))}
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        <strong>Note:</strong> Tier 0 is deterministic (no LLM calls) — most fields are disabled.
        Token budgets and staleness thresholds apply to Tier 1 and Tier 2 research runs.
        Changes take effect immediately for new runs.
      </div>
    </div>
  );
}
