import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AnalystActionButton } from "@/components/analyst";
import AnalystRefreshTheater from "@/components/admin/intelligence/AnalystRefreshTheater";
import { FreshnessBadge } from "@/components/admin/intelligence/knowledge-registry/FreshnessBadge";
import { Loader2 } from "@/components/icons/themed-icons";

interface CountryRow {
  id: number;
  countryCode: string;
  countryName: string;
  inflationRate: string | null;
  fxRateToUsd: string | null;
  gdpGrowthRate: string | null;
  interestRate: string | null;
  sourcedAt: string | null;
  sourceNotes: string | null;
  updatedAt: string;
}

function fmtPct(n: string | null | undefined): string {
  if (n == null) return "—";
  const v = parseFloat(n);
  return isNaN(v) ? "—" : `${v.toFixed(2)}%`;
}

function fmtFx(n: string | null | undefined): string {
  if (n == null) return "—";
  const v = parseFloat(n);
  return isNaN(v) ? "—" : v.toPrecision(4);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CountryEconomicDataPage() {
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rows, isLoading, isError } = useQuery<CountryRow[]>({
    queryKey: ["/api/admin/knowledge-registry/country-economic-data"],
    queryFn: async () => {
      const res = await fetch("/api/admin/knowledge-registry/country-economic-data", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load country economic data");
      return res.json() as Promise<CountryRow[]>;
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/knowledge-registry/country-economic-data/regenerate",
        {},
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry/country-economic-data"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry"] });
      toast({ title: "Country economic data refreshed" });
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      setRefreshing(false);
    },
  });

  function handleAnalystClick() {
    setRefreshing(true);
    regenerateMutation.mutate();
  }

  return (
    <>
      {refreshing && (
        <AnalystRefreshTheater
          tableLabel="Country Economic Data"
          onCancel={() => {
            setRefreshing(false);
            regenerateMutation.reset();
          }}
        />
      )}

      <div className="p-4 max-w-5xl space-y-4" data-testid="country-economic-data-page">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Country Economic Data</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Macro-economic indicators for the four primary H+ markets. Sourced from FRED, Frankfurter ECB, and World Bank.
            </p>
          </div>
          <AnalystActionButton
            onClick={handleAnalystClick}
            running={regenerateMutation.isPending}
            testIdSuffix="country-data"
            tooltipText="Refresh from FRED, Frankfurter, and World Bank"
          />
        </div>

        <Card>
          {isLoading && (
            <div className="flex items-center gap-2 py-8 px-4 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-accent-pop" />
              Loading…
            </div>
          )}

          {isError && (
            <p className="py-8 px-4 text-sm text-destructive">
              Failed to load country economic data.
            </p>
          )}

          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2.5 px-4 font-medium">Country</th>
                    <th className="text-right py-2.5 px-3 font-medium">Inflation</th>
                    <th className="text-right py-2.5 px-3 font-medium">FX / USD</th>
                    <th className="text-right py-2.5 px-3 font-medium">GDP Growth</th>
                    <th className="text-right py-2.5 px-3 font-medium">Interest</th>
                    <th className="text-right py-2.5 px-4 font-medium">Sourced</th>
                    <th className="text-right py-2.5 px-4 font-medium">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((row) => (
                    <tr
                      key={row.countryCode}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      data-testid={`country-row-${row.countryCode}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium">{row.countryName}</div>
                        <div className="text-xs font-mono text-muted-foreground">{row.countryCode}</div>
                      </td>
                      <td className="text-right py-3 px-3 tabular-nums">
                        {fmtPct(row.inflationRate)}
                      </td>
                      <td className="text-right py-3 px-3 tabular-nums">
                        {fmtFx(row.fxRateToUsd)}
                      </td>
                      <td className="text-right py-3 px-3 tabular-nums">
                        {fmtPct(row.gdpGrowthRate)}
                      </td>
                      <td className="text-right py-3 px-3 tabular-nums">
                        {fmtPct(row.interestRate)}
                      </td>
                      <td className="text-right py-3 px-4 text-xs text-muted-foreground">
                        {fmtDate(row.sourcedAt ?? row.updatedAt)}
                      </td>
                      <td className="text-right py-3 px-4">
                        <div className="flex justify-end">
                          <FreshnessBadge
                            lastRefreshedAt={row.sourcedAt ?? row.updatedAt}
                            liveCount={1}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(rows ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No country data available. Click Analyst to fetch initial data.
                </p>
              )}
            </div>
          )}
        </Card>

        {rows && rows.length > 0 && rows[0]?.sourceNotes && (
          <p className="text-xs text-muted-foreground px-1">
            Sources: {rows.map((r) => r.sourceNotes).filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </>
  );
}
