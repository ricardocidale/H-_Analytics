import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconInfo, IconDatabase, IconDollarSign, IconBuilding, IconUsers, IconFileText, IconMapPin } from "@/components/icons";
import { DataCard, SectionHeading, fmt$ } from "./IcpUIComponents";

interface IcpMarketContextTabProps {
  global: any;
  properties: any[];
  companyInputs: Array<{ label: string; value: string }>;
  focusAreas: string[];
}

export function IcpMarketContextTab({ global, properties, companyInputs, focusAreas }: IcpMarketContextTabProps) {
  const assetDef = global.assetDefinition as Record<string, string> | undefined;

  return (
    <div className="space-y-4">
      <Card className="bg-accent-pop/5 border-accent-pop/20 p-4" data-testid="context-advisory-note">
        <div className="flex gap-3">
          <IconInfo className="w-5 h-5 text-accent-pop dark:text-accent-pop shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Context vs. Benchmarked Values</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The values below are used as <span className="font-medium text-foreground">context</span> for
              the AI researcher — they describe your company and portfolio so the AI can find relevant benchmarks.
              The AI <span className="font-medium text-foreground">does not modify</span> these values; instead,
              it benchmarks your management fees, operating costs, and compensation against industry standards.
            </p>
          </div>
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDatabase} title="Company Context" />
        <p className="text-xs text-muted-foreground">These company-level details shape the AI's understanding of your management entity and the asset class you specialize in.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-company-context">
          {companyInputs.map((input, i) => (<DataCard key={i} label={input.label} value={input.value} />))}
          <DataCard label="Property Count" value={`${properties.length} properties`} />
          {properties.length > 0 && (
            <DataCard label="Portfolio Markets" value={Array.from(new Set(properties.map(p => p.location).filter(Boolean))).join(", ") || "—"} />
          )}
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Fee Structures" />
        <p className="text-xs text-muted-foreground">Management fee rates applied across the portfolio — the AI benchmarks these against industry standards (HVS, CBRE).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-fee-structures">
          <DataCard label="Base Management Fee" value={`${global.baseManagementFee}%`} />
          <DataCard label="Incentive Management Fee" value={`${global.incentiveManagementFee}%`} />
          <DataCard label="Marketing Rate" value={`${global.marketingRate}%`} />
          <DataCard label="Misc Ops Rate" value={`${global.miscOpsRate}%`} />
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconBuilding} title="Overhead Structure" />
        <p className="text-xs text-muted-foreground">Fixed overhead costs that define the management company's operational cost base.</p>
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
        <p className="text-xs text-muted-foreground">Staffing tiers and compensation structure for the management company.</p>
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
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{assetDef.description}</p>
        </Card>
      )}

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Research Focus Areas" />
        <p className="text-xs text-muted-foreground">The AI researcher covers these specific domains for management company analysis.</p>
        <div className="space-y-1.5">
          {focusAreas.map((area, i) => (
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
            {((global as unknown as { portfolioLocations?: string[] }).portfolioLocations ?? []).map((loc, i) => (
              <Badge key={i} variant="outline" className="text-xs">{loc}</Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
