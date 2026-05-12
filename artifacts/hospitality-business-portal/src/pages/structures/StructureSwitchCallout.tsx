import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
} from "@shared/constants-operating-structures";
import { formatCompact } from "@/components/graphics";
import type { StructureMetrics } from "@calc/analysis/structure-comparison";

interface StructureSwitchCalloutProps {
  recommended: StructureMetrics;
  current: StructureMetrics | null;
  currentStructure: OperatingStructureId;
  onCurrentStructureChange: (id: OperatingStructureId) => void;
}

export function StructureSwitchCallout({
  recommended,
  current,
  currentStructure,
  onCurrentStructureChange,
}: StructureSwitchCalloutProps) {
  return (
    <Card className="border-accent-pop/40 bg-accent-pop/5" data-testid="card-switch-callout">
      <CardHeader>
        <CardTitle className="text-base">What changes if you switch?</CardTitle>
        <div className="flex items-center gap-3 pt-2">
          <Label className="text-xs text-muted-foreground">Currently modelled as</Label>
          <Select
            value={currentStructure}
            onValueChange={(v) => onCurrentStructureChange(v as OperatingStructureId)}
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
  );
}

function SwitchDelta({ from, to }: { from: StructureMetrics; to: StructureMetrics }) {
  const irrDelta = (to.unleveredIrr ?? 0) - (from.unleveredIrr ?? 0);
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
        className={`text-lg font-semibold ${positive ? "text-emerald-600" : "text-red-600"}`}
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}
