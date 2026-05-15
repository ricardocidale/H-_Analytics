/**
 * RevenueAssumptionsSection.tsx — Room revenue, ancillary income, and growth.
 *
 * Configures every revenue driver for the property's income statement:
 *
 *   Room Revenue:
 *     • ADR (Average Daily Rate) — nightly rate in Year 1
 *     • Occupancy rate — stabilized annual occupancy target
 *     • Occupancy ramp schedule — Year 1 through Year 4 ramp-up percentages
 *       (new hotels rarely open at full occupancy)
 *     • ADR growth rate — annual escalation of nightly rate
 *     • RevPAR is derived: ADR × Occupancy (Revenue Per Available Room)
 *
 *   Ancillary Revenue (as % of total revenue):
 *     • F&B (Food & Beverage) percentage of total revenue
 *     • Catering boost — deprecated (absorbed into F&B share)
 *     • Event / function revenue percentage of total revenue
 *     • Other revenue (spa, parking, retail) percentage of total revenue
 *
 *   Growth:
 *     • Revenue growth rate applied after stabilization year
 *
 * All rates use sliders with EditableValue for precise entry. Research Badges
 * show AI benchmarks when available.
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Slider } from "@/components/ui/slider";
import { EditableValue } from "@/components/ui/editable-value";
import { GaapBadge } from "@/components/ui/gaap-badge";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import {
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PropertyEditSectionProps } from "./types";

export default function RevenueAssumptionsSection({ draft, onChange, researchValues, guidance }: PropertyEditSectionProps) {
  const eid = draft.id as number | undefined;
  const gc = (key: string, label?: string) => eid ? { entityType: "property" as const, entityId: eid, assumptionKey: key, fieldLabel: label } : undefined;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6 space-y-6">
        <div>
          <h3 className="text-xl font-display text-foreground">Revenue Assumptions</h3>
          <p className="text-muted-foreground text-sm label-text">ADR and occupancy projections</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-end">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Starting ADR <InfoTooltip text="The average nightly rate charged per occupied room when the hotel first opens. This is the foundation of all revenue projections — room revenue, F&B, and events all flow from ADR × occupancy. STR Chain Scale ADR benchmarks (STR/CoStar 2024): Luxury $396+, Upper Upscale $173–$312, Upscale $134–$198, Upper Midscale $100–$140. Boutique/lifestyle properties in secondary markets typically fall in the $200–$400 range." /></>}
                badgeProps={{ entry: researchValues.adr }}
                onApplyValue={() => researchValues.adr && onChange("startAdr", researchValues.adr.mid)}
                guidanceContext={gc("adr", "Starting ADR")}
                currentValue={draft.startAdr}
                className="min-w-0"
              />
              <EditableValue
                value={draft.startAdr}
                onChange={(val) => onChange("startAdr", val)}
                format="dollar"
                min={100}
                max={1200}
                step={10}
                className="shrink-0"
              />
            </div>
            <Slider 
              value={[draft.startAdr]}
              onValueChange={(vals: number[]) => onChange("startAdr", vals[0])}
              min={100}
              max={1200}
              step={10}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>ADR Annual Growth <InfoTooltip text="The yearly percentage increase applied to ADR, compounding each year. A 3.5% growth rate means a $250 ADR becomes ~$259 in Year 2, ~$268 in Year 3, and so on. Reflects pricing power, inflation, and market positioning. Industry benchmark: 2–5% annual ADR growth for Upper Upscale; 3–6% for Luxury with strong brand equity (STR/CoStar 2024 trend data)." /></>}
                badgeProps={{ entry: researchValues.adrGrowth }}
                onApplyValue={() => researchValues.adrGrowth && onChange("adrGrowthRate", researchValues.adrGrowth.mid / 100)}
                guidanceContext={gc("adrGrowth", "ADR Annual Growth")}
                currentValue={draft.adrGrowthRate} isPercent
                className="min-w-0"
              />
              <EditableValue
                value={draft.adrGrowthRate * 100}
                onChange={(val) => onChange("adrGrowthRate", val / 100)}
                format="percent"
                min={0}
                max={50}
                step={1}
                className="shrink-0"
              />
            </div>
            <Slider 
              value={[draft.adrGrowthRate * 100]}
              onValueChange={(vals: number[]) => onChange("adrGrowthRate", vals[0] / 100)}
              min={0}
              max={50}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Starting Occupancy <InfoTooltip text="The percentage of rooms sold in the first month of operations. New hotels typically open well below their long-term potential while they build awareness and reputation. This is the starting point of the occupancy ramp. STR benchmarks (STR/CoStar 2024): Luxury 40–55% initial, Upper Upscale 45–60%, Upscale 50–65%. VRBO/STR properties: 35–50% initial depending on listing maturity and market saturation." /></>}
                badgeProps={{ entry: researchValues.startOccupancy }}
                onApplyValue={() => researchValues.startOccupancy && onChange("startOccupancy", researchValues.startOccupancy.mid / 100)}
                guidanceContext={gc("startOccupancy", "Starting Occupancy")}
                currentValue={draft.startOccupancy} isPercent
                className="min-w-0"
              />
              <EditableValue
                value={draft.startOccupancy * 100}
                onChange={(val) => onChange("startOccupancy", val / 100)}
                format="percent"
                min={0}
                max={100}
                step={1}
                className="shrink-0"
              />
            </div>
            <Slider 
              value={[draft.startOccupancy * 100]}
              onValueChange={(vals: number[]) => onChange("startOccupancy", vals[0] / 100)}
              min={0}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Stabilized Occupancy <InfoTooltip text="The maximum occupancy the property will reach once fully ramped. The occupancy growth step increases occupancy toward this ceiling at regular intervals. Once reached, occupancy stays here for the remainder of the projection. STR benchmarks (STR/CoStar 2024): Luxury 65–75%, Upper Upscale 70–80%, Upscale 72–82%, Upper Midscale 60–72%. VRBO/STR properties: 55–75% depending on market seasonality and pricing strategy." /></>}
                badgeProps={{ entry: researchValues.occupancy }}
                onApplyValue={() => researchValues.occupancy && onChange("maxOccupancy", researchValues.occupancy.mid / 100)}
                guidanceContext={gc("occupancy", "Stabilized Occupancy")}
                currentValue={draft.maxOccupancy} isPercent
                className="min-w-0"
              />
              <EditableValue
                value={draft.maxOccupancy * 100}
                onChange={(val) => onChange("maxOccupancy", val / 100)}
                format="percent"
                min={0}
                max={100}
                step={1}
                className="shrink-0"
              />
            </div>
            <Slider 
              value={[draft.maxOccupancy * 100]}
              onValueChange={(vals: number[]) => onChange("maxOccupancy", vals[0] / 100)}
              min={0}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-end">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Occupancy Ramp <InfoTooltip text="How many months pass between each occupancy step-up. For example, if set to 9 months with a 5% growth step, occupancy jumps by 5 percentage points every 9 months until it hits the stabilized maximum. A shorter ramp means faster fill-up." /></>}
                badgeProps={{ entry: researchValues.rampMonths }}
                onApplyValue={() => researchValues.rampMonths && onChange("occupancyRampMonths", researchValues.rampMonths.mid)}
                guidanceContext={gc("rampMonths", "Occupancy Ramp")}
                currentValue={draft.occupancyRampMonths}
                className="min-w-0"
              />
              <EditableValue
                value={draft.occupancyRampMonths}
                onChange={(val) => onChange("occupancyRampMonths", val)}
                format="months"
                min={0}
                max={36}
                step={1}
                className="shrink-0"
              />
            </div>
            <Slider 
              value={[draft.occupancyRampMonths]}
              onValueChange={(vals: number[]) => onChange("occupancyRampMonths", vals[0])}
              min={0}
              max={36}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Occupancy Growth Step <InfoTooltip text="The size of each occupancy increase during the ramp-up period. Every time the ramp interval elapses, occupancy jumps by this many percentage points. Example: starting at 40% with a 5% step → 40%, 45%, 50%, 55%… until the stabilized maximum is reached." /></>}
                badgeProps={{ entry: researchValues.occupancyStep }}
                onApplyValue={() => researchValues.occupancyStep && onChange("occupancyGrowthStep", researchValues.occupancyStep.mid / 100)}
                guidanceContext={gc("occupancyStep", "Occupancy Growth Step")}
                currentValue={draft.occupancyGrowthStep} isPercent
                className="min-w-0"
              />
              <EditableValue
                value={draft.occupancyGrowthStep * 100}
                onChange={(val) => onChange("occupancyGrowthStep", val / 100)}
                format="percent"
                min={0}
                max={20}
                step={1}
                className="shrink-0"
              />
            </div>
            <Slider 
              value={[draft.occupancyGrowthStep * 100]}
              onValueChange={(vals: number[]) => onChange("occupancyGrowthStep", vals[0] / 100)}
              min={0}
              max={20}
              step={1}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t border-primary/15">
          <Label className="label-text text-foreground flex items-center gap-1.5">
            Revenue Shares (% of Total Revenue)
            <InfoTooltip text="Configure what fraction of total property revenue each ancillary stream represents. Room revenue share is derived as the remainder (1 - events - F&B - other)." />
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-end">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Events <InfoTooltip text="Revenue from meetings, weddings, and other events as a percentage of total revenue. Global Wellness Institute 2024: wellness/retreat properties generate 25–35% of total revenue from events and programming. Standard hotels typically see 10–15%." /> <GaapBadge rule="ASC 606: Event revenue recognized when the event occurs (point-in-time). Deposits recorded as deferred revenue until the performance obligation is satisfied." /></>}
                  badgeProps={{ entry: researchValues.revShareEvents }}
                  onApplyValue={() => researchValues.revShareEvents && onChange("revShareEvents", researchValues.revShareEvents.mid / 100)}
                  guidanceContext={gc("revShareEvents", "Events")}
                  currentValue={draft.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS} isPercent
                  className="min-w-0"
                />
                <EditableValue
                  value={(draft.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS) * 100}
                  onChange={(val) => onChange("revShareEvents", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                  className="shrink-0"
                />
              </div>
              <Slider 
                value={[(draft.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS) * 100]}
                onValueChange={(vals: number[]) => onChange("revShareEvents", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">Meetings, weddings, conferences</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>F&B <InfoTooltip text="USALI F&B Department — food & beverage revenue as a percentage of total revenue. Includes restaurant, bar, room service, and catering. Industry benchmark: 25–35% of total revenue for boutique hotels with on-site dining and event catering (USALI 12th Ed.)." /> <GaapBadge rule="ASC 606: F&B revenue recognized at the point of sale. Bundled packages (e.g., room + breakfast) must allocate revenue to each performance obligation based on standalone selling prices." /></>}
                  badgeProps={{ entry: researchValues.revShareFB }}
                  onApplyValue={() => researchValues.revShareFB && onChange("revShareFB", researchValues.revShareFB.mid / 100)}
                  guidanceContext={gc("revShareFB", "F&B")}
                  currentValue={draft.revShareFB ?? DEFAULT_REV_SHARE_FB} isPercent
                  className="min-w-0"
                />
                <EditableValue
                  value={(draft.revShareFB ?? DEFAULT_REV_SHARE_FB) * 100}
                  onChange={(val) => onChange("revShareFB", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                  className="shrink-0"
                />
              </div>
              <Slider 
                value={[(draft.revShareFB ?? DEFAULT_REV_SHARE_FB) * 100]}
                onValueChange={(vals: number[]) => onChange("revShareFB", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">Restaurant, bar, room service</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Other <InfoTooltip text="USALI Other Operated Departments — revenue from spa, parking, activities, and other ancillary services as a percentage of total revenue. Industry benchmark: 2–6% of total revenue for boutique/lifestyle hotels (USALI 12th Ed.)." /></>}
                  badgeProps={{ entry: researchValues.revShareOther }}
                  onApplyValue={() => researchValues.revShareOther && onChange("revShareOther", researchValues.revShareOther.mid / 100)}
                  guidanceContext={gc("revShareOther", "Other Revenue")}
                  currentValue={draft.revShareOther ?? DEFAULT_REV_SHARE_OTHER} isPercent
                  className="min-w-0"
                />
                <EditableValue
                  value={(draft.revShareOther ?? DEFAULT_REV_SHARE_OTHER) * 100}
                  onChange={(val) => onChange("revShareOther", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                  className="shrink-0"
                />
              </div>
              <Slider 
                value={[(draft.revShareOther ?? DEFAULT_REV_SHARE_OTHER) * 100]}
                onValueChange={(vals: number[]) => onChange("revShareOther", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">Spa, parking, activities</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <ResearchContextFieldLabel
                  label={<>Catering Uplift <InfoTooltip text="Legacy field — no longer used in revenue calculations. F&B share now directly captures the full food and beverage revenue target, with catering included. This value is preserved for properties set up under the prior model." /></>}
                  badgeProps={{ entry: researchValues.catering }}
                  onApplyValue={() => researchValues.catering && onChange("cateringBoostPercent", researchValues.catering.mid / 100)}
                  guidanceContext={gc("catering", "Catering Boost")}
                  currentValue={draft.cateringBoostPercent ?? DEFAULT_CATERING_BOOST_PCT}
                  isPercent
                  className="min-w-0"
                />
                <EditableValue
                  value={(draft.cateringBoostPercent ?? DEFAULT_CATERING_BOOST_PCT) * 100}
                  onChange={(val) => onChange("cateringBoostPercent", val / 100)}
                  format="percent"
                  min={0}
                  max={100}
                  step={5}
                  className="shrink-0"
                />
              </div>
              <Slider 
                value={[(draft.cateringBoostPercent ?? DEFAULT_CATERING_BOOST_PCT) * 100]}
                onValueChange={(vals: number[]) => onChange("cateringBoostPercent", vals[0] / 100)}
                min={0}
                max={100}
                step={5}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">F&B uplift from catered events</p>
            </div>
          </div>
        </div>

        <SeasonalityProfileEditor draft={draft} onChange={onChange} />

        <OccupancyRampOverrideEditor draft={draft} onChange={onChange} />
      </div>
    </div>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DEFAULT_PROFILE = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/** Shape of one seasonal-calendar market as returned by GET /api/research/seasonal-calendars */
interface SeasonalMarket {
  market: string;
  country: string | null;
  profile: number[];
}

/**
 * Keyword overrides for city/location matching within a country.
 * Country matching (draft.country === market.country) is the primary signal;
 * these keywords narrow within a country when multiple markets share it.
 */
const MARKET_KEYWORDS: Record<string, string[]> = {
  "Catskills NY":    ["catskill"],
  "Miami":           ["miami"],
  "New York City":   ["new york", "nyc", "manhattan", "brooklyn"],
  "Park City UT":    ["park city", "eden ut", "powder mountain"],
};

/**
 * Deterministic market match:
 * 1. Country code must match (case-insensitive) when the market declares one.
 * 2. Within matching-country markets, prefer one whose keyword appears in location.
 * 3. If only one market matches the country, return it.
 * 4. If no country match, fall back to keyword search across all markets.
 */
function detectMarketFromData(
  markets: SeasonalMarket[],
  location: string | null | undefined,
  country: string | null | undefined,
): SeasonalMarket | null {
  if (!markets.length) return null;
  const hay = `${location ?? ""}`.toLowerCase();
  const countryUpper = (country ?? "").toUpperCase();

  // Step 1: narrow by country code
  const countryMatches = countryUpper
    ? markets.filter((m) => (m.country ?? "").toUpperCase() === countryUpper)
    : markets;

  if (countryMatches.length === 0) {
    // No country match — try keyword across all
    return markets.find((m) => MARKET_KEYWORDS[m.market]?.some((kw) => hay.includes(kw))) ?? null;
  }

  if (countryMatches.length === 1) return countryMatches[0];

  // Step 2: keyword disambiguates within country
  const kwMatch = countryMatches.find((m) => MARKET_KEYWORDS[m.market]?.some((kw) => hay.includes(kw)));
  return kwMatch ?? null;  // if no keyword match, don't guess
}

function profileSummary(profile: number[], markets: SeasonalMarket[]): string {
  if (profile.every((v) => v === 1)) return "Flat (1.0)";
  const match = markets.find(
    (m) => m.profile.length === profile.length && m.profile.every((v, i) => Math.abs(v - profile[i]) < 0.01),
  );
  return match ? match.market : "Custom";
}

function SeasonalityProfileEditor({ draft, onChange }: { draft: PropertyEditSectionProps["draft"]; onChange: PropertyEditSectionProps["onChange"] }) {
  const [isOpen, setIsOpen] = useState(false);
  const profile: number[] = draft.seasonalityProfile || DEFAULT_PROFILE;

  // Fetch seasonal calendar presets from the live DB table
  const { data: markets = [] } = useQuery<SeasonalMarket[]>({
    queryKey: ["seasonal-calendars"],
    queryFn: async () => {
      const res = await fetch("/api/research/seasonal-calendars");
      if (!res.ok) throw new Error("Failed to load seasonal calendars");
      return res.json() as Promise<SeasonalMarket[]>;
    },
    staleTime: 1000 * 60 * 60, // 1 hour — static seeded data changes rarely
  });

  const isFlat = profile.every((v) => v === 1);
  const suggestedMarket = useMemo(
    () => detectMarketFromData(markets, draft.location, draft.country),
    [markets, draft.location, draft.country],
  );

  // Auto-apply on first mount when profile is still flat and location matches a known market.
  // Run once only — if the user has already customised the profile we must not clobber it.
  useEffect(() => {
    if (isFlat && suggestedMarket) {
      onChange("seasonalityProfile", [...suggestedMarket.profile]);
    }
  }, []);  // intentionally empty — mount only

  const activeMarket = markets.find(
    (m) => m.profile.length === profile.length && m.profile.every((v, i) => Math.abs(v - profile[i]) < 0.01),
  );
  const summary = isFlat ? "Flat (1.0)" : activeMarket ? activeMarket.market : "Custom";
  const selectValue = isFlat ? "flat" : activeMarket ? activeMarket.market : "custom";

  const handleSelectPreset = (value: string) => {
    if (value === "flat" || value === "custom") {
      onChange("seasonalityProfile", [...DEFAULT_PROFILE]);
      return;
    }
    const market = markets.find((m) => m.market === value);
    if (market) {
      onChange("seasonalityProfile", [...market.profile]);
    }
  };

  return (
    <div className="border-t border-primary/20 pt-4">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left py-2 h-auto px-0"
        data-testid="toggle-seasonality-profile"
      >
        <div className="flex items-center gap-2">
          <Label className="label-text text-foreground cursor-pointer">Seasonality Profile</Label>
          <InfoTooltip text="Monthly multipliers (Jan–Dec) applied to occupancy and ADR to reflect seasonal demand patterns. A value of 1.0 means normal baseline; 1.3 means 30% above the annual average (peak season); 0.7 means 30% below (trough). Selecting a market preset pre-fills all 12 months from STR/CoStar seasonal data for that market. You can then fine-tune individual months." />
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="text-xs text-muted-foreground font-mono">
              {summary}
            </span>
          )}
          <svg className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </Button>
      {isOpen && (
        <div className="pt-2 space-y-4">
          {/* Market preset selector — Select dropdown backed by live seasonal_calendars data */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">Market preset</Label>
            <Select value={selectValue} onValueChange={handleSelectPreset}>
              <SelectTrigger className="w-full max-w-xs bg-card border-primary/30" data-testid="select-seasonality-preset">
                <SelectValue placeholder="Select a market…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">Flat (1.0) — no seasonality</SelectItem>
                {markets.map((market) => (
                  <SelectItem key={market.market} value={market.market}>
                    {market.market}
                    {suggestedMarket?.market === market.market && isFlat && " ★"}
                  </SelectItem>
                ))}
                {selectValue === "custom" && (
                  <SelectItem value="custom">Custom</SelectItem>
                )}
              </SelectContent>
            </Select>
            {suggestedMarket && isFlat && (
              <p className="text-xs text-muted-foreground">
                ★ Suggested based on this property's location. Select it above to pre-fill.
              </p>
            )}
          </div>

          {/* Month-by-month grid */}
          <div className="grid grid-cols-6 gap-2">
            {MONTH_LABELS.map((label, i) => (
              <div key={i} className="text-center">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  className="text-center text-sm bg-card border-primary/30"
                  value={profile[i]}
                  onChange={(e) => {
                    const newProfile = [...profile];
                    const parsed = parseFloat(e.target.value);
                    newProfile[i] = isNaN(parsed) ? 1 : parsed;
                    onChange("seasonalityProfile", newProfile);
                  }}
                  data-testid={`input-seasonality-${i}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onChange("seasonalityProfile", [...DEFAULT_PROFILE])} data-testid="btn-reset-seasonality">
              Reset to Flat
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OccupancyRampOverrideEditor({ draft, onChange }: { draft: PropertyEditSectionProps["draft"]; onChange: PropertyEditSectionProps["onChange"] }) {
  const [isOpen, setIsOpen] = useState(false);
  const curve: number[] = draft.occupancyRampCurve || [];

  return (
    <div className="border-t border-primary/20 pt-4">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left py-2 h-auto px-0"
        data-testid="toggle-occupancy-ramp-curve"
      >
        <div className="flex items-center gap-2">
          <Label className="label-text text-foreground cursor-pointer">Occupancy Ramp Override</Label>
          <InfoTooltip text="Optional year-by-year override of stabilized occupancy. Leave blank to use the automatic step-function ramp derived from Occupancy Ramp and Growth Step. When set, each entry directly specifies that year's occupancy as a fraction of stabilized max (e.g. 0.55 = 55% of stabilized). Values only appear once you expand this section and add a year." />
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="text-xs text-muted-foreground font-mono">
              {curve.length === 0 ? "Default step function" : `${curve.length} year${curve.length !== 1 ? "s" : ""} overridden`}
            </span>
          )}
          <svg className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </Button>
      {isOpen && (
        <div className="pt-2 space-y-3">
          {curve.length === 0 && (
            <p className="text-xs text-muted-foreground">No override set. Using the automatic step-function ramp derived from Occupancy Ramp and Growth Step above. Add a year override below to take manual control.</p>
          )}
          <div className="space-y-2">
            {curve.map((val, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-16 shrink-0">Year {i + 1}</span>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={val}
                  onChange={(e) => {
                    const c = [...curve];
                    const parsed = parseFloat(e.target.value); c[i] = Number.isFinite(parsed) ? parsed : 0;
                    onChange("occupancyRampCurve", c);
                  }}
                  className="w-24 bg-card border-primary/30 text-sm"
                  data-testid={`input-ramp-year-${i}`}
                />
                <span className="text-sm text-muted-foreground font-mono w-12">{(val * 100).toFixed(0)}%</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 w-7 p-0"
                  onClick={() => {
                    const c = curve.filter((_, j) => j !== i);
                    onChange("occupancyRampCurve", c.length > 0 ? c : null);
                  }}
                  data-testid={`btn-remove-ramp-year-${i}`}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange("occupancyRampCurve", [...curve, curve.length === 0 ? 0.55 : 1.0])}
            data-testid="btn-add-ramp-year"
          >
            + Add Year Override
          </Button>
        </div>
      )}
    </div>
  );
}
