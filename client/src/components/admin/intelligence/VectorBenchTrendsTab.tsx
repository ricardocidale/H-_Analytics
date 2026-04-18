import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";

interface Stats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

interface RunResult {
  size: number;
  totalRowsAtRun: number;
  single: Stats;
  multi: Stats;
}

interface BenchRun {
  timestamp: string;
  node: string;
  dbHint: string;
  queries: number;
  topK: number;
  sizes: number[];
  results: RunResult[];
}

interface BenchHistoryPayload {
  available: boolean;
  updatedAt: string | null;
  namespaces?: number;
  thresholds: {
    singleP95Ms: number;
    singleP50Ms: number;
    multiP95Ms: number;
    multiP50Ms: number;
  } | null;
  runs: BenchRun[];
  message?: string;
}

interface ChartPoint {
  timestamp: string;
  ts: number;
  singleP50: number | null;
  singleP95: number | null;
  multiP50: number | null;
  multiP95: number | null;
  totalRowsAtRun: number | null;
}

const FALLBACK_THRESHOLDS = {
  singleP95Ms: 50,
  singleP50Ms: 25,
  multiP95Ms: 600,
  multiP50Ms: 300,
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMs(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 100 ? `${v.toFixed(0)} ms` : `${v.toFixed(1)} ms`;
}

export default function VectorBenchTrendsTab() {
  const { data, isLoading, isError, error } = useQuery<BenchHistoryPayload>({
    queryKey: ["/api/admin/vector-bench/history"],
    refetchInterval: 60_000,
  });

  const sizes = useMemo(() => {
    if (!data?.runs) return [] as number[];
    const set = new Set<number>();
    for (const run of data.runs) {
      for (const r of run.results) set.add(r.size);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [data]);

  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const activeSize =
    selectedSize != null && sizes.includes(selectedSize)
      ? selectedSize
      : sizes[sizes.length - 1] ?? null;

  const thresholds = data?.thresholds ?? FALLBACK_THRESHOLDS;

  const points = useMemo<ChartPoint[]>(() => {
    if (!data?.runs || activeSize == null) return [];
    return data.runs.map((run) => {
      const r = run.results.find((x) => x.size === activeSize);
      return {
        timestamp: run.timestamp,
        ts: new Date(run.timestamp).getTime(),
        singleP50: r ? r.single.p50Ms : null,
        singleP95: r ? r.single.p95Ms : null,
        multiP50: r ? r.multi.p50Ms : null,
        multiP95: r ? r.multi.p95Ms : null,
        totalRowsAtRun: r ? r.totalRowsAtRun : null,
      };
    });
  }, [data, activeSize]);

  const breachCount = useMemo(() => {
    let n = 0;
    for (const p of points) {
      if (p.singleP95 != null && p.singleP95 > thresholds.singleP95Ms) n++;
      if (p.multiP95 != null && p.multiP95 > thresholds.multiP95Ms) n++;
    }
    return n;
  }, [points, thresholds]);

  const lastPoint = points[points.length - 1];
  const lastBreaches = useMemo(() => {
    const out: string[] = [];
    if (!lastPoint) return out;
    if (lastPoint.singleP95 != null && lastPoint.singleP95 > thresholds.singleP95Ms)
      out.push(
        `single p95 ${formatMs(lastPoint.singleP95)} > ${thresholds.singleP95Ms} ms`,
      );
    if (lastPoint.singleP50 != null && lastPoint.singleP50 > thresholds.singleP50Ms)
      out.push(
        `single p50 ${formatMs(lastPoint.singleP50)} > ${thresholds.singleP50Ms} ms`,
      );
    if (lastPoint.multiP95 != null && lastPoint.multiP95 > thresholds.multiP95Ms)
      out.push(
        `multi p95 ${formatMs(lastPoint.multiP95)} > ${thresholds.multiP95Ms} ms`,
      );
    if (lastPoint.multiP50 != null && lastPoint.multiP50 > thresholds.multiP50Ms)
      out.push(
        `multi p50 ${formatMs(lastPoint.multiP50)} > ${thresholds.multiP50Ms} ms`,
      );
    return out;
  }, [lastPoint, thresholds]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        data-testid="vector-bench-loading"
      >
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card data-testid="vector-bench-error">
        <CardContent className="py-8 flex items-center gap-3 text-destructive">
          <IconAlertTriangle className="w-5 h-5" />
          <span>
            Failed to load benchmark history:{" "}
            {error instanceof Error ? error.message : "unknown error"}
          </span>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.runs || data.runs.length === 0) {
    return (
      <Card data-testid="vector-bench-empty">
        <CardHeader>
          <CardTitle>Vector Search Latency Trends</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            {data?.message ??
              "No benchmark history yet. Run the vector benchmark to start collecting data."}
          </p>
          <pre className="rounded-md bg-muted p-3 text-xs">
            npx tsx script/vector-bench.ts
          </pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="vector-bench-trends">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Vector Search Latency Trends</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Recorded runs of <code>script/vector-bench.ts</code>. Last
              updated{" "}
              {data.updatedAt ? formatTs(data.updatedAt) : "never"} · {data.runs.length}{" "}
              run{data.runs.length === 1 ? "" : "s"}
              {data.namespaces ? ` · ${data.namespaces} namespaces` : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {breachCount > 0 ? (
              <Badge
                variant="destructive"
                data-testid="badge-bench-breaches"
                className="gap-1"
              >
                <IconAlertTriangle className="w-3 h-3" />
                {breachCount} threshold breach
                {breachCount === 1 ? "" : "es"}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                data-testid="badge-bench-healthy"
                className="gap-1 text-emerald-600 border-emerald-600/40"
              >
                <IconCheckCircle className="w-3 h-3" />
                Within thresholds
              </Badge>
            )}
            {sizes.length > 1 && activeSize != null && (
              <Select
                value={String(activeSize)}
                onValueChange={(v) => setSelectedSize(Number(v))}
              >
                <SelectTrigger
                  className="w-[180px]"
                  data-testid="select-bench-size"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sizes.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      Seeded {s.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {lastBreaches.length > 0 && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2"
              data-testid="alert-last-breach"
            >
              <IconAlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Most recent run breached thresholds:</p>
                <ul className="list-disc ml-5 mt-1 space-y-0.5">
                  {lastBreaches.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <BenchChart
            title="Single-namespace query latency"
            testId="chart-bench-single"
            data={points}
            series={[
              { key: "singleP50", label: "p50", color: "hsl(var(--chart-2))" },
              { key: "singleP95", label: "p95", color: "hsl(var(--chart-1))" },
            ]}
            thresholdP50={thresholds.singleP50Ms}
            thresholdP95={thresholds.singleP95Ms}
          />
          <BenchChart
            title="Multi-namespace fan-out latency"
            testId="chart-bench-multi"
            data={points}
            series={[
              { key: "multiP50", label: "p50", color: "hsl(var(--chart-2))" },
              { key: "multiP95", label: "p95", color: "hsl(var(--chart-1))" },
            ]}
            thresholdP50={thresholds.multiP50Ms}
            thresholdP95={thresholds.multiP95Ms}
          />

          <div className="text-xs text-muted-foreground">
            Thresholds: single p50 ≤ {thresholds.singleP50Ms} ms, p95 ≤{" "}
            {thresholds.singleP95Ms} ms · multi p50 ≤ {thresholds.multiP50Ms} ms,
            p95 ≤ {thresholds.multiP95Ms} ms.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ChartSeries {
  key: keyof ChartPoint;
  label: string;
  color: string;
}

function BenchChart({
  title,
  testId,
  data,
  series,
  thresholdP50,
  thresholdP95,
}: {
  title: string;
  testId: string;
  data: ChartPoint[];
  series: ChartSeries[];
  thresholdP50: number;
  thresholdP95: number;
}) {
  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {series.map((s) => (
            <span key={s.key as string} className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 border-t border-dashed border-destructive" />
            threshold
          </span>
        </div>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTs}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={48}
              tickFormatter={(v) => `${v}ms`}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
              }}
              labelFormatter={(label) => formatTs(String(label))}
              formatter={(value: number, name: string) => [
                formatMs(value),
                name,
              ]}
            />
            <ReferenceLine
              y={thresholdP50}
              stroke="hsl(var(--destructive))"
              strokeDasharray="4 4"
              strokeOpacity={0.45}
              ifOverflow="extendDomain"
              label={{
                value: `p50 ${thresholdP50}ms`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "hsl(var(--destructive))",
              }}
            />
            <ReferenceLine
              y={thresholdP95}
              stroke="hsl(var(--destructive))"
              strokeDasharray="6 4"
              strokeOpacity={0.7}
              ifOverflow="extendDomain"
              label={{
                value: `p95 ${thresholdP95}ms`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "hsl(var(--destructive))",
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key as string}
                type="monotone"
                dataKey={s.key as string}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={(props: {
                  cx?: number;
                  cy?: number;
                  payload?: ChartPoint;
                  index?: number;
                }) => {
                  const { cx, cy, payload, index } = props;
                  if (cx == null || cy == null || !payload) {
                    return <g key={`dot-${s.key as string}-${index ?? 0}`} />;
                  }
                  const v = payload[s.key];
                  const numeric = typeof v === "number" ? v : null;
                  const isP95 = (s.key as string).endsWith("P95");
                  const breach =
                    numeric != null &&
                    numeric > (isP95 ? thresholdP95 : thresholdP50);
                  return (
                    <circle
                      key={`dot-${s.key as string}-${index ?? 0}`}
                      cx={cx}
                      cy={cy}
                      r={breach ? 5 : 3}
                      fill={breach ? "hsl(var(--destructive))" : s.color}
                      stroke={breach ? "hsl(var(--destructive))" : s.color}
                      strokeWidth={breach ? 2 : 1}
                    />
                  );
                }}
                activeDot={{ r: 6 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
