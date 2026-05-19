/**
 * BrandsTab — Admin UI for editing brand_fees rows per H+ flag.
 *
 * Lists all business_brands. Admin selects a brand to drill into its fee rows.
 * Each fee row has an inline editable percentage input, a range-quality dot
 * from assumption_guardrails, and a per-row Save button.
 *
 * Reads from GET /api/admin/brands and GET /api/admin/brand-fees/:brandSlug.
 * Writes via PATCH /api/admin/brand-fees/:brandSlug/:feeType.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPencil, IconPlus } from "@/components/icons";
import { useAssumptionGuardrail } from "@/hooks/useAssumptionGuardrail";
import { cn } from "@/lib/utils";
import { BrandFormDialog } from "./BrandFormDialog";

interface BrandRow {
  id: number;
  name: string;
  slug: string;
  businessModel: string | null;
  segment: string | null;
  isActive: boolean;
  isDefault: boolean;
}

interface BrandFeeRow {
  id: number;
  brandSlug: string;
  feeType: string;
  rate: number;
  label: string;
  sortOrder: number;
  sourceUrl: string | null;
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

function FeeRangeQualityDot({ guardrailKey, rate }: { guardrailKey: string | null; rate: number }) {
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

function BrandFeeRowEditor({
  row,
  onSave,
  isPending,
}: {
  row: BrandFeeRow;
  onSave: (brandSlug: string, feeType: string, rate: number) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState<string>((row.rate * 100).toFixed(2));
  const guardrailKey = guardrailKeyForBrandFee(row.feeType);
  const draftNum = parseFloat(draft);
  const isDirty = !isNaN(draftNum) && Math.abs(draftNum / 100 - row.rate) > 1e-6;

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/60 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium text-foreground">{row.label}</Label>
          <FeeRangeQualityDot guardrailKey={guardrailKey} rate={draftNum / 100} />
        </div>
        {row.sourceUrl && (
          <span className="text-xs text-muted-foreground truncate">{row.sourceUrl}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative w-24">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="pr-6 text-right text-sm h-8 bg-card border-primary/30 text-foreground"
            data-testid={`brand-fee-input-${row.feeType}`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
        </div>
        <Button
          size="sm"
          variant={isDirty ? "default" : "outline"}
          disabled={!isDirty || isNaN(draftNum) || isPending}
          onClick={() => onSave(row.brandSlug, row.feeType, draftNum / 100)}
          className="h-8 px-3 text-xs"
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

function BrandFeesPanel({ brand }: { brand: BrandRow }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data: feeRows, isLoading } = useQuery<BrandFeeRow[]>({
    queryKey: ["/api/admin/brand-fees", brand.slug],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brand-fees/${encodeURIComponent(brand.slug)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch brand fees");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ brandSlug, feeType, rate }: { brandSlug: string; feeType: string; rate: number }) => {
      const res = await fetch(
        `/api/admin/brand-fees/${encodeURIComponent(brandSlug)}/${encodeURIComponent(feeType)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ rate }),
        },
      );
      if (!res.ok) throw new Error("Failed to update brand fee");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brand-fees", brand.slug] });
      toast({ title: "Brand fee updated", description: `${brand.name} fee rate saved.` });
      setSavingKey(null);
    },
    onError: (err) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setSavingKey(null);
    },
  });

  const handleSave = (brandSlug: string, feeType: string, rate: number) => {
    setSavingKey(`${brandSlug}/${feeType}`);
    updateMutation.mutate({ brandSlug, feeType, rate });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
      </div>
    );
  }

  if (!feeRows || feeRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No fee rows found for this brand flag.
      </p>
    );
  }

  return (
    <div>
      {feeRows.map((row) => (
        <BrandFeeRowEditor
          key={row.id}
          row={row}
          onSave={handleSave}
          isPending={
            savingKey === `${row.brandSlug}/${row.feeType}` && updateMutation.isPending
          }
        />
      ))}
    </div>
  );
}

export function BrandsTab() {
  const queryClient = useQueryClient();
  const { data: brands, isLoading } = useQuery<BrandRow[]>({
    queryKey: ["/api/admin/brands"],
    queryFn: async () => {
      const res = await fetch("/api/admin/brands", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
  });

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selectedBrand = brands?.find((b) => b.slug === selectedSlug) ?? null;

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BrandRow | undefined>(undefined);

  const openCreate = () => {
    setEditTarget(undefined);
    setFormDialogOpen(true);
  };

  const openEdit = (brand: BrandRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(brand);
    setFormDialogOpen(true);
  };

  const handleFormSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/admin/brands"] });
  };

  const nonDefaultBrands = (brands ?? []).filter((b) => !b.isDefault);

  return (
    <div className="space-y-4">
      {/* Brand selector */}
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">H+ Brand Flags</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Select a brand flag to view and edit its fee stack. Range-quality dots compare
                values against CBRE 2024 Franchise Fee Survey guardrails.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={openCreate}
              className="shrink-0"
              data-testid="button-new-brand"
            >
              <IconPlus className="w-3.5 h-3.5 mr-1.5" />
              New brand
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nonDefaultBrands.map((brand) => (
                <button
                  key={brand.slug}
                  onClick={() => setSelectedSlug(brand.slug === selectedSlug ? null : brand.slug)}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    selectedSlug === brand.slug
                      ? "border-accent-pop bg-accent-pop/10 text-accent-pop"
                      : "border-border/60 bg-muted/30 text-foreground hover:border-border",
                  )}
                  data-testid={`brand-selector-${brand.slug}`}
                >
                  <span className="font-medium">{brand.name}</span>
                  {brand.businessModel && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {brand.businessModel}
                    </Badge>
                  )}
                  {brand.segment && (
                    <Badge variant="outline" className="text-xs capitalize text-muted-foreground">
                      {brand.segment}
                    </Badge>
                  )}
                  {!brand.isActive && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">inactive</Badge>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => openEdit(brand, e)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openEdit(brand, e as unknown as React.MouseEvent); }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded p-0.5 hover:bg-accent-pop/10"
                    data-testid={`button-edit-brand-${brand.slug}`}
                    aria-label={`Edit ${brand.name}`}
                  >
                    <IconPencil className="w-3 h-3" />
                  </span>
                </button>
              ))}
              {nonDefaultBrands.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No named brand flags found. Ensure the startup migration has run.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected brand fee rows */}
      {selectedBrand && (
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">{selectedBrand.name}</CardTitle>
              {selectedBrand.businessModel && (
                <Badge variant="outline" className="text-xs capitalize">{selectedBrand.businessModel}</Badge>
              )}
              {selectedBrand.segment && (
                <Badge variant="outline" className="text-xs capitalize text-muted-foreground">{selectedBrand.segment}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Fee stack applied to properties assigned to the <strong>{selectedBrand.name}</strong> flag.
            </p>
          </CardHeader>
          <CardContent>
            <BrandFeesPanel brand={selectedBrand} />
          </CardContent>
        </Card>
      )}

      <BrandFormDialog
        mode={editTarget ? "edit" : "create"}
        brand={editTarget}
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
