import { Fragment, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Bell, MessageSquare, Mail, AlertTriangle, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { Checkbox } from "@/components/ui/checkbox";
import type { AlertRule, Property } from "@shared/schema";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
type AdminUser = { id: number; email: string; role: string; firstName?: string | null; lastName?: string | null };

const METRIC_OPTIONS = [
  { value: "dscr", label: "DSCR" },
  { value: "cap_rate", label: "Cap Rate" },
  { value: "occupancy", label: "Occupancy" },
  { value: "noi_variance", label: "NOI Variance" },
];

const OPERATOR_OPTIONS = [
  { value: "<", label: "Less than (<)" },
  { value: ">", label: "Greater than (>)" },
  { value: "=", label: "Equals (=)" },
  { value: "!=", label: "Not equals (≠)" },
];

const SCOPE_OPTIONS = [
  { value: "all", label: "All Properties" },
  { value: "specific", label: "Specific Property" },
  { value: "portfolio", label: "Portfolio Level" },
];

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
    sent: { variant: "default", icon: CheckCircle },
    delivered: { variant: "default", icon: CheckCircle },
    pending: { variant: "secondary", icon: Clock },
    failed: { variant: "destructive", icon: XCircle },
    bounced: { variant: "destructive", icon: AlertTriangle },
  };
  const { variant, icon: Icon } = config[status] || config.pending;
  return (
    <Badge variant={variant} className="gap-1" data-testid={`status-badge-${status}`}>
      <Icon className="w-3 h-3" />
      {status}
    </Badge>
  );
}

export default function NotificationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("channels");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<AlertRule> | null>(null);

  const { data: settings = {} } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/notifications/settings"],
  });

  const { data: alertRulesList = [] } = useQuery<AlertRule[]>({
    queryKey: ["/api/notifications/alert-rules"],
  });

  const { data: logs = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications/logs"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const [resendEnabled, setResendEnabled] = useState(false);
  const [bandChangeDisabled, setBandChangeDisabled] = useState(false);
  const [llmRegistryRefreshDisabled, setLlmRegistryRefreshDisabled] = useState(false);
  const [legacyStorageAuditDisabled, setLegacyStorageAuditDisabled] = useState(false);
  const [vectorOverrides, setVectorOverrides] = useState({
    singleP95: "",
    multiP95: "",
    singleP50: "",
    multiP50: "",
  });

  // Vector latency alert local form state (synced from settings)
  const [vectorAlertsEnabled, setVectorAlertsEnabled] = useState(true);
  const [vectorRecipientIds, setVectorRecipientIds] = useState<number[]>([]);

  const { data: adminUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    select: (rows) => (rows ?? []).filter((u) => u.email && ADMIN_ROLES.has(u.role)),
  });

  useEffect(() => {
    setResendEnabled(settings.resend_enabled === "true");
    setBandChangeDisabled(settings.specialist_quality_band_change_disabled === "true");
    setLlmRegistryRefreshDisabled(settings.llm_registry_refresh_disabled === "true");
    setLegacyStorageAuditDisabled(settings.legacy_storage_url_audit_disabled === "true");
    setVectorAlertsEnabled(settings.vector_latency_alerts_disabled !== "true");
    setVectorOverrides({
      singleP95: settings.vector_latency_single_p95_override ?? "",
      multiP95: settings.vector_latency_multi_p95_override ?? "",
      singleP50: settings.vector_latency_single_p50_override ?? "",
      multiP50: settings.vector_latency_multi_p50_override ?? "",
    });
    try {
      const raw = settings.vector_latency_recipient_user_ids;
      const parsed = raw ? JSON.parse(raw) : [];
      setVectorRecipientIds(Array.isArray(parsed) ? parsed.map((n: unknown) => Number(n)).filter((n) => Number.isFinite(n)) : []);
    } catch {
      setVectorRecipientIds([]);
    }
  }, [settings]);

  const testVectorMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/test-vector-latency", {});
      return res.json();
    },
    onSuccess: (data: { sent: number; failed: number; recipients: number; errors?: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/logs"] });
      if (data.failed > 0) {
        toast({
          title: `Sent ${data.sent}/${data.recipients}, ${data.failed} failed`,
          description: data.errors?.[0],
          variant: "destructive",
        });
      } else {
        toast({ title: `Test email sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}` });
      }
    },
    onError: async (err: unknown) => {
      const msg = (err as { message?: string })?.message || "Failed to send test email";
      toast({ title: "Test email failed", description: msg, variant: "destructive" });
    },
  });

  const saveVectorSettings = () => {
    const updates: Record<string, string | null> = {
      vector_latency_alerts_disabled: vectorAlertsEnabled ? "false" : "true",
      vector_latency_single_p95_override: vectorOverrides.singleP95.trim() === "" ? null : vectorOverrides.singleP95.trim(),
      vector_latency_multi_p95_override: vectorOverrides.multiP95.trim() === "" ? null : vectorOverrides.multiP95.trim(),
      vector_latency_single_p50_override: vectorOverrides.singleP50.trim() === "" ? null : vectorOverrides.singleP50.trim(),
      vector_latency_multi_p50_override: vectorOverrides.multiP50.trim() === "" ? null : vectorOverrides.multiP50.trim(),
      vector_latency_recipient_user_ids:
        vectorRecipientIds.length === 0 ? null : JSON.stringify(vectorRecipientIds),
    };
    saveSettingsMutation.mutate(updates);
  };

  const toggleVectorRecipient = (userId: number, checked: boolean) => {
    setVectorRecipientIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(userId);
      else set.delete(userId);
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  const saveSettingsMutation = useMutation({
    mutationFn: async (updates: Record<string, string | null>) => {
      await apiRequest("PUT", "/api/notifications/settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/settings"] });
      toast({ title: "Settings saved" });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async (rule: { id?: number | string; [key: string]: unknown }) => {
      if (rule.id) {
        await apiRequest("PATCH", `/api/notifications/alert-rules/${rule.id}`, rule);
      } else {
        await apiRequest("POST", "/api/notifications/alert-rules", rule);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/alert-rules"] });
      setRuleDialogOpen(false);
      setEditingRule(null);
      toast({ title: "Alert rule saved" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/notifications/alert-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/alert-rules"] });
      toast({ title: "Alert rule deleted" });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/notifications/alert-rules/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/alert-rules"] });
    },
  });

  return (
    <div className="space-y-6" data-testid="notifications-tab">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="channels" data-testid="tab-channels">
            <MessageSquare className="w-4 h-4 mr-1" /> Channels
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">
            <AlertTriangle className="w-4 h-4 mr-1" /> Alert Rules
          </TabsTrigger>
          <TabsTrigger value="vector-latency" data-testid="tab-vector-latency">
            <AlertTriangle className="w-4 h-4 mr-1" /> Vector Latency
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">
            <Bell className="w-4 h-4 mr-1" /> Delivery Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" /> Resend Email
              </CardTitle>
              <CardDescription>
                Enable branded email notifications via Resend. Requires RESEND_API_KEY environment variable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  data-testid="switch-resend-enabled"
                  checked={resendEnabled}
                  onCheckedChange={(checked) => {
                    setResendEnabled(checked);
                    saveSettingsMutation.mutate({ resend_enabled: checked ? "true" : "false" });
                  }}
                />
                <Label>Enable Resend email delivery</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                When enabled, report sharing and system notifications will be sent via Resend branded templates.
                Set <code className="text-xs bg-muted px-1 py-0.5 rounded">RESEND_API_KEY</code> in environment variables.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" /> Quiet hours
              </CardTitle>
              <CardDescription>
                Org-wide kill switches for noisy admin emails. Individual recipients can still tune their
                own preferences from the user settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  data-testid="switch-specialist-quality-band-change-disabled"
                  checked={bandChangeDisabled}
                  onCheckedChange={(checked) => {
                    setBandChangeDisabled(checked);
                    saveSettingsMutation.mutate({
                      specialist_quality_band_change_disabled: checked ? "true" : "false",
                    });
                  }}
                />
                <Label>Mute nightly Specialist quality band-drop emails</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                When enabled, the nightly Specialist quality recomputer will skip emailing admins about
                downward band drops (green→amber, amber→red, green→red). Quality scores still recompute
                and update on the Resources transparency UI; upward improvements never email — only
                drops are suppressed by this switch.
              </p>

              <div className="flex items-center gap-3 pt-2 border-t">
                <Switch
                  data-testid="switch-llm-registry-refresh-disabled"
                  checked={llmRegistryRefreshDisabled}
                  onCheckedChange={(checked) => {
                    setLlmRegistryRefreshDisabled(checked);
                    saveSettingsMutation.mutate({
                      llm_registry_refresh_disabled: checked ? "true" : "false",
                    });
                  }}
                />
                <Label>Mute LLM registry refresh issue emails</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                When enabled, the LLM registry refresher will skip emailing admins about issues it
                detects with admin-overridden model selections (e.g. a chosen model going offline or
                being deprecated). The registry still refreshes and applies recommendations; only the
                org-wide digest email is suppressed.
              </p>

              <div className="flex items-center gap-3 pt-4 border-t">
                <Switch
                  data-testid="switch-legacy-storage-url-audit-disabled"
                  checked={legacyStorageAuditDisabled}
                  onCheckedChange={(checked) => {
                    setLegacyStorageAuditDisabled(checked);
                    saveSettingsMutation.mutate({
                      legacy_storage_url_audit_disabled: checked ? "true" : "false",
                    });
                  }}
                />
                <Label>Mute nightly legacy storage URL audit emails</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                When enabled, the nightly database audit for legacy Replit Object Storage URLs will skip
                emailing admins when bad rows are detected. The scan still runs every 24h and the cycle
                summary is still recorded on the Observability dashboard — only the alert email is muted.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold font-display">Alert Rules</h3>
              <p className="text-sm text-muted-foreground">
                Define threshold rules that trigger notifications when property metrics breach limits.
              </p>
            </div>
            <Button
              data-testid="button-add-rule"
              onClick={() => {
                setEditingRule({ metric: "dscr", operator: "<", threshold: 1.2, scope: "all", cooldownMinutes: 1440, isActive: true, name: "" });
                setRuleDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Rule
            </Button>
          </div>

          {alertRulesList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No alert rules configured yet. Add a rule to start receiving threshold alerts.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {alertRulesList.map((rule) => (
                <Card key={rule.id} data-testid={`card-alert-rule-${rule.id}`}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Switch
                        data-testid={`switch-rule-${rule.id}`}
                        checked={rule.isActive}
                        onCheckedChange={(checked) => toggleRuleMutation.mutate({ id: rule.id, isActive: checked })}
                      />
                      <div>
                        <p className="font-medium">{rule.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {METRIC_OPTIONS.find((m) => m.value === rule.metric)?.label || rule.metric}{" "}
                          {rule.operator} {rule.threshold} &bull;{" "}
                          {SCOPE_OPTIONS.find((s) => s.value === rule.scope)?.label || rule.scope} &bull;{" "}
                          Cooldown: {rule.cooldownMinutes}min
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`button-edit-rule-${rule.id}`}
                        onClick={() => {
                          setEditingRule(rule);
                          setRuleDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`button-delete-rule-${rule.id}`}
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="vector-latency" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Vector Search Latency Alerts
              </CardTitle>
              <CardDescription>
                Email admins when the latest vector benchmark run breaches the p95 latency thresholds.
                Leave a threshold blank to use the value embedded in the bench history file.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3">
                <Switch
                  data-testid="switch-vector-alerts-enabled"
                  checked={vectorAlertsEnabled}
                  onCheckedChange={setVectorAlertsEnabled}
                />
                <Label>Alert enabled</Label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="input-vector-single-p95">Single-namespace p95 override (ms)</Label>
                  <Input
                    id="input-vector-single-p95"
                    data-testid="input-vector-single-p95-override"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 50 (blank = use file)"
                    value={vectorOverrides.singleP95}
                    onChange={(e) => setVectorOverrides({ ...vectorOverrides, singleP95: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="input-vector-multi-p95">Multi-namespace p95 override (ms)</Label>
                  <Input
                    id="input-vector-multi-p95"
                    data-testid="input-vector-multi-p95-override"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 600 (blank = use file)"
                    value={vectorOverrides.multiP95}
                    onChange={(e) => setVectorOverrides({ ...vectorOverrides, multiP95: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="input-vector-single-p50">Single-namespace p50 override (ms)</Label>
                  <Input
                    id="input-vector-single-p50"
                    data-testid="input-vector-single-p50-override"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 20 (blank = use file)"
                    value={vectorOverrides.singleP50}
                    onChange={(e) => setVectorOverrides({ ...vectorOverrides, singleP50: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="input-vector-multi-p50">Multi-namespace p50 override (ms)</Label>
                  <Input
                    id="input-vector-multi-p50"
                    data-testid="input-vector-multi-p50-override"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 200 (blank = use file)"
                    value={vectorOverrides.multiP50}
                    onChange={(e) => setVectorOverrides({ ...vectorOverrides, multiP50: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Recipients</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Pick which admins receive alerts. Leave all unchecked to email every admin (default).
                </p>
                {adminUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-admins">
                    No admin users found.
                  </p>
                ) : (
                  <div className="space-y-2 border rounded-md p-3 max-h-64 overflow-y-auto">
                    {adminUsers.map((u) => {
                      const checked = vectorRecipientIds.includes(u.id);
                      const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-3 cursor-pointer text-sm"
                          data-testid={`row-vector-recipient-${u.id}`}
                        >
                          <Checkbox
                            data-testid={`checkbox-vector-recipient-${u.id}`}
                            checked={checked}
                            onCheckedChange={(v) => toggleVectorRecipient(u.id, v === true)}
                          />
                          <span className="font-medium">{displayName}</span>
                          <span className="text-muted-foreground">{u.email}</span>
                          <Badge variant="outline" className="ml-auto text-xs">{u.role}</Badge>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <SaveButton
                  data-testid="button-save-vector-settings"
                  onClick={saveVectorSettings}
                  isPending={saveSettingsMutation.isPending}
                >
                  Save settings
                </SaveButton>
                <Button
                  variant="outline"
                  data-testid="button-test-vector-email"
                  onClick={() => testVectorMutation.mutate()}
                  disabled={testVectorMutation.isPending || !resendEnabled}
                  title={!resendEnabled ? "Enable Resend on the Channels tab first" : undefined}
                >
                  Send test email
                </Button>
              </div>
              {!resendEnabled && (
                <p className="text-xs text-muted-foreground" data-testid="text-resend-disabled-hint">
                  Resend email delivery is currently disabled. Enable it on the Channels tab to send alerts.
                </p>
              )}
            </CardContent>
          </Card>

          <VectorLatencyAlertsPanel />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Delivery Log</CardTitle>
              <CardDescription>Recent notification delivery status across all channels.</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No notifications sent yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Event</th>
                        <th className="py-2 px-3">Channel</th>
                        <th className="py-2 px-3">Recipient</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log: { id: number; createdAt: string; eventType: string; channel: string; recipient?: string; status: string }) => (
                        <tr key={log.id} className="border-b" data-testid={`row-log-${log.id}`}>
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 px-3">{log.eventType}</td>
                          <td className="py-2 px-3">
                            <Badge variant="outline">{log.channel}</Badge>
                          </td>
                          <td className="py-2 px-3">{log.recipient || "—"}</td>
                          <td className="py-2 px-3">
                            <StatusBadge status={log.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule?.id ? "Edit Alert Rule" : "New Alert Rule"}</DialogTitle>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-4">
              <div>
                <Label>Rule Name</Label>
                <Input
                  data-testid="input-rule-name"
                  value={editingRule.name || ""}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="e.g., Low DSCR Alert"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Metric</Label>
                  <Select value={editingRule.metric || "dscr"} onValueChange={(v) => setEditingRule({ ...editingRule, metric: v })}>
                    <SelectTrigger data-testid="select-rule-metric">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operator</Label>
                  <Select value={editingRule.operator || "<"} onValueChange={(v) => setEditingRule({ ...editingRule, operator: v })}>
                    <SelectTrigger data-testid="select-rule-operator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Threshold</Label>
                  <Input
                    data-testid="input-rule-threshold"
                    type="number"
                    step="0.01"
                    value={editingRule.threshold ?? 1.2}
                    onChange={(e) => setEditingRule({ ...editingRule, threshold: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select value={editingRule.scope || "all"} onValueChange={(v) => setEditingRule({ ...editingRule, scope: v })}>
                    <SelectTrigger data-testid="select-rule-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editingRule.scope === "specific" && (
                <div>
                  <Label>Property</Label>
                  <Select
                    value={editingRule.propertyId?.toString() || ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, propertyId: parseInt(v) })}
                  >
                    <SelectTrigger data-testid="select-rule-property">
                      <SelectValue placeholder="Select a property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p: Property) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Cooldown (minutes)</Label>
                <Input
                  data-testid="input-rule-cooldown"
                  type="number"
                  value={editingRule.cooldownMinutes ?? 1440}
                  onChange={(e) => setEditingRule({ ...editingRule, cooldownMinutes: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground mt-1">Default: 1440 (24 hours). Prevents duplicate alerts within this period.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-save-rule"
              onClick={() => {
                if (!editingRule?.name) return;
                createRuleMutation.mutate(editingRule);
              }}
              disabled={!editingRule?.name || createRuleMutation.isPending}
            >
              {editingRule?.id ? "Update" : "Create"} Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type VectorLatencyFilter = "all" | "real" | "test";

type VectorBreach = {
  size?: number;
  scope?: "single" | "multi";
  metric?: "p50" | "p95";
  valueMs?: number;
  thresholdMs?: number;
  p50Ms?: number;
  p95Ms?: number;
  thresholdP95Ms?: number;
};

type VectorAlertMetadata = {
  test?: boolean;
  runId?: string;
  breaches?: VectorBreach[];
} | null;

type VectorAlertLog = {
  id: number;
  createdAt: string;
  recipient?: string;
  status: string;
  metadata?: VectorAlertMetadata;
};

function fmtLatency(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  return ms >= 100 ? `${ms.toFixed(0)} ms` : `${ms.toFixed(1)} ms`;
}

function summarizeBreach(b: VectorBreach): string {
  const scope = b.scope ?? "?";
  const metric = b.metric ?? (b.thresholdP95Ms !== undefined ? "p95" : "?");
  const value = b.valueMs ?? (metric === "p95" ? b.p95Ms : b.p50Ms);
  const threshold = b.thresholdMs ?? b.thresholdP95Ms;
  const sizeLabel = typeof b.size === "number" ? b.size.toLocaleString() : "?";
  return `${scope} ${metric} ${fmtLatency(value)} > ${fmtLatency(threshold)} @ size ${sizeLabel}`;
}

function VectorLatencyAlertsPanel() {
  const [filter, setFilter] = useState<VectorLatencyFilter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data: vectorLogs = [], isLoading } = useQuery<VectorAlertLog[]>({
    queryKey: ["/api/notifications/logs", { eventType: "VECTOR_LATENCY_BREACH", limit: 10 }],
    queryFn: async () => {
      const res = await fetch("/api/notifications/logs?eventType=VECTOR_LATENCY_BREACH&limit=10", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load alerts: ${res.status}`);
      return res.json();
    },
  });

  const filteredLogs = vectorLogs.filter((log) => {
    if (filter === "all") return true;
    const isTest = !!log.metadata?.test;
    return filter === "test" ? isTest : !isTest;
  });

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card data-testid="card-vector-latency-alerts">
      <CardHeader>
        <CardTitle>Recent Vector Latency Alerts</CardTitle>
        <CardDescription>
          The last 10 vector search latency breach notifications, including [TEST] sends, so you can
          confirm your alert wiring without leaving the page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) => {
              if (value === "all" || value === "real" || value === "test") {
                setFilter(value);
              }
            }}
            variant="outline"
            size="sm"
            data-testid={`toggle-vector-latency-filter-${filter}`}
          >
            <ToggleGroupItem value="all" data-testid="toggle-vector-latency-filter-all">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="real" data-testid="toggle-vector-latency-filter-real">
              Real only
            </ToggleGroupItem>
            <ToggleGroupItem value="test" data-testid="toggle-vector-latency-filter-test">
              Test only
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8" data-testid="text-vector-latency-loading">
            Loading recent alerts…
          </p>
        ) : filteredLogs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8" data-testid="text-vector-latency-empty">
            {vectorLogs.length === 0
              ? "No vector latency alerts have been sent yet."
              : "No vector latency alerts match the current filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">Recipient</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Why</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const meta = log.metadata ?? null;
                  const isTest = !!meta?.test;
                  const breaches = Array.isArray(meta?.breaches) ? meta!.breaches! : [];
                  const hasBreaches = !isTest && breaches.length > 0;
                  const isExpanded = expanded.has(log.id);
                  const canExpand = hasBreaches && breaches.length > 1;
                  return (
                    <Fragment key={log.id}>
                      <tr
                        className="border-b"
                        data-testid={`row-vector-latency-alert-${log.id}`}
                      >
                        <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 px-3">{log.recipient || "—"}</td>
                        <td className="py-2 px-3">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            variant={isTest ? "secondary" : "outline"}
                            data-testid={`badge-vector-latency-kind-${log.id}`}
                          >
                            {isTest ? "[TEST]" : "Real"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          {isTest || !hasBreaches ? (
                            <span
                              className="text-muted-foreground"
                              data-testid={`text-vector-latency-summary-${log.id}`}
                            >
                              —
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {canExpand ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(log.id)}
                                  className="inline-flex items-center text-muted-foreground hover:text-foreground"
                                  aria-expanded={isExpanded}
                                  aria-label={
                                    isExpanded
                                      ? "Collapse breach details"
                                      : "Expand breach details"
                                  }
                                  data-testid={`button-vector-latency-expand-${log.id}`}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              ) : null}
                              <span
                                className="font-mono text-xs"
                                data-testid={`text-vector-latency-summary-${log.id}`}
                              >
                                {summarizeBreach(breaches[0])}
                              </span>
                              {canExpand && !isExpanded ? (
                                <span
                                  className="text-xs text-muted-foreground"
                                  data-testid={`text-vector-latency-more-${log.id}`}
                                >
                                  +{breaches.length - 1} more
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && canExpand ? (
                        <tr
                          className="border-b bg-muted/30"
                          data-testid={`row-vector-latency-details-${log.id}`}
                        >
                          <td colSpan={5} className="py-2 px-3">
                            <ul className="list-disc pl-6 space-y-1 font-mono text-xs">
                              {breaches.map((b, idx) => (
                                <li
                                  key={idx}
                                  data-testid={`text-vector-latency-detail-${log.id}-${idx}`}
                                >
                                  {summarizeBreach(b)}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
