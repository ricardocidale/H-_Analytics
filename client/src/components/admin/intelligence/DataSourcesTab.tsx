import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { IconActivity, IconGlobe, IconResearch, IconBrain, IconSettingsGear } from "@/components/icons";

type SourceCategory = "apis" | "scrapers" | "sources" | "models";

interface DataSource {
  id: string;
  name: string;
  description: string;
  category: SourceCategory;
  status: "healthy" | "degraded" | "error" | "inactive";
  enabled: boolean;
  lastCall?: string;
  successRate?: number;
  avgLatency?: string;
  costPerCall?: string;
  dataProvided?: string[];
}

const CATEGORY_TABS: { value: SourceCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "apis", label: "APIs", icon: IconGlobe },
  { value: "scrapers", label: "Scrapers", icon: IconResearch },
  { value: "sources", label: "Sources", icon: IconActivity },
  { value: "models", label: "Models", icon: IconBrain },
];

const SEED_SOURCES: DataSource[] = [
  { id: "fred", name: "FRED API", description: "Federal Reserve Economic Data", category: "apis", status: "healthy", enabled: true, lastCall: "2h ago", successRate: 99.2, avgLatency: "340ms", costPerCall: "Free", dataProvided: ["SOFR", "CPI", "Treasury Yields", "GDP"] },
  { id: "xotelo", name: "Xotelo", description: "Hotel pricing and rate intelligence", category: "apis", status: "healthy", enabled: true, lastCall: "4h ago", successRate: 96.8, avgLatency: "1.2s", costPerCall: "$0.01", dataProvided: ["Hotel ADR", "Price Ranges", "Ratings"] },
  { id: "openexchange", name: "Open Exchange Rates", description: "Currency conversion rates", category: "apis", status: "healthy", enabled: true, lastCall: "1h ago", successRate: 99.9, avgLatency: "180ms", costPerCall: "Free", dataProvided: ["Exchange Rates", "Currency Data"] },
  { id: "weather", name: "Weather API", description: "Climate data for property locations", category: "apis", status: "inactive", enabled: false, successRate: 0, dataProvided: ["Climate Data", "Seasonal Patterns"] },

  { id: "airbnb", name: "Airbnb Scraper", description: "STR listings and pricing via Apify", category: "scrapers", status: "healthy", enabled: true, lastCall: "6h ago", successRate: 94.5, avgLatency: "8.2s", costPerCall: "$0.05", dataProvided: ["STR Pricing", "Occupancy", "Reviews"] },
  { id: "vrbo", name: "VRBO Scraper", description: "Vacation rental listings via Apify", category: "scrapers", status: "healthy", enabled: true, lastCall: "6h ago", successRate: 92.1, avgLatency: "9.5s", costPerCall: "$0.05", dataProvided: ["STR Pricing", "Availability"] },
  { id: "booking", name: "Booking.com Scraper", description: "Hotel listings and pricing", category: "scrapers", status: "degraded", enabled: true, lastCall: "12h ago", successRate: 87.3, avgLatency: "11.0s", costPerCall: "$0.05", dataProvided: ["Hotel Pricing", "Reviews"] },
  { id: "tripadvisor", name: "TripAdvisor Scraper", description: "Reviews and ratings", category: "scrapers", status: "inactive", enabled: false, dataProvided: ["Reviews", "Ratings", "Rankings"] },

  { id: "cbre", name: "CBRE Trends Report", description: "Hotel capital markets overview", category: "sources", status: "healthy", enabled: true, lastCall: "3d ago", dataProvided: ["Cap Rates", "Market Trends"] },
  { id: "hvs", name: "HVS Fee Survey", description: "Management fee benchmarks", category: "sources", status: "healthy", enabled: true, lastCall: "7d ago", dataProvided: ["Mgmt Fees", "Incentive Fees"] },
  { id: "pkf", name: "PKF Hospitality", description: "Industry financial benchmarks", category: "sources", status: "healthy", enabled: true, lastCall: "14d ago", dataProvided: ["USALI Benchmarks", "Expense Ratios"] },
  { id: "aahoa", name: "AAHOA Surveys", description: "Hotel owner association data", category: "sources", status: "inactive", enabled: false, dataProvided: ["Insurance Rates", "Property Tax"] },

  { id: "gpt4o", name: "GPT-4o", description: "OpenAI — general research and embeddings", category: "models", status: "healthy", enabled: true, lastCall: "5m ago", successRate: 99.8, avgLatency: "2.1s", costPerCall: "$0.005" },
  { id: "claude-sonnet", name: "Claude 3.5 Sonnet", description: "Anthropic — market strategy analysis", category: "models", status: "healthy", enabled: true, lastCall: "10m ago", successRate: 99.5, avgLatency: "3.4s", costPerCall: "$0.008" },
  { id: "gemini-flash", name: "Gemini Flash", description: "Google — fast quantitative analysis", category: "models", status: "healthy", enabled: true, lastCall: "15m ago", successRate: 98.9, avgLatency: "1.5s", costPerCall: "$0.002" },
];

function StatusBadge({ status }: { status: DataSource["status"] }) {
  const config = {
    healthy: { label: "Healthy", variant: "outline" as const, className: "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30" },
    degraded: { label: "Degraded", variant: "outline" as const, className: "border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30" },
    error: { label: "Error", variant: "outline" as const, className: "border-red-300 text-red-700 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-950/30" },
    inactive: { label: "Inactive", variant: "outline" as const, className: "border-gray-300 text-gray-500 bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:bg-gray-900/30" },
  };
  const c = config[status];
  return <Badge variant={c.variant} className={cn("text-[10px] px-1.5 py-0", c.className)}>{c.label}</Badge>;
}

function DataSourceCard({ source }: { source: DataSource }) {
  const [enabled, setEnabled] = useState(source.enabled);

  return (
    <Card
      data-testid={`data-source-card-${source.id}`}
      className={cn(
        "transition-all duration-200 hover:shadow-md",
        !enabled && "opacity-60"
      )}
    >
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-semibold text-foreground truncate">{source.name}</h4>
              <StatusBadge status={enabled ? source.status : "inactive"} />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{source.description}</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid={`toggle-${source.id}`}
            className="ml-2 shrink-0"
          />
        </div>

        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
              {source.lastCall && (
                <div>
                  <span className="text-muted-foreground">Last Call</span>
                  <p className="font-medium text-foreground">{source.lastCall}</p>
                </div>
              )}
              {source.successRate !== undefined && source.successRate > 0 && (
                <div>
                  <span className="text-muted-foreground">Success Rate</span>
                  <p className={cn(
                    "font-medium",
                    source.successRate >= 95 ? "text-emerald-600" : source.successRate >= 90 ? "text-amber-600" : "text-red-600"
                  )}>{source.successRate}%</p>
                </div>
              )}
              {source.avgLatency && (
                <div>
                  <span className="text-muted-foreground">Avg Latency</span>
                  <p className="font-medium text-foreground">{source.avgLatency}</p>
                </div>
              )}
              {source.costPerCall && (
                <div>
                  <span className="text-muted-foreground">Cost/Call</span>
                  <p className="font-medium text-foreground">{source.costPerCall}</p>
                </div>
              )}
            </div>

            {source.dataProvided && source.dataProvided.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {source.dataProvided.map((d) => (
                  <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{d}</Badge>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/60">
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`configure-${source.id}`}>
            <IconSettingsGear className="w-3 h-3 mr-1" />
            Configure
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`test-${source.id}`}>
            Test
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`logs-${source.id}`}>
            Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataSourcesTab() {
  const [activeCategory, setActiveCategory] = useState<SourceCategory>("apis");

  const filtered = SEED_SOURCES.filter((s) => s.category === activeCategory);
  const categoryCounts = SEED_SOURCES.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div data-testid="data-sources-tab">
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveCategory(tab.value)}
              data-testid={`datasource-tab-${tab.value}`}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeCategory === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{categoryCounts[tab.value] ?? 0}</Badge>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((source) => (
          <DataSourceCard key={source.id} source={source} />
        ))}

        <Card className="border-dashed border-2 border-border hover:border-primary/40 transition-colors cursor-pointer" data-testid="add-data-source">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <span className="text-lg text-muted-foreground">+</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Add {CATEGORY_TABS.find(t => t.value === activeCategory)?.label.slice(0, -1) ?? "Source"}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
