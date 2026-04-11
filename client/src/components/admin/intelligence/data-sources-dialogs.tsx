import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { IconClock } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import type { SourceCategory, SourceEntry, CallLogEntry } from "./data-sources-types";
import { CATEGORY_SINGULAR, SOURCE_TYPES } from "./data-sources-types";

export interface ConfigureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SourceEntry | null;
  defaultCategory: SourceCategory;
  onSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}

export function ConfigureDialog({ open, onOpenChange, source, defaultCategory, onSave, isSaving }: ConfigureDialogProps) {
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

export function LogsPanel({ open, onOpenChange, source }: { open: boolean; onOpenChange: (open: boolean) => void; source: SourceEntry | null }) {
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
