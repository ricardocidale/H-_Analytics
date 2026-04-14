import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconFileText, IconSettings } from "@/components/icons";
import { DataCard, SectionHeading, BENCHMARK_SOURCES } from "./IcpUIComponents";
import type { IcpDescriptive } from "@/components/admin/icp-config";

interface IcpIndustryStandardsTabProps {
  preferredLlm: string;
  timeHorizon: string | null;
  regions: string[];
  enabledTools: string[];
  customInstructions: string | null;
  icpDescriptive: IcpDescriptive;
}

export function IcpIndustryStandardsTab({
  preferredLlm, timeHorizon, regions, enabledTools, customInstructions, icpDescriptive,
}: IcpIndustryStandardsTabProps) {
  return (
    <div className="space-y-4">
      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconFileText} title="Seed Benchmark Sources" />
        <p className="text-xs text-muted-foreground">These authoritative industry sources provide the foundational benchmarks that drive the AI's company-level research analysis.</p>
        <div className="space-y-3">
          {BENCHMARK_SOURCES.map((source, i) => (
            <div key={i} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconFileText className="w-4 h-4 text-primary/70" />
                <h4 className="text-sm font-medium text-foreground">{source.name}</h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{source.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconSettings} title="Research Configuration" />
        <p className="text-xs text-muted-foreground">These settings shape how the AI conducts its company-level analysis. Contact your administrator to request changes.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <DataCard label="Preferred LLM" value={preferredLlm} />
          {timeHorizon && <DataCard label="Investment Horizon" value={timeHorizon} />}
        </div>

        {regions.length > 0 && (
          <div className="space-y-1.5 mt-3">
            <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Geographic Scope</p>
            <div className="flex flex-wrap gap-1.5">
              {regions.map((r) => (<Badge key={r} variant="outline" className="text-xs">{r}</Badge>))}
            </div>
          </div>
        )}

        {enabledTools.length > 0 && (
          <div className="space-y-1.5 mt-3">
            <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Enabled Research Tools</p>
            <div className="flex flex-wrap gap-1.5">
              {enabledTools.map((tool) => (<Badge key={tool} variant="secondary" className="text-xs">{tool}</Badge>))}
            </div>
          </div>
        )}

        {customInstructions && (
          <div className="space-y-1.5 mt-3">
            <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Custom Instructions</p>
            <Card className="bg-muted/50 border-border p-3">
              <p className="text-sm text-foreground whitespace-pre-wrap">{customInstructions}</p>
            </Card>
          </div>
        )}

        {!regions.length && !timeHorizon && !enabledTools.length && !customInstructions && (
          <p className="text-sm text-muted-foreground italic">
            No custom research configuration has been set. The AI will use its default research methodology for management company analysis.
          </p>
        )}
      </Card>

      {icpDescriptive.vendorServices && (
        <Card className="border border-border rounded-lg p-5 space-y-3">
          <SectionHeading icon={IconSettings} title="Managed Vendor Services" />
          <p className="text-xs text-muted-foreground">Third-party vendor services the management company coordinates for each property.</p>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{icpDescriptive.vendorServices}</p>
        </Card>
      )}
    </div>
  );
}
