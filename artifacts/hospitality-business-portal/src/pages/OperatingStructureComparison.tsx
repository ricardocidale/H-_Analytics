/**
 * OperatingStructureComparison.tsx — Side-by-side comparison of the six
 * canonical hospitality operating structures (own / franchise / HMA / lease
 * tenant / lease landlord / hybrid). Implements Task #809.
 *
 * Layout:
 *   1. Header with property selector + Analyst refresh button
 *   2. Recommendation banner (top-scoring structure)
 *   3. Toggle row to include/exclude individual structures
 *   4. Comparison table (NOI, GOP, EBITDA, IRRs, equity multiple, risk)
 *   5. IRR bar chart (unlevered vs levered)
 *   6. Revenue distribution stacked bar
 *   7. "What changes if you switch?" callout — compares currently selected
 *      structure (default = recommendation) against the user's currently
 *      modelled structure (initially "fee-simple-independent")
 */
import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IconCompare, IconAlertTriangle, IconBuilding } from "@/components/icons";
import { useProperties } from "@/lib/api/properties";
import { useGlobalAssumptions } from "@/lib/api/admin";
import {
  useStructureComparison,
  type StructureOverlaysMap,
} from "@/lib/api/structure-comparison";
import { Input } from "@/components/ui/input";
import {
  AnalystActionButton,
  useAnalystRefresh,
} from "@/components/analyst";
import {
  CHART_COLORS,
  formatCompact,
  formatPercent,
} from "@/components/graphics";
import {
  OPERATING_STRUCTURE_DEFAULTS,
  OPERATING_STRUCTURE_IDS,
  getOperatingStructureOverlay,
  type OperatingStructureId,
  type OperatingStructureDefaults,
  type StructureOverlayPatch,
} from "@shared/constants-operating-structures";
import type { StructureMetrics } from "@calc/analysis/structure-comparison";

const RISK_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  medium: { label: "Medium", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  "very-high": { label: "Very High", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

function fmtIrr(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return formatPercent(v, 1);
}

function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return formatCompact(v);
}

function fmtMoic(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  return `${v.toFixed(2)}×`;
}

export default function OperatingStructureComparison() {
  const params = useParams<{ id?: string }>();
  const initialId = params.id ? Number.parseInt(params.id, 10) : null;
  const [propertyId, setPropertyId] = useState<number | null>(
    initialId && !Number.isNaN(initialId) ? initialId : null,
  );
  const [enabledStructures, setEnabledStructures] = useState<Set<OperatingStructureId>>(
    new Set(OPERATING_STRUCTURE_IDS),
  );
  const [currentStructure, setCurrentStructure] = useState<OperatingStructureId>(
    "fee-simple-independent",
  );
  // Pending = the edits the user is typing. Applied = the snapshot sent to the
  // server (and the React Query cache key). Promoted via the "Apply overrides"
  // button so that every keystroke does not trigger a full server recompute.
  const [pendingOverlays, setPendingOverlays] = useState<StructureOverlaysMap>({});
  const [appliedOverlays, setAppliedOverlays] = useState<StructureOverlaysMap>({});
  const [editingStructure, setEditingStructure] = useState<OperatingStructureId | null>(null);

  const { data: properties = [], isLoading: propsLoading } = useProperties();
  const { data: global, isLoading: globalLoading } = useGlobalAssumptions();

  const property = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  const enabledArray = useMemo<OperatingStructureId[]>(
    () => OPERATING_STRUCTURE_IDS.filter((id) => enabledStructures.has(id)),
    [enabledStructures],
  );

  const {
    data: comparison,
    isLoading: cmpLoading,
    error: cmpError,
    refetch,
  } = useStructureComparison(propertyId, global ?? undefined, enabledArray, appliedOverlays);

  const overlaysDirty = useMemo(
    () => JSON.stringify(pendingOverlays) !== JSON.stringify(appliedOverlays),
    [pendingOverlays, appliedOverlays],
  );

  // Resolve the country-baseline overlay for the structure being edited so we
  // can show the user "you're overriding 5.5% → 6.0%" rather than just the new
  // value in isolation. Re-resolves when the property's country changes.
  const editingBaseline: OperatingStructureDefaults | null = useMemo(() => {
    if (!editingStructure) return null;
    const country = (property as { country?: string | null } | null)?.country ?? null;
    return getOperatingStructureOverlay(editingStructure, country);
  }, [editingStructure, property]);

  // Analyst hook — uses the same scope/specialist contract as PropertyEdit
  // (mgmt-co.funding is the only v1 specialist today; structure-specific
  // assumption overlays will move to a dedicated specialist in a follow-up
  // task — for now, refresh routes through the same shared pipeline).
  const analyst = useAnalystRefresh({
    scope: "global-assumptions",
    specialistId: "mgmt-co.funding",
  });

  const recommended =
    comparison?.structures.find((s) => s.id === comparison.recommendation) ?? null;
  const current = comparison?.structures.find((s) => s.id === currentStructure) ?? null;

  // Update a single field on a structure's pending overlay. Pruning empty
  // patches keeps the cache key compact and the request body minimal.
  function updateOverlay(
    id: OperatingStructureId,
    section: "feeOverlay" | "lease",
    field: string,
    value: number | undefined,
  ) {
    setPendingOverlays((prev) => {
      const next = { ...prev };
      const patch: StructureOverlayPatch = { ...(next[id] ?? {}) };
      const sub = { ...((patch[section] ?? {}) as Record<string, unknown>) };
      if (value === undefined || Number.isNaN(value)) {
        delete sub[field];
      } else {
        sub[field] = value;
      }
      if (Object.keys(sub).length === 0) {
        delete (patch as Record<string, unknown>)[section];
      } else {
        (patch as Record<string, unknown>)[section] = sub;
      }
      if (Object.keys(patch).length === 0) {
        delete next[id];
      } else {
        next[id] = patch;
      }
      return next;
    });
  }

  function updateOverlayScalar(
    id: OperatingStructureId,
    field: "capexFactor",
    value: number | undefined,
  ) {
    setPendingOverlays((prev) => {
      const next = { ...prev };
      const patch: StructureOverlayPatch = { ...(next[id] ?? {}) };
      if (value === undefined || Number.isNaN(value)) {
        delete patch[field];
      } else {
        patch[field] = value;
      }
      if (Object.keys(patch).length === 0) {
        delete next[id];
      } else {
        next[id] = patch;
      }
      return next;
    });
  }

  function applyOverrides() {
    setAppliedOverlays(pendingOverlays);
  }

  function resetOverrides() {
    setPendingOverlays({});
    setAppliedOverlays({});
  }

  function toggleStructure(id: OperatingStructureId) {
    setEnabledStructures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Always keep at least 1 enabled
      if (next.size === 0) next.add(id);
      return next;
    });
  }

  const irrChartData = useMemo(() => {
    if (!comparison) return [];
    return comparison.structures.map((s) => ({
      name: s.shortLabel,
      "Unlevered IRR": s.unleveredIrr ? Number((s.unleveredIrr * 100).toFixed(2)) : 0,
      "Levered IRR": s.leveredIrr ? Number((s.leveredIrr * 100).toFixed(2)) : 0,
      isRecommended: s.id === comparison.recommendation,
    }));
  }, [comparison]);

  const revenueChartData = useMemo(() => {
    if (!comparison) return [];
    return comparison.structures.map((s) => ({
      name: s.shortLabel,
      Operator: Math.max(0, s.revenueDistribution.operator),
      Brand: Math.max(0, s.revenueDistribution.brand),
      Lender: Math.max(0, s.revenueDistribution.lender),
      Sponsor: Math.max(0, s.revenueDistribution.sponsor),
      "Operating expenses": Math.max(0, s.revenueDistribution.operatingExpenses),
    }));
  }, [comparison]);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Operating-Structure Comparison"
          subtitle="Compare own vs. lease vs. HMA vs. franchise side-by-side. See which structure delivers the best risk-adjusted return for this property."
          backLink={propertyId ? `/property/${propertyId}` : "/portfolio"}
          backLinkTestId="link-back-property"
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={propertyId ? String(propertyId) : ""}
                onValueChange={(v) => setPropertyId(Number.parseInt(v, 10))}
              >
                <SelectTrigger
                  className="w-[220px]"
                  data-testid="select-property"
                >
                  <SelectValue
                    placeholder={propsLoading ? "Loading…" : "Select property"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={String(p.id)}
                      data-testid={`option-property-${p.id}`}
                    >
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AnalystActionButton
                onClick={() => analyst.triggerRefresh()}
                running={analyst.running}
                cooldownRemainingMs={analyst.cooldownRemainingMs}
                testIdSuffix="structure-comparison"
                tooltipText="Refresh structure-specific assumptions"
              />
            </div>
          }
        />

        {!propertyId && (
          <Alert data-testid="alert-no-property">
            <IconBuilding className="h-4 w-4" />
            <AlertTitle>Select a property to begin</AlertTitle>
            <AlertDescription>
              Choose a property above to see how each operating structure changes
              its returns, cash flow, and risk profile.
            </AlertDescription>
          </Alert>
        )}

        {propertyId && (cmpLoading || globalLoading) && (
          <div className="space-y-3" data-testid="loading-comparison">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        )}

        {cmpError && (
          <Alert variant="destructive" data-testid="alert-comparison-error">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertTitle>Comparison failed</AlertTitle>
            <AlertDescription>
              {cmpError instanceof Error ? cmpError.message : "Unknown error"}
              <Button
                variant="link"
                className="ml-2 h-auto p-0"
                onClick={() => refetch()}
                data-testid="button-retry"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {comparison && recommended && property && (
          <>
            {/* Recommendation banner */}
            <Card
              className={
                comparison.isCloseCall
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-primary/40 bg-primary/5"
              }
              data-testid="card-recommendation"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Recommended structure for {property.name}
                    </p>
                    <CardTitle className="text-2xl mt-1" data-testid="text-recommendation-label">
                      {recommended.label}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {comparison.isCloseCall && (
                      <Badge
                        className="bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        data-testid="badge-close-call"
                      >
                        Close call
                      </Badge>
                    )}
                    <Badge
                      className={RISK_BADGE[recommended.riskProfile]?.className}
                      data-testid="badge-recommendation-risk"
                    >
                      {RISK_BADGE[recommended.riskProfile]?.label} risk
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground" data-testid="text-recommendation-description">
                  {recommended.description}
                </p>
                <p
                  className="text-sm text-foreground/90 leading-relaxed border-l-2 border-primary/40 pl-3"
                  data-testid="text-recommendation-rationale"
                >
                  {comparison.recommendationRationale}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Unlevered IRR</p>
                    <p className="text-lg font-semibold" data-testid="text-recommendation-unlevered-irr">
                      {fmtIrr(recommended.unleveredIrr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Levered IRR</p>
                    <p className="text-lg font-semibold" data-testid="text-recommendation-levered-irr">
                      {fmtIrr(recommended.leveredIrr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Equity Multiple</p>
                    <p className="text-lg font-semibold" data-testid="text-recommendation-moic">
                      {fmtMoic(recommended.equityMultiple)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg NOI</p>
                    <p className="text-lg font-semibold" data-testid="text-recommendation-avg-noi">
                      {fmtMoney(recommended.avgNoi)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Toggle row */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Include structures</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {OPERATING_STRUCTURE_IDS.map((id) => {
                    const def = OPERATING_STRUCTURE_DEFAULTS[id];
                    const checked = enabledStructures.has(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                      >
                        <Label
                          htmlFor={`toggle-${id}`}
                          className="text-xs font-medium cursor-pointer"
                          data-testid={`label-structure-${id}`}
                        >
                          {def.shortLabel}
                        </Label>
                        <Switch
                          id={`toggle-${id}`}
                          checked={checked}
                          onCheckedChange={() => toggleStructure(id)}
                          data-testid={`toggle-structure-${id}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Override editor — lets users tweak fee/lease/capex assumptions
                per structure for this scenario without touching admin defaults. */}
            <Card data-testid="card-overlay-editor">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Override assumptions (this scenario only)</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tweak fee, lease, or capex assumptions for any structure. Apply to recompute.
                    Resets when you leave the page.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetOverrides}
                    disabled={
                      Object.keys(pendingOverlays).length === 0 &&
                      Object.keys(appliedOverlays).length === 0
                    }
                    data-testid="button-reset-overrides"
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={applyOverrides}
                    disabled={!overlaysDirty}
                    data-testid="button-apply-overrides"
                  >
                    Apply overrides
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-3">
                  <Label className="text-xs text-muted-foreground">Edit structure</Label>
                  <Select
                    value={editingStructure ?? ""}
                    onValueChange={(v) =>
                      setEditingStructure(v ? (v as OperatingStructureId) : null)
                    }
                  >
                    <SelectTrigger
                      className="w-[260px]"
                      data-testid="select-edit-structure"
                    >
                      <SelectValue placeholder="Pick a structure to override…" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATING_STRUCTURE_IDS.map((id) => {
                        const dirty = pendingOverlays[id] != null;
                        return (
                          <SelectItem
                            key={id}
                            value={id}
                            data-testid={`option-edit-${id}`}
                          >
                            {OPERATING_STRUCTURE_DEFAULTS[id].shortLabel}
                            {dirty ? " •" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {Object.keys(appliedOverlays).length > 0 && (
                    <Badge variant="outline" data-testid="badge-overrides-active">
                      {Object.keys(appliedOverlays).length} structure(s) overridden
                    </Badge>
                  )}
                </div>
                {editingStructure && editingBaseline ? (
                  <OverlayEditor
                    structureId={editingStructure}
                    baseline={editingBaseline}
                    patch={pendingOverlays[editingStructure]}
                    onChangeFee={(field, value) =>
                      updateOverlay(editingStructure, "feeOverlay", field, value)
                    }
                    onChangeLease={(field, value) =>
                      updateOverlay(editingStructure, "lease", field, value)
                    }
                    onChangeCapex={(value) =>
                      updateOverlayScalar(editingStructure, "capexFactor", value)
                    }
                  />
                ) : (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="text-overlay-editor-empty"
                  >
                    Pick a structure above to override its baseline assumptions.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Comparison table */}
            <Card data-testid="card-comparison-table">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconCompare className="w-4 h-4" /> Side-by-side metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card">
                        Metric
                      </th>
                      {comparison.structures.map((s) => (
                        <th
                          key={s.id}
                          className="text-right py-2 px-3 font-medium"
                          data-testid={`header-structure-${s.id}`}
                        >
                          <div className="flex flex-col items-end">
                            <span>{s.shortLabel}</span>
                            {s.id === comparison.recommendation && (
                              <Badge variant="secondary" className="mt-1 text-[10px]">
                                Recommended
                              </Badge>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="[&_tr]:border-b [&_tr]:border-border/40">
                    <ComparisonRow label="Avg GOP" structures={comparison.structures} render={(s) => fmtMoney(s.avgGop)} testIdPrefix="row-gop" />
                    <ComparisonRow label="Avg EBITDA" structures={comparison.structures} render={(s) => fmtMoney(s.avgEbitda)} testIdPrefix="row-ebitda" />
                    <ComparisonRow label="Avg NOI" structures={comparison.structures} render={(s) => fmtMoney(s.avgNoi)} testIdPrefix="row-noi" />
                    <ComparisonRow label="Stabilized NOI" structures={comparison.structures} render={(s) => fmtMoney(s.stabilizedNoi)} testIdPrefix="row-stab-noi" />
                    <ComparisonRow label="Exit Value" structures={comparison.structures} render={(s) => fmtMoney(s.exitValue)} testIdPrefix="row-exit-value" />
                    <ComparisonRow label="Unlevered IRR" structures={comparison.structures} render={(s) => fmtIrr(s.unleveredIrr)} testIdPrefix="row-unlevered-irr" highlight />
                    <ComparisonRow label="Levered IRR" structures={comparison.structures} render={(s) => fmtIrr(s.leveredIrr)} testIdPrefix="row-levered-irr" highlight />
                    <ComparisonRow label="Equity Multiple" structures={comparison.structures} render={(s) => fmtMoic(s.equityMultiple)} testIdPrefix="row-moic" />
                    <ComparisonRow label="Peak Negative CF" structures={comparison.structures} render={(s) => fmtMoney(s.peakNegativeCashFlow)} testIdPrefix="row-peak-neg" />
                    <ComparisonRow
                      label="Year of First +CF"
                      structures={comparison.structures}
                      render={(s) =>
                        s.yearOfFirstPositiveCashFlow !== null
                          ? `Yr ${s.yearOfFirstPositiveCashFlow}`
                          : "Never"
                      }
                      testIdPrefix="row-first-positive"
                    />
                    <ComparisonRow label="Downside NOI" structures={comparison.structures} render={(s) => fmtMoney(s.downsideNoi)} testIdPrefix="row-downside" />
                    <tr>
                      <td className="py-2 pr-3 font-medium text-muted-foreground">Risk Tier</td>
                      {comparison.structures.map((s) => (
                        <td
                          key={s.id}
                          className="text-right py-2 px-3"
                          data-testid={`cell-risk-${s.id}`}
                        >
                          <Badge className={RISK_BADGE[s.riskProfile]?.className}>
                            {RISK_BADGE[s.riskProfile]?.label}
                          </Badge>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* IRR bar chart */}
            <Card data-testid="card-irr-chart">
              <CardHeader>
                <CardTitle className="text-base">IRR by structure</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={irrChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                    <Legend />
                    <Bar dataKey="Unlevered IRR" fill={CHART_COLORS.primary}>
                      {irrChartData.map((entry, i) => (
                        <Cell
                          key={`u-${i}`}
                          fill={
                            entry.isRecommended
                              ? CHART_COLORS.accent
                              : CHART_COLORS.primary
                          }
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="Levered IRR" fill={CHART_COLORS.blue} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue distribution — where each gross-revenue dollar ends up */}
            <Card data-testid="card-revenue-chart">
              <CardHeader>
                <CardTitle className="text-base">Where the revenue ends up (cumulative over hold)</CardTitle>
                <p className="text-xs text-muted-foreground pt-1">
                  Each bar splits gross revenue into the four stakeholders that get paid — operator, brand, lender, sponsor — plus all other operating expenses.
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tickFormatter={(v) => formatCompact(v)}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(v: number) => formatCompact(v)} />
                    <Legend />
                    <Bar dataKey="Operating expenses" stackId="r" fill={CHART_COLORS.slate} />
                    <Bar dataKey="Operator" stackId="r" fill={CHART_COLORS.primary} />
                    <Bar dataKey="Brand" stackId="r" fill={CHART_COLORS.secondary} />
                    <Bar dataKey="Lender" stackId="r" fill={CHART_COLORS.amber} />
                    <Bar dataKey="Sponsor" stackId="r" fill={CHART_COLORS.teal} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* What changes if you switch */}
            <Card
              className="border-accent-pop/40 bg-accent-pop/5"
              data-testid="card-switch-callout"
            >
              <CardHeader>
                <CardTitle className="text-base">What changes if you switch?</CardTitle>
                <div className="flex items-center gap-3 pt-2">
                  <Label className="text-xs text-muted-foreground">Currently modelled as</Label>
                  <Select
                    value={currentStructure}
                    onValueChange={(v) => setCurrentStructure(v as OperatingStructureId)}
                  >
                    <SelectTrigger className="w-[200px]" data-testid="select-current-structure">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATING_STRUCTURE_IDS.map((id) => (
                        <SelectItem key={id} value={id} data-testid={`option-current-${id}`}>
                          {OPERATING_STRUCTURE_DEFAULTS[id].shortLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {current && current.id === recommended.id ? (
                  <p className="text-sm text-muted-foreground" data-testid="text-already-recommended">
                    You're already on the recommended structure. Nothing to switch.
                  </p>
                ) : current ? (
                  <SwitchDelta from={current} to={recommended} />
                ) : null}
              </CardContent>
            </Card>

            {/* Key terms accordion */}
            <Card data-testid="card-key-terms">
              <CardHeader>
                <CardTitle className="text-base">Key contract terms</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {comparison.structures.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-md border border-border/50 p-3"
                      data-testid={`terms-card-${s.id}`}
                    >
                      <p className="font-medium text-sm">{s.shortLabel}</p>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-4">
                        {s.keyTerms.map((t, i) => (
                          <li key={i} data-testid={`term-${s.id}-${i}`}>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Link href={`/property/${propertyId}`}>
                <Button variant="outline" data-testid="button-back-to-property">
                  Back to property
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function ComparisonRow({
  label,
  structures,
  render,
  testIdPrefix,
  highlight,
}: {
  label: string;
  structures: StructureMetrics[];
  render: (s: StructureMetrics) => string;
  testIdPrefix: string;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-muted/30" : ""}>
      <td className="py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card">
        {label}
      </td>
      {structures.map((s) => (
        <td
          key={s.id}
          className="text-right py-2 px-3 tabular-nums"
          data-testid={`${testIdPrefix}-${s.id}`}
        >
          {render(s)}
        </td>
      ))}
    </tr>
  );
}

function SwitchDelta({ from, to }: { from: StructureMetrics; to: StructureMetrics }) {
  const irrDelta =
    (to.unleveredIrr ?? 0) - (from.unleveredIrr ?? 0);
  const noiDelta = to.avgNoi - from.avgNoi;
  const moicDelta = to.equityMultiple - from.equityMultiple;
  const cashDelta = to.peakNegativeCashFlow - from.peakNegativeCashFlow;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <DeltaCell
        label="Unlevered IRR"
        value={`${irrDelta >= 0 ? "+" : ""}${(irrDelta * 100).toFixed(1)} pp`}
        positive={irrDelta >= 0}
        testId="delta-irr"
      />
      <DeltaCell
        label="Avg NOI"
        value={`${noiDelta >= 0 ? "+" : ""}${formatCompact(noiDelta)}`}
        positive={noiDelta >= 0}
        testId="delta-noi"
      />
      <DeltaCell
        label="Equity Multiple"
        value={`${moicDelta >= 0 ? "+" : ""}${moicDelta.toFixed(2)}×`}
        positive={moicDelta >= 0}
        testId="delta-moic"
      />
      <DeltaCell
        label="Worst-Year CF"
        value={`${cashDelta >= 0 ? "+" : ""}${formatCompact(cashDelta)}`}
        positive={cashDelta >= 0}
        testId="delta-cf"
      />
    </div>
  );
}

/**
 * Per-structure overlay editor. Shows inputs only for fields the structure
 * actually consumes (e.g. lease terms appear only for the two lease modes).
 * Each input is initialized empty when the user has not overridden it; the
 * placeholder shows the resolved baseline value so the user always sees what
 * they would inherit by leaving the field untouched.
 */
function OverlayEditor({
  structureId,
  baseline,
  patch,
  onChangeFee,
  onChangeLease,
  onChangeCapex,
}: {
  structureId: OperatingStructureId;
  baseline: OperatingStructureDefaults;
  patch: StructureOverlayPatch | undefined;
  onChangeFee: (field: string, value: number | undefined) => void;
  onChangeLease: (field: string, value: number | undefined) => void;
  onChangeCapex: (value: number | undefined) => void;
}) {
  const showFranchise = baseline.feeOverlay.brandRoyaltyOnRooms > 0;
  const showHma = baseline.feeOverlay.hmaBaseOnTotalRevenue > 0 || baseline.feeOverlay.hmaIncentiveOnGop > 0;
  const showLease = baseline.lease != null;

  return (
    <div className="space-y-4" data-testid={`overlay-editor-${structureId}`}>
      {showFranchise && (
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
            Brand fees (% of room revenue)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PercentField
              label="Royalty"
              testId={`input-${structureId}-royalty`}
              baseline={baseline.feeOverlay.brandRoyaltyOnRooms}
              value={patch?.feeOverlay?.brandRoyaltyOnRooms}
              onChange={(v) => onChangeFee("brandRoyaltyOnRooms", v)}
            />
            <PercentField
              label="Marketing"
              testId={`input-${structureId}-marketing`}
              baseline={baseline.feeOverlay.brandMarketingOnRooms}
              value={patch?.feeOverlay?.brandMarketingOnRooms}
              onChange={(v) => onChangeFee("brandMarketingOnRooms", v)}
            />
            <PercentField
              label="Reservation"
              testId={`input-${structureId}-reservation`}
              baseline={baseline.feeOverlay.brandReservationOnRooms}
              value={patch?.feeOverlay?.brandReservationOnRooms}
              onChange={(v) => onChangeFee("brandReservationOnRooms", v)}
            />
          </div>
        </div>
      )}
      {showHma && (
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
            HMA fees
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PercentField
              label="Base fee (% of total revenue)"
              testId={`input-${structureId}-hma-base`}
              baseline={baseline.feeOverlay.hmaBaseOnTotalRevenue}
              value={patch?.feeOverlay?.hmaBaseOnTotalRevenue}
              onChange={(v) => onChangeFee("hmaBaseOnTotalRevenue", v)}
            />
            <PercentField
              label="Incentive fee (% of GOP)"
              testId={`input-${structureId}-hma-incentive`}
              baseline={baseline.feeOverlay.hmaIncentiveOnGop}
              value={patch?.feeOverlay?.hmaIncentiveOnGop}
              onChange={(v) => onChangeFee("hmaIncentiveOnGop", v)}
            />
          </div>
        </div>
      )}
      {showLease && baseline.lease && (
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
            Lease terms
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <PercentField
              label="Base rent (% of stabilized revenue)"
              testId={`input-${structureId}-base-rent`}
              baseline={baseline.lease.baseRentRevenueShare}
              value={patch?.lease?.baseRentRevenueShare}
              onChange={(v) => onChangeLease("baseRentRevenueShare", v)}
            />
            <PercentField
              label="Percentage rent (% of incremental)"
              testId={`input-${structureId}-pct-rent`}
              baseline={baseline.lease.percentageRentOnRevenue}
              value={patch?.lease?.percentageRentOnRevenue}
              onChange={(v) => onChangeLease("percentageRentOnRevenue", v)}
            />
            <PercentField
              label="Annual rent escalator"
              testId={`input-${structureId}-escalator`}
              baseline={baseline.lease.rentEscalator}
              value={patch?.lease?.rentEscalator}
              onChange={(v) => onChangeLease("rentEscalator", v)}
            />
            <PercentField
              label="Operator take cap (% of GOP)"
              testId={`input-${structureId}-operator-cap`}
              baseline={baseline.lease.operatorTakeCapOfGop}
              value={patch?.lease?.operatorTakeCapOfGop}
              onChange={(v) => onChangeLease("operatorTakeCapOfGop", v)}
            />
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
          Capex factor (× FF&E reserve)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RatioField
            label="Capex factor"
            testId={`input-${structureId}-capex-factor`}
            baseline={baseline.capexFactor}
            value={patch?.capexFactor}
            onChange={onChangeCapex}
          />
        </div>
      </div>
    </div>
  );
}

function PercentField({
  label,
  testId,
  baseline,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  baseline: number;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  // The user enters a percentage (e.g. 5.5) but the model stores a decimal
  // (e.g. 0.055). We convert at the boundary to keep the display consistent
  // with how baselines are quoted everywhere else in the app.
  const display = value !== undefined ? (value * 100).toFixed(2) : "";
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={display}
          placeholder={`${(baseline * 100).toFixed(2)} (default)`}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(undefined);
              return;
            }
            const parsed = Number.parseFloat(raw);
            onChange(Number.isFinite(parsed) ? parsed / 100 : undefined);
          }}
          className="pr-8 tabular-nums"
          data-testid={testId}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );
}

function RatioField({
  label,
  testId,
  baseline,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  baseline: number;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  const display = value !== undefined ? value.toFixed(2) : "";
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step="0.05"
          min="0"
          value={display}
          placeholder={`${baseline.toFixed(2)} (default)`}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(undefined);
              return;
            }
            const parsed = Number.parseFloat(raw);
            onChange(Number.isFinite(parsed) ? parsed : undefined);
          }}
          className="pr-8 tabular-nums"
          data-testid={testId}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          ×
        </span>
      </div>
    </div>
  );
}

function DeltaCell({
  label,
  value,
  positive,
  testId,
}: {
  label: string;
  value: string;
  positive: boolean;
  testId: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold ${
          positive ? "text-emerald-600" : "text-red-600"
        }`}
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}
