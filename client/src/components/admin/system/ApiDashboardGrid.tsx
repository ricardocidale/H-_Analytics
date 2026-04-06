import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconRefreshCw, IconTrash, IconActivity, IconShield, IconKey,
} from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ExternalIntegration {
  id: number;
  kind: string;
  serviceKey: string;
  name: string;
  sourceType: string;
  credentialEnvVar: string | null;
  host: string | null;
  isEnabled: boolean;
  isSubscribed: boolean;
  notes: string | null;
}

interface IntegrationStatus {
  name: string;
  healthy: boolean;
  latencyMs: number;
  lastError?: string;
  lastErrorAt?: number;
  circuitState: "closed" | "open" | "half-open";
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  keyCount: number;
  connected: boolean;
}

interface KeyRotation {
  id: number;
  serviceKey: string;
  rotatedBy: number | null;
  rotatedAt: string;
  previousKeyHash: string | null;
  notes: string | null;
}

function StatusDot({ healthy, enabled }: { healthy?: boolean; enabled: boolean }) {
  if (!enabled) return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />;
  if (healthy === undefined) return <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />;
  return <span className={cn("w-2 h-2 rounded-full shrink-0", healthy ? "bg-emerald-500" : "bg-red-500")} />;
}

function CircuitBadge({ state }: { state?: string }) {
  if (!state) return null;
  const color = state === "closed" ? "bg-emerald-500/10 text-emerald-700" : state === "open" ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-700";
  return <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium uppercase", color)} data-testid={`badge-circuit-${state}`}>{state}</span>;
}

export default function ApiDashboardGrid() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = useState("");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [rotationNotes, setRotationNotes] = useState("");

  const { data: integrations, isLoading: loadingIntegrations, refetch: refetchIntegrations } = useQuery<ExternalIntegration[]>({
    queryKey: ["/api/admin/ext-integrations"],
    staleTime: 30_000,
  });

  const { data: healthData, isLoading: loadingHealth, refetch: refetchHealth } = useQuery<IntegrationStatus[]>({
    queryKey: ["/api/admin/integrations/health"],
    staleTime: 30_000,
  });

  const { data: cacheStats, refetch: refetchCache } = useQuery<CacheStats>({
    queryKey: ["/api/admin/integrations/cache/stats"],
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      await apiRequest("PATCH", `/api/admin/ext-integrations/${id}/toggle`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ext-integrations"] });
      toast({ title: "Integration updated" });
    },
    onError: () => { toast({ title: "Failed to toggle integration", variant: "destructive" }); },
  });

  const clearAllCache = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/integrations/cache/clear");
    },
    onSuccess: () => {
      toast({ title: "Cache cleared" });
      refetchCache();
    },
    onError: () => { toast({ title: "Failed to clear cache", variant: "destructive" }); },
  });

  const clearPropertyCache = useMutation({
    mutationFn: async (pid: string) => {
      await apiRequest("POST", `/api/admin/integrations/cache/clear-property/${pid}`);
    },
    onSuccess: () => {
      toast({ title: "Property cache cleared" });
      refetchCache();
      setPropertyId("");
    },
    onError: () => { toast({ title: "Failed to clear property cache", variant: "destructive" }); },
  });

  const rotateMutation = useMutation({
    mutationFn: async ({ serviceKey, notes }: { serviceKey: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/admin/integrations/${serviceKey}/rotate-key`, { notes });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: "Key rotation recorded", description: `Service: ${vars.serviceKey}` });
      queryClient.invalidateQueries({ queryKey: ["key-rotations"] });
      setRotationNotes("");
    },
    onError: () => { toast({ title: "Failed to rotate key", variant: "destructive" }); },
  });

  const isLoading = loadingIntegrations || loadingHealth;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="api-dashboard-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const services = (integrations || []).map(integration => {
    const health = (healthData || []).find(h =>
      h.name.toLowerCase().replace(/[\s_-]+/g, "") === integration.name.toLowerCase().replace(/[\s_-]+/g, "")
      || h.name.toLowerCase().includes(integration.serviceKey.toLowerCase())
    );
    return { integration, health };
  });

  const apis = services.filter(s => s.integration.kind === "api");
  const scrapers = services.filter(s => s.integration.kind === "scraper");

  const hitRate = cacheStats && cacheStats.hits + cacheStats.misses > 0
    ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)
    : "0.0";

  function refreshAll() {
    refetchIntegrations();
    refetchHealth();
    refetchCache();
  }

  return (
    <div className="space-y-6" data-testid="api-dashboard-grid">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">{apis.length} APIs</Badge>
          <Badge variant="outline" className="text-xs">{scrapers.length} Scrapers</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} data-testid="button-refresh-dashboard">
          <IconRefreshCw className="w-4 h-4 mr-1" />
          Refresh All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {services.map(({ integration, health }) => (
          <ServiceCard
            key={integration.id}
            integration={integration}
            health={health}
            expanded={expandedCard === integration.serviceKey}
            onToggleExpand={() => setExpandedCard(expandedCard === integration.serviceKey ? null : integration.serviceKey)}
            onToggleEnabled={(enabled) => toggleMutation.mutate({ id: integration.id, isEnabled: enabled })}
            rotationNotes={expandedCard === integration.serviceKey ? rotationNotes : ""}
            onRotationNotesChange={setRotationNotes}
            onRotateKey={() => rotateMutation.mutate({ serviceKey: integration.serviceKey, notes: rotationNotes || undefined })}
            isRotating={rotateMutation.isPending}
          />
        ))}
      </div>

      <Card data-testid="card-data-source-config">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <IconShield className="w-4 h-4" />
            Institutional Data Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            {[
              { name: "Moody's Analytics", envVar: "MOODYS_API_KEY", desc: "Credit risk, default probability, risk premiums" },
              { name: "S&P Global", envVar: "SPGLOBAL_API_KEY", desc: "Case-Shiller indices, cap rate forecasts, sector analytics" },
              { name: "CoStar Group", envVar: "COSTAR_API_KEY", desc: "RevPAR, ADR, occupancy, supply pipeline, transaction comps" },
            ].map(source => {
              const match = (healthData || []).find(h => h.name.includes(source.name.split(" ")[0]));
              const configured = match?.healthy ?? false;
              return (
                <div key={source.name} className="flex items-start gap-3 p-3 border border-border rounded-lg" data-testid={`config-${source.name.replace(/[^a-zA-Z]/g, "").toLowerCase()}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-xs">{source.name}</span>
                      <Badge variant={configured ? "default" : "secondary"} className="text-[10px]">
                        {configured ? "Connected" : "Not Configured"}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px]">{source.desc}</p>
                    {!configured && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Set <code className="bg-muted px-1 rounded">{source.envVar}</code>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-cache-stats">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <IconActivity className="w-4 h-4" />
            Cache Performance
            <Badge variant={cacheStats?.connected ? "default" : "secondary"} className="text-[10px]">
              {cacheStats?.connected ? "Connected" : "Disconnected"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Hit Rate</p>
              <p className="font-semibold" data-testid="text-cache-hit-rate">{hitRate}%</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Hits</p>
              <p className="font-semibold" data-testid="text-cache-hits">{cacheStats?.hits ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Misses</p>
              <p className="font-semibold" data-testid="text-cache-misses">{cacheStats?.misses ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Keys</p>
              <p className="font-semibold" data-testid="text-cache-keys">{cacheStats?.keyCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Invalidations</p>
              <p className="font-semibold" data-testid="text-cache-invalidations">{cacheStats?.invalidations ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <Input
              placeholder="Property ID"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-32 h-8 text-xs"
              data-testid="input-property-id"
            />
            <Button variant="outline" size="sm" onClick={() => propertyId && clearPropertyCache.mutate(propertyId)} disabled={!propertyId || clearPropertyCache.isPending} data-testid="button-clear-property-cache">
              <IconTrash className="w-3 h-3 mr-1" />
              Clear Property
            </Button>
            <Button variant="destructive" size="sm" onClick={() => clearAllCache.mutate()} disabled={clearAllCache.isPending} data-testid="button-clear-all-cache">
              <IconTrash className="w-3 h-3 mr-1" />
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceCard({
  integration, health, expanded, onToggleExpand, onToggleEnabled,
  rotationNotes, onRotationNotesChange, onRotateKey, isRotating,
}: {
  integration: ExternalIntegration;
  health?: IntegrationStatus;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  rotationNotes: string;
  onRotationNotesChange: (v: string) => void;
  onRotateKey: () => void;
  isRotating: boolean;
}) {
  const { data: rotations } = useQuery<KeyRotation[]>({
    queryKey: ["key-rotations", integration.serviceKey],
    queryFn: async () => {
      const res = await fetch(`/api/admin/integrations/${integration.serviceKey}/rotations`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: expanded,
    staleTime: 60_000,
  });

  return (
    <Card className={cn("transition-all", !integration.isEnabled && "opacity-60")} data-testid={`card-service-${integration.serviceKey}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot healthy={health?.healthy} enabled={integration.isEnabled} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" data-testid={`text-service-name-${integration.serviceKey}`}>{integration.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{integration.sourceType}</Badge>
                {integration.host && <span className="text-[10px] text-muted-foreground font-mono truncate max-w-32">{integration.host}</span>}
              </div>
            </div>
          </div>
          <Switch
            checked={integration.isEnabled}
            onCheckedChange={onToggleEnabled}
            data-testid={`switch-enable-${integration.serviceKey}`}
          />
        </div>

        {health && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span data-testid={`text-latency-${integration.serviceKey}`}>{health.latencyMs}ms</span>
            <CircuitBadge state={health.circuitState} />
            {health.lastError && (
              <span className="text-red-500 truncate max-w-40" title={health.lastError}>{health.lastError}</span>
            )}
          </div>
        )}

        {integration.credentialEnvVar && (
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
            data-testid={`button-expand-${integration.serviceKey}`}
          >
            <IconKey className="w-3 h-3" />
            <span>Key Rotation</span>
            <span className={cn("ml-auto text-[10px] transition-transform", expanded && "rotate-180")}>▾</span>
          </button>
        )}

        {expanded && integration.credentialEnvVar && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>Credential:</span>
              <code className="bg-muted px-1 rounded">{integration.credentialEnvVar}</code>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Rotation notes (optional)"
                value={rotationNotes}
                onChange={(e) => onRotationNotesChange(e.target.value)}
                className="h-7 text-xs flex-1"
                data-testid={`input-rotation-notes-${integration.serviceKey}`}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onRotateKey}
                disabled={isRotating}
                data-testid={`button-rotate-key-${integration.serviceKey}`}
              >
                {isRotating ? <Loader2 className="w-3 h-3 animate-spin" /> : <IconKey className="w-3 h-3 mr-1" />}
                Rotate
              </Button>
            </div>
            {rotations && rotations.length > 0 && (
              <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
                <p className="text-[10px] text-muted-foreground font-medium">Recent rotations</p>
                {rotations.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono">{r.previousKeyHash?.slice(0, 8)}…</span>
                    <span>{new Date(r.rotatedAt).toLocaleDateString()}</span>
                    {r.notes && <span className="truncate max-w-32" title={r.notes}>{r.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
