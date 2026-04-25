/**
 * SpecialistToolsICall — page-level "Tools I call" card rendered above
 * the SpecialistPage tabs (Task #463).
 *
 * Doctrine:
 *   • Mirrors the same SPECIALIST_TOOLS registry that powers Letícia's
 *     toolbox on the Resources surface, but filtered to entries whose
 *     `calledBy` includes THIS specialist. Same `/api/admin/specialist-
 *     tools` payload — no second fetch shape, no second source of truth.
 *   • Read-only. The escape hatch for a closer look (or a registry edit)
 *     is the "Open in Resources →" link on each row, which jumps to the
 *     AI Intelligence Resources surface where Letícia's toolbox renders
 *     the full per-tool inspectability strip.
 *   • Renders nothing when the Specialist calls no registered tools, so
 *     it doesn't add visual noise to Specialists outside the call graph
 *     (e.g. Helena, when the registry only attributes regulatory tables
 *     to her, still sees the card; a Specialist with zero entries does
 *     not).
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconLayers } from "@/components/icons";
import { navigateToResources } from "./constants";

interface ToolCalledBy {
  id: string;
  humanName: string;
  displayName: string;
}

interface ToolView {
  id: string;
  displayName: string;
  description: string;
  kind: "deterministic" | "llm" | "hybrid";
  sourceFile: string;
  citation: string | null;
  resourceSlug: string | null;
  owner: { specialistId: string; humanName: string; displayName: string };
  calledBy: ToolCalledBy[];
  lastBuiltAt: string | null;
  lastBuiltSource: { kind: string } & Record<string, unknown>;
}

interface ToolsResponse {
  catalogSize: number;
  tools: ToolView[];
}

function formatLastBuilt(iso: string | null, sourceKind: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const rel = formatDistanceToNow(d, { addSuffix: true });
  if (sourceKind === "build-time") return `since deploy (${rel})`;
  return rel;
}

export function SpecialistToolsICall({ specialistId }: { specialistId: string }) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery<ToolsResponse>({
    queryKey: ["/api/admin/specialist-tools"],
    queryFn: async () => {
      const res = await fetch("/api/admin/specialist-tools", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  // Loading and error states are deliberately quiet — the page already
  // shows a spinner / error banner for the Specialist detail fetch, and
  // the Tools I call section is auxiliary information. We render the
  // card shell so admins know the surface exists, but do not block.
  if (isLoading) {
    return (
      <Card data-testid="card-specialist-tools-i-call">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconLayers className="w-4 h-4" />
            Tools I call
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading toolbox…</p>
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card data-testid="card-specialist-tools-i-call">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconLayers className="w-4 h-4" />
            Tools I call
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-rose-600">Failed to load tool registry.</p>
        </CardContent>
      </Card>
    );
  }

  const myTools = data.tools.filter((t) => t.calledBy.some((c) => c.id === specialistId));
  if (myTools.length === 0) {
    // Specialist calls no registered tools — render nothing so the page
    // stays focused on capability tabs.
    return null;
  }

  return (
    <Card data-testid="card-specialist-tools-i-call">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconLayers className="w-4 h-4" />
              Tools I call
              <Badge variant="outline" className="ml-1">read-only</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Deterministic capabilities this Specialist depends on. Owned by Letícia
              (or the Specialist named in the registry); refresh cadence is tracked per tool.
            </p>
          </div>
          <Badge variant="outline" data-testid="badge-tools-i-call-count">
            {myTools.length} {myTools.length === 1 ? "tool" : "tools"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" data-testid="list-specialist-tools-i-call">
          {myTools.map((t) => (
            <li
              key={t.id}
              className="py-3 flex items-start justify-between gap-3 flex-wrap"
              data-testid={`row-tool-i-call-${t.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium" data-testid={`text-tool-i-call-name-${t.id}`}>
                    {t.displayName}
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">{t.kind}</Badge>
                </div>
                <p
                  className="text-xs text-muted-foreground mt-1 font-mono break-all"
                  data-testid={`text-tool-i-call-source-${t.id}`}
                >
                  {t.sourceFile}
                </p>
              </div>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <span
                  className="text-xs text-muted-foreground"
                  data-testid={`text-tool-i-call-freshness-${t.id}`}
                >
                  last refreshed {formatLastBuilt(t.lastBuiltAt, t.lastBuiltSource.kind)}
                </span>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => navigateToResources(setLocation, "resources-apis")}
                  data-testid={`link-tool-i-call-resources-${t.id}`}
                >
                  Open in Resources →
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
