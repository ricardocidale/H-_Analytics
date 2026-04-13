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

          {draft.businessModel === "vrbo" && (
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
            </div>
          )}
        </div>

        <PropertyDescriptorsSection draft={draft} onChange={onChange} onNumberChange={onNumberChange} />
      </div>
    </div>
  );
}

function PropertyDescriptorsSection({ draft, onChange, onNumberChange }: { draft: any; onChange: PropertyEditSectionProps["onChange"]; onNumberChange: PropertyEditSectionProps["onNumberChange"] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-6 border border-primary/20 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
        data-testid="toggle-property-descriptors"
      >
        <div>
          <p className="text-sm font-medium text-foreground label-text">Property Details</p>
          <p className="text-xs text-muted-foreground">Classification, physical attributes, and F&B capacity</p>
        </div>
        <svg className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {isOpen && (
        <div className="p-4 pt-0 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          <div className="border-t border-primary/10 pt-4">
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

          <div className="border-t border-primary/10 pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Physical Attributes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="label-text text-foreground text-sm">Total Acreage</Label>
                <Input type="number" step="0.1" value={draft.totalPropertyAcreage ?? ""} onChange={(e) => onNumberChange("totalPropertyAcreage", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-total-acreage" />
              </div>
              <div className="space-y-2">
                <Label className="label-text text-foreground text-sm">Building (sq ft)</Label>
                <Input type="number" value={draft.totalBuildingSqft ?? ""} onChange={(e) => onNumberChange("totalBuildingSqft", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-building-sqft" />
              </div>
              <div className="space-y-2">
                <Label className="label-text text-foreground text-sm">Year Built</Label>
                <Input type="number" value={draft.yearBuilt ?? ""} onChange={(e) => onNumberChange("yearBuilt", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-year-built" />
              </div>
              <div className="space-y-2">
                <Label className="label-text text-foreground text-sm">Last Renovated</Label>
                <Input type="number" value={draft.lastRenovationYear ?? ""} onChange={(e) => onNumberChange("lastRenovationYear", e.target.value)} className="bg-card border-primary/30 text-foreground" data-testid="input-last-renovated" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
