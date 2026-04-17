import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import { SelfHealingBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/ui/page-header";
import { AnimatedPage, AnimatedSection } from "@/components/graphics/AnimatedPage";
import { CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { SaveButton } from "@/components/ui/save-button";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconTarget, IconHotel, IconPencil, IconRefreshCw, IconBookOpen, IconMapPin, IconAlertTriangle } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import AssetDefinitionTab from "@/components/admin/AssetDefinitionTab";
import CompanyProfileTab from "@/components/company/CompanyProfileTab";
import IcpLocationTab from "@/components/admin/IcpLocationTab";
import { useGlobalAssumptions, useUpdateAdminConfig } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { AdminSaveState } from "@/components/admin/save-state";
import {
  type IcpConfig,
  type IcpDescriptive,
  DEFAULT_ICP_CONFIG,
  DEFAULT_ICP_DESCRIPTIVE,
  generateIcpEssay,
} from "@/components/admin/icp-config";

const ICP_TABS: CurrentThemeTabItem[] = [
  { value: "icp-location", label: "Location", icon: IconMapPin },
  { value: "icp-profile", label: "Property Profile", icon: IconHotel },
  { value: "icp-description", label: "Property Description", icon: IconTarget },
  { value: "icp-definition", label: "ICP Definition", icon: IconBookOpen },
];

interface IcpContentProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

function IcpLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-md" />
        ))}
      </div>
      <Card className="bg-card border border-border/80">
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-80" />
          <div className="space-y-3 pt-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function IcpContent({ onSaveStateChange }: IcpContentProps) {
  const { data: ga, isLoading: gaLoading, error: gaError, refetch: gaRefetch } = useGlobalAssumptions();
  const updateMutation = useUpdateAdminConfig();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("icp-location");
  const [defEditing, setDefEditing] = useState(false);
  const [defDraft, setDefDraft] = useState("");

  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const tabSaveState = useRef<Record<string, AdminSaveState | null>>({});
  const [, setDirtyTick] = useState(0);
  const localSaveRef = useRef<(() => void) | null>(null);

  const handleSubTabSaveState = useCallback((tabKey: string) => {
    return (state: AdminSaveState | null) => {
      tabSaveState.current[tabKey] = state;
      setDirtyTick(t => t + 1);
    };
  }, []);

  const handleLocationSaveState = useMemo(() => handleSubTabSaveState("icp-location"), [handleSubTabSaveState]);
  const handleDescriptionSaveState = useMemo(() => handleSubTabSaveState("icp-description"), [handleSubTabSaveState]);
  const handleProfileSaveState = useMemo(() => handleSubTabSaveState("icp-profile"), [handleSubTabSaveState]);

  const isCurrentTabDirty = useCallback((): boolean => {
    if (activeTab === "icp-definition" && defEditing) return true;
    return tabSaveState.current[activeTab]?.isDirty ?? false;
  }, [activeTab, defEditing]);

  const saveCurrentTab = useCallback(() => {
    if (activeTab === "icp-definition" && defEditing) {
      localSaveRef.current?.();
    } else {
      tabSaveState.current[activeTab]?.onSave();
    }
  }, [activeTab, defEditing]);

  const handleTabSwitch = useCallback((newTab: string) => {
    if (newTab === activeTab) return;
    if (isCurrentTabDirty()) {
      setPendingTab(newTab);
    } else {
      setActiveTab(newTab);
    }
  }, [activeTab, isCurrentTabDirty]);

  const icpDirty = isCurrentTabDirty();
  useEffect(() => {
    if (icpDirty) {
      onSaveStateChange?.({
        isDirty: true,
        isPending: updateMutation.isPending,
        onSave: saveCurrentTab,
      });
    } else {
      onSaveStateChange?.(null);
    }
    return () => onSaveStateChange?.(null);
  }, [icpDirty, updateMutation.isPending, onSaveStateChange, saveCurrentTab]);

  const pendingTabRef = useRef<string | null>(null);

  const handleDialogSave = useCallback(() => {
    pendingTabRef.current = pendingTab;
    saveCurrentTab();
    setPendingTab(null);
  }, [pendingTab, saveCurrentTab]);

  useEffect(() => {
    if (pendingTabRef.current && !icpDirty) {
      setActiveTab(pendingTabRef.current);
      pendingTabRef.current = null;
    }
  }, [icpDirty]);

  const handleDialogDiscard = useCallback(() => {
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  }, [pendingTab]);

  useEffect(() => {
    if (!isCurrentTabDirty()) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isCurrentTabDirty]);

  const config: IcpConfig = useMemo(() => {
    if (ga?.icpConfig) return { ...DEFAULT_ICP_CONFIG, ...(ga.icpConfig as Partial<IcpConfig>) };
    return DEFAULT_ICP_CONFIG;
  }, [ga?.icpConfig]);

  const desc: IcpDescriptive = useMemo(() => {
    if (ga?.icpConfig && ga.icpConfig._descriptive) {
      return { ...DEFAULT_ICP_DESCRIPTIVE, ...(ga.icpConfig._descriptive as Partial<IcpDescriptive>) };
    }
    return DEFAULT_ICP_DESCRIPTIVE;
  }, [ga?.icpConfig]);

  const propertyLabel = ga?.propertyLabel || "Boutique Hotel";

  const savedDefinition = ga?.icpConfig?._definition as string | undefined;

  const essay = useMemo(
    () => generateIcpEssay(config, desc, propertyLabel),
    [config, desc, propertyLabel]
  );

  const icpConfigWith = useCallback((overrides: Record<string, any>) => {
    return { ...(ga?.icpConfig as Record<string, any> || {}), ...overrides };
  }, [ga?.icpConfig]);

  const mutateError = useCallback(() => {
    toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
  }, [toast]);

  const handleGenerateDefinition = () => {
    const md = generateIcpEssay(config, desc, propertyLabel);
    updateMutation.mutate(
      { icpConfig: icpConfigWith({ _definition: md }) },
      {
        onSuccess: () => {
          setDefEditing(false);
          toast({ title: "Generated", description: "ICP Management Co definition updated from current profile." });
        },
        onError: mutateError,
      }
    );
  };

  const handleSaveDefinition = useCallback(() => {
    updateMutation.mutate(
      { icpConfig: icpConfigWith({ _definition: defDraft }) },
      {
        onSuccess: () => {
          setDefEditing(false);
          toast({ title: "Saved", description: "ICP Management Co definition saved." });
        },
        onError: mutateError,
      }
    );
  }, [icpConfigWith, defDraft, updateMutation, toast, mutateError]);

  const handleEditDefinition = () => {
    setDefDraft(savedDefinition || essay || "");
    setDefEditing(true);
  };

  useEffect(() => {
    if (activeTab === "icp-definition" && defEditing) {
      localSaveRef.current = handleSaveDefinition;
    } else {
      localSaveRef.current = null;
    }
  }, [activeTab, defEditing, handleSaveDefinition]);

  // Layer 1: Loading gate — prevent sub-tabs from rendering before data is ready
  if (gaLoading) return <IcpLoadingSkeleton />;
  if (gaError) {
    return (
      <div className="w-full p-8 text-center">
        <IconAlertTriangle className="w-10 h-10 text-accent-pop mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load ICP Management Co configuration</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Could not fetch global assumptions. Check your connection and try again.
        </p>
        <Button onClick={() => gaRefetch()}>
          <IconRefreshCw className="w-4 h-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CurrentThemeTab tabs={ICP_TABS} activeTab={activeTab} onTabChange={handleTabSwitch} />

      <div className="mt-6">
        {activeTab === "icp-location" && (
          <IcpLocationTab onSaveStateChange={handleLocationSaveState} />
        )}

        {activeTab === "icp-profile" && (
          <CompanyProfileTab onSaveStateChange={handleProfileSaveState} />
        )}

        {activeTab === "icp-description" && (
          <AssetDefinitionTab onSaveStateChange={handleDescriptionSaveState} />
        )}

        {activeTab === "icp-definition" && (
          <Card className="bg-card border border-border/80 shadow-sm" data-testid="card-icp-definition">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">
                    ICP Definition
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Human-readable summary of the Ideal Customer Profile. Generate from current settings or edit by hand.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleGenerateDefinition}
                    disabled={updateMutation.isPending}
                    className="text-xs h-8 gap-1.5"
                    data-testid="button-generate-definition"
                  >
                    <IconRefreshCw className="w-3.5 h-3.5" />
                    {savedDefinition ? "Regenerate" : "Generate"}
                  </Button>
                  {!defEditing ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleEditDefinition}
                      disabled={!savedDefinition && !essay}
                      className="text-xs h-8 gap-1.5"
                      data-testid="button-edit-definition"
                    >
                      <IconPencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSaveDefinition}
                        disabled={updateMutation.isPending}
                        className="text-xs h-8 gap-1.5"
                        data-testid="button-save-definition"
                      >
                        {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDefEditing(false)}
                        className="text-xs h-8"
                        data-testid="button-cancel-definition"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {defEditing ? (
                <textarea
                  value={defDraft}
                  onChange={(e) => setDefDraft(e.target.value)}
                  className="w-full min-h-[400px] text-sm leading-relaxed font-sans text-foreground/90 bg-muted/40 border border-border rounded p-4 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="textarea-icp-definition"
                />
              ) : savedDefinition ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground/90"
                  data-testid="text-icp-definition"
                >
                  {savedDefinition.split("\n\n").map((paragraph, i) => (
                    <p key={i} className="mb-3 last:mb-0">{paragraph}</p>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <IconBookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No ICP Management Co definition generated yet</p>
                  <p className="text-xs mt-1">
                    Click <strong>Generate</strong> to build the definition from your current Property Profile and Property Description.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      </div>

      <AlertDialog open={pendingTab !== null} onOpenChange={(open) => { if (!open) setPendingTab(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this tab. Would you like to save them before switching?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTab(null)}>
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={handleDialogDiscard} data-testid="button-discard-changes">
              Discard
            </Button>
            <Button onClick={handleDialogSave} data-testid="button-save-and-switch">
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Icp() {
  const [saveState, setSaveState] = useState<AdminSaveState | null>(null);
  const handleSaveStateChange = useCallback((state: AdminSaveState | null) => {
    setSaveState(state);
  }, []);

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-4 p-4 sm:p-6">
          <PageHeader
            title="Ideal Customer Profile (Management Company)"
            subtitle="Define the target property profile and asset description for the portfolio"
            actions={
              saveState ? (
                <SaveButton
                  onClick={saveState.onSave}
                  hasChanges={saveState.isDirty}
                  isPending={saveState.isPending}
                  size="sm"
                  data-testid="button-icp-save"
                />
              ) : undefined
            }
          />
          <AnimatedSection delay={0.1}>
            <SelfHealingBoundary>
              <IcpContent onSaveStateChange={handleSaveStateChange} />
            </SelfHealingBoundary>
          </AnimatedSection>
        </div>
      </AnimatedPage>
    </Layout>
  );
}
