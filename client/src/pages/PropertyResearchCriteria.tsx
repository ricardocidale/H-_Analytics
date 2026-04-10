import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { useProperty, useGlobalAssumptions } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  IconDatabase,
  IconSettings,
  IconGlobe,
  IconAlertCircle,
  IconFileText,
  IconTarget,
  IconCpu,
  IconExternalLink,
  IconInfo,
} from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { useRoute } from "wouter";
import type { ResearchConfig, ResearchEventConfig } from "@shared/schema";
import { PropertyStatus, DEFAULT_ANTHROPIC_MODEL } from "@shared/constants";

export default function PropertyResearchCriteria() {
  const [, params] = useRoute("/property/:id/criteria");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const { data: property, isLoading } = useProperty(propertyId);
  const { data: global } = useGlobalAssumptions();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">Property not found.</p>
        </div>
      </Layout>
    );
  }

  const researchConfig = ((global as unknown as Record<string, unknown>)?.researchConfig as ResearchConfig) ?? {};
  const eventConfig: Partial<ResearchEventConfig> = researchConfig.property ?? {};
  const assetDef = global?.assetDefinition as Record<string, string> | undefined;
  const propertyLabel = global?.propertyLabel ?? "Boutique Hotel";
  const icpDefinition = global?.icpConfig?._definition as string | undefined;

  const propertyInputs = [
    { label: "Property Name", value: property.name },
    { label: "Location", value: property.location },
    { label: "Market", value: property.market || "Not specified" },
    { label: "Room Count", value: String(property.roomCount) },
    { label: "Property Type", value: property.type || "Full Equity" },
    { label: "Status", value: property.status || PropertyStatus.PLANNED },
    { label: "City", value: property.city || "—" },
    { label: "State / Province", value: property.stateProvince || "—" },
    { label: "Country", value: property.country || "—" },
  ];

  if (property.description) {
    propertyInputs.push({ label: "Description", value: property.description });
  }

  const assetInputs: Array<{ label: string; value: string }> = [];
  if (assetDef) {
    if (assetDef.level) assetInputs.push({ label: "Asset Level", value: assetDef.level });
    if (assetDef.minRooms != null && assetDef.maxRooms != null) assetInputs.push({ label: "Room Range", value: `${assetDef.minRooms}–${assetDef.maxRooms}` });
    if (assetDef.minAdr != null && assetDef.maxAdr != null) assetInputs.push({ label: "ADR Range", value: `$${assetDef.minAdr}–$${assetDef.maxAdr}` });
    if (assetDef.hasFB) assetInputs.push({ label: "F&B Operations", value: "Yes" });
    if (assetDef.hasEvents) assetInputs.push({ label: "Event Hosting", value: "Yes" });
    if (assetDef.hasWellness) assetInputs.push({ label: "Wellness", value: "Yes" });
    if (assetDef.eventLocations) assetInputs.push({ label: "Event Locations", value: String(assetDef.eventLocations) });
    if (assetDef.maxEventCapacity) assetInputs.push({ label: "Max Event Capacity", value: `${assetDef.maxEventCapacity} guests` });
    if (assetDef.acreage) assetInputs.push({ label: "Acreage", value: `${assetDef.acreage} acres` });
    if (assetDef.privacyLevel) assetInputs.push({ label: "Privacy Level", value: assetDef.privacyLevel });
    if (assetDef.description) assetInputs.push({ label: "Property Description", value: assetDef.description });
  }

  const focusAreas = eventConfig.focusAreas?.length ? eventConfig.focusAreas : [];
  const regions = eventConfig.regions?.length ? eventConfig.regions : [];
  const customInstructions = eventConfig.customInstructions?.trim() || null;
  const enabledTools = eventConfig.enabledTools?.length ? eventConfig.enabledTools : [];
  const customSources = researchConfig.customSources?.length ? researchConfig.customSources : [];
  const timeHorizon = eventConfig.timeHorizon || null;
  const preferredLlm = researchConfig.preferredLlm || global?.preferredLlm || DEFAULT_ANTHROPIC_MODEL;

  const hasAdminConfig = focusAreas.length > 0 || regions.length > 0 || customInstructions || enabledTools.length > 0 || timeHorizon;

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6 max-w-4xl">
          <PageHeader
            title="Research Criteria"
            subtitle={property.name}
            variant="dark"
            backLink={`/property/${propertyId}/edit`}
          />

          {icpDefinition && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 p-6" data-testid="criteria-icp-definition">
              <div className="flex items-start gap-3 mb-3">
                <IconFileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {propertyLabel} — Target Profile
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The fund's official description of its ideal customer profile and target asset class, used by the AI to understand what types of properties to benchmark against.
                  </p>
                </div>
              </div>
              <div className="pl-8">
                <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {icpDefinition}
                </div>
              </div>
            </Card>
          )}

          <Card className="bg-primary/5 border-primary/20 p-4" data-testid="criteria-advisory-notice">
            <div className="flex gap-3">
              <IconInfo className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  How research uses your property data
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The AI researcher uses your property's descriptive details — name, location, market, 
                  room count, amenities, and property type — to find relevant market comparisons.
                  It does <span className="font-medium text-foreground">not</span> use
                  the numeric financial assumptions you're setting (ADR, occupancy targets, cost rates, 
                  cap rates, etc.), because the whole purpose of research is to provide independent 
                  market benchmarks for those numbers.
                </p>
              </div>
            </div>
          </Card>

          <Accordion type="multiple" defaultValue={["property-context", "asset-definition", "admin-config"]} className="space-y-3">
            <AccordionItem value="property-context" className="border border-border rounded-lg overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <IconDatabase className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium text-sm">Property Context</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {propertyInputs.length} fields
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground mb-3">
                  These property details are sent to the AI as research context.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-property-context">
                  {propertyInputs.map((input, i) => (
                    <Card key={i} className="bg-muted/30 border-border p-3 space-y-1">
                      <p className="label-text text-muted-foreground uppercase tracking-wide text-[11px]">
                        {input.label}
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {input.value || "—"}
                      </p>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="asset-definition" className="border border-border rounded-lg overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <IconTarget className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium text-sm">{propertyLabel} Definition</span>
                  {assetInputs.length > 0 && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {assetInputs.length} attributes
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground mb-3">
                  The asset class definition helps the AI understand what type of property to benchmark against.
                </p>
                {assetInputs.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-asset-definition">
                    {assetInputs.map((input, i) => (
                      <Card key={i} className="bg-muted/30 border-border p-3 space-y-1">
                        <p className="label-text text-muted-foreground uppercase tracking-wide text-[11px]">
                          {input.label}
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {input.value}
                        </p>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No asset definition configured.</p>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="admin-config" className="border border-border rounded-lg overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <IconSettings className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium text-sm">Admin Research Configuration</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground mb-3">
                  These settings are managed by your administrator in the Research Center and shape how the AI conducts its analysis.
                </p>
                {hasAdminConfig ? (
                  <div className="space-y-4">
                    {focusAreas.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Focus Areas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {focusAreas.map((area) => (
                            <Badge key={area} variant="outline" className="text-xs">{area}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {regions.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Geographic Scope</p>
                        <div className="flex flex-wrap gap-1.5">
                          {regions.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {timeHorizon && (
                      <div className="space-y-1.5">
                        <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Investment Horizon</p>
                        <p className="text-sm text-foreground">{timeHorizon}</p>
                      </div>
                    )}
                    {enabledTools.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Enabled Research Tools</p>
                        <div className="flex flex-wrap gap-1.5">
                          {enabledTools.map((tool) => (
                            <Badge key={tool} variant="secondary" className="text-xs">{tool}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {customInstructions && (
                      <div className="space-y-1.5">
                        <p className="label-text text-muted-foreground font-medium text-[11px] uppercase tracking-wide">Custom Instructions</p>
                        <Card className="bg-muted/50 border-border p-3">
                          <p className="text-sm text-foreground whitespace-pre-wrap">{customInstructions}</p>
                        </Card>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No custom research configuration has been set. The AI will use its default research methodology.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>

            {customSources.length > 0 && (
              <AccordionItem value="sources" className="border border-border rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <IconGlobe className="h-4 w-4 shrink-0 text-primary" />
                    <span className="font-medium text-sm">Curated Sources</span>
                    <Badge variant="outline" className="ml-2 text-xs">{customSources.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {customSources.map((source, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-xs shrink-0">{source.category}</Badge>
                          <span className="text-sm text-foreground truncate">{source.name}</span>
                        </div>
                        {source.url && (
                          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors shrink-0">
                            <IconExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="model" className="border border-border rounded-lg overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <IconCpu className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium text-sm">AI Model</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <Card className="bg-muted/30 border-border p-3 inline-block">
                  <p className="label-text text-muted-foreground uppercase tracking-wide text-[11px]">Preferred Model</p>
                  <p className="text-sm font-medium text-foreground mt-1">{preferredLlm}</p>
                </Card>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Card className="bg-muted/30 border-border p-4">
            <div className="flex gap-3">
              <IconAlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                These criteria are read-only. To change the research configuration, 
                ask your administrator to update the settings in the Research Center 
                section of the Admin panel.
              </p>
            </div>
          </Card>
        </div>
      </AnimatedPage>
    </Layout>
  );
}
