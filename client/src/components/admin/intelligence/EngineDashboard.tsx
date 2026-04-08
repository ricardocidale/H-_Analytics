import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconActivity, IconGauge, IconResearch, IconTimer } from "@/components/icons";
import type { Property } from "@shared/schema";

interface EngineStats {
  totalProperties: number;
  freshCount: number;
  staleCount: number;
  missingCount: number;
  freshPct: number;
}

function useEngineStats(): EngineStats {
  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  const { data: lastRefresh } = useQuery<{ lastFullRefresh: string | null }>({
    queryKey: ["/api/research/last-full-refresh"],
  });

  const total = properties?.length ?? 0;
  const lastGlobalResearch = lastRefresh?.lastFullRefresh ? new Date(lastRefresh.lastFullRefresh).getTime() : 0;

  let fresh = 0;
  let stale = 0;
  let missing = 0;

  for (const p of properties ?? []) {
    const lastChange = p.lastAssumptionChangeAt ? new Date(p.lastAssumptionChangeAt).getTime() : 0;

    if (!lastGlobalResearch) {
      missing++;
    } else if (lastChange > lastGlobalResearch) {
      stale++;
    } else {
      fresh++;
    }
  }

  return {
    totalProperties: total,
    freshCount: fresh,
    staleCount: stale,
    missingCount: missing,
    freshPct: total > 0 ? Math.round((fresh / total) * 100) : 0,
  };
}

function StatusDot({ status }: { status: "green" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "inline-block w-2.5 h-2.5 rounded-full",
        status === "green" && "bg-emerald-500",
        status === "amber" && "bg-amber-500",
        status === "red" && "bg-red-500"
      )}
    />
  );
}

function HealthBar({ stats }: { stats: EngineStats }) {
  const status = stats.missingCount > 0 ? "red" : stats.staleCount > 0 ? "amber" : "green";
  const message =
    status === "green" ? "Engine Healthy — All intelligence is current" :
    status === "amber" ? `${stats.staleCount} propert${stats.staleCount === 1 ? "y" : "ies"} need${stats.staleCount === 1 ? "s" : ""} refresh` :
    `${stats.missingCount} propert${stats.missingCount === 1 ? "y" : "ies"} missing intelligence`;

  return (
    <div
      data-testid="engine-health-bar"
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border",
        status === "green" && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
        status === "amber" && "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800",
        status === "red" && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
      )}
    >
      <StatusDot status={status} />
      <span className="text-sm font-medium text-foreground">{message}</span>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", accent ?? "text-foreground")}>{value}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
            <Icon className="w-4.5 h-4.5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageHeatmap({ stats }: { stats: EngineStats }) {
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: lastRefresh } = useQuery<{ lastFullRefresh: string | null }>({
    queryKey: ["/api/research/last-full-refresh"],
  });

  if (!properties?.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Coverage Heatmap</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No properties to display.</p>
        </CardContent>
      </Card>
    );
  }

  const lastGlobalResearch = lastRefresh?.lastFullRefresh ? new Date(lastRefresh.lastFullRefresh).getTime() : 0;

  return (
    <Card data-testid="coverage-heatmap">
      <CardHeader><CardTitle className="text-sm">Property Intelligence Coverage</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {properties.slice(0, 20).map((p) => {
            const lastChange = p.lastAssumptionChangeAt ? new Date(p.lastAssumptionChangeAt).getTime() : 0;
            const status: "green" | "amber" | "red" = !lastGlobalResearch ? "red" :
              (lastChange > lastGlobalResearch) ? "amber" : "green";

            return (
              <div key={p.id} className="flex items-center gap-3" data-testid={`heatmap-row-${p.id}`}>
                <StatusDot status={status} />
                <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {status === "amber" ? "Stale" : status === "red" ? "No data" : "Current"}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PortfolioProfile() {
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });

  const props = properties ?? [];
  const total = props.length;
  const byType: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const cities = new Set<string>();
  const countries = new Set<string>();
  let totalRooms = 0;

  for (const p of props) {
    byType[p.hospitalityType ?? "hotel"] = (byType[p.hospitalityType ?? "hotel"] ?? 0) + 1;
    byModel[p.businessModel ?? "hotel"] = (byModel[p.businessModel ?? "hotel"] ?? 0) + 1;
    if (p.city) cities.add(p.city);
    if (p.country) countries.add(p.country);
    totalRooms += p.roomCount ?? 0;
  }

  return (
    <Card data-testid="portfolio-profile">
      <CardHeader><CardTitle className="text-sm">Portfolio Profile</CardTitle></CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No properties in portfolio.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Properties</p>
              <p className="font-semibold text-foreground">{total}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Rooms</p>
              <p className="font-semibold text-foreground">{totalRooms.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Markets</p>
              <p className="font-semibold text-foreground">{cities.size} cities, {countries.size} countries</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Business Models</p>
              <p className="font-semibold text-foreground">
                {Object.entries(byModel).map(([k, v]) => `${k === "hotel" ? "Hotel" : "VRBO"}: ${v}`).join(", ")}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground font-medium">Property Types</p>
              <p className="font-semibold text-foreground">
                {Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EngineDashboard() {
  const stats = useEngineStats();

  return (
    <div className="space-y-6" data-testid="engine-dashboard">
      <HealthBar stats={stats} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Properties" value={stats.totalProperties} icon={IconResearch} />
        <StatCard label="Fresh" value={`${stats.freshPct}%`} icon={IconGauge} accent="text-emerald-600" />
        <StatCard label="Stale" value={stats.staleCount} icon={IconTimer} accent={stats.staleCount > 0 ? "text-amber-600" : undefined} />
        <StatCard label="Missing" value={stats.missingCount} icon={IconActivity} accent={stats.missingCount > 0 ? "text-red-600" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CoverageHeatmap stats={stats} />
        <PortfolioProfile />
      </div>
    </div>
  );
}
