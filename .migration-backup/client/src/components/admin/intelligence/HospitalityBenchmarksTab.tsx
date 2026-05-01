import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertTriangle } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";

interface Benchmark {
  id: number;
  category: string;
  segment: string;
  metricKey: string;
  metricLabel: string;
  value: number;
  unit: string;
  sourceYear: number;
  sourceName: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
}

const UNIT_LABELS: Record<string, string> = {
  usd: "$",
  percent: "%",
  ratio: "×",
  years: "yr",
};

const CATEGORY_COLORS: Record<string, string> = {
  adr: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  occupancy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  revpar: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  cap_rate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  cost_rate: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  depreciation: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  insurance: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  management: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

function formatValue(value: number, unit: string): string {
  if (unit === "usd") return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (unit === "percent") return `${value}%`;
  if (unit === "ratio") return `${value}×`;
  if (unit === "years") return `${value} yr`;
  return String(value);
}

export default function HospitalityBenchmarksTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: benchmarks = [], isLoading, isError } = useQuery<Benchmark[]>({
    queryKey: ["/api/hospitality-benchmarks"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: number }) => {
      await apiRequest("PUT", `/api/admin/hospitality-benchmarks/${id}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hospitality-benchmarks"] });
      setEditingId(null);
      toast({ title: "Benchmark updated", description: "Value saved successfully." });
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update benchmark", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!search) return benchmarks;
    const q = search.toLowerCase();
    return benchmarks.filter(b =>
      b.metricLabel.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q) ||
      b.segment.toLowerCase().includes(q) ||
      (b.sourceName ?? "").toLowerCase().includes(q)
    );
  }, [benchmarks, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, Benchmark[]> = {};
    for (const b of filtered) {
      const key = b.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <IconAlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load benchmarks. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-benchmarks-tab">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {benchmarks.length} benchmarks across {new Set(benchmarks.map(b => b.category)).size} categories
          </p>
        </div>
        <Input
          placeholder="Search benchmarks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          data-testid="input-benchmark-search"
        />
      </div>

      {grouped.map(([category, items]) => (
        <Card key={category} className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <Badge variant="secondary" className={CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground"}>
                {category.replace(/_/g, " ")}
              </Badge>
              <span className="text-xs text-muted-foreground font-normal">{items.length} benchmarks</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {items.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-4 py-2.5 group"
                  data-testid={`benchmark-row-${b.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{b.metricLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.sourceName ?? "Unknown"} · {b.sourceYear} · {b.segment.replace(/_/g, " ")}
                      {b.country && ` · ${b.country}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {editingId === b.id ? (
                      <>
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-24 h-8 text-sm"
                          data-testid={`input-benchmark-value-${b.id}`}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const v = parseFloat(editValue);
                              if (!isNaN(v)) updateMutation.mutate({ id: b.id, value: v });
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">{UNIT_LABELS[b.unit] ?? b.unit}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={updateMutation.isPending}
                          onClick={() => {
                            const v = parseFloat(editValue);
                            if (!isNaN(v)) updateMutation.mutate({ id: b.id, value: v });
                          }}
                          data-testid={`button-save-benchmark-${b.id}`}
                        >
                          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <IconCheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-semibold tabular-nums text-foreground" data-testid={`text-benchmark-value-${b.id}`}>
                          {formatValue(b.value, b.unit)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setEditingId(b.id);
                            setEditValue(String(b.value));
                          }}
                          data-testid={`button-edit-benchmark-${b.id}`}
                        >
                          Edit
                        </Button>
                      </>
                    )}

                    {!b.isActive && (
                      <Badge variant="outline" className="text-[10px]">
                        <IconAlertTriangle className="w-3 h-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {search ? "No benchmarks match your search." : "No benchmarks configured yet."}
        </div>
      )}
    </div>
  );
}
