/**
 * QualityHistoryChart — shared score-history chart used by both:
 *   • The Specialist page Quality & Gaps card (full-width, ~96px tall,
 *     Task #540's line + dots + reference-band design).
 *   • The Resource detail Consumers table (inline per-row, compact).
 *
 * Lifted out of ResourceAssignmentsTab.tsx for Task #536 so the Resource
 * detail dialog can render the same chart per-consumer without duplicating
 * the Recharts wiring or the score-band color logic.
 *
 * Visual design (Task #540): a single thin line tracks the score over
 * time, with each datum dotted in its band color (green ≥80, amber ≥60,
 * red <60). Background reference areas tint the band regions so the line
 * "lives" inside its band even between snapshots — much easier to scan
 * than per-bar coloring when the score plateaus.
 */
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Tooltip,
  YAxis,
  XAxis,
  ReferenceArea,
  Dot,
} from "recharts";

export interface QualityHistoryPoint {
  score: number;
  computedAt: string;
}

export interface QualityHistoryResponse {
  specialistId: string;
  points: QualityHistoryPoint[];
}

// Score-band colors mirror the ScorePill used elsewhere so the chart and
// pill agree at a glance: ≥80 emerald, ≥60 amber, otherwise rose.
export function scoreBandColor(score: number): string {
  if (score >= 80) return "hsl(160 84% 39%)"; // emerald-500
  if (score >= 60) return "hsl(38 92% 50%)"; // amber-500
  return "hsl(347 77% 50%)"; // rose-500
}

// Background tint for each band region. Subtle so the line and dots
// remain dominant; band identity is conveyed by hue, not saturation.
const BAND_TINT_GREEN = "hsl(160 84% 39% / 0.10)";
const BAND_TINT_AMBER = "hsl(38 92% 50% / 0.10)";
const BAND_TINT_RED = "hsl(347 77% 50% / 0.10)";

interface QualityHistoryChartProps {
  points: QualityHistoryPoint[];
  /** Pixel height of the chart. Defaults to 96 for the full Specialist
   *  card; pass a smaller number (e.g. 32–40) when embedding in a table
   *  row. */
  height?: number;
  /** Whether to render the dashed/tinted band reference areas. On by
   *  default for the full card; off for compact embeds where the tints
   *  would dominate the tiny canvas. */
  showBands?: boolean;
  /**
   * Override the data-testid prefix so multiple charts on the same page
   * (one per consumer row) don't share IDs. Defaults to "quality-history",
   * matching the original Specialist-page testIDs.
   */
  testIdPrefix?: string;
}

export function QualityHistoryChart({
  points,
  height = 96,
  showBands = true,
  testIdPrefix = "quality-history",
}: QualityHistoryChartProps) {
  if (points.length === 0) {
    return (
      <div
        data-testid={`${testIdPrefix}-empty`}
        className="flex items-center justify-center text-xs text-muted-foreground border rounded"
        style={{ height }}
      >
        No history yet — recompute to record the first snapshot.
      </div>
    );
  }
  if (points.length === 1) {
    // One point would render as a misleading "flat trend"; show the
    // value and prompt for more data instead.
    return (
      <div
        data-testid={`${testIdPrefix}-single`}
        className="flex items-center justify-center gap-2 text-xs text-muted-foreground border rounded px-2"
        style={{ height }}
      >
        <span className="truncate">
          Only one snapshot ({points[0].score}). History appears after the next recompute.
        </span>
      </div>
    );
  }

  // Pre-index points so X = 0..n-1 (categorical). Recharts datum keeps the
  // ISO timestamp so the tooltip can format it locally.
  const indexed = points.map((p, i) => ({ ...p, i }));

  return (
    <div data-testid={`${testIdPrefix}-chart`} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={indexed} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="i" hide type="number" domain={[0, indexed.length - 1]} />
          <YAxis hide domain={[0, 100]} />
          {showBands && (
            <>
              {/*
                Band tinting: green ≥80, amber ≥60, red <60. Drawing the
                regions as ReferenceAreas (instead of per-point coloring)
                makes band membership visible even between snapshots, so
                a line tracking sideways through "amber" reads as "amber
                for two weeks" without having to count points.
              */}
              <ReferenceArea
                data-testid={`${testIdPrefix}-band-red`}
                y1={0}
                y2={60}
                fill={BAND_TINT_RED}
                fillOpacity={1}
                ifOverflow="extendDomain"
              />
              <ReferenceArea
                data-testid={`${testIdPrefix}-band-amber`}
                y1={60}
                y2={80}
                fill={BAND_TINT_AMBER}
                fillOpacity={1}
                ifOverflow="extendDomain"
              />
              <ReferenceArea
                data-testid={`${testIdPrefix}-band-green`}
                y1={80}
                y2={100}
                fill={BAND_TINT_GREEN}
                fillOpacity={1}
                ifOverflow="extendDomain"
              />
            </>
          )}
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground) / 0.4)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as QualityHistoryPoint;
              return (
                <div
                  data-testid={`${testIdPrefix}-tooltip`}
                  className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-lg border border-primary/15 shadow-xl px-3 py-1.5 text-xs"
                >
                  <p className="font-mono font-semibold text-foreground">Score {p.score}</p>
                  <p className="text-muted-foreground">{new Date(p.computedAt).toLocaleString()}</p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--foreground) / 0.7)"
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, payload, index } = props as {
                cx: number;
                cy: number;
                payload: QualityHistoryPoint;
                index: number;
              };
              return (
                <Dot
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={2.5}
                  fill={scoreBandColor(payload.score)}
                  stroke="hsl(var(--background))"
                  strokeWidth={1}
                />
              );
            }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
