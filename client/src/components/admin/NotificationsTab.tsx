import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Bell, MessageSquare, Mail, AlertTriangle, CheckCircle, XCircle, Clock } from "@/components/icons/themed-icons";
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
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
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

  // Vector latency alert local form state (synced from settings)
  const [vectorAlertsEnabled, setVectorAlertsEnabled] = useState(true);
  const [vectorSingleP95, setVectorSingleP95] = useState<string>("");
  const [vectorMultiP95, setVectorMultiP95] = useState<string>("");
  const [vectorRecipientIds, setVectorRecipientIds] = useState<number[]>([]);

  const { data: adminUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    select: (rows) => (rows ?? []).filter((u) => u.email && ADMIN_ROLES.has(u.role)),
  });

  useEffect(() => {
    setResendEnabled(settings.resend_enabled === "true");
    setVectorAlertsEnabled(settings.vector_latency_alerts_disabled !== "true");
    setVectorSingleP95(settings.vector_latency_single_p95_override ?? "");
    setVectorMultiP95(settings.vector_latency_multi_p95_override ?? "");
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
    onError: async (err: any) => {
      const msg = err?.message || "Failed to send test email";
      toast({ title: "Test email failed", description: msg, variant: "destructive" });
    },
  });

  const saveVectorSettings = () => {
    const updates: Record<string, string | null> = {
      vector_latency_alerts_disabled: vectorAlertsEnabled ? "false" : "true",
      vector_latency_single_p95_override: vectorSingleP95.trim() === "" ? null : vectorSingleP95.trim(),
      vector_latency_multi_p95_override: vectorMultiP95.trim() === "" ? null : vectorMultiP95.trim(),
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
    mutationFn: async (rule: any) => {
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
        </TabsContent>

        <TabsContent value="rules" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Alert Rules</h3>
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
                    data-testid="input-vector-single-p95"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 50 (blank = use file)"
                    value={vectorSingleP95}
                    onChange={(e) => setVectorSingleP95(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="input-vector-multi-p95">Multi-namespace p95 override (ms)</Label>
                  <Input
                    id="input-vector-multi-p95"
                    data-testid="input-vector-multi-p95"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 600 (blank = use file)"
                    value={vectorMultiP95}
                    onChange={(e) => setVectorMultiP95(e.target.value)}
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
                <Button
                  data-testid="button-save-vector-settings"
                  onClick={saveVectorSettings}
                  disabled={saveSettingsMutation.isPending}
                >
                  Save settings
                </Button>
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
                      {logs.map((log: any) => (
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
