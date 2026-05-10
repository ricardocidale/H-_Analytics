/**
 * EditDialog — Create / Edit dialog for a reference_range row.
 *
 * Extracted from `../ReferenceRangesTab.tsx` (task-1360). The markup is
 * byte-identical to the original; form state and the submit handler
 * come in as props from the page shell.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  REFERENCE_RANGE_DOMAINS,
  REFERENCE_RANGE_CONFIDENCES,
  type ReferenceRangeDomain,
  type ReferenceRangeConfidence,
} from "@shared/schema/reference-range";
import type { DialogMode, FormState } from "./types";

type Props = {
  dialogMode: DialogMode;
  form: FormState;
  formError: string | null;
  submitting: boolean;
  onClose: () => void;
  onChange: (form: FormState) => void;
  onSubmit: () => void;
};

export function EditDialog({
  dialogMode,
  form,
  formError,
  submitting,
  onClose,
  onChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-reference-range">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {dialogMode?.kind === "edit" ? "Edit reference range" : "New reference range"}
          </DialogTitle>
          <DialogDescription>
            {dialogMode?.kind === "edit"
              ? "Update an existing low / mid / high reference range row."
              : "Add a new low / mid / high reference range row."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rr-domain">Domain</Label>
            <Select value={form.domain} onValueChange={(v) => onChange({ ...form, domain: v as ReferenceRangeDomain })}>
              <SelectTrigger id="rr-domain" data-testid="select-form-domain">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFERENCE_RANGE_DOMAINS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-metric-key">Metric Key</Label>
            <Input
              id="rr-metric-key"
              value={form.metricKey}
              onChange={(e) => onChange({ ...form, metricKey: e.target.value })}
              placeholder="adr-luxury"
              data-testid="input-form-metric-key"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="rr-label">Label</Label>
            <Input
              id="rr-label"
              value={form.label}
              onChange={(e) => onChange({ ...form, label: e.target.value })}
              placeholder="ADR — Luxury segment"
              data-testid="input-form-label"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-country">Country</Label>
            <Input
              id="rr-country"
              value={form.country}
              onChange={(e) => onChange({ ...form, country: e.target.value })}
              placeholder="GLOBAL or US, BR, ..."
              data-testid="input-form-country"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-subdivision">Subdivision</Label>
            <Input
              id="rr-subdivision"
              value={form.subdivision}
              onChange={(e) => onChange({ ...form, subdivision: e.target.value })}
              placeholder="optional (e.g. CA)"
              data-testid="input-form-subdivision"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-market">Market</Label>
            <Input
              id="rr-market"
              value={form.market}
              onChange={(e) => onChange({ ...form, market: e.target.value })}
              placeholder="optional (e.g. Miami)"
              data-testid="input-form-market"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-segment">Segment</Label>
            <Input
              id="rr-segment"
              value={form.segment}
              onChange={(e) => onChange({ ...form, segment: e.target.value })}
              placeholder="optional (e.g. luxury)"
              data-testid="input-form-segment"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-property-type">Property Type</Label>
            <Input
              id="rr-property-type"
              value={form.propertyType}
              onChange={(e) => onChange({ ...form, propertyType: e.target.value })}
              placeholder="optional (e.g. hotel)"
              data-testid="input-form-property-type"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-year">Year (0 = evergreen)</Label>
            <Input
              id="rr-year"
              type="number"
              min="0"
              value={form.year}
              onChange={(e) => onChange({ ...form, year: e.target.value })}
              data-testid="input-form-year"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-unit">Unit</Label>
            <Input
              id="rr-unit"
              value={form.unit}
              onChange={(e) => onChange({ ...form, unit: e.target.value })}
              placeholder="percent, usd_per_room_night, ..."
              data-testid="input-form-unit"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-low">Low</Label>
            <Input
              id="rr-low"
              type="number"
              value={form.low}
              onChange={(e) => onChange({ ...form, low: e.target.value })}
              data-testid="input-form-low"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-mid">Mid</Label>
            <Input
              id="rr-mid"
              type="number"
              value={form.mid}
              onChange={(e) => onChange({ ...form, mid: e.target.value })}
              data-testid="input-form-mid"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-high">High</Label>
            <Input
              id="rr-high"
              type="number"
              value={form.high}
              onChange={(e) => onChange({ ...form, high: e.target.value })}
              data-testid="input-form-high"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-confidence">Confidence</Label>
            <Select
              value={form.confidence}
              onValueChange={(v) => onChange({ ...form, confidence: v as ReferenceRangeConfidence })}
            >
              <SelectTrigger id="rr-confidence" data-testid="select-form-confidence">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFERENCE_RANGE_CONFIDENCES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-source-name">Source Name</Label>
            <Input
              id="rr-source-name"
              value={form.sourceName}
              onChange={(e) => onChange({ ...form, sourceName: e.target.value })}
              placeholder="optional"
              data-testid="input-form-source-name"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="rr-source-url">Source URL</Label>
            <Input
              id="rr-source-url"
              type="url"
              value={form.sourceUrl}
              onChange={(e) => onChange({ ...form, sourceUrl: e.target.value })}
              placeholder="optional, https://…"
              data-testid="input-form-source-url"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="rr-methodology">Methodology</Label>
            <Textarea
              id="rr-methodology"
              value={form.methodology}
              onChange={(e) => onChange({ ...form, methodology: e.target.value })}
              placeholder="optional one-line description of how the range was derived"
              rows={2}
              data-testid="input-form-methodology"
            />
          </div>
        </div>

        {formError && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            data-testid="text-form-error"
            role="alert"
          >
            {formError}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-form-cancel">
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting} data-testid="button-form-submit">
            {submitting ? "Saving…" : dialogMode?.kind === "edit" ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
