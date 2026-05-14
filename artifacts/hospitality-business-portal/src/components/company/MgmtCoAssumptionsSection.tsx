/**
 * MgmtCoAssumptionsSection — Read-only display of management_company_fees
 * and brand_fees rates for the Company Assumptions → Mgmt Co Assumptions tab.
 *
 * Company users see the current Tier A and per-flag rates that apply to their
 * properties. Admin users see a link to the Admin panel where rates can be
 * edited. Range-quality dots from assumption_guardrails flag out-of-range values.
 *
 * Reads from:
 *   GET /api/management-company-fees — Tier A fee rows
 *   GET /api/brands — all H+ brand flags
 *   GET /api/brand-fees/:brandSlug — per-flag fee rows
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { useAssumptionGuardrail } from "@/hooks/useAssumptionGuardrail";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface FeeRow {
  id: number;
  feeType: string;
  rate: number;
  label: string;
  sortOrder: number;
  sourceUrl: string | null;
}

interface BrandRow {
  id: number;
  name: string;
  slug: string;
  businessModel: string | null;
  segment: string | null;
  isActive: boolean;
  isDefault: boolean;
}

function guardrailKeyForMgmtFee(feeType: string): string {
  return `mgmt_co_fee.${feeType}`;
}

function guardrailKeyForBrandFee(feeType: string): string | null {
  const BRAND_GUARDRAIL_KEYS: Record<string, string> = {
    royalty:         "brand_fee.royalty",
    brand_marketing: "brand_fee.brand_marketing",
    loyalty:         "brand_fee.loyalty",
    reservation:     "brand_fee.reservation",
    brand_tech:      "brand_fee.brand_tech",
  };
  return BRAND_GUARDRAIL_KEYS[feeType] ?? null;
}

function RangeQualityDot({ guardrailKey, rate }: { guardrailKey: string | null; rate: number }) {
  const guardrail = useAssumptionGuardrail(guardrailKey);
  if (!guardrail) return null;
  const inRange = rate >= guardrail.low && rate <= guardrail.high;
  const nearRange =
    !inRange &&
    rate >= guardrail.low * 0.9 &&
    rate <= guardrail.high * 1.1;
  return (
    <span
      title={`Guardrail: ${(guardrail.low * 100).toFixed(1)}%–${(guardrail.high * 100).toFixed(1)}%`}
      className={cn(
        "inline-block w-2 h-2 rounded-full shrink-0",
        inRange
          ? "bg-emerald-500"
          : nearRange
            ? "bg-amber-400"
            : "bg-red-500",
      )}
      data-testid="fabio-range-quality-dot"
    />
  );
}

function FeeDisplayRow({ label, rate, guardrailKey, sourceUrl }: {
  label: string;
  rate: number;
  guardrailKey: string | null;
  sourceUrl: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <RangeQualityDot guardrailKey={guardrailKey} rate={rate} />
        </div>
        {sourceUrl && (
          <span className="text-xs text-muted-foreground truncate">{sourceUrl}</span>
        )}
      </div>
      <span className="text-sm font-mono shrink-0 text-foreground">
        {(rate * 100).toFixed(2)}%
      </span>
    </div>
  );
}

function BrandFeePanel({ brand }: { brand: BrandRow }) {
  const { data: feeRows, isLoading } = useQuery<FeeRow[]>({
    queryKey: ["/api/brand-fees", brand.slug],
    queryFn: async () => {
      const res = await fetch(`/api/brand-fees/${encodeURIComponent(brand.slug)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch brand fees");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading fee stack…
      </div>
    );
  }

  if (!feeRows || feeRows.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No fee rows for this brand flag.</p>;
  }

  return (
    <div>
      {feeRows.map((row) => (
        <FeeDisplayRow
          key={row.id}
          label={row.label}
          rate={row.rate}
          guardrailKey={guardrailKeyForBrandFee(row.feeType)}
          sourceUrl={row.sourceUrl}
        />
      ))}
    </div>
  );
}

export function MgmtCoAssumptionsSection() {
  const { isAdmin } = useAuth();

  const { data: mgmtRows, isLoading: mgmtLoading } = useQuery<FeeRow[]>({
    queryKey: ["/api/management-company-fees"],
    queryFn: async () => {
      const res = await fetch("/api/management-company-fees", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch management company fees");
      return res.json();
    },
  });

  const { data: brands, isLoading: brandsLoading } = useQuery<BrandRow[]>({
    queryKey: ["/api/brands"],
    queryFn: async () => {
      const res = await fetch("/api/brands", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
  });

  const [selectedBrandSlug, setSelectedBrandSlug] = useState<string | null>(null);

  const nonDefaultBrands = (brands ?? []).filter((b) => !b.isDefault);

  return (
    <div className="space-y-4">
      {/* Header with admin link */}
      {isAdmin && (
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            These rates are managed in Admin → Model Defaults → Mgmt Co Fees / Brands.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = "/admin?section=defaults-mgmt-co-fees";
            }}
            className="shrink-0 text-xs"
          >
            Edit in Admin
          </Button>
        </div>
      )}

      {/* Tier A — Management Company Fees */}
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Tier A — Management Fees</CardTitle>
          <p className="text-sm text-muted-foreground">
            Applied to all properties. Range dots compare against HVS 2024 survey guardrails.
          </p>
        </CardHeader>
        <CardContent>
          {mgmtLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
            </div>
          ) : mgmtRows && mgmtRows.length > 0 ? (
            <div>
              {mgmtRows.map((row) => (
                <FeeDisplayRow
                  key={row.id}
                  label={row.label}
                  rate={row.rate}
                  guardrailKey={guardrailKeyForMgmtFee(row.feeType)}
                  sourceUrl={row.sourceUrl}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No management fee rows found.</p>
          )}
        </CardContent>
      </Card>

      {/* Brand Fee Stacks */}
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Brand Fee Stacks</CardTitle>
          <p className="text-sm text-muted-foreground">
            Per-flag fee rates applied to properties assigned to each H+ brand flag.
          </p>
        </CardHeader>
        <CardContent>
          {brandsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {nonDefaultBrands.map((brand) => (
                  <button
                    key={brand.slug}
                    onClick={() => setSelectedBrandSlug(brand.slug === selectedBrandSlug ? null : brand.slug)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      selectedBrandSlug === brand.slug
                        ? "border-accent-pop bg-accent-pop/10 text-accent-pop"
                        : "border-border/60 bg-muted/30 text-foreground hover:border-border",
                    )}
                    data-testid={`brand-selector-${brand.slug}`}
                  >
                    <span className="font-medium">{brand.name}</span>
                    {brand.businessModel && (
                      <Badge variant="outline" className="text-xs capitalize">{brand.businessModel}</Badge>
                    )}
                    {!brand.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">inactive</Badge>
                    )}
                  </button>
                ))}
                {nonDefaultBrands.length === 0 && (
                  <p className="text-sm text-muted-foreground">No named brand flags configured.</p>
                )}
              </div>
              {selectedBrandSlug && (() => {
                const brand = nonDefaultBrands.find((b) => b.slug === selectedBrandSlug);
                if (!brand) return null;
                return (
                  <div className="border-t border-border/40 pt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold">{brand.name}</span>
                      {brand.segment && (
                        <Badge variant="outline" className="text-xs capitalize text-muted-foreground">{brand.segment}</Badge>
                      )}
                    </div>
                    <BrandFeePanel brand={brand} />
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
