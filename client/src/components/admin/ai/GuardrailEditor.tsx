import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  IconShield,
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconRefreshCw,
} from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Guardrail {
  id: number;
  label: string;
  rule: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function GuardrailEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: guardrails, isLoading, isError, refetch } = useQuery<Guardrail[]>({
    queryKey: ["rebeccaGuardrails"],
    queryFn: async () => {
      const res = await fetch("/api/rebecca/guardrails", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch guardrails");
      return res.json();
    },
  });

  const [newLabel, setNewLabel] = useState("");
  const [newRule, setNewRule] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRule, setEditRule] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const maxOrder = guardrails?.length
        ? Math.max(...guardrails.map(g => g.sortOrder)) + 1
        : 1;
      return apiRequest("POST", "/api/rebecca/guardrails", {
        label: newLabel.trim(),
        rule: newRule.trim(),
        sortOrder: maxOrder,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebeccaGuardrails"] });
      setNewLabel("");
      setNewRule("");
      toast({ title: "Guardrail created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Guardrail> }) => {
      return apiRequest("PATCH", `/api/rebecca/guardrails/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebeccaGuardrails"] });
      setEditingId(null);
      toast({ title: "Guardrail updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/rebecca/guardrails/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebeccaGuardrails"] });
      setDeletingId(null);
      toast({ title: "Guardrail deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleToggle = (g: Guardrail) => {
    updateMutation.mutate({ id: g.id, data: { isActive: !g.isActive } });
  };

  const startEdit = (g: Guardrail) => {
    setEditingId(g.id);
    setEditLabel(g.label);
    setEditRule(g.rule);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: { label: editLabel.trim(), rule: editRule.trim() },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-6 p-8 flex flex-col items-center gap-4 text-center rounded-xl border border-accent-pop/20 bg-accent-pop/10">
        <IconAlertTriangle className="w-10 h-10 text-accent-pop" />
        <div>
          <p className="font-semibold text-foreground">Failed to load guardrails</p>
          <p className="text-sm text-muted-foreground mt-1">Check your connection or try again.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-retry-guardrails">
          <IconRefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const activeCount = guardrails?.filter(g => g.isActive).length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <Card className="bg-gradient-to-r from-primary/5 to-primary/[0.02] border border-primary/20">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <IconShield className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">What are guardrails?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Guardrails are behavioral rules injected into Rebecca's system prompt at runtime.
                They define what she can and cannot discuss, ensuring she stays focused on hospitality
                investment analytics. Active guardrails are enforced on every chat message — toggle
                them off to temporarily disable without deleting.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold bg-primary/10 text-primary border-primary/20" data-testid="badge-active-guardrails">
            {activeCount} active
          </Badge>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold" data-testid="badge-total-guardrails">
            {guardrails?.length ?? 0} total
          </Badge>
        </div>
      </div>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">Add Guardrail</CardTitle>
              <CardDescription className="label-text mt-0.5">
                Create a new behavioral rule for Rebecca to follow.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="label-text font-medium text-xs uppercase tracking-wider text-muted-foreground/70">Label</Label>
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="e.g., No competitor mentions"
              className="bg-card border-border max-w-lg"
              data-testid="input-guardrail-label"
            />
          </div>
          <div className="space-y-2">
            <Label className="label-text font-medium text-xs uppercase tracking-wider text-muted-foreground/70">Rule</Label>
            <Textarea
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              placeholder="e.g., Never mention or compare against specific competitor companies by name."
              rows={3}
              className="bg-card border-border text-sm"
              data-testid="input-guardrail-rule"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!newLabel.trim() || !newRule.trim() || createMutation.isPending}
              data-testid="button-create-guardrail"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconPlus className="w-4 h-4 mr-2" />}
              Add Guardrail
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {guardrails?.map((g) => (
            <motion.div
              key={g.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card
                className={cn(
                  "bg-card border shadow-sm transition-all duration-200",
                  g.isActive ? "border-border/80" : "border-border/40 opacity-60"
                )}
                data-testid={`card-guardrail-${g.id}`}
              >
                <CardContent className="py-4 px-5">
                  {editingId === g.id ? (
                    <div className="space-y-3">
                      <Input
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        className="bg-card border-border font-medium"
                        data-testid={`input-edit-label-${g.id}`}
                      />
                      <Textarea
                        value={editRule}
                        onChange={e => setEditRule(e.target.value)}
                        rows={3}
                        className="bg-card border-border text-sm"
                        data-testid={`input-edit-rule-${g.id}`}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(null)}
                          data-testid={`button-cancel-edit-${g.id}`}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
                          disabled={!editLabel.trim() || !editRule.trim() || updateMutation.isPending}
                          data-testid={`button-save-edit-${g.id}`}
                        >
                          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground truncate">{g.label}</p>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0 shrink-0",
                              g.isActive
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {g.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{g.rule}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={g.isActive}
                          onCheckedChange={() => handleToggle(g)}
                          data-testid={`switch-guardrail-${g.id}`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(g)}
                          data-testid={`button-edit-guardrail-${g.id}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </Button>
                        {deletingId === g.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 text-xs px-2"
                              onClick={() => deleteMutation.mutate(g.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-confirm-delete-${g.id}`}
                            >
                              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs px-2"
                              onClick={() => setDeletingId(null)}
                              data-testid={`button-cancel-delete-${g.id}`}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingId(g.id)}
                            data-testid={`button-delete-guardrail-${g.id}`}
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {guardrails?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <IconShield className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No guardrails configured yet.</p>
            <p className="text-xs mt-1">Add your first guardrail above to define Rebecca's behavioral boundaries.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
