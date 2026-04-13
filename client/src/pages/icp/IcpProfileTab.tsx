import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconTarget, IconBuilding, IconDollarSign, IconMapPin, IconAlertCircle, IconRefreshCw, IconPencil, IconBookOpen } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { DataCard, PriorityBadge, SectionHeading, fmt$ } from "./IcpUIComponents";
import type { IcpConfig, IcpDescriptive, Priority } from "@/components/admin/icp-config";

interface IcpProfileTabProps {
  icpConfig: IcpConfig;
  icpDescriptive: IcpDescriptive;
  icpQualitative: Record<string, string>;
  savedDefinition: string | undefined;
  essay: string;
  defEditing: boolean;
  defDraft: string;
  setDefDraft: (v: string) => void;
  onGenerate: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  isPending: boolean;
  qualitativeSections: Array<{ key: string; label: string; icon: React.ComponentType<any> }>;
}

export function IcpProfileTab({
  icpConfig, icpDescriptive, icpQualitative, savedDefinition, essay,
  defEditing, defDraft, setDefDraft,
  onGenerate, onEdit, onSave, onCancelEdit, isPending,
  qualitativeSections,
}: IcpProfileTabProps) {
  const amenityItems: Array<{ name: string; priority: Priority; detail?: string }> = [
    { name: "Swimming Pool", priority: icpConfig.pool, detail: `${icpConfig.poolSqFt} sq ft` },
    { name: "Spa Facility", priority: icpConfig.spa, detail: `${icpConfig.spaTreatmentRooms} rooms` },
    { name: "Yoga Studio", priority: icpConfig.yogaStudio },
    { name: "Gym / Fitness", priority: icpConfig.gym },
    { name: "Tennis", priority: icpConfig.tennis, detail: `${icpConfig.tennisCourts} court(s)` },
    { name: "Pickleball", priority: icpConfig.pickleball, detail: `${icpConfig.pickleballCourts} court(s)` },
    { name: "Equestrian", priority: icpConfig.horseFacilities, detail: `${icpConfig.horseStalls} stalls` },
    { name: "Casitas", priority: icpConfig.casitas, detail: `${icpConfig.casitasCount} units` },
    { name: "Vineyard / Orchard", priority: icpConfig.vineyard },
    { name: "Barn (Events)", priority: icpConfig.barn },
    { name: "Glamping", priority: icpConfig.glamping },
    { name: "Chapel", priority: icpConfig.chapel },
  ].filter(a => a.priority !== "no");

  return (
    <div className="space-y-4">
      <Card className="border border-border rounded-lg overflow-hidden" data-testid="card-icp-definition">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">ICP Definition</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Human-readable summary of the Ideal Customer Profile. Generate from current settings or edit by hand.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="default" onClick={onGenerate} disabled={isPending} className="text-xs h-8 gap-1.5" data-testid="button-generate-definition">
                <IconRefreshCw className="w-3.5 h-3.5" />
                {savedDefinition ? "Regenerate" : "Generate"}
              </Button>
              {!defEditing ? (
                <Button size="sm" variant="outline" onClick={onEdit} disabled={!savedDefinition && !essay} className="text-xs h-8 gap-1.5" data-testid="button-edit-definition">
                  <IconPencil className="w-3.5 h-3.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="default" onClick={onSave} disabled={isPending} className="text-xs h-8 gap-1.5" data-testid="button-save-definition">
                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onCancelEdit} className="text-xs h-8" data-testid="button-cancel-definition">Cancel</Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {defEditing ? (
            <textarea value={defDraft} onChange={(e) => setDefDraft(e.target.value)} className="w-full min-h-[400px] text-sm leading-relaxed font-sans text-foreground/90 bg-muted/40 border border-border rounded p-4 resize-y focus:outline-none focus:ring-1 focus:ring-ring" data-testid="textarea-icp-definition" />
          ) : savedDefinition ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground/90" data-testid="text-icp-definition">
              {savedDefinition.split("\n\n").map((paragraph, i) => (<p key={i} className="mb-3 last:mb-0">{paragraph}</p>))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <IconBookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No ICP definition generated yet</p>
              <p className="text-xs mt-1">Click <strong>Generate</strong> to build the definition from your current ICP profile settings.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {qualitativeSections.length > 0 && (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconTarget} title="Strategic Vision" />
          <p className="text-xs text-muted-foreground">Qualitative ICP descriptions that define your target client profile and inform market sizing.</p>
          <div className="space-y-4">
            {qualitativeSections.map((section) => (
              <div key={section.key} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <section.icon className="w-4 h-4 text-primary/70" />
                  <h4 className="text-sm font-medium text-foreground">{section.label}</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{icpQualitative[section.key]}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconBuilding} title="Physical Property Parameters" />
        <p className="text-xs text-muted-foreground">Quantitative ICP parameters that define the ideal property target — used by the AI to benchmark operating costs, revenue mix, and investment returns.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-icp-physical">
          <DataCard label="Room Count" value={`${icpConfig.roomsMin}–${icpConfig.roomsMax}`} />
          <DataCard label="Sweet Spot" value={`${icpConfig.roomsSweetSpotMin}–${icpConfig.roomsSweetSpotMax} rooms`} />
          <DataCard label="Land Area" value={`${icpConfig.landAcresMin}–${icpConfig.landAcresMax} acres`} />
          <DataCard label="Built Area" value={`${icpConfig.builtSqFtMin.toLocaleString()}–${icpConfig.builtSqFtMax.toLocaleString()} sq ft`} />
          <DataCard label="Indoor Event Capacity" value={`${icpConfig.indoorEventMin}–${icpConfig.indoorEventMax} guests`} />
          <DataCard label="Outdoor Event Capacity" value={`${icpConfig.outdoorEventMin}–${icpConfig.outdoorEventMax} guests`} />
          <DataCard label="Dining Capacity" value={`${icpConfig.diningCapacityMin}–${icpConfig.diningCapacityMax} guests`} />
          <DataCard label="Parking" value={`${icpConfig.parkingMin}–${icpConfig.parkingMax} spaces`} />
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Financial Parameters" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-icp-financial">
          <DataCard label="Acquisition Range" value={`${fmt$(icpConfig.acquisitionMin)}–${fmt$(icpConfig.acquisitionMax)}`} />
          <DataCard label="Target Acquisition" value={`${fmt$(icpConfig.acquisitionTargetMin)}–${fmt$(icpConfig.acquisitionTargetMax)}`} />
          <DataCard label="Total Investment" value={`${fmt$(icpConfig.totalInvestmentMin)}–${fmt$(icpConfig.totalInvestmentMax)}`} />
          <DataCard label="Renovation Budget" value={`${fmt$(icpConfig.renovationMin)}–${fmt$(icpConfig.renovationMax)}`} />
          <DataCard label="FF&E per Room" value={`${fmt$(icpConfig.ffePerRoomMin)}–${fmt$(icpConfig.ffePerRoomMax)}`} />
          <DataCard label="Target ADR" value={`$${icpConfig.adrMin}–$${icpConfig.adrMax}`} />
          <DataCard label="Stabilized Occupancy" value={`${icpConfig.occupancyMin}%–${icpConfig.occupancyMax}%`} />
          <DataCard label="RevPAR Target" value={`$${icpConfig.revParMin}–$${icpConfig.revParMax}`} />
          <DataCard label="Base Mgmt Fee" value={`${icpConfig.baseMgmtFeeMin}%–${icpConfig.baseMgmtFeeMax}%`} />
          <DataCard label="Incentive Fee" value={`${icpConfig.incentiveFeeMin}%–${icpConfig.incentiveFeeMax}%`} />
          <DataCard label="Exit Cap Rate" value={`${icpConfig.exitCapRateMin}%–${icpConfig.exitCapRateMax}%`} />
          <DataCard label="Target IRR" value={`${icpConfig.targetIrr}%+`} />
          <DataCard label="Equity Multiple" value={`${icpConfig.equityMultipleMin}x–${icpConfig.equityMultipleMax}x`} />
          <DataCard label="Hold Period" value={`${icpConfig.holdYearsMin}–${icpConfig.holdYearsMax} years`} />
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Revenue Mix Targets" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-icp-revenue">
          <DataCard label="F&B Share" value={`${icpConfig.fbShareMin}%–${icpConfig.fbShareMax}% of total revenue`} />
          <DataCard label="Events Share" value={`${icpConfig.eventsShareMin}%–${icpConfig.eventsShareMax}% of total revenue`} />
          <DataCard label="Spa & Wellness" value={`${icpConfig.spaShareMin}%–${icpConfig.spaShareMax}% of total revenue`} />
          <DataCard label="Other Ancillary" value={`${icpConfig.otherShareMin}%–${icpConfig.otherShareMax}% of total revenue`} />
          <DataCard label="Total Ancillary Target" value={`${icpConfig.totalAncillaryMin}%–${icpConfig.totalAncillaryMax}%`} />
        </div>
      </Card>

      {amenityItems.length > 0 && (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconTarget} title="Required Amenities & Facilities" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-icp-amenities">
            {amenityItems.map((item, i) => (
              <DataCard key={i} label={item.name} value={item.detail || "—"} badge={<PriorityBadge priority={item.priority} />} />
            ))}
          </div>
        </Card>
      )}

      {icpDescriptive.locationDetails && (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconMapPin} title="Details about Location" />
          <div className="space-y-1.5">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{icpDescriptive.locationDetails}</p>
          </div>
        </Card>
      )}

      {(icpDescriptive.exclusions || icpDescriptive.regulatoryNotes) && (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconAlertCircle} title="Exclusions & Regulatory" />
          {icpDescriptive.regulatoryNotes && (
            <div className="space-y-1.5">
              <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Regulatory Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{icpDescriptive.regulatoryNotes}</p>
            </div>
          )}
          {icpDescriptive.exclusions && (
            <div className="space-y-1.5 mt-4">
              <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Exclusions</p>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{icpDescriptive.exclusions}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
