/**
 * PropertyExitDefaultsCard.tsx — Default exit cap rate + sales commission for new properties.
 *
 * Lives in the Property Defaults tab. These fields are PROPERTY DEFAULTS that
 * cascade into each property's last-year exit valuation via the engine
 * aggregators (`engine/aggregation/cashFlowAggregator.ts`,
 * `engine/aggregation/yearlyAggregator.ts`):
 *
 *   property.exitCapRate ?? global?.exitCapRate ?? DEFAULT_EXIT_CAP_RATE
 *
 * They are NOT Management Company exit fields. Per ARCHITECTURE.md §1a the
 * HMC is an operating service business with no cap-rate exit — its terminal
 * value (if ever needed) is DCF on FCF discounted at `costOfEquity`, or an
 * EBITDA multiple. See `.claude/skills/finance/management-company-statements.md`.
 */
import { useQuery } from "@tanstack/react-query";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE } from "@/lib/constants";
import EditableValue from "./EditableValue";
import type { CompanyAssumptionsSectionProps } from "./types";

interface PropertyExitDefaultsCardProps extends CompanyAssumptionsSectionProps {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

interface ExitMultipleBand {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

export default function PropertyExitDefaultsCard({ formData, onChange, global, researchValues }: PropertyExitDefaultsCardProps) {
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  // Admin-managed exit-multiple bands (per industry vertical) used to populate
  // the dropdown and drive the inline "outside band" warning. Cached client-side
  // — refetching only on window focus is enough; admins refresh these manually.
  const { data: exitMultiples = [] } = useQuery<ExitMultipleBand[]>({
    queryKey: ["/api/exit-multiples"],
    queryFn: async () => {
      const res = await fetch("/api/exit-multiples", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load exit multiples");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedVertical = (formData.industryVertical ?? global.industryVertical) || "";
  const selectedMultipleRaw = formData.exitRevenueMultiple ?? global.exitRevenueMultiple;
  const selectedMultiple = typeof selectedMultipleRaw === "number" ? selectedMultipleRaw : null;
  const band = exitMultiples.find(m => m.dimensionKey === selectedVertical) ?? null;
  const hasBand = !!(band && band.valueLow != null && band.valueHigh != null);
  const outsideBand = !!(
    hasBand &&
    selectedMultiple != null &&
    band &&
    band.valueLow != null &&
    band.valueHigh != null &&
    (selectedMultiple < band.valueLow || selectedMultiple > band.valueHigh)
  );

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
        <div className="space-y-6">
          <h3 className="text-lg font-display text-foreground flex items-center gap-2">
            Property Exit Defaults
            <InfoTooltip text="Default exit cap rate and sales commission applied to NEW properties. Each property can override these on its own assumptions page. The Management Company itself has no cap-rate exit — see Cost of Equity (Funding tab) for company-level DCF." manualSection="investment-returns" />
          </h3>
          <p className="text-xs text-muted-foreground -mt-3">
            Cascading defaults for property terminal-year valuation. Not used for the Management Company.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <ResearchContextFieldLabel
                label={<>Default Exit Cap Rate <InfoTooltip text="Capitalization rate used for property valuation at exit. Higher cap rate = lower valuation. Applied as: GrossValue = AnnualizedNOI / exitCapRate at the property's terminal year." manualSection="investment-returns" /></>}
                badgeProps={{ value: researchValues.exitCapRate?.display, sourceType: "industry", sourceName: "CBRE Cap Rate Survey", "data-testid": "badge-exit-cap" }}
                onApplyValue={() => researchValues.exitCapRate && onChange("exitCapRate", researchValues.exitCapRate.mid / 100)}
                guidanceContext={gc("exitCapRate", "Default Exit Cap Rate")}
              />
              <EditableValue
                value={formData.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE}
                onChange={(v) => onChange("exitCapRate", v)}
                format="percent"
                min={0.04}
                max={0.15}
                step={0.005}
              />
            </div>
            <Slider
              value={[(formData.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100]}
              onValueChange={([v]) => onChange("exitCapRate", v / 100)}
              min={4}
              max={15}
              step={0.5}
            />
          </div>

          {/* Industry Vertical + Exit Revenue Multiple — Analyst-managed band check.
              Picking a vertical (sourced from exit_multiples.dimensionKey) and
              entering a multiple outside the [low, high] range surfaces the
              watchdog warning inline with the recommended midpoint. */}
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-foreground">Exit Revenue Multiple</h4>
              <InfoTooltip text="Sanity-check the property's exit valuation against the admin-managed revenue-multiple band for the chosen industry vertical. The Analyst flags multiples outside the band and recommends the midpoint." />
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Cross-check for cap-rate exits. Bands are maintained by an admin in Analyst Tables.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="industryVertical" className="text-xs text-muted-foreground">Industry Vertical</Label>
                <Select
                  value={selectedVertical || "__none__"}
                  onValueChange={(v) => onChange("industryVertical", v === "__none__" ? null : v)}
                >
                  <SelectTrigger id="industryVertical" data-testid="select-industry-vertical">
                    <SelectValue placeholder="Select a vertical…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {exitMultiples.map((m) => (
                      <SelectItem key={m.dimensionKey} value={m.dimensionKey} data-testid={`option-vertical-${m.dimensionKey}`}>
                        {m.label}
                        {m.valueLow != null && m.valueHigh != null
                          ? ` (${m.valueLow.toFixed(1)}x – ${m.valueHigh.toFixed(1)}x)`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exitRevenueMultiple" className="text-xs text-muted-foreground">Exit Revenue Multiple (×)</Label>
                <EditableValue
                  value={selectedMultiple ?? 0}
                  onChange={(v) => onChange("exitRevenueMultiple", v > 0 ? v : null)}
                  format="number"
                  min={0}
                  max={20}
                  step={0.1}
                />
              </div>
            </div>

            {hasBand && band && (
              <p className="text-xs text-muted-foreground" data-testid="text-exit-multiple-band">
                {band.label} band: {band.valueLow!.toFixed(1)}x – {band.valueHigh!.toFixed(1)}x
                {band.valueMid != null ? ` (mid ${band.valueMid.toFixed(1)}x)` : ""}
              </p>
            )}

            {outsideBand && band && (
              <div
                className="rounded-md border border-amber-300/70 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700/50 p-3 text-xs text-amber-900 dark:text-amber-200"
                data-testid="warning-exit-multiple-out-of-band"
              >
                <span className="font-medium">Outside Analyst band.</span>{" "}
                {selectedMultiple!.toFixed(1)}x is outside the {band.label} range
                {" "}{band.valueLow!.toFixed(1)}x – {band.valueHigh!.toFixed(1)}x
                {band.valueMid != null ? (
                  <>
                    .{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
                      onClick={() => onChange("exitRevenueMultiple", band.valueMid!)}
                      data-testid="button-apply-exit-multiple-mid"
                    >
                      Apply recommended midpoint {band.valueMid.toFixed(1)}x
                    </button>
                    .
                  </>
                ) : "."}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <ResearchContextFieldLabel
                label={<>Default Sales Commission Rate <InfoTooltip text="As a percentage of gross sale price. Default broker commission for new properties. Each property can override this with its own disposition commission." /></>}
                badgeProps={{ value: researchValues.dispositionCommission?.display, sourceType: "industry", sourceName: "NAR transaction data", "data-testid": "badge-sales-commission" }}
                onApplyValue={() => researchValues.dispositionCommission && onChange("salesCommissionRate", researchValues.dispositionCommission.mid / 100)}
                guidanceContext={gc("dispositionCommission", "Sales Commission Rate")}
              />
              <EditableValue
                value={formData.salesCommissionRate ?? global.salesCommissionRate ?? DEFAULT_COMMISSION_RATE}
                onChange={(v) => onChange("salesCommissionRate", v)}
                format="percent"
                min={0}
                max={0.10}
                step={0.005}
              />
            </div>
            <Slider
              value={[(formData.salesCommissionRate ?? global.salesCommissionRate ?? DEFAULT_COMMISSION_RATE) * 100]}
              onValueChange={([v]) => onChange("salesCommissionRate", v / 100)}
              min={0}
              max={10}
              step={0.5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
