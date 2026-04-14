import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Play, Pencil, Trash2, Plus, CheckCircle2, XCircle, Clock, Hourglass } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ScheduledWorkflow {
  id: number;
  workflowKey: string;
  name: string;
  description: string | null;
  researchType: string;
  frequencyHours: number;
  promptInstructions: string | null;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string | null;
  lastRunDurationMs: number | null;
  lastRunError: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowFormData {
  workflowKey: string;
  name: string;
  description: string;
  researchType: string;
  frequencyHours: number;
  promptInstructions: string;
  isEnabled: boolean;
  priority: number;
}

const defaultForm: WorkflowFormData = {
  workflowKey: "",
  name: "",
  description: "",
  researchType: "global",
  frequencyHours: 168,
  promptInstructions: "",
  isEnabled: true,
  priority: 5,
};

function formatDuration(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absMs = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  if (absMs < 60000) return isFuture ? "in < 1 min" : "< 1 min ago";
  if (absMs < 3600000) {
    const mins = Math.floor(absMs / 60000);
    return isFuture ? `in ${mins} min` : `${mins} min ago`;
  }
  if (absMs < 86400000) {
    const hours = Math.floor(absMs / 3600000);
    return isFuture ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.floor(absMs / 86400000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function StatusBadge({ status }: { status: string | null }) {
  const config: Record<string, { className: string; icon: typeof CheckCircle2 }> = {
    completed: { className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
    running: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse", icon: Clock },
    failed: { className: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
    pending: { className: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Hourglass },
  };
  const c = config[status ?? "pending"] ?? config.pending;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${c.className}`} data-testid={`status-badge-${status}`}>
      <Icon className="w-3 h-3" />
      {status ?? "pending"}
    </Badge>
  );
}

export default function ScheduledResearchPanel() {
  const queryClient = useQueryClient();
  const [editingWorkflow, setEditingWorkflow] = useState<ScheduledWorkflow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<WorkflowFormData>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledWorkflow | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useQuery<ScheduledWorkflow[]>({
    queryKey: ["/api/admin/scheduled-research"],
    queryFn: () => apiRequest("GET", "/api/admin/scheduled-research").then(r => r.json()),
    refetchInterval: 15000,
  });

  const createMutation = useMutation({
    mutationFn: (data: WorkflowFormData) => apiRequest("POST", "/api/admin/scheduled-research", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-research"] });
      setIsCreating(false);
      setFormData(defaultForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WorkflowFormData> }) =>
      apiRequest("PUT", `/api/admin/scheduled-research/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-research"] });
      setEditingWorkflow(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/scheduled-research/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-research"] });
      setDeleteTarget(null);
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) =>
      apiRequest("PUT", `/api/admin/scheduled-research/${id}`, { isEnabled }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-research"] }),
  });

  const runNow = async (workflow: ScheduledWorkflow) => {
    setRunningId(workflow.id);
    try {
      const response = await fetch(`/api/admin/scheduled-research/${workflow.id}/execute`, {
        method: "POST",
        credentials: "include",
      });
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          decoder.decode(value);
        }
      }
    } finally {
      setRunningId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-research"] });
    }
  };

  const openEdit = (w: ScheduledWorkflow) => {
    setEditingWorkflow(w);
    setFormData({
      workflowKey: w.workflowKey,
      name: w.name,
      description: w.description ?? "",
      researchType: w.researchType,
      frequencyHours: w.frequencyHours,
      promptInstructions: w.promptInstructions ?? "",
      isEnabled: w.isEnabled,
      priority: w.priority,
    });
  };

  const openCreate = () => {
    setIsCreating(true);
    setFormData(defaultForm);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const staleCount = workflows.filter(w =>
    w.isEnabled && w.nextRunAt && new Date(w.nextRunAt) <= new Date(),
  ).length;

  return (
    <div className="space-y-6" data-testid="scheduled-research-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {workflows.length} Workflow{workflows.length !== 1 ? "s" : ""}
            </h3>
            <p className="text-xs text-muted-foreground">
              {staleCount > 0 ? `${staleCount} due for refresh` : "All up to date"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5" data-testid="button-create-workflow">
          <Plus className="w-4 h-4" />
          Add Workflow
        </Button>
      </div>

      <div className="grid gap-3">
        {workflows.map((w) => {
          const isDue = w.isEnabled && w.nextRunAt && new Date(w.nextRunAt) <= new Date();
          const isRunning = runningId === w.id || w.lastRunStatus === "running";

          return (
            <Card
              key={w.id}
              className={`transition-all ${isDue ? "border-amber-500/40 bg-amber-500/5" : ""} ${!w.isEnabled ? "opacity-60" : ""}`}
              data-testid={`card-workflow-${w.workflowKey}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-foreground truncate" data-testid={`text-workflow-name-${w.id}`}>
                        {w.name}
                      </h4>
                      <StatusBadge status={w.lastRunStatus} />
                      {isDue && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                          Due
                        </Badge>
                      )}
                    </div>
                    {w.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {w.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span data-testid={`text-frequency-${w.id}`}>
                        Every {formatDuration(w.frequencyHours)}
                      </span>
                      <span>
                        Last: {formatRelativeTime(w.lastRunAt)}
                      </span>
                      <span>
                        Next: {formatRelativeTime(w.nextRunAt)}
                      </span>
                      {w.lastRunDurationMs != null && (
                        <span>
                          Duration: {(w.lastRunDurationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      <span className="text-primary/60">
                        P{w.priority}
                      </span>
                    </div>
                    {w.lastRunError && (
                      <p className="text-[11px] text-red-500 mt-1 line-clamp-1" data-testid={`text-error-${w.id}`}>
                        {w.lastRunError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      checked={w.isEnabled}
                      onCheckedChange={(checked) => toggleEnabled.mutate({ id: w.id, isEnabled: checked })}
                      data-testid={`switch-enable-${w.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isRunning}
                      onClick={() => runNow(w)}
                      data-testid={`button-run-${w.id}`}
                    >
                      {isRunning ? (
                        <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(w)}
                      data-testid={`button-edit-${w.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => setDeleteTarget(w)}
                      data-testid={`button-delete-${w.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {workflows.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No scheduled research workflows</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create workflows to automatically keep your intelligence fresh
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isCreating || !!editingWorkflow} onOpenChange={(open) => {
        if (!open) { setIsCreating(false); setEditingWorkflow(null); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWorkflow ? "Edit Workflow" : "New Scheduled Research Workflow"}</DialogTitle>
            <DialogDescription>
              {editingWorkflow
                ? "Update the research schedule configuration"
                : "Configure a new automated research topic"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editingWorkflow && (
              <div className="space-y-1.5">
                <Label htmlFor="workflowKey">Workflow Key</Label>
                <Input
                  id="workflowKey"
                  placeholder="e.g., tax-policy-updates"
                  value={formData.workflowKey}
                  onChange={(e) => setFormData(d => ({ ...d, workflowKey: e.target.value }))}
                  data-testid="input-workflow-key"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Tax Policy Updates"
                value={formData.name}
                onChange={(e) => setFormData(d => ({ ...d, name: e.target.value }))}
                data-testid="input-workflow-name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of what this research covers..."
                value={formData.description}
                onChange={(e) => setFormData(d => ({ ...d, description: e.target.value }))}
                rows={2}
                data-testid="input-workflow-description"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="frequencyHours">Frequency (hours)</Label>
                <Input
                  id="frequencyHours"
                  type="number"
                  min={1}
                  value={formData.frequencyHours}
                  onChange={(e) => setFormData(d => ({ ...d, frequencyHours: parseInt(e.target.value) || 168 }))}
                  data-testid="input-frequency"
                />
                <span className="text-[10px] text-muted-foreground">
                  = {formatDuration(formData.frequencyHours)}
                </span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.priority}
                  onChange={(e) => setFormData(d => ({ ...d, priority: parseInt(e.target.value) || 5 }))}
                  data-testid="input-priority"
                />
                <span className="text-[10px] text-muted-foreground">1 = highest</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="researchType">Type</Label>
                <Select value={formData.researchType} onValueChange={(v) => setFormData(d => ({ ...d, researchType: v }))}>
                  <SelectTrigger data-testid="select-research-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="property">Property</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="promptInstructions">Research Instructions</Label>
              <Textarea
                id="promptInstructions"
                placeholder="Detailed instructions for the AI researcher..."
                value={formData.promptInstructions}
                onChange={(e) => setFormData(d => ({ ...d, promptInstructions: e.target.value }))}
                rows={5}
                className="font-mono text-xs"
                data-testid="input-prompt-instructions"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setIsCreating(false); setEditingWorkflow(null); }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingWorkflow) {
                  updateMutation.mutate({ id: editingWorkflow.id, data: formData });
                } else {
                  createMutation.mutate(formData);
                }
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-workflow"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
