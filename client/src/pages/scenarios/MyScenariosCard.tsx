import { ScrollReveal, AnimatedGrid, AnimatedGridItem } from "@/components/graphics";
import { TiltCard } from "@/components/ui/animated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSave, IconFolderOpen, IconPencil, IconTrash, IconClock, IconFileStack, IconDownload, IconUpload, IconCopy, IconGitCompareArrows, IconShare } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/formatters";
import type { ScenarioActions } from "./useScenarioActions";

const NO_PERMISSION_MSG = "Scenario management is disabled for your account. Contact an admin to enable it.";

interface MyScenariosCardProps {
  actions: ScenarioActions;
}

export function MyScenariosCard({ actions }: MyScenariosCardProps) {
  const {
    myScenarios,
    manualScenarios,
    canManageScenarios,
    importFileRef,
    compareMode, toggleCompareMode,
    compareSelection, toggleCompareSelect,
    compareLoading,
    handleLoad, handleExport, handleClone, handleDelete, handleImport,
    handleCompare,
    setIsCreating,
    setEditingScenario,
    setSharingScenario,
    loadIsPending,
  } = actions;

  return (
    <Card className="relative overflow-hidden bg-card border-border shadow-sm">
      
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-display text-foreground">My Scenarios</CardTitle>
            <CardDescription className="label-text text-muted-foreground">
              {myScenarios.length === 0
                ? "No scenarios saved yet. Save your current configuration to get started."
                : `${myScenarios.length} scenario${myScenarios.length === 1 ? '' : 's'} saved`
              }
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    onClick={() => importFileRef.current?.click()}
                    disabled={!canManageScenarios}
                    data-testid="button-import-scenario"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <IconUpload className="w-4 h-4" />
                    Import
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{canManageScenarios ? "Import a scenario from a JSON file" : NO_PERMISSION_MSG}</TooltipContent>
            </Tooltip>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            {manualScenarios.length >= 2 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={compareMode ? "default" : "ghost"}
                    onClick={toggleCompareMode}
                    data-testid="button-toggle-compare"
                    className={compareMode ? "" : "text-muted-foreground hover:text-foreground hover:bg-muted"}
                  >
                    <IconGitCompareArrows className="w-4 h-4" />
                    {compareMode ? "Cancel Compare" : "Compare"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{compareMode ? "Exit comparison mode" : "Compare two scenarios side by side"}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="default"
                    onClick={() => setIsCreating(true)}
                    disabled={!canManageScenarios}
                    data-testid="button-new-scenario"
                  >
                    <IconSave className="w-4 h-4" />
                    Save As
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{canManageScenarios ? "Save current state as a new scenario" : NO_PERMISSION_MSG}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative space-y-4">
        {compareMode && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
            <span className="text-foreground text-sm">
              {compareSelection.length === 0 && "Select two scenarios to compare"}
              {compareSelection.length === 1 && "Select one more scenario"}
              {compareSelection.length === 2 && "Ready to compare"}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  disabled={compareSelection.length !== 2 || compareLoading}
                  onClick={handleCompare}
                  data-testid="button-run-compare"
                >
                  {compareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconGitCompareArrows className="w-4 h-4" />}
                  Compare
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {compareSelection.length !== 2 ? "Select exactly two scenarios to compare" : "Compare the two selected scenarios"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 mb-4" data-testid="baseline-indicator">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-sm font-medium text-foreground">Current Baseline</span>
            <Badge variant="outline" className="text-xs">Active Working State</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-4">
            Your current assumptions and properties. Save as a scenario to preserve this state.
          </p>
        </div>

        {myScenarios.length === 0 ? (
          <div className="text-center py-12">
            <IconFileStack className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="label-text text-muted-foreground font-medium">No scenarios saved yet</p>
            <p className="label-text text-muted-foreground mt-1">
              Click "Save Current" to save your current assumptions and properties as a scenario
            </p>
          </div>
        ) : (
          <ScrollReveal>
          <AnimatedGrid className="grid gap-4">
            <TooltipProvider>
            {myScenarios.map((scenario) => (
              <AnimatedGridItem key={scenario.id}>
              <TiltCard intensity={4}>
              <div
                className={`p-4 rounded-lg border transition-colors ${
                  compareMode && compareSelection.includes(scenario.id)
                    ? "bg-primary/10 border-primary"
                    : "bg-muted border-border hover:bg-muted"
                } ${compareMode ? "cursor-pointer" : ""}`}
                onClick={compareMode ? () => toggleCompareSelect(scenario.id) : undefined}
                data-testid={`scenario-card-${scenario.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {compareMode && (
                    <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      compareSelection.includes(scenario.id) ? "border-primary bg-primary" : "border-border"
                    }`}>
                      {compareSelection.includes(scenario.id) && (
                        <span className="text-[10px] font-bold text-white">
                          {compareSelection.indexOf(scenario.id) + 1}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-foreground truncate">{scenario.name}</h3>
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
                    <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="default"
                              onClick={() => handleLoad(scenario.id, scenario.name)}
                              disabled={loadIsPending}
                              data-testid={`button-load-scenario-${scenario.id}`}
                            >
                              {loadIsPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <IconFolderOpen className="w-4 h-4" />
                              )}
                              Load
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Restore this scenario as the active configuration</TooltipContent>
                        </Tooltip>
                      
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleExport(scenario.id, scenario.name)}
                              className="text-muted-foreground hover:text-foreground hover:bg-muted"
                              data-testid={`button-export-scenario-${scenario.id}`}
                            >
                              <IconDownload className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Export as JSON file</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleClone(scenario.id, scenario.name)}
                                disabled={!canManageScenarios}
                                className="text-muted-foreground hover:text-foreground hover:bg-muted"
                                data-testid={`button-clone-scenario-${scenario.id}`}
                              >
                                <IconCopy className="w-4 h-4" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{canManageScenarios ? "Duplicate this scenario" : NO_PERMISSION_MSG}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSharingScenario({ id: scenario.id, name: scenario.name })}
                              className="text-muted-foreground hover:text-foreground hover:bg-muted"
                              data-testid={`button-share-scenario-${scenario.id}`}
                            >
                              <IconShare className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Share this scenario</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingScenario({
                                  id: scenario.id,
                                  name: scenario.name,
                                  description: scenario.description || ""
                                })}
                                disabled={!canManageScenarios}
                                className="text-muted-foreground hover:text-foreground hover:bg-muted"
                                data-testid={`button-edit-scenario-${scenario.id}`}
                              >
                                <IconPencil className="w-4 h-4" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{canManageScenarios ? "Edit name and description" : NO_PERMISSION_MSG}</TooltipContent>
                        </Tooltip>

                        {scenario.name !== "Base" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                {canManageScenarios ? (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive/80 hover:text-destructive/60 hover:bg-destructive/10"
                                        data-testid={`button-delete-scenario-${scenario.id}`}
                                      >
                                        <IconTrash className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle className="font-display">Delete Scenario</AlertDialogTitle>
                                        <AlertDialogDescription className="label-text">
                                          Are you sure you want to delete "{scenario.name}"? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDelete(scenario.id, scenario.name)}
                                          className="bg-destructive hover:bg-destructive/80"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled
                                    className="text-destructive/80 hover:text-destructive/60 hover:bg-destructive/10"
                                    data-testid={`button-delete-scenario-${scenario.id}`}
                                  >
                                    <IconTrash className="w-4 h-4" />
                                  </Button>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{canManageScenarios ? "Delete this scenario" : NO_PERMISSION_MSG}</TooltipContent>
                          </Tooltip>
                        )}
                      </>
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
