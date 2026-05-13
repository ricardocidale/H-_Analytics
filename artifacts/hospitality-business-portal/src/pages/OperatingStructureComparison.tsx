/**
 * OperatingStructureComparison.tsx — Side-by-side comparison of the six
 * canonical hospitality operating structures (own / franchise / HMA / lease
 * tenant / lease landlord / hybrid). Implements Task #809.
 *
 * Sub-components co-located in src/pages/:
 *   StructureRecommendationBanner, StructureOverlayEditorCard,
 *   StructureComparisonTable, StructureChartSection, StructureSwitchCallout
 */
import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { IconAlertTriangle, IconBuilding } from "@/components/icons";
import { useProperties } from "@/lib/api/properties";
import { useGlobalAssumptions } from "@/lib/api/admin";
import { useStructureComparison } from "@/lib/api/structure-comparison";
import {
  AnalystActionButton,
  useAnalystRefresh,
} from "@/components/analyst";
import {
  OPERATING_STRUCTURE_DEFAULTS,
  OPERATING_STRUCTURE_IDS,
  getOperatingStructureOverlay,
  type OperatingStructureId,
  type OperatingStructureDefaults,
} from "@shared/constants-operating-structures";
import { useStructureOverlays } from "@/hooks/useStructureOverlays";
import { StructureRecommendationBanner } from "./structures/StructureRecommendationBanner";
import { StructureOverlayEditorCard } from "./structures/StructureOverlayEditorCard";
import { StructureComparisonTable } from "./structures/StructureComparisonTable";
import { StructureChartSection } from "./structures/StructureChartSection";
import { StructureSwitchCallout } from "./structures/StructureSwitchCallout";

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
  const [editingStructure, setEditingStructure] = useState<OperatingStructureId | null>(null);

  // Pending = the edits the user is typing. Applied = the snapshot sent to the
  // server (and the React Query cache key). Promoted via the "Apply overrides"
  // button so that every keystroke does not trigger a full server recompute.
  const {
    pendingOverlays,
    appliedOverlays,
    overlaysDirty,
    updateOverlay,
    updateOverlayScalar,
    applyOverrides,
    resetOverrides,
  } = useStructureOverlays();

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

  // Resolve the country-baseline overlay for the structure being edited so we
  // can show the user "you're overriding 5.5% → 6.0%" rather than just the new
  // value in isolation. Re-resolves when the property's country changes.
  const editingBaseline: OperatingStructureDefaults | null = useMemo(() => {
    if (!editingStructure) return null;
    const country = (property as { country?: string | null } | null)?.country ?? null;
    return getOperatingStructureOverlay(editingStructure, country);
  }, [editingStructure, property]);

  // Analyst hook — uses the same scope/specialist contract as PropertyEdit
  const analyst = useAnalystRefresh({
    scope: "global-assumptions",
    specialistId: "mgmt-co.funding",
  });

  const recommended =
    comparison?.structures.find((s) => s.id === comparison.recommendation) ?? null;
  const current = comparison?.structures.find((s) => s.id === currentStructure) ?? null;

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
                <SelectTrigger className="w-[220px]" data-testid="select-property">
                  <SelectValue placeholder={propsLoading ? "Loading…" : "Select property"} />
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
              Choose a property above to see how each operating structure changes its returns, cash
              flow, and risk profile.
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1" data-testid="alert-comparison-error">
            <IconAlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span>{cmpError instanceof Error ? cmpError.message : "Comparison failed"}</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => refetch()} data-testid="button-retry">
              Retry
            </Button>
          </div>
        )}

        {comparison && recommended && property && (
          <>
            <StructureRecommendationBanner
              recommended={recommended}
              propertyName={property.name}
              isCloseCall={comparison.isCloseCall}
              recommendationRationale={comparison.recommendationRationale}
            />

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

            <StructureOverlayEditorCard
              editingStructure={editingStructure}
              editingBaseline={editingBaseline}
              pendingOverlays={pendingOverlays}
              appliedOverlays={appliedOverlays}
              overlaysDirty={overlaysDirty}
              onSelectStructure={setEditingStructure}
              onUpdateOverlay={updateOverlay}
              onUpdateCapex={(id, value) => updateOverlayScalar(id, "capexFactor", value)}
              onApply={applyOverrides}
              onReset={resetOverrides}
            />

            <StructureComparisonTable
              structures={comparison.structures}
              recommendation={comparison.recommendation}
            />

            <StructureChartSection
              structures={comparison.structures}
              recommendation={comparison.recommendation}
            />

            <StructureSwitchCallout
              recommended={recommended}
              current={current}
              currentStructure={currentStructure}
              onCurrentStructureChange={setCurrentStructure}
            />

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
