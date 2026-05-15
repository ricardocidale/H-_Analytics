/**
 * BreakevenTargetsPanel.tsx — Reverse-solved hospitality breakeven thresholds.
 *
 * Renders six rows (ADR, Occupancy, RevPAR, Going-In Cap, Debt Rate,
 * Terminal Cap) with Current / Breakeven / Gap / Status columns. The math
 * lives in `@calc/analysis/breakeven-targets`; this file is presentational.
 *
 * Display rules:
 *   • Field labels for property-backed metrics resolve through FIELD_REGISTRY
 *     so canonical hospitality terms ("ADR", not "startAdr") are used.
 *   • RevPAR / Going-In Cap labels are not in the registry (they're derived
 *     metrics, not editable fields) and are spelled out canonically here.
 *   • Status badge: green when current is on the safe side of breakeven, red
 *     when current is on the wrong side, amber when within
 *     BREAKEVEN_PROXIMITY_RATIO of breakeven.
 *   • Unsolvable rows show an em-dash and the reason as tooltip text.
 */
import { IconBarChart3 } from "@/components/icons";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/ui/animated";
import { FIELD_REGISTRY } from "@shared/field-registry";
import type {
  SensitivityBreakevenBundle,
  SensitivityBreakevenRow,
} from "@shared/sensitivity-types";

interface BreakevenTargetsPanelProps {
  bundle: SensitivityBreakevenBundle;
}

interface RowSpec {
  /** Canonical user-facing label. */
  label: string;
  /** Plain-language explanation of the row, shown in the info tooltip. */
  tooltipText: string;
  /** Math formula shown beneath the tooltip text. */
  tooltipFormula: string;
  /** Format a value into the column-display string. */
  format: (value: number) => string;
  /** Higher is better for this metric (controls badge phrasing). */
  higherIsBetter: boolean;
}

/** Look up the registry label for a property field; fall back to the supplied default. */
function registryLabel(propertyField: string, fallback: string): string {
  const def = FIELD_REGISTRY.find((f) => f.propertyField === propertyField);
  return def?.label ?? fallback;
}

/** Currency formatter used by the ADR/RevPAR rows. */
function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Percentage formatter used by Occupancy / Cap-rate / Debt-rate rows. */
function fmtPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

const ROW_SPECS: Record<SensitivityBreakevenRow["key"], RowSpec> = {
  adr: {
    // "ADR" is the canonical hospitality term; FIELD_REGISTRY uses
    // "Starting ADR" for the editable field.
    label: `Breakeven ADR`,
    tooltipText:
      `${registryLabel("startAdr", "Starting ADR")} required so ANOI covers ` +
      `annual debt service. Holds occupancy at the current value.`,
    tooltipFormula: "ADR* = current ADR × [1 + (annual debt service − Year 1 ANOI) / slope]",
    format: fmtCurrency,
    higherIsBetter: true,
  },
  occupancy: {
    label: "Breakeven Occupancy",
    tooltipText:
      `${registryLabel("maxOccupancy", "Max Occupancy")} required so ANOI ` +
      `covers annual debt service. Holds ADR at the current value.`,
    tooltipFormula: "Occ* = current occupancy × [1 + (annual debt service − Year 1 ANOI) / slope]",
    format: fmtPct,
    higherIsBetter: true,
  },
  revpar: {
    label: "Breakeven RevPAR",
    tooltipText:
      "Revenue per available room (ADR × Occupancy) needed for ANOI to cover " +
      "annual debt service.",
    tooltipFormula: "Breakeven RevPAR = Breakeven ADR × Breakeven Occupancy",
    format: fmtCurrency,
    higherIsBetter: true,
  },
  goingInCap: {
    label: "Breakeven Going-In Cap Rate",
    tooltipText:
      "Year-1 NOI yield required to satisfy the DSCR floor at the current " +
      "purchase price. A higher current cap is safer.",
    tooltipFormula: "Cap* = (annual debt service × DSCR floor) / purchase price",
    format: fmtPct,
    higherIsBetter: true,
  },
  debtRate: {
    label: `Breakeven ${registryLabel("acquisitionInterestRate", "Acquisition Interest Rate")}`,
    tooltipText:
      "Highest annual interest rate the deal can carry while keeping ANOI / " +
      "debt service ≥ DSCR floor.",
    tooltipFormula: "Monthly payment(rate) × 12 = ANOI / DSCR floor → solve for rate",
    format: fmtPct,
    higherIsBetter: false,
  },
  terminalCap: {
    label: `Breakeven ${registryLabel("exitCapRate", "Exit Cap Rate")}`,
    tooltipText:
      "Highest exit (terminal) cap rate at sale that still produces a non-" +
      "negative IRR. A lower current exit cap is safer.",
    tooltipFormula: "IRR = 0 at the breakeven exit cap rate (interpolated from scenario range)",
    format: fmtPct,
    higherIsBetter: false,
  },
};

function StatusBadge({ row }: { row: SensitivityBreakevenRow }) {
  const spec = ROW_SPECS[row.key];
  if (row.status === "unsolvable") {
    return (
      <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-status-${row.key}`}>
        N/A
      </Badge>
    );
  }
  if (row.status === "close") {
    return (
      <Badge
        className="bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 border-amber-500/30"
        data-testid={`badge-status-${row.key}`}
      >
        Close to breakeven
      </Badge>
    );
  }
  const safe = row.status === "above";
  const phrasing = spec.higherIsBetter
    ? safe ? "Above breakeven" : "Below breakeven"
    : safe ? "Below breakeven" : "Above breakeven";
  return (
    <Badge
      className={
        safe
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 border-emerald-500/30"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/15 border-rose-500/30"
      }
      data-testid={`badge-status-${row.key}`}
    >
      {phrasing}
    </Badge>
  );
}

export function BreakevenTargetsPanel({ bundle }: BreakevenTargetsPanelProps) {
  return (
    <div
      className="bg-gradient-to-br from-card to-card/80 rounded-xl p-6 border border-border shadow-sm"
      data-testid="panel-breakeven-targets"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <IconBarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3
            className="text-lg font-semibold text-foreground"
            data-testid="text-breakeven-targets-title"
          >
            Breakeven Targets
          </h3>
          <p className="text-xs text-muted-foreground">
            Reverse-solved thresholds at DSCR floor{" "}
            {bundle.meta.targetDscrFloor.toFixed(2)} — how far each variable can
            move before the deal breaks.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-breakeven-targets">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="py-2 pr-4 font-semibold">Metric</th>
              <th className="py-2 px-4 font-semibold text-right">Current</th>
              <th className="py-2 px-4 font-semibold text-right">Breakeven</th>
              <th className="py-2 px-4 font-semibold text-right">Gap</th>
              <th className="py-2 pl-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {bundle.rows.map((row) => {
              const spec = ROW_SPECS[row.key];
              return (
                <tr
                  key={row.key}
                  className="border-b border-border/60 last:border-b-0"
                  data-testid={`row-breakeven-${row.key}`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1 font-medium text-foreground">
                      <span data-testid={`text-breakeven-label-${row.key}`}>
                        {spec.label}
                      </span>
                      <InfoTooltip
                        text={spec.tooltipText}
                        formula={spec.tooltipFormula}
                      />
                    </div>
                  </td>
                  <td
                    className="py-3 px-4 text-right tabular-nums text-foreground"
                    data-testid={`text-breakeven-current-${row.key}`}
                  >
                    <AnimatedCounter value={row.current} format={spec.format} />
                  </td>
                  <td
                    className="py-3 px-4 text-right tabular-nums text-foreground"
                    data-testid={`text-breakeven-value-${row.key}`}
                  >
                    {row.breakeven === null ? (
                      <span
                        className="text-muted-foreground"
                        title={row.reason ?? "Cannot solve."}
                      >
                        —
                      </span>
                    ) : (
                      <AnimatedCounter value={row.breakeven} format={spec.format} />
                    )}
                  </td>
                  <td
                    className="py-3 px-4 text-right tabular-nums text-muted-foreground"
                    data-testid={`text-breakeven-gap-${row.key}`}
                  >
                    {row.gap === null ? (
                      "—"
                    ) : (
                      <AnimatedCounter
                        value={row.gap}
                        format={(n) => `${n >= 0 ? "+" : "−"}${spec.format(Math.abs(n))}`}
                      />
                    )}
                  </td>
                  <td className="py-3 pl-4">
                    <StatusBadge row={row} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
