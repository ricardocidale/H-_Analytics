import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IconFileText,
  IconDatabase,
  IconSettings,
  IconGlobe,
  IconCpu,
  IconExternalLink,
} from "@/components/icons";

interface ResearchCriteriaTabProps {
  type: "property" | "operations" | "marketing" | "industry";
  icpContext?: string;
  dataInputs?: Array<{ label: string; value: string }>;
  adminConfig?: {
    enabledTools?: string[];
    focusAreas?: string[];
    regions?: string[];
    timeHorizon?: string;
    customInstructions?: string;
  };
  sources?: Array<{ name: string; url?: string; category: string }>;
  generationMeta?: {
    model?: string;
    timestamp?: string;
    tokenCount?: number;
    estimatedCost?: number;
  };
}

const typeLabels: Record<ResearchCriteriaTabProps["type"], string> = {
  property: "Property Research",
  operations: "Operations Research",
  marketing: "Marketing Research",
  industry: "Industry Research",
};

function SectionIcon({ icon: Icon }: { icon: typeof IconFileText }) {
  return (
    <Icon className="h-4 w-4 shrink-0 text-primary" />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground italic py-2">{message}</p>
  );
}

export function ResearchCriteriaTab({
  type,
  icpContext,
  dataInputs,
  adminConfig,
  sources,
  generationMeta,
}: ResearchCriteriaTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <IconFileText className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-semibold text-foreground">
          Criteria &amp; Sources
        </h3>
        <Badge variant="secondary" className="ml-auto">
          {typeLabels[type]}
        </Badge>
      </div>

      <Accordion type="multiple" defaultValue={["data-inputs"]} className="space-y-2">
        {/* ICP Context */}
        <AccordionItem value="icp-context" className="border border-border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <SectionIcon icon={IconFileText} />
              <span className="font-medium text-sm">ICP Context Used</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {icpContext ? (
              <Card className="bg-muted/50 border-border p-4">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {icpContext}
                </pre>
              </Card>
            ) : (
              <EmptyState message="No ICP context was provided for this research." />
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Data Inputs */}
        <AccordionItem value="data-inputs" className="border border-border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <SectionIcon icon={IconDatabase} />
              <span className="font-medium text-sm">Data Inputs</span>
              {dataInputs && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {dataInputs.length} fields
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {dataInputs && dataInputs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dataInputs.map((input, i) => (
                  <Card
                    key={i}
                    className="bg-muted/30 border-border p-3 space-y-1"
                  >
                    <p className="label-text text-muted-foreground uppercase tracking-wide">
                      {input.label}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {input.value || "\u2014"}
                    </p>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState message="No data inputs were used for this research." />
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Admin */}
        <AccordionItem value="admin-config" className="border border-border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <SectionIcon icon={IconSettings} />
              <span className="font-medium text-sm">Admin</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {adminConfig ? (
              <div className="space-y-4">
                {/* Enabled Tools */}
                {adminConfig.enabledTools && adminConfig.enabledTools.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="label-text text-muted-foreground font-medium">
                      Enabled Tools
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {adminConfig.enabledTools.map((tool) => (
                        <Badge
                          key={tool}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Focus Areas */}
                {adminConfig.focusAreas && adminConfig.focusAreas.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="label-text text-muted-foreground font-medium">
                      Focus Areas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {adminConfig.focusAreas.map((area) => (
                        <Badge
                          key={area}
                          variant="outline"
                          className="text-xs"
                        >
                          {area}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Regions */}
                {adminConfig.regions && adminConfig.regions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="label-text text-muted-foreground font-medium">
                      Regions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {adminConfig.regions.map((region) => (
                        <Badge
                          key={region}
                          variant="outline"
                          className="text-xs"
                        >
                          {region}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Horizon */}
                {adminConfig.timeHorizon && (
                  <div className="space-y-1.5">
                    <p className="label-text text-muted-foreground font-medium">
                      Time Horizon
                    </p>
                    <p className="text-sm text-foreground">
                      {adminConfig.timeHorizon}
                    </p>
                  </div>
                )}

                {/* Custom Instructions */}
                {adminConfig.customInstructions && (
                  <div className="space-y-1.5">
                    <p className="label-text text-muted-foreground font-medium">
                      Custom Instructions
                    </p>
                    <Card className="bg-muted/50 border-border p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {adminConfig.customInstructions}
                      </p>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState message="No admin overrides applied." />
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Sources Referenced */}
        <AccordionItem value="sources" className="border border-border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <SectionIcon icon={IconGlobe} />
              <span className="font-medium text-sm">Sources Referenced</span>
              {sources && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {sources.length}
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {sources && sources.length > 0 ? (
              <div className="space-y-2">
                {sources.map((source, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {source.category}
                      </Badge>
                      <span className="text-sm text-foreground truncate">
                        {source.name}
                      </span>
                    </div>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 transition-colors shrink-0"
                      >
                        <IconExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No external sources were referenced." />
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Generation Metadata */}
        <AccordionItem value="generation-meta" className="border border-border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <SectionIcon icon={IconCpu} />
              <span className="font-medium text-sm">Generation Metadata</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {generationMeta ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {generationMeta.model && (
                  <Card className="bg-muted/30 border-border p-3 space-y-1">
                    <p className="label-text text-muted-foreground uppercase tracking-wide">
                      Model
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {generationMeta.model}
                    </p>
                  </Card>
                )}
                {generationMeta.timestamp && (
                  <Card className="bg-muted/30 border-border p-3 space-y-1">
                    <p className="label-text text-muted-foreground uppercase tracking-wide">
                      Generated
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {generationMeta.timestamp}
                    </p>
                  </Card>
                )}
                {generationMeta.tokenCount != null && (
                  <Card className="bg-muted/30 border-border p-3 space-y-1">
                    <p className="label-text text-muted-foreground uppercase tracking-wide">
                      Tokens
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {generationMeta.tokenCount.toLocaleString()}
                    </p>
                  </Card>
                )}
                {generationMeta.estimatedCost != null && (
                  <Card className="bg-muted/30 border-border p-3 space-y-1">
                    <p className="label-text text-muted-foreground uppercase tracking-wide">
                      Est. Cost
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      ${generationMeta.estimatedCost.toFixed(4)}
                    </p>
                  </Card>
                )}
              </div>
            ) : (
              <EmptyState message="No generation metadata available." />
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
