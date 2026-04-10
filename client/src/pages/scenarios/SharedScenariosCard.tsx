import { ScrollReveal, AnimatedGrid, AnimatedGridItem } from "@/components/graphics";
import { TiltCard } from "@/components/ui/animated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconFolderOpen, IconClock, IconDownload, IconShare } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/formatters";
import type { ScenarioActions } from "./useScenarioActions";

interface SharedScenariosCardProps {
  actions: ScenarioActions;
}

export function SharedScenariosCard({ actions }: SharedScenariosCardProps) {
  const {
    sharedScenarios,
    sharedLoading,
    handleExport,
    setLoadSharedWarning,
    loadIsPending,
  } = actions;

  return (
    <Card className="relative overflow-hidden bg-card border-border shadow-sm">
      <CardHeader className="relative">
        <div>
          <CardTitle className="text-xl font-display text-foreground">Shared with Me</CardTitle>
          <CardDescription className="label-text text-muted-foreground">
            {sharedLoading
              ? "Loading shared scenarios..."
              : sharedScenarios.length === 0
                ? "No scenarios have been shared with you yet."
                : `${sharedScenarios.length} scenario${sharedScenarios.length === 1 ? '' : 's'} shared with you`
            }
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        {sharedLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : sharedScenarios.length === 0 ? (
          <div className="text-center py-12">
            <IconShare className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="label-text text-muted-foreground font-medium">No shared scenarios</p>
            <p className="label-text text-muted-foreground mt-1">
              When someone shares a scenario with you, it will appear here.
            </p>
          </div>
        ) : (
          <ScrollReveal>
          <AnimatedGrid className="grid gap-4">
            <TooltipProvider>
            {sharedScenarios.map((scenario: any) => (
              <AnimatedGridItem key={scenario.id}>
              <TiltCard intensity={4}>
              <div
                className="p-4 rounded-lg border bg-muted border-border hover:bg-muted transition-colors"
                data-testid={`shared-scenario-card-${scenario.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-foreground truncate">{scenario.name}</h3>
                      <Badge variant="secondary" className="text-xs shrink-0" data-testid={`badge-shared-${scenario.id}`}>
                        Shared by {scenario.sharedByName || "unknown"}
                      </Badge>
                      <Badge variant="outline" className="text-xs shrink-0">Read-only</Badge>
                    </div>
                    {scenario.description && (
                      <p className="label-text text-muted-foreground mt-1 line-clamp-2">{scenario.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono">
                        <IconClock className="w-3 h-3" />
                        Saved: {formatDateTime(scenario.updatedAt)}
                      </span>
                      <span className="font-mono">{(Array.isArray(scenario.properties) ? scenario.properties.length : 0)} properties</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          onClick={() => setLoadSharedWarning({ id: scenario.id, name: scenario.name, sharedByName: scenario.sharedByName || null })}
                          disabled={loadIsPending}
                          data-testid={`button-load-shared-scenario-${scenario.id}`}
                        >
                          {loadIsPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <IconFolderOpen className="w-4 h-4" />
                          )}
                          Load
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restore this shared scenario as the active configuration</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExport(scenario.id, scenario.name)}
                          className="text-muted-foreground hover:text-foreground hover:bg-muted"
                          data-testid={`button-export-shared-scenario-${scenario.id}`}
                        >
                          <IconDownload className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export as JSON file</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
              </TiltCard>
              </AnimatedGridItem>
            ))}
            </TooltipProvider>
          </AnimatedGrid>
          </ScrollReveal>
        )}
      </CardContent>
    </Card>
  );
}
