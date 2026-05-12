/**
 * BasicInfoSection.tsx — Property identity, acquisition facts, and improvement hypothesis.
 *
 * Three visually distinct subsections within one card:
 *   Basic        — identity + operational fields: name, address, market, market tier, year built,
 *                  acreage, status, room count, star rating, type, model, VRBO pricing,
 *                  quality/service/location classification
 *   As Purchased — physical capacity/size fields that have As-Improved counterparts + description:
 *                  F&B venues, F&B seats, event space sqft, building sqft, last renovated,
 *                  description_purchased
 *   As Improved  — post-renovation hypothesis for each As-Purchased capacity field + description
 *
 * Task #1404 — Milestone A: UI-only restructure. Description is now inline here;
 * the standalone DescriptionSection component is deprecated.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { PROPERTY_STATUS_VALUES, DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE, PLATFORM_FEE_RATES } from "@shared/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CityCombobox } from "@/components/ui/city-combobox";
import AddressAutocomplete, { type PlaceDetails } from "@/components/AddressAutocomplete";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGeoSelect, GEO_CLEAR_VALUE } from "@/hooks/use-geo";
import StarRatingInput from "@/components/research/StarRatingInput";
import PropertyTypeSelector, { BusinessModelSelector } from "@/components/research/PropertyTypeSelector";
import { Loader2, X } from "@/components/icons/themed-icons";
import { IconWand2, IconCheck, IconPencil } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import type { PropertyEditSectionProps } from "./types";
import { cn } from "@/lib/utils";

// ── Small helpers ────────────────────────────────────────────────────────────

function AutoFillBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full animate-in fade-in slide-in-from-left-1 duration-300">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2.5 4L3.5 5L5.5 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
      auto-filled
    </span>
  );
}

/** Subsection header — title + muted subtitle, with a left-accent rule. */
function SubsectionHeader({ title, subtitle, className }: { title: string; subtitle: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 mb-5", className)}>
      <div className="w-0.5 h-8 rounded-full bg-primary/40 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-foreground label-text">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ── As-Purchased description field (inline, replaces DescriptionSection) ─────

interface DescriptionFieldProps {
  draft: PropertyEditSectionProps["draft"];
  onChange: PropertyEditSectionProps["onChange"];
}

function AsPurchasedDescriptionField({ draft, onChange }: DescriptionFieldProps) {
  const [isRewriting, setIsRewriting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // Use descriptionPurchased as the primary field; fall back to legacy description for seeding
  const currentValue = draft.descriptionPurchased ?? draft.description ?? "";
  const [isEditing, setIsEditing] = useState(!currentValue);
  const { toast } = useToast();

  // Dual-write: keeps legacy `description` in sync so all existing consumers
  // (ICP analysis, Rebecca, slide factory, report export) continue to read current text.
  const onDescChange = useCallback((value: string | null) => {
    onChange("descriptionPurchased", value);
    onChange("description", value);
  }, [onChange]);

  const hasSavedDescription = !!currentValue.trim();

  const handleAIRewrite = async () => {
    const text = currentValue.trim();
    if (!text) {
      toast({ title: "Nothing to improve", description: "Please write a description first.", variant: "destructive" });
      return;
    }
    setIsRewriting(true);
    try {
      const res = await fetch(`/api/properties/${draft.id}/rewrite-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Rewrite failed");
      const data = await res.json();
      if (data.rewritten) setPreview(data.rewritten);
    } catch {
      toast({ title: "Error", description: "Failed to rewrite description. Please try again.", variant: "destructive" });
    } finally {
      setIsRewriting(false);
    }
  };

  const acceptRewrite = () => {
    if (preview) {
      onDescChange(preview);
      toast({ title: "Description improved", description: "AI rewrite has been applied." });
    }
    setPreview(null);
  };

  return (
    <>
      <div className="sm:col-span-2 space-y-2">
        <Label className="label-text text-foreground flex items-center gap-1.5">
          Description
          <InfoTooltip text="A narrative description of the property as acquired. Used in reports, exports, and as context for AI research. Describe the property's unique features, target market, and investment appeal." />
        </Label>

        {hasSavedDescription && !isEditing ? (
          <div className="space-y-2">
            <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="card-saved-description">
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-saved-description">
                {currentValue}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              data-testid="button-edit-description"
            >
              <IconPencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={currentValue}
              onChange={(e) => onDescChange(e.target.value || null)}
              placeholder="Describe this property — its setting, unique features, target guests, and what makes it an attractive investment..."
              className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground min-h-[100px] resize-y"
              data-testid="input-property-description"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAIRewrite}
                disabled={isRewriting || !currentValue.trim()}
                data-testid="button-ai-rewrite-description"
              >
                {isRewriting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop mr-1.5" />
                ) : (
                  <IconWand2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                {isRewriting ? "Rewriting..." : "Improve with AI"}
              </Button>
              {currentValue.trim() && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDescChange(null)}
                    className="text-muted-foreground"
                    data-testid="button-clear-description"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Clear
                  </Button>
                  {isEditing && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                      className="text-muted-foreground"
                      data-testid="button-done-editing-description"
                    >
                      Done
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI Rewrite Preview</DialogTitle>
            <DialogDescription>
              Review the improved description below. Accept to apply it, or dismiss to keep your original.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 label-text">Original</p>
              <div className="text-sm text-foreground/70 bg-muted/50 rounded-md p-3 max-h-[120px] overflow-y-auto whitespace-pre-wrap" data-testid="text-original-description">
                {currentValue.trim()}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-primary mb-1.5 label-text">Improved</p>
              <div className="text-sm text-foreground bg-primary/5 border border-primary/15 rounded-md p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap" data-testid="text-rewritten-description">
                {preview}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreview(null)} data-testid="button-dismiss-rewrite">
              Dismiss
            </Button>
            <Button size="sm" onClick={acceptRewrite} data-testid="button-accept-rewrite">
              <IconCheck className="w-3.5 h-3.5 mr-1.5" />
              Accept Rewrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function BasicInfoSection({ draft, onChange, onNumberChange }: PropertyEditSectionProps) {
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const autoFillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
    };
  }, []);

  const markAutoFilled = useCallback((fields: string[]) => {
    setAutoFilledFields(new Set(fields));
    if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
    autoFillTimerRef.current = setTimeout(() => setAutoFilledFields(new Set()), 6000);
  }, []);

  const geo = useGeoSelect({
    countryName: draft.country || "",
    stateName: draft.stateProvince || "",
    onCountryChange: (v) => onChange("country", v || null),
    onStateChange: (v) => onChange("stateProvince", v || null),
    onCityChange: (v) => onChange("city", v || null),
  });

  const handlePlaceSelect = useCallback((details: PlaceDetails) => {
    const filled: string[] = [];

    const fillIfEmpty = (key: string, value: string | number | null) => {
      const current = (draft as unknown as Record<string, unknown>)[key];
      if (!current || (typeof current === "string" && current.trim() === "")) {
        onChange(key, value);
        filled.push(key);
      }
    };

    const resolvedStreet = details.streetAddress || details.formattedAddress || null;
    if (resolvedStreet) {
      onChange("streetAddress", resolvedStreet);
      filled.push("streetAddress");
    }

    if (details.city) fillIfEmpty("city", details.city);
    if (details.stateProvince) fillIfEmpty("stateProvince", details.stateProvince);
    if (details.zipPostalCode) fillIfEmpty("zipPostalCode", details.zipPostalCode);
    if (details.country) fillIfEmpty("country", details.country);

    if (details.city || details.stateProvince) {
      const location = [details.city, details.stateProvince].filter(Boolean).join(", ");
      fillIfEmpty("location", location);
    }

    if (details.lat !== undefined && details.lng !== undefined) {
      onChange("latitude", details.lat);
      onChange("longitude", details.lng);
      filled.push("latitude", "longitude");

      if (draft.id) {
        fetch(`/api/properties/${draft.id}/coords`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ latitude: details.lat, longitude: details.lng }),
        }).catch(() => { /* ignore: coord patch is best-effort after geocode */ });
      }
    }

    if (filled.length > 0) markAutoFilled(filled);
  }, [onChange, markAutoFilled, draft]);

  const isAutoFilled = (field: string) => autoFilledFields.has(field);
  const countryIso = geo.countryCode || undefined;
  const stateForBias = draft.stateProvince || undefined;

  // Effective As-Purchased description for placeholder in As-Improved
  const purchasedDescriptionForPlaceholder = (draft.descriptionPurchased ?? draft.description ?? "").slice(0, 120);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6">

        {/* ── BASIC ──────────────────────────────────────────────────────────
            Immutable identity fields only: name, location, market, address,
            market tier, year built, total acreage.
        ──────────────────────────────────────────────────────────────────── */}
        <SubsectionHeader title="Basic" subtitle="Property identification and location" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Property Name<InfoTooltip text="Internal name used to identify this property across the portfolio. Appears in dashboards, reports, and financial statements." /></Label>
            <Input value={draft.name} onChange={(e) => onChange("name", e.target.value)} className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">
              Location
              {isAutoFilled("location") && <AutoFillBadge />}
              <InfoTooltip text="City and state/region of the property. Used for market research to find comparable properties and local hospitality benchmarks." />
            </Label>
            <Input value={draft.location} onChange={(e) => onChange("location", e.target.value)} className={cn("bg-card border-primary/30 text-foreground placeholder:text-muted-foreground", isAutoFilled("location") && "ring-1 ring-emerald-400/50")} />
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Market<InfoTooltip text="The broader market or MSA (Metropolitan Statistical Area) this property operates in. Drives market research, comp set analysis, and regional benchmarks." /></Label>
            <Input value={draft.market} onChange={(e) => onChange("market", e.target.value)} className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground" />
          </div>

          <div className="sm:col-span-2 border border-primary/20 rounded-xl p-4 space-y-4">
            <p className="text-sm font-medium text-foreground label-text">Address Details <span className="text-muted-foreground font-normal">(optional — type to search)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label className="label-text text-muted-foreground text-sm flex items-center gap-1.5">
                  Street Address
                  {isAutoFilled("streetAddress") && <AutoFillBadge />}
                </Label>
                <AddressAutocomplete
                  value={draft.streetAddress || ""}
                  onChange={(val) => onChange("streetAddress", val || null)}
                  onPlaceSelect={handlePlaceSelect}
                  placeholder="Start typing an address..."
                  className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground"
                  data-testid="input-street-address"
                  countryBias={countryIso}
                  stateBias={stateForBias}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="label-text text-muted-foreground text-sm">Address Line 2</Label>
                <Input
                  value={draft.streetAddress2 || ""}
                  onChange={(e) => onChange("streetAddress2", e.target.value || null)}
                  placeholder="Apt, suite, unit, floor, etc."
                  className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground"
                  data-testid="input-street-address-2"
                />
              </div>
              <div className="space-y-2">
                <Label className="label-text text-muted-foreground text-sm flex items-center gap-1.5">
                  Country
                  {isAutoFilled("country") && <AutoFillBadge />}
                </Label>
                <Select value={geo.countryCode || GEO_CLEAR_VALUE} onValueChange={geo.handleCountryChange}>
                  <SelectTrigger className={cn("bg-card border-primary/30 text-foreground", isAutoFilled("country") && "ring-1 ring-emerald-400/50")} data-testid="select-property-country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    <SelectItem value={GEO_CLEAR_VALUE} className="text-muted-foreground">None</SelectItem>
                    {geo.countries.map((c) => (
                      <SelectItem key={c.isoCode} value={c.isoCode}>
                        {c.flag} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="label-text text-muted-foreground text-sm flex items-center gap-1.5">
                  State / Province / Region
                  {isAutoFilled("stateProvince") && <AutoFillBadge />}
                </Label>
                <Select value={geo.stateCode || GEO_CLEAR_VALUE} onValueChange={geo.handleStateChange} disabled={!geo.countryCode}>
                  <SelectTrigger className={cn("bg-card border-primary/30 text-foreground", isAutoFilled("stateProvince") && "ring-1 ring-emerald-400/50")} data-testid="select-property-state">
                    <SelectValue placeholder={geo.countryCode ? "Select state" : "Select country first"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    <SelectItem value={GEO_CLEAR_VALUE} className="text-muted-foreground">None</SelectItem>
                    {geo.states.map((s) => (
                      <SelectItem key={s.isoCode} value={s.isoCode}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="label-text text-muted-foreground text-sm flex items-center gap-1.5">
                  City
                  {isAutoFilled("city") && <AutoFillBadge />}
                </Label>
                <CityCombobox
                  value={draft.city || ""}
                  onValueChange={geo.handleCityChange}
                  cities={geo.cities}
                  disabled={!geo.stateCode}
                  placeholder={geo.stateCode ? "Select city" : "Select state first"}
                  className={cn("bg-card border-primary/30 text-foreground", isAutoFilled("city") && "ring-1 ring-emerald-400/50")}
                  data-testid="select-property-city"
                />
              </div>
              <div className="space-y-2">
                <Label className="label-text text-muted-foreground text-sm flex items-center gap-1.5">
                  Postal / ZIP Code
                  {isAutoFilled("zipPostalCode") && <AutoFillBadge />}
                </Label>
                <Input
                  value={draft.zipPostalCode || ""}
                  onChange={(e) => onChange("zipPostalCode", e.target.value || null)}
                  placeholder="78701"
                  className={cn("bg-card border-primary/30 text-foreground placeholder:text-muted-foreground", isAutoFilled("zipPostalCode") && "ring-1 ring-emerald-400/50")}
                />
              </div>
            </div>
          </div>

          {/* Identity classifiers + operational facts — all belong in Basic for Milestone A */}
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Market Tier<InfoTooltip text="MSA classification. Primary = Top 25 metro areas with highest hotel demand. Secondary and tertiary markets have different risk/return profiles." /></Label>
            <Select value={draft.marketTier || ""} onValueChange={(v) => onChange("marketTier", v)}>
              <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-market-tier"><SelectValue placeholder="Select tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary (Top 25 MSA)</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="tertiary">Tertiary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground text-sm">Year Built</Label>
            <Input type="number" value={draft.yearBuilt ?? ""} onChange={(e) => onNumberChange("yearBuilt", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-year-built" />
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground text-sm">Total Acreage</Label>
            <Input type="number" step="0.1" value={draft.totalPropertyAcreage ?? ""} onChange={(e) => onNumberChange("totalPropertyAcreage", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-total-acreage" />
          </div>

          {/* Status + Room Count */}
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Market Tier<InfoTooltip text="MSA classification. Primary = Top 25 metro areas with highest hotel demand. Secondary and tertiary markets have different risk/return profiles." /></Label>
            <Select value={draft.marketTier || ""} onValueChange={(v) => onChange("marketTier", v)}>
              <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-market-tier"><SelectValue placeholder="Select tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary (Top 25 MSA)</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="tertiary">Tertiary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground text-sm">Year Built</Label>
            <Input type="number" value={draft.yearBuilt ?? ""} onChange={(e) => onNumberChange("yearBuilt", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-year-built" />
          </div>

          {/* Star Rating */}
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Star Rating<InfoTooltip text="Property star classification (1-5★). Drives research comparable matching — luxury (5★) properties are only compared to other luxury properties. Click to set, click same star to clear." /></Label>
            <StarRatingInput
              value={draft.starRating}
              suggested={draft.starRatingSuggested}
              onChange={(v) => onChange("starRating", v)}
            />
          </div>

          {/* Property Type + Business Model */}
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Property Type<InfoTooltip text="Hospitality category that determines which expense benchmarks and revenue assumptions apply. Extended Stay properties use different occupancy and ADR patterns than traditional hotels." /></Label>
            <PropertyTypeSelector
              value={draft.hospitalityType || "hotel"}
              onChange={(v) => onChange("hospitalityType", v)}
            />
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Business Model<InfoTooltip text="Determines the financial framework: Hotel uses USALI with departmental expenses (F&B, Events), management fees (2-5% base + incentive). Lodge is a large whole-property rental with premium amenities and guest meals but no events department, management fees (15-25%). VRBO/STR uses platform fees (Airbnb 15.5%, VRBO 8%), per-turnover cleaning, and all-in management fees (20-35%)." /></Label>
            <BusinessModelSelector
              value={draft.businessModel || "hotel"}
              onChange={(v) => onChange("businessModel", v)}
            />
          </div>

          {/* VRBO pricing panel — conditional on business model */}
          {(draft.businessModel === "vrbo" || draft.businessModel === "vrbo_owner_managed") && (
            <div className="sm:col-span-2 border border-primary/20 rounded-xl p-4 space-y-4">
              <p className="text-sm font-medium text-foreground label-text">Pricing Model</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="label-text text-foreground flex items-center gap-1.5">Pricing Model<InfoTooltip text="Per Room uses hotel-style ADR × room count. Per Property charges a single nightly rate for the entire property (luxury rental model)." /></Label>
                  <Select value={draft.pricingModel || "per_room"} onValueChange={(v) => onChange("pricingModel", v)}>
                    <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-pricing-model"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_room">Per Room (hotel-style ADR × rooms)</SelectItem>
                      <SelectItem value="per_property">Per Property (whole-property nightly rate)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.pricingModel === "per_property" && (
                  <>
                    <div className="space-y-2">
                      <Label className="label-text text-foreground flex items-center gap-1.5">Nightly Property Rate ($)<InfoTooltip text="The per-night rate for renting the entire property. Revenue = rate × days × occupancy. Room count is tracked for capacity only." /></Label>
                      <Input type="number" value={draft.nightlyPropertyRate || ""} onChange={(e) => onNumberChange("nightlyPropertyRate", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-nightly-property-rate" />
                    </div>
                    <div className="space-y-2">
                      <Label className="label-text text-foreground flex items-center gap-1.5">Max Guests<InfoTooltip text="Maximum guest capacity for the whole property. Used by research engines to calibrate comparable properties." /></Label>
                      <Input type="number" step="1" value={draft.maxGuests || ""} onChange={(e) => { const v = parseInt(e.target.value, 10); onChange("maxGuests", isNaN(v) ? null : v); }} className="bg-card border-primary/30 text-foreground" data-testid="input-max-guests" />
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label className="label-text text-foreground flex items-center gap-1.5">
                    Platform Fee Rate (%)
                    <InfoTooltip text={`Blended Airbnb / VRBO / Booking.com commission as % of room revenue. Default ${DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE * 100}% = Airbnb ${PLATFORM_FEE_RATES.airbnb * 100}% / VRBO ${PLATFORM_FEE_RATES.vrbo * 100}% / Booking ${PLATFORM_FEE_RATES.booking * 100}% blended. Set to 0 for direct-booking only.`} />
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draft.platformFeeRate != null ? +(draft.platformFeeRate * 100).toFixed(2) : ""}
                    placeholder={String(DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE * 100)}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      onChange("platformFeeRate", isNaN(raw) ? null : raw / 100);
                    }}
                    className="bg-card border-primary/30 text-foreground"
                    data-testid="input-platform-fee-rate"
                  />
                </div>
              </div>
            </div>
          )}
          {/* Classification tiers — quality, service level, location type */}
          <div className="sm:col-span-2 border-t border-border/50 pt-5">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Classification</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="label-text text-foreground flex items-center gap-1.5">Quality Tier<InfoTooltip text="STR chain scale classification. Drives comp set matching and benchmark selection for research engines." /></Label>
                <Select value={draft.qualityTier || ""} onValueChange={(v) => onChange("qualityTier", v)}>
                  <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-quality-tier"><SelectValue placeholder="Select tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="luxury">Luxury</SelectItem>
                    <SelectItem value="upper_upscale">Upper Upscale</SelectItem>
                    <SelectItem value="upscale">Upscale</SelectItem>
                    <SelectItem value="upper_midscale">Upper Midscale</SelectItem>
                    <SelectItem value="midscale">Midscale</SelectItem>
                    <SelectItem value="economy">Economy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="label-text text-foreground flex items-center gap-1.5">Service Level<InfoTooltip text="Determines staffing model and expense structure. Full Service includes concierge, room service, and F&B. Limited Service operates with minimal on-site staff." /></Label>
                <Select value={draft.serviceLevel || ""} onValueChange={(v) => onChange("serviceLevel", v)}>
                  <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-service-level"><SelectValue placeholder="Select level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_service">Full Service</SelectItem>
                    <SelectItem value="select_service">Select Service</SelectItem>
                    <SelectItem value="limited_service">Limited Service</SelectItem>
                    <SelectItem value="all_inclusive">All Inclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="label-text text-foreground flex items-center gap-1.5">Location Type<InfoTooltip text="Geographic classification affecting seasonality patterns, ADR benchmarks, and expense ratios." /></Label>
                <Select value={draft.locationType || ""} onValueChange={(v) => onChange("locationType", v)}>
                  <SelectTrigger className="bg-card border-primary/30 text-foreground" data-testid="select-location-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urban">Urban</SelectItem>
                    <SelectItem value="suburban">Suburban</SelectItem>
                    <SelectItem value="resort">Resort</SelectItem>
                    <SelectItem value="rural">Rural</SelectItem>
                    <SelectItem value="airport">Airport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* ── AS PURCHASED ───────────────────────────────────────────────────
            Physical capacity/size fields that have As-Improved counterparts,
            plus the property description (bound to description_purchased).
            Operational fields (status, rooms, type, model, classification)
            live in Basic above; they don't have improved counterparts yet.
        ──────────────────────────────────────────────────────────────────── */}
        <div className="mt-8 border-t border-border/50 pt-6">
          <SubsectionHeader
            title="As Purchased"
            subtitle="Physical footprint and description at acquisition — capacity and size fields that have As-Improved counterparts"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* F&B & Events Capacity */}
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">F&B & Events Capacity</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">F&B Venues</Label>
                  <Input type="number" value={draft.fbVenues ?? ""} onChange={(e) => onNumberChange("fbVenues", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-fb-venues" />
                </div>
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">F&B Seats (total)</Label>
                  <Input type="number" value={draft.fbSeats ?? ""} onChange={(e) => onNumberChange("fbSeats", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-fb-seats" />
                </div>
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">Event Space (sq ft)</Label>
                  <Input type="number" value={draft.eventSpaceSqft ?? ""} onChange={(e) => onNumberChange("eventSpaceSqft", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-event-space" />
                </div>
              </div>
            </div>

            {/* Physical Attributes */}
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Physical Attributes</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">Building (sq ft)</Label>
                  <Input type="number" value={draft.totalBuildingSqft ?? ""} onChange={(e) => onNumberChange("totalBuildingSqft", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-building-sqft" />
                </div>
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">Last Renovated</Label>
                  <Input type="number" value={draft.lastRenovationYear ?? ""} onChange={(e) => onNumberChange("lastRenovationYear", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-last-renovated" />
                </div>
              </div>
            </div>

            {/* As-Purchased Description */}
            <AsPurchasedDescriptionField draft={draft} onChange={onChange} />
          </div>
        </div>

        {/* ── AS IMPROVED ────────────────────────────────────────────────────
            Post-renovation hypothesis — leave blank to carry forward
            As-Purchased values. Inputs show As-Purchased value as a faded
            placeholder when no improved value has been set.
        ──────────────────────────────────────────────────────────────────── */}
        <div className="mt-8 border-t border-border/50 pt-6">
          <SubsectionHeader
            title="As Improved"
            subtitle="Post-renovation hypothesis — leave blank to carry forward As-Purchased values"
            className="mb-4"
          />
          <p className="text-xs text-muted-foreground mb-5 -mt-2 ml-5 pl-0.5">
            Inputs show the As-Purchased value as a placeholder when no improved value has been set.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">F&B & Events Capacity (Improved)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">F&B Venues</Label>
                  <Input
                    type="number"
                    value={draft.fbVenuesImproved ?? ""}
                    placeholder={draft.fbVenues != null ? String(draft.fbVenues) : ""}
                    onChange={(e) => onNumberChange("fbVenuesImproved", e.target.value)}
                    className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground/50"
                    data-testid="input-fb-venues-improved"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">F&B Seats (total)</Label>
                  <Input
                    type="number"
                    value={draft.fbSeatsImproved ?? ""}
                    placeholder={draft.fbSeats != null ? String(draft.fbSeats) : ""}
                    onChange={(e) => onNumberChange("fbSeatsImproved", e.target.value)}
                    className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground/50"
                    data-testid="input-fb-seats-improved"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">Event Space (sq ft)</Label>
                  <Input
                    type="number"
                    value={draft.eventSpaceSqftImproved ?? ""}
                    placeholder={draft.eventSpaceSqft != null ? String(draft.eventSpaceSqft) : ""}
                    onChange={(e) => onNumberChange("eventSpaceSqftImproved", e.target.value)}
                    className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground/50"
                    data-testid="input-event-space-improved"
                  />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Physical Attributes (Improved)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="label-text text-foreground text-sm">Building (sq ft)</Label>
                  <Input
                    type="number"
                    value={draft.totalBuildingSqftImproved ?? ""}
                    placeholder={draft.totalBuildingSqft != null ? String(draft.totalBuildingSqft) : ""}
                    onChange={(e) => onNumberChange("totalBuildingSqftImproved", e.target.value)}
                    className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground/50"
                    data-testid="input-building-sqft-improved"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="label-text text-foreground flex items-center gap-1.5 text-sm">
                    Planned Reopening Year
                    <InfoTooltip text="The target year the property reopens to guests after the improvement phase." />
                  </Label>
                  <Input
                    type="number"
                    value={draft.plannedReopeningYear ?? ""}
                    placeholder=""
                    onChange={(e) => onNumberChange("plannedReopeningYear", e.target.value)}
                    className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground/50"
                    data-testid="input-planned-reopening-year"
                  />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label className="label-text text-foreground flex items-center gap-1.5">
                Description (Improved)
                <InfoTooltip text="A narrative description of the property after planned improvements. Describe the transformation, new amenities, and revised target guest profile." />
              </Label>
              <Textarea
                value={draft.descriptionImproved ?? ""}
                onChange={(e) => onChange("descriptionImproved", e.target.value || null)}
                placeholder={purchasedDescriptionForPlaceholder ? purchasedDescriptionForPlaceholder + (purchasedDescriptionForPlaceholder.length >= 120 ? "…" : "") : "Describe the property after improvements..."}
                className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground/50 min-h-[100px] resize-y"
                data-testid="input-description-improved"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
