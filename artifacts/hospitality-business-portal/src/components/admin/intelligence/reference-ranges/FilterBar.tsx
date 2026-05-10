/**
 * FilterBar — top Card with header copy, action buttons (New Range,
 * Ask The Analyst), analyst status/error banners, filter selects
 * (domain, country, year), metric-key search input, show-archived
 * switch, and the Clear button.
 *
 * Extracted from `../ReferenceRangesTab.tsx` (task-1360). The markup is
 * byte-identical to the original; the only difference is that the state
 * and handlers are received as props from the page shell.
 */
import { IconPlus, IconSparkles } from "@/components/icons";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ANALYST_STEPS, ANY } from "./constants";
import type { FacetsResponse } from "./types";

type Props = {
  domain: string;
  country: string;
  year: string;
  metricSearch: string;
  showArchived: boolean;
  analystStep: number | null;
  analystError: string | null;
  analystBusy: boolean;
  hasActiveFilter: boolean;
  facets: FacetsResponse | undefined;
  setDomain: (v: string) => void;
  setCountry: (v: string) => void;
  setYear: (v: string) => void;
  setMetricSearch: (v: string) => void;
  setShowArchived: (v: boolean) => void;
  onOpenCreate: () => void;
  onAskAnalyst: () => void;
  onClearFilters: () => void;
};

export function FilterBar({
  domain,
  country,
  year,
  metricSearch,
  showArchived,
  analystStep,
  analystError,
  analystBusy,
  hasActiveFilter,
  facets,
  setDomain,
  setCountry,
  setYear,
  setMetricSearch,
  setShowArchived,
  onOpenCreate,
  onAskAnalyst,
  onClearFilters,
}: Props) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Reference Ranges</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Admin-editable low / mid / high reference ranges (tax tables, macro indicators,
              hospitality KPIs, construction costs, financing terms, labor rates, risk premia,
              demand metrics).
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenCreate}
                data-testid="button-new-range"
              >
                <IconPlus className="h-3.5 w-3.5 mr-1.5" />
                New Range
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={onAskAnalyst}
                disabled={analystStep !== null}
                data-testid="button-ask-analyst"
              >
                <IconSparkles className="h-3.5 w-3.5 mr-1.5" />
                Ask The Analyst
              </Button>
            </div>
            {facets && (
              <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                <div data-testid="text-totals-active">
                  <span className="font-medium text-foreground">{facets.totalActive}</span> active
                </div>
                <div data-testid="text-totals-archived">
                  <span className="font-medium text-foreground">{facets.totalArchived}</span> archived
                </div>
              </div>
            )}
          </div>
        </div>

        {analystStep !== null && (
          <div
            className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
            data-testid="status-analyst-step"
            role="status"
            aria-live="polite"
          >
            <IconSparkles
              className={`h-3.5 w-3.5 text-primary ${analystBusy ? "animate-pulse" : ""}`}
            />
            <span data-testid={`text-analyst-step-${analystStep}`}>
              {ANALYST_STEPS[analystStep]}
            </span>
          </div>
        )}

        {analystError !== null && analystStep === null && (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
            data-testid="status-analyst-error"
            role="status"
            aria-live="polite"
          >
            <IconSparkles className="h-3.5 w-3.5 text-amber-500" />
            <span data-testid="text-analyst-error">{analystError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger className="w-44" data-testid="select-domain">
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All domains</SelectItem>
              {(facets?.domains ?? []).map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.value} ({d.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-44" data-testid="select-country">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All countries</SelectItem>
              {(facets?.countries ?? []).map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.value} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-32" data-testid="select-year">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All years</SelectItem>
              {(facets?.years ?? []).map((y) => (
                <SelectItem key={y.value} value={String(y.value)}>
                  {y.value === 0 ? "Evergreen" : y.value} ({y.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="search"
            placeholder="Filter by metric key…"
            value={metricSearch}
            onChange={(e) => setMetricSearch(e.target.value)}
            className="w-64"
            data-testid="input-metric-search"
          />

          <div className="flex items-center gap-2 ml-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
              data-testid="switch-show-archived"
            />
            <Label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">
              Show archived
            </Label>
          </div>

          {hasActiveFilter && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearFilters}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
