import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { IconActivity, IconGlobe, IconResearch, IconBrain, IconSettingsGear, IconTrash, IconCheckCircle, IconXCircle, IconAlertTriangle, IconClock } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SourceRegistryOverlay from "./SourceRegistryOverlay";

type SourceCategory = "apis" | "scrapers" | "sources" | "models";

interface SourceEntry {
  id: number;
  serviceKey: string;
  name: string;
  sourceType: string;
  trustScore: string | null;
  category: string;
  cadence: string | null;
  lastHealthCheck: string | null;
  lastDataDate: string | null;
  isActive: boolean;
  description: string | null;
  endpoint: string | null;
  apiKeyRef: string | null;
  rateLimitPerMin: number | null;
  successRate: number | null;
  avgLatencyMs: number | null;
  costPerCall: string | null;
  dataProvided: string[] | null;
}

interface TestResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

const CATEGORY_TABS: { value: SourceCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "apis", label: "APIs", icon: IconGlobe },
  { value: "scrapers", label: "Scrapers", icon: IconResearch },
  { value: "sources", label: "Sources", icon: IconActivity },
  { value: "models", label: "Models", icon: IconBrain },
];

const CATEGORY_SINGULAR: Record<SourceCategory, string> = {
  apis: "API",
  scrapers: "Scraper",
  sources: "Source",
  models: "Model",
};

const SOURCE_TYPES: Record<SourceCategory, string[]> = {
  apis: ["api", "rest", "graphql"],
  scrapers: ["scraper", "crawler", "extractor"],
  sources: ["report", "survey", "publication", "database"],
  models: ["llm", "embedding", "vision"],
};

function getStatus(source: SourceEntry): "healthy" | "degraded" | "error" | "inactive" {
  if (!source.isActive) return "inactive";
  if (source.successRate !== null) {
    if (source.successRate < 80) return "error";
    if (source.successRate < 90) return "degraded";
  }
  return "healthy";
}

function StatusBadge({ status }: { status: "healthy" | "degraded" | "error" | "inactive" }) {
  const config = {
    healthy: { label: "Healthy", className: "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30" },
    degraded: { label: "Degraded", className: "border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30" },
    error: { label: "Unreliable", className: "border-red-300 text-red-700 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-950/30" },
    inactive: { label: "Inactive", className: "border-gray-300 text-gray-500 bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:bg-gray-900/30" },
  };
  const c = config[status];
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", c.className)}>{c.label}</Badge>;
}

function HealthBadge({ successRate }: { successRate: number | null }) {
  if (successRate === null) return null;
  if (successRate >= 90) return null;
  if (successRate < 80) {
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-700 bg-red-50 dark:border-red-700 dark:text-red-400 dark:bg-red-950/30">
      <IconAlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Unreliable
    </Badge>;
  }
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/30">
    <IconAlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Warning
  </Badge>;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ConfigureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SourceEntry | null;
  defaultCategory: SourceCategory;
  onSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}

function ConfigureDialog({ open, onOpenChange, source, defaultCategory, onSave, isSaving }: ConfigureDialogProps) {
  const isCreate = !source;
  const [name, setName] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SourceCategory>(defaultCategory);
  const [sourceType, setSourceType] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [rateLimitPerMin, setRateLimitPerMin] = useState("");
  const [costPerCall, setCostPerCall] = useState("");
  const [dataProvidedStr, setDataProvidedStr] = useState("");
  const [cadence, setCadence] = useState("");

  useEffect(() => {
    if (!open) return;
    if (source) {
      setName(source.name);
      setServiceKey(source.serviceKey);
      setDescription(source.description ?? "");
      setCategory(source.category as SourceCategory);
      setSourceType(source.sourceType);
      setEndpoint(source.endpoint ?? "");
      setApiKeyRef(source.apiKeyRef ?? "");
      setRateLimitPerMin(source.rateLimitPerMin?.toString() ?? "");
      setCostPerCall(source.costPerCall ?? "");
      setDataProvidedStr(source.dataProvided?.join(", ") ?? "");
      setCadence(source.cadence ?? "");
    } else {
      setName("");
      setServiceKey("");
      setDescription("");
      setCategory(defaultCategory);
      setSourceType(SOURCE_TYPES[defaultCategory][0] ?? "api");
      setEndpoint("");
      setApiKeyRef("");
      setRateLimitPerMin("");
      setCostPerCall("");
      setDataProvidedStr("");
      setCadence("");
    }
  }, [open, source, defaultCategory]);

  const handleSubmit = () => {
    const data: Record<string, unknown> = {
      name,
      description: description || undefined,
      category,
      sourceType: sourceType || SOURCE_TYPES[category][0],
      endpoint: endpoint || undefined,
      apiKeyRef: apiKeyRef || undefined,
      rateLimitPerMin: rateLimitPerMin ? parseInt(rateLimitPerMin) : undefined,
      costPerCall: costPerCall || undefined,
      dataProvided: dataProvidedStr ? dataProvidedStr.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      cadence: cadence || undefined,
    };
    if (isCreate) {
      data.serviceKey = serviceKey || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="configure-dialog">
        <DialogHeader>
          <DialogTitle>{isCreate ? `Add ${CATEGORY_SINGULAR[defaultCategory]}` : `Configure ${source?.name}`}</DialogTitle>
          <DialogDescription>
            {isCreate ? "Add a new data source to the registry." : "Edit source configuration and connection details."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cfg-name">Name</Label>
              <Input id="cfg-name" data-testid="input-source-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FRED API" />
            </div>
            {isCreate && (
              <div>
                <Label htmlFor="cfg-key">Service Key</Label>
                <Input id="cfg-key" data-testid="input-service-key" value={serviceKey} onChange={(e) => setServiceKey(e.target.value)} placeholder="e.g. fred-api" />
              </div>
            )}
            {!isCreate && (
              <div>
                <Label htmlFor="cfg-type">Source Type</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger id="cfg-type" data-testid="select-source-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES[category].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="cfg-desc">Description</Label>
            <Textarea id="cfg-desc" data-testid="input-source-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" rows={2} />
          </div>

          <div>
            <Label htmlFor="cfg-endpoint">Endpoint URL</Label>
            <Input id="cfg-endpoint" data-testid="input-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.com/v1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cfg-apikey">Credential Env Var</Label>
              <Input id="cfg-apikey" data-testid="input-api-key-ref" value={apiKeyRef} onChange={(e) => setApiKeyRef(e.target.value)} placeholder="e.g. FRED_API_KEY" />
            </div>
            <div>
              <Label htmlFor="cfg-ratelimit">Rate Limit (req/min)</Label>
              <Input id="cfg-ratelimit" data-testid="input-rate-limit" type="number" value={rateLimitPerMin} onChange={(e) => setRateLimitPerMin(e.target.value)} placeholder="e.g. 60" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cfg-cost">Cost per Call</Label>
              <Input id="cfg-cost" data-testid="input-cost" value={costPerCall} onChange={(e) => setCostPerCall(e.target.value)} placeholder="e.g. $0.01 or Free" />
            </div>
            <div>
              <Label htmlFor="cfg-cadence">Cadence</Label>
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger id="cfg-cadence" data-testid="select-cadence">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {["realtime", "hourly", "daily", "weekly", "monthly", "quarterly", "annual"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="cfg-data">Data Provided (comma-separated)</Label>
            <Input id="cfg-data" data-testid="input-data-provided" value={dataProvidedStr} onChange={(e) => setDataProvidedStr(e.target.value)} placeholder="e.g. SOFR, CPI, Treasury Yields" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="btn-cancel-configure">Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name || isSaving} data-testid="btn-save-configure">
            {isSaving ? "Saving…" : isCreate ? "Create" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CallLogEntry {
  id: number;
  sourceId: number;
  serviceKey: string;
  timestamp: string;
  httpStatus: number | null;
  latencyMs: number | null;
  success: boolean;
  errorMessage: string | null;
}

function LogsPanel({ open, onOpenChange, source }: { open: boolean; onOpenChange: (open: boolean) => void; source: SourceEntry | null }) {
  const { data: logs = [], isLoading } = useQuery<CallLogEntry[]>({
    queryKey: ["/api/admin/source-registry", source?.id, "logs"],
    queryFn: () => apiRequest("GET", `/api/admin/source-registry/${source!.id}/logs`).then(r => r.json()),
    enabled: open && !!source,
  });

  if (!source) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg" data-testid="logs-panel">
        <SheetHeader>
          <SheetTitle>Activity Logs — {source.name}</SheetTitle>
          <SheetDescription>Last 50 API calls for this source.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2 max-h-[calc(100vh-150px)] overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Loading logs…</p>}
          {!isLoading && logs.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No activity logged yet. Use the "Test" button to create an entry.</p>
          )}
          {logs.map((log) => {
            const statusCode = log.httpStatus ?? (log.success ? 200 : 0);
            return (
              <div key={log.id} className="flex items-center gap-3 text-xs py-2 px-3 rounded-md bg-muted/40 border border-border/40">
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  log.success ? "bg-emerald-500" : statusCode === 429 ? "bg-amber-500" : "bg-red-500"
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {statusCode > 0 && <span className="font-mono font-medium">{statusCode}</span>}
                    {log.latencyMs !== null && <span className="text-muted-foreground">{log.latencyMs}ms</span>}
                    {log.errorMessage && <span className="text-red-600 dark:text-red-400 truncate">{log.errorMessage}</span>}
                    {!log.errorMessage && log.success && <span className="text-emerald-600 dark:text-emerald-400">OK</span>}
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0">
                  <IconClock className="w-3 h-3 inline mr-1" />
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DataSourceCard({
  source,
  onToggle,
  onConfigure,
  onDelete,
  onTest,
  onLogs,
  testResult,
  isTesting,
}: {
  source: SourceEntry;
  onToggle: (id: number, isActive: boolean) => void;
  onConfigure: (source: SourceEntry) => void;
  onDelete: (source: SourceEntry) => void;
  onTest: (source: SourceEntry) => void;
  onLogs: (source: SourceEntry) => void;
  testResult: TestResult | null;
  isTesting: boolean;
}) {
  const status = getStatus(source);

  return (
    <Card
      data-testid={`data-source-card-${source.serviceKey}`}
      className={cn(
        "transition-all duration-200 hover:shadow-md",
        !source.isActive && "opacity-60"
      )}
    >
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="text-sm font-semibold text-foreground truncate">{source.name}</h4>
              <StatusBadge status={status} />
              <HealthBadge successRate={source.isActive ? source.successRate : null} />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{source.description ?? source.sourceType}</p>
          </div>
          <Switch
            checked={source.isActive}
            onCheckedChange={(checked) => onToggle(source.id, checked)}
            data-testid={`toggle-${source.serviceKey}`}
            className="ml-2 shrink-0"
          />
        </div>

        {source.isActive && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
              {source.lastHealthCheck && (
                <div>
                  <span className="text-muted-foreground">Last Check</span>
                  <p className="font-medium text-foreground">{formatRelativeTime(source.lastHealthCheck)}</p>
                </div>
              )}
              {source.successRate !== null && (
                <div>
                  <span className="text-muted-foreground">Success Rate</span>
                  <p className={cn(
                    "font-medium",
                    source.successRate >= 95 ? "text-emerald-600" : source.successRate >= 90 ? "text-amber-600" : "text-red-600"
                  )}>{source.successRate}%</p>
                </div>
              )}
              {source.avgLatencyMs !== null && (
                <div>
                  <span className="text-muted-foreground">Avg Latency</span>
                  <p className="font-medium text-foreground">{formatLatency(source.avgLatencyMs)}</p>
                </div>
              )}
              {source.costPerCall && (
                <div>
                  <span className="text-muted-foreground">Cost/Call</span>
                  <p className="font-medium text-foreground">{source.costPerCall}</p>
                </div>
              )}
            </div>

            {source.dataProvided && source.dataProvided.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {source.dataProvided.map((d) => (
                  <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{d}</Badge>
                ))}
              </div>
            )}

            {testResult && (
              <div className={cn(
                "flex items-center gap-2 text-xs px-2 py-1.5 rounded-md mb-3",
                testResult.healthy
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              )} data-testid={`test-result-${source.serviceKey}`}>
                {testResult.healthy
                  ? <><IconCheckCircle className="w-3.5 h-3.5" /> Connected — {testResult.latencyMs}ms</>
                  : <><IconXCircle className="w-3.5 h-3.5" /> Failed — {testResult.error ?? "Unknown error"}</>
                }
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/60">
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`configure-${source.serviceKey}`} onClick={() => onConfigure(source)}>
            <IconSettingsGear className="w-3 h-3 mr-1" />
            Configure
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`test-${source.serviceKey}`} onClick={() => onTest(source)} disabled={isTesting}>
            {isTesting ? "Testing…" : "Test"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" data-testid={`logs-${source.serviceKey}`} onClick={() => onLogs(source)}>
            Logs
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-destructive hover:text-destructive" data-testid={`delete-${source.serviceKey}`} onClick={() => onDelete(source)}>
            <IconTrash className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
          const Icon = tab.icon;
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
              <Icon className="w-3.5 h-3.5" />
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
