import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { IconActivity, IconGlobe, IconResearch, IconBrain } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SourceRegistryOverlay from "./SourceRegistryOverlay";
import type { SourceCategory, SourceEntry, TestResult } from "./data-sources-types";
import { CATEGORY_TABS, CATEGORY_SINGULAR } from "./data-sources-types";
import { DataSourceCard } from "./data-sources-card";
import { ConfigureDialog, LogsPanel } from "./data-sources-dialogs";

export type { SourceCategory, SourceEntry, TestResult, CallLogEntry } from "./data-sources-types";
export { CATEGORY_TABS, CATEGORY_SINGULAR, SOURCE_TYPES, getStatus, formatLatency, formatRelativeTime } from "./data-sources-types";
export { StatusBadge, HealthBadge, DataSourceCard } from "./data-sources-card";
export { ConfigureDialog, LogsPanel } from "./data-sources-dialogs";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  IconGlobe,
  IconResearch,
  IconActivity,
  IconBrain,
};

export default function DataSourcesTab() {
  const [activeCategory, setActiveCategory] = useState<SourceCategory>("apis");
  const [configSource, setConfigSource] = useState<SourceEntry | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [deleteSource, setDeleteSource] = useState<SourceEntry | null>(null);
  const [logsSource, setLogsSource] = useState<SourceEntry | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set());

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sources = [], isLoading } = useQuery<SourceEntry[]>({
    queryKey: ["/api/admin/source-registry"],
    queryFn: () => apiRequest("GET", "/api/admin/source-registry").then(r => r.json()),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/source-registry/${id}/toggle`, { isActive }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/source-registry"] }),
    onError: () => toast({ title: "Failed to toggle source", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Record<string, unknown> }) =>
      id
        ? apiRequest("PATCH", `/api/admin/source-registry/${id}`, data).then(r => r.json())
        : apiRequest("POST", "/api/admin/source-registry", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/source-registry"] });
      setConfigOpen(false);
      toast({ title: isCreateMode ? "Source created" : "Source updated" });
    },
    onError: () => toast({ title: "Failed to save source", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/source-registry/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/source-registry"] });
      setDeleteSource(null);
      toast({ title: "Source deleted" });
    },
    onError: () => toast({ title: "Failed to delete source", variant: "destructive" }),
  });

  const handleToggle = (id: number, isActive: boolean) => {
    toggleMutation.mutate({ id, isActive });
  };

  const handleConfigure = (source: SourceEntry) => {
    setConfigSource(source);
    setIsCreateMode(false);
    setConfigOpen(true);
  };

  const handleAddNew = () => {
    setConfigSource(null);
    setIsCreateMode(true);
    setConfigOpen(true);
  };

  const handleSave = (data: Record<string, unknown>) => {
    saveMutation.mutate({ id: isCreateMode ? undefined : configSource?.id, data });
  };

  const handleTest = async (source: SourceEntry) => {
    setTestingIds(prev => new Set(prev).add(source.id));
    try {
      const res = await apiRequest("POST", `/api/admin/source-registry/${source.id}/test`);
      const result: TestResult = await res.json();
      setTestResults(prev => ({ ...prev, [source.id]: result }));
    } catch {
      setTestResults(prev => ({ ...prev, [source.id]: { healthy: false, latencyMs: 0, error: "Request failed" } }));
    } finally {
      setTestingIds(prev => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }
  };

  const filtered = sources.filter((s) => s.category === activeCategory);
  const categoryCounts = sources.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) {
    return (
      <div data-testid="data-sources-tab" className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading data sources…</p>
      </div>
    );
  }

  return (
    <div data-testid="data-sources-tab">
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {CATEGORY_TABS.map((tab) => {
          const Icon = ICON_MAP[tab.iconName];
          return (
            <button
              key={tab.value}
              onClick={() => setActiveCategory(tab.value)}
              data-testid={`datasource-tab-${tab.value}`}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeCategory === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {tab.label}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">{categoryCounts[tab.value] ?? 0}</Badge>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((source) => (
          <DataSourceCard
            key={source.id}
            source={source}
            onToggle={handleToggle}
            onConfigure={handleConfigure}
            onDelete={(s) => setDeleteSource(s)}
            onTest={handleTest}
            onLogs={(s) => setLogsSource(s)}
            testResult={testResults[source.id] ?? null}
            isTesting={testingIds.has(source.id)}
          />
        ))}

        <Card
          className="border-dashed border-2 border-border hover:border-primary/40 transition-colors cursor-pointer"
          data-testid="add-data-source"
          onClick={handleAddNew}
        >
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <span className="text-lg text-muted-foreground">+</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">Add {CATEGORY_SINGULAR[activeCategory]}</p>
          </CardContent>
        </Card>
      </div>

      <ConfigureDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        source={isCreateMode ? null : configSource}
        defaultCategory={activeCategory}
        onSave={handleSave}
        isSaving={saveMutation.isPending}
      />

      <AlertDialog open={!!deleteSource} onOpenChange={(open) => !open && setDeleteSource(null)}>
        <AlertDialogContent data-testid="delete-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteSource?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the data source from the registry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSource && deleteMutation.mutate(deleteSource.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LogsPanel open={!!logsSource} onOpenChange={(open) => !open && setLogsSource(null)} source={logsSource} />

      <SourceRegistryOverlay />
    </div>
  );
}
