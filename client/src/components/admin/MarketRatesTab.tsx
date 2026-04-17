/**
 * MarketRatesTab.tsx — Live market rate monitoring and admin overrides.
 *
 * Shows all tracked rates with:
 *   - Current value, source, and last fetch timestamp
 *   - Color-coded freshness (green/yellow/red based on staleness %)
 *   - Per-rate refresh and manual override
 *   - Bulk refresh all stale rates
 */
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconRefreshCw, IconSave, IconClock, IconAlertTriangle, IconCheckCircle2, IconXCircle, IconTrending, IconPencil } from "@/components/icons";
import {
  useMarketRates,
  useRefreshRate,
  useRefreshAllRates,
  useOverrideRate,
  type MarketRateResponse,
} from "@/lib/api/market-rates";

function statusIcon(status: MarketRateResponse["status"]) {
  switch (status) {
    case "fresh": return <IconCheckCircle2 className="w-4 h-4 text-primary" />;
    case "warning": return <IconClock className="w-4 h-4 text-accent-pop" />;
    case "stale": return <IconAlertTriangle className="w-4 h-4 text-destructive" />;
    case "missing": return <IconXCircle className="w-4 h-4 text-muted-foreground" />;
  }
}

function statusBadge(status: MarketRateResponse["status"]) {
  const styles: Record<string, string> = {
    fresh: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-accent-pop/10 text-accent-pop border-accent-pop/20",
    stale: "bg-destructive/10 text-destructive border-destructive/20",
    missing: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={`${styles[status]} text-xs`}>
      {status}
    </Badge>
  );
}

function formatAge(fetchedAt: string | null): string {
  if (!fetchedAt) return "Never";
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  const mins = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${mins}m ago`;
  return `${mins}m ago`;
}

function sourceLabel(source: string): string {
  switch (source) {
    case "fred": return "FRED";
    case "frankfurter": return "Frankfurter";
    case "admin_manual": return "Manual";
    default: return source;
  }
}

export default function MarketRatesTab() {
  const { toast } = useToast();
  const { data: rates, isLoading } = useMarketRates();
  const refreshRate = useRefreshRate();
  const refreshAll = useRefreshAllRates();
  const overrideRate = useOverrideRate();

  const [overrideDialog, setOverrideDialog] = useState<MarketRateResponse | null>(null);
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideNote, setOverrideNote] = useState("");

  const handleRefreshAll = () => {
    refreshAll.mutate(undefined, {
      onSuccess: (data) => toast({ title: "Rates refreshed", description: `${data.refreshed} rates updated` }),
      onError: (err) => toast({ title: "Refresh failed", description: err.message, variant: "destructive" }),
    });
  };

  const handleRefreshOne = (rateKey: string) => {
    refreshRate.mutate(rateKey, {
      onSuccess: () => toast({ title: "Rate refreshed" }),
      onError: (err) => toast({ title: "Refresh failed", description: err.message, variant: "destructive" }),
    });
  };

  const openOverride = (rate: MarketRateResponse) => {
    setOverrideDialog(rate);
    setOverrideValue(rate.value != null ? String(rate.value) : "");
    setOverrideNote("");
  };

  const handleOverride = () => {
    if (!overrideDialog) return;
    const val = parseFloat(overrideValue);
    if (isNaN(val)) {
      toast({ title: "Invalid value", variant: "destructive" });
      return;
    }
    overrideRate.mutate(
      { rateKey: overrideDialog.rateKey, value: val, manualNote: overrideNote || undefined },
      {
        onSuccess: () => {
          toast({ title: "Rate overridden" });
          setOverrideDialog(null);
        },
        onError: (err) => toast({ title: "Override failed", description: err.message, variant: "destructive" }),
      },
    );
  };

  // Group rates by source
  const grouped = (rates ?? []).reduce<Record<string, MarketRateResponse[]>>((acc, r) => {
    const key = r.source;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const freshCount = (rates ?? []).filter((r) => r.status === "fresh").length;
  const staleCount = (rates ?? []).filter((r) => r.status === "stale").length;
  const warningCount = (rates ?? []).filter((r) => r.status === "warning").length;
  const missingCount = (rates ?? []).filter((r) => r.status === "missing").length;

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card className="bg-card border border-border/80">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-chart-1 to-chart-1 flex items-center justify-center">
              <IconTrending className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">Live Market Rates</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {rates?.length ?? 0} rates tracked from FRED, Frankfurter, and manual sources
              </p>
            </div>
          </div>
          <Button
            onClick={handleRefreshAll}
            disabled={refreshAll.isPending}
            size="sm"
            className="gap-2"
          >
            {refreshAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconRefreshCw className="w-4 h-4" />}
            Refresh All
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <IconCheckCircle2 className="w-4 h-4 text-primary" />
              <span className="font-medium">{freshCount}</span>
              <span className="text-muted-foreground">fresh</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <IconClock className="w-4 h-4 text-accent-pop" />
              <span className="font-medium">{warningCount}</span>
              <span className="text-muted-foreground">warning</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <IconAlertTriangle className="w-4 h-4 text-destructive" />
              <span className="font-medium">{staleCount}</span>
              <span className="text-muted-foreground">stale</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <IconXCircle className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{missingCount}</span>
              <span className="text-muted-foreground">missing</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Rate Groups */}
      {Object.entries(grouped).map(([source, sourceRates]) => (
        <Card key={source} className="bg-card border border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {sourceLabel(source)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sourceRates.map((rate) => (
                <div
                  key={rate.rateKey}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted border border-border/60 hover:bg-muted transition-colors"
                  data-testid={`rate-card-${rate.rateKey}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {statusIcon(rate.status)}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{rate.displayValue ?? rate.rateKey}</span>
                        {statusBadge(rate.status)}
                        {rate.isManual && (
                          <Badge variant="outline" className="text-xs bg-chart-3/10 text-chart-3 border-chart-3/20">
                            manual
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <code className="bg-muted px-1 rounded">{rate.rateKey}</code>
                        <span>·</span>
                        <span>{formatAge(rate.fetchedAt)}</span>
                        {rate.stalePct > 0 && (
                          <>
                            <span>·</span>
                            <span className={rate.stalePct >= 100 ? "text-destructive" : rate.stalePct >= 75 ? "text-accent-pop" : ""}>
                              {rate.stalePct}% of threshold
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm font-semibold">
                      {rate.value != null ? rate.value : "—"}
                    </span>
                    <div className="flex gap-1">
                      {source !== "admin_manual" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleRefreshOne(rate.rateKey)}
                              disabled={refreshRate.isPending}
                            >
                              <IconRefreshCw className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh this rate</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openOverride(rate)}
                          >
                            <IconPencil className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Manual override</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Override Dialog */}
      <Dialog open={!!overrideDialog} onOpenChange={(open) => !open && setOverrideDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override: {overrideDialog?.rateKey}</DialogTitle>
            <DialogDescription>
              Set a manual value. This overrides the API-fetched value until the next automatic refresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Value</Label>
              <Input
                type="number"
                step="any"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="e.g., 5.33"
              />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="e.g., Updated per FOMC announcement"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialog(null)}>Cancel</Button>
            <Button onClick={handleOverride} disabled={overrideRate.isPending} className="gap-2">
              {overrideRate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
