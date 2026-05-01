import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconGlobe, IconExternalLink, IconCpu } from "@/components/icons";
import { DataCard, SectionHeading } from "./IcpUIComponents";

interface ResearchSource {
  category?: string;
  name?: string;
  title?: string;
  url?: string;
  link?: string;
}

interface IcpDataSourcesTabProps {
  customSources: Array<{ name: string; url?: string; category: string }>;
  researchSources: ResearchSource[];
  researchMeta: { model: string | null; timestamp: string | null; tokenCount: number | null };
}

export function IcpDataSourcesTab({ customSources, researchSources, researchMeta }: IcpDataSourcesTabProps) {
  return (
    <div className="space-y-4">
      {customSources.length > 0 ? (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconGlobe} title="Curated Sources" />
          <p className="text-xs text-muted-foreground">These sources are provided to the AI as reference material for its analysis.</p>
          <div className="space-y-2">
            {customSources.map((source, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">{source.category}</Badge>
                  <span className="text-sm text-foreground truncate">{source.name}</span>
                </div>
                {source.url && (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors shrink-0" data-testid={`link-source-${i}`}>
                    <IconExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="border border-border rounded-lg p-5 space-y-3">
          <SectionHeading icon={IconGlobe} title="Curated Sources" />
          <p className="text-sm text-muted-foreground italic">
            No custom sources have been configured. The AI uses its built-in knowledge of hospitality industry databases, USALI standards, and management company benchmarks.
          </p>
        </Card>
      )}

      {Array.isArray(researchSources) && researchSources.length > 0 && (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconExternalLink} title="Sources from Last Research Run" />
          <p className="text-xs text-muted-foreground">External references cited in the most recent company research generation.</p>
          <div className="space-y-2">
            {researchSources.map((source, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {source.category && (<Badge variant="outline" className="text-xs shrink-0">{source.category}</Badge>)}
                  <span className="text-sm text-foreground truncate">{source.name || source.title || source.url}</span>
                </div>
                {(source.url || source.link) && (
                  <a href={source.url || source.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors shrink-0">
                    <IconExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconCpu} title="Generation Metadata" />
        <p className="text-xs text-muted-foreground">Details from the most recent company research generation run.</p>
        {researchMeta.model || researchMeta.timestamp ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {researchMeta.model && <DataCard label="Model" value={researchMeta.model} />}
            {researchMeta.timestamp && <DataCard label="Generated" value={researchMeta.timestamp} />}
            {researchMeta.tokenCount != null && <DataCard label="Tokens" value={researchMeta.tokenCount.toLocaleString()} />}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No company research has been generated yet. Run research from the Company Assumptions page to populate this data.
          </p>
        )}
      </Card>
    </div>
  );
}
