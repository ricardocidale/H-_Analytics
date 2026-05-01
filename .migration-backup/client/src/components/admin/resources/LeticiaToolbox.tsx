/**
 * Letícia's Toolbox — Resources-page identity header + tool inspectability.
 *
 * Renders Letícia (Specialist L — Resource Builder) as the named owner of
 * the Resources surface, then lists every entry in the SPECIALIST_TOOLS
 * registry with provenance and call-graph. The list is the per-tool
 * "Built by Letícia · last refreshed X · called by …" strip the Phase 2b
 * spec calls for; rendering it once at the top of every Resources kind
 * tab keeps the strip near the resource rows it describes without
 * coupling the registry to the admin_resources slug space.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import { formatLastBuilt, useSpecialistTools } from "./specialist-tools-shared";

const LETICIA = SPECIALIST_CATALOG.find((d) => d.id === "resources.builder");
const LETICIA_HEADER = LETICIA
  ? `${LETICIA.humanName} · ${LETICIA.displayName ?? LETICIA.realName} (Specialist ${LETICIA.letter})`
  : "Resource Builder";

export default function LeticiaToolbox() {
  const { data, isLoading, isError } = useSpecialistTools();

  return (
    <Card data-testid="card-leticia-toolbox" className="border-l-4 border-l-amber-500">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <CardTitle data-testid="text-leticia-header">{LETICIA_HEADER}</CardTitle>
            <CardDescription>
              I keep the deterministic capabilities the rest of the team relies on — regulatory tables, the FRED reader, the vector store, finance compute, and the render pipelines. Every entry below tracks its own freshness and the Specialists that call it.
            </CardDescription>
          </div>
          {data && (
            <Badge variant="outline" data-testid="badge-tool-count">
              {data.tools.length} tools
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading toolbox…</p>
        ) : isError || !data ? (
          <p className="text-sm text-rose-600">Failed to load Letícia's toolbox.</p>
        ) : (
          <ul className="divide-y" data-testid="list-leticia-tools">
            {data.tools.map((t) => {
              const ownerLabel = t.owner.specialistId === "resources.builder"
                ? "Letícia"
                : `${t.owner.humanName} (${t.owner.displayName})`;
              const calledByLabel = t.calledBy.length === 0
                ? "no Specialists yet"
                : t.calledBy.map((c) => c.humanName).join(", ");
              return (
                <li key={t.id} className="py-3" data-testid={`row-tool-${t.id}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium" data-testid={`text-tool-name-${t.id}`}>{t.displayName}</span>
                        <Badge variant="secondary" className="font-mono text-[10px]">{t.kind}</Badge>
                        {t.resourceSlugs.map((slug) => (
                          <Badge
                            key={slug}
                            variant="outline"
                            className="font-mono text-[10px]"
                            data-testid={`badge-tool-slug-${t.id}-${slug}`}
                          >
                            {slug}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono" data-testid={`text-tool-source-${t.id}`}>
                        {t.sourceFile}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                      <div data-testid={`text-tool-meta-${t.id}`}>
                        Built by <span className="font-medium">{ownerLabel}</span>
                      </div>
                      <div data-testid={`text-tool-freshness-${t.id}`}>
                        last refreshed {formatLastBuilt(t.lastBuiltAt, t.lastBuiltSource.kind)}
                      </div>
                      <div data-testid={`text-tool-called-by-${t.id}`}>
                        called by {calledByLabel}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
