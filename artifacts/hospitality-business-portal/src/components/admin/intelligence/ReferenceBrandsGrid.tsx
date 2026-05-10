/**
 * ReferenceBrandsGrid.tsx — Renders brand detail cards for the Reference Brands
 * analyst table. Each card shows brand name, niche badge, key metrics (ADR,
 * occupancy, RevPAR), property count, geographic focus, and a collapsible
 * description. Used in AnalystTables.tsx in place of the generic range-grid
 * for the reference_brands table.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type BrandSummary = {
  id: number;
  brandName: string;
  niche: string | null;
  adrUsd: number | null;
  occupancyPct: number | null;
  revparUsd: number | null;
  propertyCount: number | null;
  geographicFocus: string | null;
  description: string | null;
};

function fmt(value: number | null, prefix = "", suffix = ""): string {
  if (value == null) return "—";
  return `${prefix}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}${suffix}`;
}

function fmtPct(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center bg-muted/50 rounded px-3 py-1.5 min-w-[60px]">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium leading-none mb-0.5">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function BrandCard({ brand }: { brand: BrandSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border rounded-lg p-3 flex flex-col gap-2 bg-card"
      data-testid={`brand-card-${brand.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className="text-sm font-semibold leading-tight"
            data-testid={`brand-card-name-${brand.id}`}
          >
            {brand.brandName}
          </div>
          {brand.geographicFocus && (
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
              {brand.geographicFocus}
            </div>
          )}
        </div>
        {brand.niche && (
          <span
            className="shrink-0 text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 bg-indigo-500/10 text-indigo-700 border-indigo-500/25 whitespace-nowrap"
            data-testid={`brand-card-niche-${brand.id}`}
          >
            {brand.niche}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <MetricChip label="ADR" value={fmt(brand.adrUsd, "$")} />
        <MetricChip label="Occ" value={fmtPct(brand.occupancyPct)} />
        <MetricChip label="RevPAR" value={fmt(brand.revparUsd, "$")} />
        {brand.propertyCount != null && (
          <MetricChip label="Props" value={String(brand.propertyCount)} />
        )}
      </div>

      {brand.description && (
        <div className="text-xs text-muted-foreground">
          {expanded ? (
            <>
              <span>{brand.description}</span>{" "}
              <Button
                variant="ghost"
                size="sm"
                className="text-primary underline underline-offset-2 h-auto p-0 text-xs inline"
                onClick={() => setExpanded(false)}
                data-testid={`brand-card-collapse-${brand.id}`}
              >
                less
              </Button>
            </>
          ) : (
            <>
              <span className="line-clamp-2">{brand.description}</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary underline underline-offset-2 h-auto p-0 text-xs mt-0.5 block"
                onClick={() => setExpanded(true)}
                data-testid={`brand-card-expand-${brand.id}`}
              >
                more
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  brands: BrandSummary[];
};

export default function ReferenceBrandsGrid({ brands }: Props) {
  if (brands.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic" data-testid="reference-brands-empty">
        No reference brands loaded yet. Run the Analyst to populate.
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
      data-testid="reference-brands-grid"
    >
      {brands.map(b => (
        <BrandCard key={b.id} brand={b} />
      ))}
    </div>
  );
}
