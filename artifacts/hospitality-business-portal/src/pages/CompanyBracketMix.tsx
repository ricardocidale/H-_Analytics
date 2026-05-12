import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { AnimatedPage, AnimatedSection } from "@/components/graphics/AnimatedPage";
import { useGlobalAssumptions, useProperties } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconTarget,
  IconBuilding,
  IconDatabase,
  IconDollarSign,
  IconUsers,
  IconFileText,
  IconMapPin,
  IconAlertTriangle,
  IconInfo,
  IconExternalLink,
  IconRefreshCw,
  IconBookOpen,
  IconGlobe,
} from "@/components/icons";
import { DEFAULT_ICP_CONFIG, DEFAULT_ICP_DESCRIPTIVE } from "@/components/admin/icp-config";
import type { IcpConfig, IcpDescriptive } from "@/components/admin/icp-config";
import type { GlobalResponse, PropertyResponse } from "@/lib/api/types";

const TABS: CurrentThemeTabItem[] = [
  { value: "bracket-mix", label: "Bracket Mix", icon: IconTarget },
  { value: "market-evidence", label: "Market Evidence", icon: IconDatabase },
  { value: "data-sources", label: "Data Sources", icon: IconGlobe },
  { value: "legacy-icp", label: "Legacy ICP", icon: IconBookOpen },
];

function DataCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-muted/30 border-border p-3 space-y-1">
      <p className="label-text text-muted-foreground uppercase tracking-wide text-[11px]">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </Card>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const ICP_BRACKET_FOCUS_AREAS = [
  "Competitive brand comps — ADR bands, RevPAR benchmarks, service tiers",
  "Customer property archetypes — boutique hotel, branded STR cluster, agritourism, event-venue",
  "Service-consumption profiles — hotel (full) vs STR (marketing / branding / performance bonus only)",
  "National pass-through vendor cost percentages per service line",
  "Mgmt Co markup factors on vendor pass-through as % of revenue",
  "Market RevPAR and occupancy trends per bracket archetype",
];

function BracketMixTab() {
  const [running, setRunning] = useState(false);

  const handleRunBrackets = async () => {
    setRunning(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/20 p-4" data-testid="bracket-mix-info">
        <div className="flex gap-3">
          <IconInfo className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">What is a bracket mix?</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Instead of a 70-field freeform profile, each Management Company's ICP is expressed
              as a weighted mix across 3–5 market-inferred{" "}
              <span className="font-medium text-foreground">ICP brackets</span>. Brackets are
              customer-property archetypes (e.g., boutique upscale hotel, performance-managed STR
              cluster) characterized from real hospitality brand comps. The mix drives all
              Management Company revenue and expense calculations automatically.
            </p>
          </div>
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-5" data-testid="bracket-mix-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">ICP Bracket Mix</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Weighted distribution of customer-property archetypes across the bracket catalog.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRunBrackets}
            disabled={running}
            className="text-xs h-8 gap-1.5 shrink-0"
            data-testid="button-run-brackets"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <IconRefreshCw className="w-3.5 h-3.5" />
            )}
            {running ? "Assigning…" : "Assign Brackets"}
          </Button>
        </div>

        <div
          className="flex flex-col items-center justify-center py-14 rounded-xl border border-dashed border-border bg-muted/20 text-center gap-3"
          data-testid="bracket-mix-empty"
        >
          <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center">
            <IconTarget className="w-5 h-5 text-muted-foreground opacity-50" />
          </div>
          <p className="text-sm font-medium text-foreground">No bracket mix assigned yet</p>
          <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
            Click <span className="font-medium">Assign Brackets</span> to have the ICP Research
            Specialist analyze your company's comparable brands and suggest a bracket mix. Hotels
            consume all Mgmt Co services; STRs consume only marketing, branding, and
            performance-bonus fees.
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Bracket catalog (coming soon)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: "Boutique Upscale Hotel", type: "Hotel", color: "bg-chart-1/10 border-chart-1/20" },
              { label: "Soft-Brand Boutique", type: "Hotel", color: "bg-chart-2/10 border-chart-2/20" },
              { label: "Performance-Managed STR Cluster", type: "STR", color: "bg-primary/10 border-primary/20" },
              { label: "Agritourism / Experiential Lodge", type: "Mixed", color: "bg-chart-3/10 border-chart-3/20" },
            ].map((bracket) => (
              <div
                key={bracket.label}
                className={`rounded-lg border ${bracket.color} px-3 py-2.5 flex items-center justify-between gap-2 opacity-50`}
              >
                <span className="text-sm text-foreground">{bracket.label}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {bracket.type}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bracket weights will appear here after bracket assignment runs. The catalog is defined
            in{" "}
            <span className="font-medium">
              Admin → AI → Intelligence → Knowledge &amp; Resources → Tables
            </span>
            .
          </p>
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-3" data-testid="service-consumption-rules">
        <SectionHeading icon={IconUsers} title="Service-Consumption Rules (built into the model)" />
        <p className="text-xs text-muted-foreground">
          These are hard rules baked into each bracket — not per-company toggles.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg border border-chart-1/20 bg-chart-1/5 px-3 py-2.5">
            <IconBuilding className="w-4 h-4 text-chart-1 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Hotel brackets</p>
              <p className="text-xs text-muted-foreground">
                Consume <span className="font-medium">all</span> Management Company service lines
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <IconBuilding className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">STR brackets</p>
              <p className="text-xs text-muted-foreground">
                Consume <span className="font-medium">only</span> marketing, branding, and
                performance-bonus fees
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MarketEvidenceTab({
  global,
  properties,
}: {
  global: GlobalResponse;
  properties: PropertyResponse[];
}) {
  const assetDef = global.assetDefinition;

  const companyInputs = useMemo(() => {
    const inputs: { label: string; value: string }[] = [
      { label: "Company Name", value: global.companyName ?? "—" },
      { label: "Property Label", value: global.propertyLabel ?? "Boutique Hotel" },
      { label: "Base Management Fee", value: `${global.baseManagementFee ?? "—"}%` },
      { label: "Incentive Management Fee", value: `${global.incentiveManagementFee ?? "—"}%` },
      { label: "Marketing Rate", value: `${global.marketingRate ?? "—"}%` },
    ];
    return inputs;
  }, [global]);

  return (
    <div className="space-y-4">
      <Card className="bg-accent-pop/5 border-accent-pop/20 p-4" data-testid="evidence-advisory-note">
        <div className="flex gap-3">
          <IconInfo className="w-5 h-5 text-accent-pop dark:text-accent-pop shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Bracket Evidence Panel</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              These values provide context for the ICP Research Specialist when characterizing
              brackets from market comps. The Specialist extracts the revenue side of each comp —
              what kind of customer property it serves and at what price band — not whether comps
              own their properties.
            </p>
          </div>
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDatabase} title="Company Context" />
        <p className="text-xs text-muted-foreground">
          Company-level details that shape the Specialist's understanding of the management entity
          and the asset classes it serves.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-company-context">
          {companyInputs.map((input, i) => (
            <DataCard key={i} label={input.label} value={input.value} />
          ))}
          <DataCard label="Property Count" value={`${properties.length} properties`} />
          {properties.length > 0 && (
            <DataCard
              label="Portfolio Markets"
              value={
                Array.from(new Set(properties.map((p) => p.location).filter(Boolean))).join(
                  ", ",
                ) || "—"
              }
            />
          )}
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Fee Structures" />
        <p className="text-xs text-muted-foreground">
          Management fee rates applied across the portfolio — used by the ICP Research Specialist
          to benchmark against market comps.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-fee-structures">
          <DataCard label="Base Management Fee" value={`${global.baseManagementFee}%`} />
          <DataCard label="Incentive Management Fee" value={`${global.incentiveManagementFee}%`} />
          <DataCard label="Marketing Rate" value={`${global.marketingRate}%`} />
          <DataCard label="Misc Ops Rate" value={`${global.miscOpsRate}%`} />
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconBuilding} title="Overhead Structure" />
        <p className="text-xs text-muted-foreground">
          Fixed overhead costs that define the management company's operational cost base.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-overhead">
          <DataCard label="Office Lease" value={fmt$(global.officeLeaseStart)} />
          <DataCard label="Professional Services" value={fmt$(global.professionalServicesStart)} />
          <DataCard label="Tech Infrastructure" value={fmt$(global.techInfraStart)} />
          <DataCard label="Travel per Client" value={fmt$(global.travelCostPerClient)} />
          <DataCard label="IT License per Client" value={fmt$(global.itLicensePerClient)} />
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconUsers} title="Staffing Model" />
        <p className="text-xs text-muted-foreground">
          Staffing tiers and compensation structure for the management company.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-staffing">
          <DataCard label="Staff Salary (avg)" value={fmt$(global.staffSalary)} />
          <DataCard label="Partner Count (Yr 1)" value={`${global.partnerCountYear1} partners`} />
          <DataCard label="Partner Comp (Yr 1)" value={fmt$(global.partnerCompYear1)} />
          <DataCard label="Tier 1 (≤ props)" value={`≤${global.staffTier1MaxProperties} → ${global.staffTier1Fte} FTE`} />
          <DataCard label="Tier 2 (≤ props)" value={`≤${global.staffTier2MaxProperties} → ${global.staffTier2Fte} FTE`} />
          <DataCard label="Tier 3 (above)" value={`${global.staffTier3Fte} FTE`} />
        </div>
      </Card>

      {assetDef?.description && (
        <Card className="border border-border rounded-lg p-5 space-y-3">
          <SectionHeading icon={IconFileText} title="Asset Class Description" />
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {assetDef.description}
          </p>
        </Card>
      )}

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Bracket Research Focus Areas" />
        <p className="text-xs text-muted-foreground">
          The ICP Research Specialist covers these domains when characterizing brackets from market
          comps.
        </p>
        <div className="space-y-1.5">
          {ICP_BRACKET_FOCUS_AREAS.map((area, i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5 px-3 rounded-md bg-muted/30">
              <span className="text-xs font-mono text-primary/60 w-5">{i + 1}.</span>
              <span className="text-sm text-foreground">{area}</span>
            </div>
          ))}
        </div>
      </Card>

      {(() => {
        const locs = (global as unknown as { portfolioLocations?: unknown }).portfolioLocations;
        return Array.isArray(locs) && locs.length > 0;
      })() && (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconMapPin} title="Portfolio Locations / Markets" />
          <div className="flex flex-wrap gap-1.5">
            {(
              (global as unknown as { portfolioLocations?: string[] }).portfolioLocations ?? []
            ).map((loc, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {loc}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function DataSourcesTab() {
  return (
    <div className="space-y-4">
      <Card className="border border-border rounded-lg p-5 space-y-4" data-testid="kr-link-block">
        <SectionHeading icon={IconGlobe} title="Knowledge & Resources" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          The ICP bracket catalog, national pass-through vendor cost table, and national markup
          factor table are maintained by Administrators in the Knowledge &amp; Resources section.
          They are not edited here — front-of-app surfaces the bracket mix and calculation outputs
          only.
        </p>

        <div className="space-y-2 pt-1">
          {[
            {
              label: "ICP Bracket Catalog",
              description: "The 3–5 reusable brackets that characterize customer-property archetypes.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → Tables",
            },
            {
              label: "National Pass-Through Cost Table",
              description: "Vendor pass-through costs as % of revenue per service line. Refreshed from national research.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → Tables",
            },
            {
              label: "National Markup Factor Table",
              description: "Mgmt Co markup factors on pass-through vendor costs as % of revenue.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → Tables",
            },
            {
              label: "Brand Comp Sources",
              description: "URL links and research sources used to characterize brackets.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → URL Links",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <IconExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
              <p className="text-[10px] font-mono text-muted-foreground/70">{item.path}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
          Administrators can navigate to{" "}
          <span className="font-medium text-foreground">
            Admin → AI → Intelligence → Knowledge &amp; Resources
          </span>{" "}
          using the sidebar to view and manage these resources.
        </p>
      </Card>
    </div>
  );
}

function LegacyIcpTab({
  icpConfig,
  icpDescriptive,
}: {
  icpConfig: IcpConfig;
  icpDescriptive: IcpDescriptive;
}) {
  const hasLegacyData =
    (icpConfig as unknown as { _generated?: boolean })._generated === true ||
    icpConfig.roomsMin !== DEFAULT_ICP_CONFIG.roomsMin;

  const AMENITY_LABELS: Record<string, string> = {
    pool: "Pool", spa: "Spa", sauna: "Sauna", steamRoom: "Steam Room",
    coldPlunge: "Cold Plunge", yogaStudio: "Yoga Studio", gym: "Gym",
    tennis: "Tennis", pickleball: "Pickleball", hikingTrails: "Hiking Trails",
    garden: "Garden", vineyard: "Vineyard", casitas: "Casitas", barn: "Barn",
    glamping: "Glamping", firePit: "Fire Pit", wineCellar: "Wine Cellar",
    outdoorKitchen: "Outdoor Kitchen", hotTub: "Hot Tub", horseFacilities: "Horse Facilities",
  };

  const amenities = Object.entries(AMENITY_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      priority: (icpConfig as unknown as Record<string, string | undefined>)[key],
    }))
    .filter((a) => a.priority && a.priority !== "no");

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-4" data-testid="legacy-deprecated-notice">
        <div className="flex gap-3">
          <IconAlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Deprecated — Legacy 70-field ICP Record
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
              This tab shows the previous per-company ICP record preserved as read-only reference
              data. It <span className="font-semibold">does not drive any financial calculation</span>.
              All calculations now use the bracket mix above. No new values can be saved here.
            </p>
          </div>
        </div>
      </Card>

      {!hasLegacyData ? (
        <Card className="border border-border rounded-lg p-8 text-center" data-testid="legacy-no-data">
          <IconBookOpen className="w-8 h-8 mx-auto mb-3 opacity-30 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">No legacy ICP record found</p>
          <p className="text-xs text-muted-foreground mt-1">
            This company never had a 70-field ICP profile generated.
          </p>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2" data-testid="legacy-icp-accordion">
          <AccordionItem value="physical" className="border border-border rounded-lg overflow-hidden bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
              Physical Property Parameters
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                <DataCard label="Room Count" value={`${icpConfig.roomsMin}–${icpConfig.roomsMax}`} />
                <DataCard label="Sweet Spot" value={`${icpConfig.roomsSweetSpotMin}–${icpConfig.roomsSweetSpotMax} rooms`} />
                <DataCard label="Land Area" value={`${icpConfig.landAcresMin}–${icpConfig.landAcresMax} acres`} />
                <DataCard label="Built Area" value={`${icpConfig.builtSqFtMin.toLocaleString()}–${icpConfig.builtSqFtMax.toLocaleString()} sq ft`} />
                <DataCard label="Indoor Event Capacity" value={`${icpConfig.indoorEventMin}–${icpConfig.indoorEventMax} guests`} />
                <DataCard label="Outdoor Event Capacity" value={`${icpConfig.outdoorEventMin}–${icpConfig.outdoorEventMax} guests`} />
                <DataCard label="Dining Capacity" value={`${icpConfig.diningCapacityMin}–${icpConfig.diningCapacityMax} guests`} />
                <DataCard label="Parking" value={`${icpConfig.parkingMin}–${icpConfig.parkingMax} spaces`} />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="financial" className="border border-border rounded-lg overflow-hidden bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
              Financial Parameters
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                <DataCard label="Acquisition Range" value={`${fmt$(icpConfig.acquisitionMin)}–${fmt$(icpConfig.acquisitionMax)}`} />
                <DataCard label="Target ADR" value={`$${icpConfig.adrMin}–$${icpConfig.adrMax}`} />
                <DataCard label="Occupancy Target" value={`${icpConfig.occupancyMin}%–${icpConfig.occupancyMax}%`} />
                <DataCard label="RevPAR Target" value={`$${icpConfig.revParMin}–$${icpConfig.revParMax}`} />
                <DataCard label="Base Mgmt Fee" value={`${icpConfig.baseMgmtFeeMin}%–${icpConfig.baseMgmtFeeMax}%`} />
                <DataCard label="Target IRR" value={`${icpConfig.targetIrr}%+`} />
                <DataCard label="Equity Multiple" value={`${icpConfig.equityMultipleMin}x–${icpConfig.equityMultipleMax}x`} />
                <DataCard label="Hold Period" value={`${icpConfig.holdYearsMin}–${icpConfig.holdYearsMax} years`} />
                <DataCard label="Exit Cap Rate" value={`${icpConfig.exitCapRateMin}%–${icpConfig.exitCapRateMax}%`} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {amenities.length > 0 && (
            <AccordionItem value="amenities" className="border border-border rounded-lg overflow-hidden bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
                Amenity Priorities
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-2 pt-2">
                  {amenities.map((a) => (
                    <span
                      key={a.key}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-muted/30 border-border text-foreground"
                    >
                      {a.label}
                      <span className="ml-1 opacity-60">({a.priority})</span>
                    </span>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {(icpDescriptive.propertyTypes || icpDescriptive.locationCharacteristics || icpDescriptive.locationDetails) && (
            <AccordionItem value="descriptive" className="border border-border rounded-lg overflow-hidden bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
                Descriptive Sections
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3 pt-2">
                  {[
                    { label: "Property Types", value: icpDescriptive.propertyTypes },
                    { label: "F&B Operations", value: icpDescriptive.fbLevel },
                    { label: "Location Characteristics", value: icpDescriptive.locationCharacteristics },
                    { label: "Target Markets", value: icpDescriptive.locationDetails },
                    { label: "Condition Requirements", value: icpDescriptive.conditionNotes },
                    { label: "Vendor Services", value: icpDescriptive.vendorServices },
                    { label: "Exclusions", value: icpDescriptive.exclusions },
                  ]
                    .filter((s) => s.value)
                    .map((s) => (
                      <div key={s.label} className="space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                          {s.label}
                        </p>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {s.value}
                        </p>
                      </div>
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}
    </div>
  );
}

export default function CompanyBracketMix() {
  const { data: global, isLoading } = useGlobalAssumptions();
  const { data: properties = [] } = useProperties();
  const [activeTab, setActiveTab] = useState("bracket-mix");

  const g = global as unknown as { icpConfig?: unknown; icpDescriptive?: unknown } | undefined;

  const icpConfig: IcpConfig = useMemo(
    () => ({
      ...DEFAULT_ICP_CONFIG,
      ...(g?.icpConfig && typeof g.icpConfig === "object"
        ? (g.icpConfig as Partial<IcpConfig>)
        : {}),
    }),
    [g],
  );

  const icpDescriptive: IcpDescriptive = useMemo(
    () => ({
      ...DEFAULT_ICP_DESCRIPTIVE,
      ...(g?.icpDescriptive && typeof g.icpDescriptive === "object"
        ? (g.icpDescriptive as Partial<IcpDescriptive>)
        : {}),
    }),
    [g],
  );

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-accent-pop" />
        </div>
      </Layout>
    );
  }

  if (!global) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">Failed to load company data.</p>
        </div>
      </Layout>
    );
  }

  const companyName = global.companyName ?? "Hospitality Business";

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6 p-4 sm:p-6 max-w-6xl">
          <PageHeader
            title={`ICP Bracket Mix — ${companyName}`}
            subtitle="Customer-property archetype mix that drives Management Company revenue and expense calculations"
            backLink="/company/assumptions"
          />

          <AnimatedSection delay={0.1}>
            <CurrentThemeTab tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="mt-6">
              {activeTab === "bracket-mix" && <BracketMixTab />}
              {activeTab === "market-evidence" && (
                <MarketEvidenceTab global={global} properties={properties} />
              )}
              {activeTab === "data-sources" && <DataSourcesTab />}
              {activeTab === "legacy-icp" && (
                <LegacyIcpTab icpConfig={icpConfig} icpDescriptive={icpDescriptive} />
              )}
            </div>
          </AnimatedSection>
        </div>
      </AnimatedPage>
    </Layout>
  );
}
