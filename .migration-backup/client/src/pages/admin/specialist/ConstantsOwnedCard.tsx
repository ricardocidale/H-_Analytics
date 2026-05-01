import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconDatabase } from "@/components/icons";

import { setAdminSection } from "@/lib/admin-nav";
import {
  type ApiResponse,
  type ConstantRow,
  ProvenanceBadge,
  ScopeChip,
  StaleBadge,
  formatWithUnit,
} from "@/components/admin/model-defaults/constants/_shared";
import { RefreshResearchPopover } from "@/components/admin/model-defaults/constants/RefreshResearchPopover";

const CONSTANTS_COUNTRY = "United States";
const CONSTANTS_SUBDIVISION: string | null = null;

interface ConstantsOwnedCardProps {
  specialistId: string;
  ownedKeys: string[];
}

export function ConstantsOwnedCard({ specialistId, ownedKeys }: ConstantsOwnedCardProps) {
  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["admin-model-constants", CONSTANTS_COUNTRY, CONSTANTS_SUBDIVISION],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/model-constants?country=${encodeURIComponent(CONSTANTS_COUNTRY)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load constants");
      return res.json();
    },
    enabled: ownedKeys.length > 0,
  });

  if (ownedKeys.length === 0) return null;

  if (isLoading) {
    return (
      <Card data-testid="card-constants-owned" data-specialist={specialistId}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconDatabase className="w-4 h-4" />
            Constants Owned
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3" data-testid="constants-owned-loading">
            {ownedKeys.map((key) => (
              <Skeleton key={key} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const ownedRows: ConstantRow[] = (data?.items ?? []).filter((r) => ownedKeys.includes(r.key));

  return (
    <Card data-testid="card-constants-owned" data-specialist={specialistId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconDatabase className="w-4 h-4" />
          Constants Owned
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          US-baseline values shown. Switch country or state in the Constants tab to see other localities.
        </p>
        <div className="space-y-3">
          {ownedRows.map((row) => (
            <div
              key={row.key}
              className="rounded-md border border-border/60 bg-muted/30 p-3 flex flex-col gap-2"
              data-testid={`constants-owned-row-${row.key}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" data-testid={`constants-owned-row-label-${row.key}`}>
                    {row.label}
                  </div>
                  {row.helperText && (
                    <div className="text-xs text-muted-foreground mt-0.5">{row.helperText}</div>
                  )}
                </div>
                <div
                  className="text-sm font-mono whitespace-nowrap"
                  data-testid={`constants-owned-row-value-${row.key}`}
                >
                  {formatWithUnit(row.effectiveValue, row.unit)}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <ProvenanceBadge source={row.source} />
                <ScopeChip scope={row.scope} />
                {row.isStale && (
                  <StaleBadge
                    lastRefreshedAt={row.lastRefreshedAt}
                    cadenceDays={row.refreshCadenceDays}
                    testId={`badge-stale-${row.key}`}
                  />
                )}
                <div className="ml-auto">
                  <RefreshResearchPopover
                    row={row}
                    country={CONSTANTS_COUNTRY}
                    subdivision={CONSTANTS_SUBDIVISION}
                  />
                </div>
              </div>
            </div>
          ))}
          {ownedRows.length === 0 && (
            <p className="text-xs text-muted-foreground" data-testid="constants-owned-empty">
              No matching constants found in the registry for this Specialist&apos;s owned keys.
            </p>
          )}
        </div>
        <a
          className="text-xs text-primary underline underline-offset-2"
          data-testid="link-constants-tab"
          href="/admin?section=constants"
          onClick={(e) => {
            e.preventDefault();
            setAdminSection("constants");
          }}
        >
          View all localities in Constants tab →
        </a>
      </CardContent>
    </Card>
  );
}
