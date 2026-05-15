/**
 * BenchmarkBandsTab.tsx — Editable admin view of the 24 market benchmark
 * band groups (compensation, revenue, overhead, property-defaults, company).
 *
 * Each row shows low / mid / high inputs bound to the current canonical
 * value from model_constants. Save upserts the canonical row so the change
 * takes effect in every Specialist watchdog without a code deploy.
 *
 * The Analyst button runs a non-destructive gap-fill seed — it fills any
 * missing rows with factory defaults but never overwrites manual edits.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";
import { AnalystActionButton } from "@/components/analyst";

type BandCategory = "compensation" | "revenue" | "overhead" | "property-defaults" | "company";

interface BandGroup {
  keyBase: string;
  label: string;
  category: BandCategory;
  unit: string;
  authority: string;
  low: number;
  mid: number;
  high: number;
  seeded: boolean;
}

interface ListResponse {
  groups: BandGroup[];
}

interface SaveResult {
  keyBase: string;
  low: number;
  mid: number;
  high: number;
}

interface SeedResult {
  filled: number;
  skipped: number;
}

const CATEGORY_LABELS: Record<BandCategory, string> = {
  compensation:      "Compensation",
  revenue:           "Revenue",
  overhead:          "Overhead",
  "property-defaults": "Property Defaults",
  company:           "Company",
};

const CATEGORY_COLORS: Record<BandCategory, string> = {
  compensation:        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  revenue:             "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  overhead:            "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "property-defaults": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  company:             "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

const UNIT_PREFIX: Record<string, string> = {
  usd: "$",
};
const UNIT_SUFFIX: Record<string, string> = {
  percent: "%",
  count:   "",
  usd:     "",
  ratio:   "×",
};

// HTML <input type="number" step="…"> precision per unit. Strings because
// the DOM attribute is string-typed; these are renderer/input calibrations,
// not business-model values.
const INPUT_STEP_USD = "1000";       // $1000 increment for dollar amounts
const INPUT_STEP_PERCENT = "0.001";  // 0.1% precision (= 10 bps)
const INPUT_STEP_DEFAULT = "1";

function formatValue(value: number, unit: string): string {
  const prefix = UNIT_PREFIX[unit] ?? "";
  const suffix = UNIT_SUFFIX[unit] ?? "";
  if (unit === "usd") {
    return `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  if (unit === "percent") {
    return `${(value * 100).toFixed(2)}%`;
  }
  return `${prefix}${value}${suffix}`;
}

function displayStep(unit: string): string {
  if (unit === "usd") return INPUT_STEP_USD;
  if (unit === "percent") return INPUT_STEP_PERCENT;
  return INPUT_STEP_DEFAULT;
}

function toInputValue(value: number, unit: string): string {
  if (unit === "percent") return String(+(value * 100).toFixed(4));
  return String(value);
}

function fromInputValue(raw: string, unit: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  if (unit === "percent") return n / 100;
  return n;
}

type EditState = { low: string; mid: string; high: string };

export default function BenchmarkBandsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ["/api/admin/benchmark-bands"],
  });

  const [edits, setEdits] = useState<Map<string, EditState>>(new Map());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [seedRunning, setSeedRunning] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async ({ keyBase, low, mid, high }: { keyBase: string; low: number; mid: number; high: number }) => {
      const res = await apiRequest("PUT", `/api/admin/benchmark-bands/${keyBase}`, { low, mid, high });
      return (await res.json()) as SaveResult;
    },
    onSuccess: (result) => {
      setSavingKey(null);
      setEdits((prev) => {
        const next = new Map(prev);
        next.delete(result.keyBase);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/benchmark-bands"] });
      toast({ title: "Band saved", description: "Values updated in model_constants." });
    },
    onError: (err: Error) => {
      setSavingKey(null);
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      setSeedRunning(true);
      const res = await apiRequest("POST", "/api/admin/benchmark-bands/seed", {});
      return (await res.json()) as SeedResult;
    },
    onSuccess: (result) => {
      setSeedRunning(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/benchmark-bands"] });
      toast({
        title: "Seed complete",
        description: `${result.filled} row${result.filled === 1 ? "" : "s"} filled, ${result.skipped} already present.`,
      });
    },
    onError: (err: Error) => {
      setSeedRunning(false);
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    },
  });

  function getEdit(keyBase: string, group: BandGroup): EditState {
    return edits.get(keyBase) ?? {
      low:  toInputValue(group.low,  group.unit),
      mid:  toInputValue(group.mid,  group.unit),
      high: toInputValue(group.high, group.unit),
    };
  }

  function setField(keyBase: string, group: BandGroup, field: "low" | "mid" | "high", value: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = getEdit(keyBase, group);
      next.set(keyBase, { ...current, [field]: value });
      return next;
    });
  }

  function isDirty(keyBase: string, group: BandGroup): boolean {
    const edit = edits.get(keyBase);
    if (!edit) return false;
    const orig = {
      low:  toInputValue(group.low,  group.unit),
      mid:  toInputValue(group.mid,  group.unit),
      high: toInputValue(group.high, group.unit),
    };
    return edit.low !== orig.low || edit.mid !== orig.mid || edit.high !== orig.high;
  }

  function handleSave(group: BandGroup) {
    const edit = getEdit(group.keyBase, group);
    const low  = fromInputValue(edit.low,  group.unit);
    const mid  = fromInputValue(edit.mid,  group.unit);
    const high = fromInputValue(edit.high, group.unit);
    setSavingKey(group.keyBase);
    saveMutation.mutate({ keyBase: group.keyBase, low, mid, high });
  }

  const grouped = useMemo(() => {
    const categoryOrder: BandCategory[] = [
      "compensation", "revenue", "overhead", "property-defaults", "company",
    ];
    const map = new Map<BandCategory, BandGroup[]>();
    for (const cat of categoryOrder) map.set(cat, []);
    for (const g of data?.groups ?? []) {
      map.get(g.category)?.push(g);
    }
    return categoryOrder.map((cat) => ({ category: cat, groups: map.get(cat) ?? [] }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-accent-pop" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <IconAlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load benchmark bands. Please try again later.</p>
      </div>
    );
  }

  const totalGroups = data?.groups.length ?? 0;
  const unseeded = data?.groups.filter((g) => !g.seeded).length ?? 0;

  return (
    <div className="space-y-4" data-testid="benchmark-bands-tab">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {totalGroups} band groups across 5 categories
            {unseeded > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · {unseeded} unseeded (factory defaults shown)
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edits write directly to the canonical model_constants table. Percentages are entered as whole numbers (e.g. 3 = 3%).
          </p>
        </div>
        <AnalystActionButton
          onClick={() => seedMutation.mutate()}
          running={seedRunning}
          testIdSuffix="benchmark-bands-seed"
          variant="header"
          tooltipText="Fill any missing benchmark rows with factory defaults (non-destructive — never overwrites values you have already saved)."
        />
      </div>

      {grouped.map(({ category, groups }) => {
        if (groups.length === 0) return null;
        return (
          <Card key={category} className="bg-card border-border" data-testid={`card-band-category-${category}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={CATEGORY_COLORS[category]}
                >
                  {CATEGORY_LABELS[category]}
                </Badge>
                <span className="text-xs text-muted-foreground font-normal">
                  {groups.length} band{groups.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_repeat(3,_6rem)_5.5rem] gap-2 pb-1 border-b border-border">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Metric</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-right">Low</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-right">Mid</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground text-right">High</span>
                  <span />
                </div>

                {groups.map((g) => {
                  const edit   = getEdit(g.keyBase, g);
                  const dirty  = isDirty(g.keyBase, g);
                  const saving = savingKey === g.keyBase && saveMutation.isPending;
                  const unitLabel = g.unit === "percent" ? "%" : g.unit === "usd" ? "USD" : g.unit;

                  return (
                    <div
                      key={g.keyBase}
                      className="grid grid-cols-[1fr_repeat(3,_6rem)_5.5rem] gap-2 items-center py-1.5 group"
                      data-testid={`band-row-${g.keyBase}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate leading-tight" title={g.label}>
                          {g.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate" title={g.authority}>
                          {unitLabel} · {g.authority}
                        </p>
                      </div>

                      {(["low", "mid", "high"] as const).map((field) => (
                        <div key={field} className="flex flex-col items-end gap-0.5">
                          <Input
                            type="number"
                            step={displayStep(g.unit)}
                            value={edit[field]}
                            onChange={(e) => setField(g.keyBase, g, field, e.target.value)}
                            className="h-7 text-xs text-right w-full tabular-nums"
                            aria-label={`${g.label} ${field}`}
                            data-testid={`input-${g.keyBase}-${field}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && dirty) handleSave(g);
                              if (e.key === "Escape") {
                                setEdits((prev) => {
                                  const next = new Map(prev);
                                  next.delete(g.keyBase);
                                  return next;
                                });
                              }
                            }}
                          />
                          {!edits.has(g.keyBase) && (
                            <span className="text-[9px] text-muted-foreground tabular-nums">
                              {formatValue(g[field], g.unit)}
                            </span>
                          )}
                        </div>
                      ))}

                      <div className="flex items-center justify-end gap-1">
                        {dirty ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px] text-muted-foreground"
                              onClick={() =>
                                setEdits((prev) => {
                                  const next = new Map(prev);
                                  next.delete(g.keyBase);
                                  return next;
                                })
                              }
                              data-testid={`button-cancel-${g.keyBase}`}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handleSave(g)}
                              disabled={saving}
                              data-testid={`button-save-${g.keyBase}`}
                            >
                              {saving ? (
                                <Loader2 className="w-3 h-3 animate-spin text-accent-pop" />
                              ) : (
                                "Save"
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setEdits((prev) => {
                                const next = new Map(prev);
                                next.set(g.keyBase, {
                                  low:  toInputValue(g.low,  g.unit),
                                  mid:  toInputValue(g.mid,  g.unit),
                                  high: toInputValue(g.high, g.unit),
                                });
                                return next;
                              });
                            }}
                            data-testid={`button-edit-${g.keyBase}`}
                          >
                            Edit
                          </Button>
                        )}

                        {!g.seeded && (
                          <IconAlertTriangle
                            className="w-3 h-3 text-amber-500 shrink-0"
                            aria-label="Factory default shown — not yet seeded"
                          />
                        )}
                        {g.seeded && (
                          <IconCheckCircle
                            className="w-3 h-3 text-emerald-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Seeded"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
