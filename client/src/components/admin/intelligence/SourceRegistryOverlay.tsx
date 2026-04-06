import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconGlobe, IconShieldCheck, IconAlertTriangle, IconActivity,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface SourceRegistryEntry {
  id: number;
  serviceKey: string;
  name: string;
  sourceType: string;
  trustScore: string | null;
  category: string;
  cadence: string | null;
  lastHealthCheck: string | null;
  lastDataDate: string | null;
  isActive: boolean;
}

const TRUST_COLORS: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  verified:   { dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", label: "Verified" },
  estimated:  { dot: "bg-amber-500",   bg: "bg-amber-500/10",   text: "text-amber-700 dark:text-amber-400",     label: "Estimated" },
  unverified: { dot: "bg-red-500",     bg: "bg-red-500/10",     text: "text-red-700 dark:text-red-400",         label: "Unverified" },
};

const TYPE_LABELS: Record<string, string> = {
  api: "API",
  scraper: "Scraper",
  file: "File",
  url: "URL",
  internal: "Internal",
  manual: "Manual",
};

const CATEGORY_LABELS: Record<string, string> = {
  macro: "Macro",
  hospitality: "Hospitality",
  real_estate: "Real Estate",
  risk: "Risk",
  search: "Search",
  custom: "Custom",
};

function formatTimestamp(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "< 1h ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export default function SourceRegistryOverlay() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sources, isLoading, isError, refetch } = useQuery<SourceRegistryEntry[]>({
    queryKey: ["/api/admin/source-registry"],
    queryFn: async () => {
      const res = await fetch("/api/admin/source-registry");
      if (!res.ok) throw new Error("Failed to load source registry");
      return res.json();
    },
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ serviceKey, isActive }: { serviceKey: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/admin/source-registry/${serviceKey}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/source-registry"] });
      toast({ title: "Source updated" });
    },
    onError: () => { toast({ title: "Failed to update source", variant: "destructive" }); },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="source-registry-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12" data-testid="source-registry-error">
        <IconAlertTriangle className="w-8 h-8 mx-auto mb-3 text-red-500 opacity-60" />
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">Failed to load source registry.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-sources">
          Retry
        </Button>
      </div>
    );
  }

  const activeSources = sources?.filter(s => s.isActive) ?? [];
  const inactiveSources = sources?.filter(s => !s.isActive) ?? [];
  const verifiedCount = sources?.filter(s => s.trustScore === "verified").length ?? 0;
  const estimatedCount = sources?.filter(s => s.trustScore === "estimated").length ?? 0;
  const unverifiedCount = sources?.filter(s => s.trustScore === "unverified").length ?? 0;

  const categories = Array.from(new Set(sources?.map(s => s.category) ?? [])).sort();

  return (
    <div className="space-y-6" data-testid="source-registry-panel">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <IconGlobe className="w-3.5 h-3.5" />
          <span>{sources?.length ?? 0} registered sources</span>
        </div>
        <div className="flex items-center gap-2">
          {verifiedCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {verifiedCount} verified
            </Badge>
          )}
          {estimatedCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {estimatedCount} estimated
            </Badge>
          )}
          {unverifiedCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {unverifiedCount} unverified
            </Badge>
          )}
        </div>
      </div>

      {(!sources || sources.length === 0) && (
        <div className="text-center py-12 text-muted-foreground" data-testid="source-registry-empty">
          <IconGlobe className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No sources registered yet.</p>
          <p className="text-xs mt-1">Sources are automatically registered when research integrations are configured.</p>
        </div>
      )}

      {categories.map(cat => {
        const catSources = sources?.filter(s => s.category === cat) ?? [];
        if (catSources.length === 0) return null;
        return (
          <div key={cat} className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {CATEGORY_LABELS[cat] ?? cat}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {catSources.map(source => {
                const trust = TRUST_COLORS[source.trustScore ?? "unverified"] ?? TRUST_COLORS.unverified;
                return (
                  <Card
                    key={source.id}
                    className={cn(
                      "transition-all",
                      !source.isActive && "opacity-50"
                    )}
                    data-testid={`card-source-${source.serviceKey}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", source.isActive ? trust.dot : "bg-muted-foreground/30")} />
                            <h5 className="text-sm font-medium truncate">{source.name}</h5>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 ml-4">{source.serviceKey}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] shrink-0"
                          onClick={() => toggleMutation.mutate({ serviceKey: source.serviceKey, isActive: !source.isActive })}
                          disabled={toggleMutation.isPending}
                          data-testid={`button-toggle-${source.serviceKey}`}
                        >
                          {source.isActive ? "Disable" : "Enable"}
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px]", trust.text, trust.bg)}>
                          {trust.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABELS[source.sourceType] ?? source.sourceType}
                        </Badge>
                        {source.cadence && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {source.cadence}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                        <span className="flex items-center gap-1">
                          <IconActivity className="w-3 h-3" />
                          Last check: {formatTimestamp(source.lastHealthCheck)}
                        </span>
                        {source.lastDataDate && (
                          <span className="flex items-center gap-1" data-testid={`text-last-data-${source.serviceKey}`}>
                            Last data: {formatTimestamp(source.lastDataDate)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {inactiveSources.length > 0 && activeSources.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {inactiveSources.length} source{inactiveSources.length !== 1 ? "s" : ""} disabled
        </p>
      )}
    </div>
  );
}
