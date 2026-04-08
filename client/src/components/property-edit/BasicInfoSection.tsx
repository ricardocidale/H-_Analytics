/**
 * BasicInfoSection.tsx — Property identity and physical characteristics.
 *
 * First section on the Edit Property page. Captures the property's name,
 * street address / market, hero image URL, room count, property type
 * (e.g. "Boutique Hotel", "B&B"), and optional company assignment.
 *
 * Room count is the single most important driver in the financial model:
 * it multiplies with ADR (Average Daily Rate) and occupancy to produce
 * total room revenue.  Property type influences which USALI expense
 * ratios the engine applies by default.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { PROPERTY_STATUS_VALUES } from "@shared/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CityCombobox } from "@/components/ui/city-combobox";
import AddressAutocomplete, { type PlaceDetails } from "@/components/AddressAutocomplete";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useGeoSelect, GEO_CLEAR_VALUE } from "@/hooks/use-geo";
import StarRatingInput from "@/components/research/StarRatingInput";
import PropertyTypeSelector, { BusinessModelSelector } from "@/components/research/PropertyTypeSelector";
import type { PropertyEditSectionProps } from "./types";
import { cn } from "@/lib/utils";

function AutoFillBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full animate-in fade-in slide-in-from-left-1 duration-300">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2.5 4L3.5 5L5.5 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
      auto-filled
    </span>
  );
}

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
      const current = draft[key];
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

    if (filled.length > 0) {
      markAutoFilled(filled);
    }
  }, [onChange, markAutoFilled, draft]);

  const isAutoFilled = (field: string) => autoFilledFields.has(field);

  const countryIso = geo.countryCode || undefined;
  const stateForBias = draft.stateProvince || undefined;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6">
        <div className="mb-6">
          <h3 className="text-xl font-display text-foreground">Basic Information</h3>
          <p className="text-muted-foreground text-sm label-text">Property identification and location details</p>
        </div>
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
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Status<InfoTooltip text="Current stage: Pipeline (being scoped), In Negotiation (advanced talks), Acquired (purchased), Improvements (under renovation), or Operating (generating revenue)." /></Label>
            <Select value={draft.status} onValueChange={(v) => onChange("status", v)}>
              <SelectTrigger className="bg-card border-primary/30 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_STATUS_VALUES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Room Count<InfoTooltip text="Total number of rentable guest rooms. This is the primary revenue driver — all room revenue is calculated as Rooms × ADR × Occupancy × 30.5 days/month." /></Label>
            <Input type="number" value={draft.roomCount} onChange={(e) => onNumberChange("roomCount", e.target.value)} className="bg-card border-primary/30 text-foreground placeholder:text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <Label className="label-text text-foreground flex items-center gap-1.5">Star Rating<InfoTooltip text="Property star classification (1-5★). Drives research comparable matching — luxury (5★) properties are only compared to other luxury properties. Click to set, click same star to clear." /></Label>
            <StarRatingInput
              value={draft.starRating}
              suggested={draft.starRatingSuggested}
              onChange={(v) => onChange("starRating", v)}
            />
          </div>
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
        </div>
      </div>
    </div>
  );
}
