/**
 * SpecialistToolsIBuild — page-level "Tools I build" card rendered above
 * the SpecialistPage tabs (Task #493).
 *
 * Sibling to `SpecialistToolsICall`:
 *   • SpecialistToolsICall  → tools whose `calledBy` includes this Specialist.
 *   • SpecialistToolsIBuild → tools whose `ownerSpecialistId` is this Specialist.
 *
 * Doctrine:
 *   • Mirrors the same SPECIALIST_TOOLS registry that powers Letícia's
 *     toolbox on the Resources surface, but filtered to entries this
 *     Specialist OWNS — same `/api/admin/specialist-tools` payload, no
 *     second source of truth.
 *   • Read-only. The escape hatch for a closer look is the "Open in
 *     Resources →" link on each row, which jumps to the AI Intelligence
 *     Resources surface where Letícia's toolbox renders the full
 *     per-tool inspectability strip.
 *   • Renders nothing when the Specialist owns no registered tools, so
 *     it doesn't add visual noise to Specialists outside the call graph
 *     (e.g. Helena, who consults `tax-bulletin-diff` BUT also owns it,
 *     does see the card; a Specialist with zero owned entries does not).
 *
 * This is the surface Letícia (Resource Builder) needs: her capabilities
 * tabs cover assignments + audit, but her actual day-job — keeping the
 * 5+ deterministic tools sharp — is registered in SPECIALIST_TOOLS and
 * needs to render on her admin page so admins can audit freshness and
 * call-graph without bouncing to the Resources tab.
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
  resourceSlugs?: string[];
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

export function SpecialistToolsIBuild({ specialistId }: { specialistId: string }) {
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
  // the "Tools I build" section is auxiliary. Render the card shell so
  // admins know the surface exists, but do not block.
  if (isLoading) {
    return (
      <Card data-testid="card-specialist-tools-i-build">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconLayers className="w-4 h-4" />
            Tools I build
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
      <Card data-testid="card-specialist-tools-i-build">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconLayers className="w-4 h-4" />
            Tools I build
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-rose-600">Failed to load tool registry.</p>
        </CardContent>
      </Card>
    );
  }

  const myTools = data.tools.filter((t) => t.owner.specialistId === specialistId);
  if (myTools.length === 0) {
    // Specialist owns no registered tools — render nothing so the page
    // stays focused on capability tabs.
    return null;
  }

  return (
    <Card
      data-testid="card-specialist-tools-i-build"
      className="border-l-4 border-l-amber-500"
    >
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconLayers className="w-4 h-4" />
              Tools I build
              <Badge variant="outline" className="ml-1">read-only</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Deterministic capabilities this Specialist owns and keeps fresh
              for the rest of the team. Refresh cadence is tracked per tool.
            </p>
          </div>
          <Badge variant="outline" data-testid="badge-tools-i-build-count">
            {myTools.length} {myTools.length === 1 ? "tool" : "tools"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" data-testid="list-specialist-tools-i-build">
          {myTools.map((t) => {
            const calledByLabel =
              t.calledBy.length === 0
                ? "no Specialists yet"
                : t.calledBy.map((c) => c.humanName).join(", ");
            return (
              <li
                key={t.id}
                className="py-3 flex items-start justify-between gap-3 flex-wrap"
                data-testid={`row-tool-i-build-${t.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-medium"
                      data-testid={`text-tool-i-build-name-${t.id}`}
                    >
                      {t.displayName}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {t.kind}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.description}
                  </p>
                  <p
                    className="text-xs text-muted-foreground mt-1 font-mono break-all"
                    data-testid={`text-tool-i-build-source-${t.id}`}
                  >
                    {t.sourceFile}
                  </p>
                  <p
                    className="text-xs text-muted-foreground mt-1"
                    data-testid={`text-tool-i-build-called-by-${t.id}`}
                  >
                    called by {calledByLabel}
                  </p>
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid={`text-tool-i-build-freshness-${t.id}`}
                  >
                    last refreshed {formatLastBuilt(t.lastBuiltAt, t.lastBuiltSource.kind)}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => navigateToResources(setLocation, "resources")}
                    data-testid={`link-tool-i-build-resources-${t.id}`}
                  >
                    Open in Resources →
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
