import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSave } from "@/components/icons";
import { DEFAULT_SERVICE_MARKUP } from "@shared/constants";
import { NationalBenchmarkBreakdown } from "./NationalBenchmarkBreakdown";
import { NationalBenchmarkChip } from "@/components/research/NationalBenchmarkChip";
import { useNationalBenchmarks, serviceTemplateNameToServiceLine } from "@/lib/api/national-benchmarks";
import { TEMPLATE_TO_SERVICE_LINES } from "@calc/services/national-anchors";
import {
  deriveTemplateMarkupsFromNationalBenchmarks,
} from "@calc/services/national-anchors";

const DEFAULT_SERVICE_MARKUP_PCT = (DEFAULT_SERVICE_MARKUP * 100).toFixed(0);

export interface FormState {
  name: string;
  defaultRate: string;
  serviceModel: "centralized" | "direct";
  serviceMarkup: string;
  isActive: boolean;
  sortOrder: string;
}

export const emptyForm: FormState = {
  name: "",
  // UI prompt — not a canonical default; user fills in
  defaultRate: "2",
  serviceModel: "centralized",
  serviceMarkup: DEFAULT_SERVICE_MARKUP_PCT,
  isActive: true,
  sortOrder: "0",
};

interface ServiceTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  form: FormState;
  setForm: (form: FormState) => void;
  onSave: () => void;
  isPending: boolean;
}

export function ServiceTemplateDialog({
  open,
  onOpenChange,
  editingId,
  form,
  setForm,
  onSave,
  isPending,
}: ServiceTemplateDialogProps) {
  const { data: nationalBenchmarks } = useNationalBenchmarks();

  const isCentralized = form.serviceModel === "centralized";
  const hasBenchmarkMapping =
    isCentralized &&
    form.name.trim().length > 0 &&
    (TEMPLATE_TO_SERVICE_LINES[form.name] ?? []).length > 0;

  const derivedMarkups =
    nationalBenchmarks && isCentralized
      ? deriveTemplateMarkupsFromNationalBenchmarks(
          nationalBenchmarks.vendorCosts.map((r) => ({
            serviceLine: r.serviceLine,
            costPctRevenue: r.value,
          })),
          nationalBenchmarks.markupFactors.map((r) => ({
            serviceLine: r.serviceLine,
            markupPctRevenue: r.value,
          })),
        )
      : null;
  const derivedMarkupForTemplate = derivedMarkups?.[form.name] ?? null;

  const serviceLine = serviceTemplateNameToServiceLine(form.name);
  const vendorCostRow = serviceLine
    ? (nationalBenchmarks?.vendorCosts.find((r) => r.serviceLine === serviceLine) ?? null)
    : null;
  const markupRow = serviceLine
    ? (nationalBenchmarks?.markupFactors.find((r) => r.serviceLine === serviceLine) ?? null)
    : null;

  const rateDecimal = parseFloat(form.defaultRate) / 100;
  const markupDecimal = parseFloat(form.serviceMarkup) / 100;
  const currentVendorCost =
    isCentralized && Number.isFinite(rateDecimal) && Number.isFinite(markupDecimal)
      ? rateDecimal / (1 + markupDecimal)
      : Number.isFinite(rateDecimal)
      ? rateDecimal
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{editingId ? "Edit Service Category" : "Add Service Category"}</DialogTitle>
          <DialogDescription className="label-text">
            {editingId
              ? "Update the service category settings. Changes will apply as new defaults — existing property overrides are preserved."
              : "Create a new service category. Use 'Sync to Properties' to propagate it to all existing properties."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Service Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Marketing"
              data-testid="input-service-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                Service Model
                <InfoTooltip text="Centralized: The management company procures this service from vendors and passes cost through with a markup. The property pays fee = vendor cost × (1 + markup%). Direct: The company provides oversight only — the entire fee is recognized as revenue with no vendor cost." />
              </Label>
              <Select value={form.serviceModel} onValueChange={(v) => setForm({ ...form, serviceModel: v as "centralized" | "direct" })}>
                <SelectTrigger data-testid="select-service-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="centralized">Centralized (pass-through)</SelectItem>
                  <SelectItem value="direct">Direct (oversight only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1 flex-wrap">
                Default Fee Rate
                <InfoTooltip text="The percentage of a property's Total Revenue charged for this service. e.g. 2.0 means 2.0% of Total Revenue. All active service rates sum to the Base Management Fee." />
                {vendorCostRow && (
                  <NationalBenchmarkChip
                    kind="vendor-cost"
                    currentValue={currentVendorCost}
                    benchmarkValue={vendorCostRow.value}
                    dot={vendorCostRow.dot}
                    guardrail={vendorCostRow.guardrail}
                    source={vendorCostRow.source}
                    period={vendorCostRow.period}
                    fetchedAt={vendorCostRow.fetchedAt}
                  />
                )}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.defaultRate}
                  onChange={(e) => setForm({ ...form, defaultRate: e.target.value })}
                  className="pr-8"
                  data-testid="input-service-rate"
                />
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground text-sm">%</div>
              </div>
            </div>
          </div>
          {isCentralized && (
            <div className="space-y-2 bg-muted rounded-lg p-3 border border-border/60">
              <Label className="text-sm font-medium flex items-center gap-1 flex-wrap">
                Cost-Plus Markup
                <InfoTooltip text="When the company procures a service for a property, it charges cost × (1 + markup%). e.g. 20% markup means a $1,000 vendor invoice becomes $1,200 to the property. The $200 difference is the company's gross profit on this service." />
                {markupRow && (
                  <NationalBenchmarkChip
                    kind="markup"
                    currentValue={Number.isFinite(markupDecimal) ? markupDecimal : null}
                    benchmarkValue={markupRow.value}
                    dot={markupRow.dot}
                    guardrail={markupRow.guardrail}
                    source={markupRow.source}
                    period={markupRow.period}
                    fetchedAt={markupRow.fetchedAt}
                  />
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                If markup is 20% and the company procures a service for $1.00, the property is charged $1.20.
              </p>
              {derivedMarkupForTemplate != null && (
                <p className="text-[10px] text-muted-foreground bg-primary/5 border border-primary/20 rounded px-2 py-1">
                  National feed derived markup for{" "}
                  <span className="font-medium text-foreground">{form.name}</span>:{" "}
                  <span className="font-mono font-semibold text-primary">
                    {(derivedMarkupForTemplate * 100).toFixed(0)}%
                  </span>
                  . The engine will apply this value when the national-benchmark overlay is active.
                </p>
              )}
              <div className="relative">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={form.serviceMarkup}
                  onChange={(e) => setForm({ ...form, serviceMarkup: e.target.value })}
                  className="pr-8"
                  data-testid="input-service-markup"
                />
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground text-sm">%</div>
              </div>
            </div>
          )}

          {hasBenchmarkMapping && (
            <NationalBenchmarkBreakdown
              templateName={form.name}
              serviceModel="centralized"
              benchmarks={nationalBenchmarks}
            />
          )}

          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              data-testid="switch-service-active"
            />
            <Label className="text-sm">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={isPending}
            data-testid="button-save-service"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin text-accent-pop mr-1" /> : <IconSave className="w-4 h-4 mr-1" />}
            {editingId ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
