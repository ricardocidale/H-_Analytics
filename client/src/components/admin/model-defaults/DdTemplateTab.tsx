import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  DD_TEMPLATE_VERSION,
  DD_WORKSTREAM_LABELS,
  type DdWorkstream,
} from "@shared/dd-template";
import type { DdTemplateItemRow } from "@shared/schema/property-dd";

type Draft = Record<number, Partial<DdTemplateItemRow>>;

export function DdTemplateTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "dd-template"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dd-template", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load DD template");
      return res.json() as Promise<{ items: DdTemplateItemRow[] }>;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<DdTemplateItemRow> }) => {
      const res = await fetch(`/api/admin/dd-template/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update item");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: "Template item saved" });
      setDraft((d) => {
        const { [vars.id]: _, ...rest } = d;
        return rest;
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "dd-template"] });
    },
    onError: (err) => {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const out = new Map<DdWorkstream, DdTemplateItemRow[]>();
    for (const item of items) {
      const ws = item.workstream as DdWorkstream;
      if (!out.has(ws)) out.set(ws, []);
      out.get(ws)!.push(item);
    }
    out.forEach((list) => {
      list.sort((a: DdTemplateItemRow, b: DdTemplateItemRow) => a.sortOrder - b.sortOrder);
    });
    return out;
  }, [data?.items]);

  const merged = (item: DdTemplateItemRow): DdTemplateItemRow => {
    const patch = draft[item.id];
    return patch ? { ...item, ...patch } : item;
  };

  const setField = <K extends keyof DdTemplateItemRow>(
    id: number,
    key: K,
    value: DdTemplateItemRow[K],
  ) => {
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [key]: value } }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-dd-template">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Hospitality Due-Diligence Template</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Canonical checklist seeded onto every acquisition target. Editing a row
                changes the label, description, vendor type, sort order, or stop-gate
                flag for every property created from this version.
              </p>
            </div>
            <Badge variant="outline" data-testid="badge-template-version">
              v{DD_TEMPLATE_VERSION}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {Array.from(grouped.entries()).map(([workstream, items]) => (
        <Card key={workstream} data-testid={`card-workstream-${workstream}`}>
          <CardHeader>
            <CardTitle className="text-sm">
              {DD_WORKSTREAM_LABELS[workstream] ?? workstream}
              <span className="ml-2 text-xs text-muted-foreground">({items.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((raw) => {
              const item = merged(raw);
              const dirty = Boolean(draft[item.id]);
              return (
                <div
                  key={item.id}
                  className="rounded-md border border-border/60 p-3 space-y-2"
                  data-testid={`row-template-${item.key}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <Input
                        value={item.label}
                        onChange={(e) => setField(item.id, "label", e.target.value)}
                        data-testid={`input-label-${item.key}`}
                        className="font-medium"
                      />
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{item.key}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Stop gate</span>
                      <Switch
                        checked={item.isStopGate}
                        onCheckedChange={(v) => setField(item.id, "isStopGate", v)}
                        data-testid={`switch-stop-gate-${item.key}`}
                      />
                    </div>
                  </div>
                  <Textarea
                    value={item.description}
                    onChange={(e) => setField(item.id, "description", e.target.value)}
                    rows={2}
                    data-testid={`input-description-${item.key}`}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Default vendor type</label>
                      <Input
                        value={item.defaultVendorType ?? ""}
                        onChange={(e) =>
                          setField(item.id, "defaultVendorType", e.target.value || null)
                        }
                        data-testid={`input-vendor-${item.key}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Sort order</label>
                      <Input
                        type="number"
                        value={item.sortOrder}
                        onChange={(e) =>
                          setField(item.id, "sortOrder", (n => Number.isFinite(n) ? n : 0)(Number(e.target.value)))
                        }
                        data-testid={`input-sort-${item.key}`}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {item.archived && (
                      <Badge variant="outline" className="text-xs">Archived</Badge>
                    )}
                    <Button
                      size="sm"
                      disabled={!dirty || updateMutation.isPending}
                      onClick={() =>
                        updateMutation.mutate({ id: item.id, patch: draft[item.id]! })
                      }
                      data-testid={`button-save-${item.key}`}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : null}
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
