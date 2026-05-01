import { IconBookOpen } from "@/components/icons";
import { ProvenanceBadge } from "./ProvenanceBadge";

interface CitedSource {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

interface SourceCitationsProps {
  sources: CitedSource[];
  title?: string;
}

export function SourceCitations({ sources, title = "Sources" }: SourceCitationsProps) {
  const validSources = (sources || []).filter((s) => s.url && s.title);
  if (validSources.length === 0) return null;

  return (
    <div data-testid="source-citations" className="space-y-3">
      <div className="flex items-center gap-2">
        <IconBookOpen className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <ProvenanceBadge provenance="cited" />
      </div>
      <div className="space-y-2">
        {validSources.map((src, i) => (
          <div
            key={i}
            data-testid={`source-citation-${i}`}
            className="group flex items-start gap-3 p-3 rounded-xl bg-chart-1/10 dark:bg-chart-1/5 border border-chart-1/15 dark:border-chart-1/10 hover:border-chart-1/20 dark:hover:border-chart-1/20 transition-colors"
          >
            <div className="shrink-0 w-6 h-6 rounded-full bg-chart-1/15 dark:bg-chart-1/15 flex items-center justify-center text-[10px] font-bold text-chart-1 dark:text-chart-1 mt-0.5">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-chart-1 dark:text-chart-1 hover:underline line-clamp-1"
                data-testid={`source-link-${i}`}
              >
                {src.title}
              </a>
              {src.snippet && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{src.snippet}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                {src.publishedDate && (
                  <span className="text-[10px] text-muted-foreground">
                    Published: {src.publishedDate}
                  </span>
                )}
                {src.url && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                    {(() => { try { return new URL(src.url).hostname; } catch { return src.url; } })()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
