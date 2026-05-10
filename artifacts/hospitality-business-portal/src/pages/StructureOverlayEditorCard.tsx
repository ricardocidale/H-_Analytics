import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OPERATING_STRUCTURE_DEFAULTS,
  OPERATING_STRUCTURE_IDS,
  type OperatingStructureId,
  type OperatingStructureDefaults,
  type StructureOverlayPatch,
} from "@shared/constants-operating-structures";
import { type StructureOverlaysMap } from "@/lib/api/structure-comparison";

interface StructureOverlayEditorCardProps {
  editingStructure: OperatingStructureId | null;
  editingBaseline: OperatingStructureDefaults | null;
  pendingOverlays: StructureOverlaysMap;
  appliedOverlays: StructureOverlaysMap;
  overlaysDirty: boolean;
  onSelectStructure: (id: OperatingStructureId | null) => void;
  onUpdateOverlay: (
    id: OperatingStructureId,
    section: "feeOverlay" | "lease",
    field: string,
    value: number | undefined,
  ) => void;
  onUpdateCapex: (id: OperatingStructureId, value: number | undefined) => void;
  onApply: () => void;
  onReset: () => void;
}

export function StructureOverlayEditorCard({
  editingStructure,
  editingBaseline,
  pendingOverlays,
  appliedOverlays,
  overlaysDirty,
  onSelectStructure,
  onUpdateOverlay,
  onUpdateCapex,
  onApply,
  onReset,
}: StructureOverlayEditorCardProps) {
  return (
    <Card data-testid="card-overlay-editor">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Override assumptions (this scenario only)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Tweak fee, lease, or capex assumptions for any structure. Apply to recompute. Resets when
            you leave the page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={
              Object.keys(pendingOverlays).length === 0 && Object.keys(appliedOverlays).length === 0
            }
            data-testid="button-reset-overrides"
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={onApply}
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
            onValueChange={(v) => onSelectStructure(v ? (v as OperatingStructureId) : null)}
          >
            <SelectTrigger className="w-[260px]" data-testid="select-edit-structure">
              <SelectValue placeholder="Pick a structure to override…" />
            </SelectTrigger>
            <SelectContent>
              {OPERATING_STRUCTURE_IDS.map((id) => {
                const dirty = pendingOverlays[id] != null;
                return (
                  <SelectItem key={id} value={id} data-testid={`option-edit-${id}`}>
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
            onChangeFee={(field, value) => onUpdateOverlay(editingStructure, "feeOverlay", field, value)}
            onChangeLease={(field, value) => onUpdateOverlay(editingStructure, "lease", field, value)}
            onChangeCapex={(value) => onUpdateCapex(editingStructure, value)}
          />
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="text-overlay-editor-empty">
            Pick a structure above to override its baseline assumptions.
          </p>
        )}
      </CardContent>
    </Card>
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
  const showHma =
    baseline.feeOverlay.hmaBaseOnTotalRevenue > 0 || baseline.feeOverlay.hmaIncentiveOnGop > 0;
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
          <p className="text-xs font-medium uppercase text-muted-foreground mb-2">HMA fees</p>
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
          <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Lease terms</p>
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
            if (raw === "") { onChange(undefined); return; }
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
            if (raw === "") { onChange(undefined); return; }
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
