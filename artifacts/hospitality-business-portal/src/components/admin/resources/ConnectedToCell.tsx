/**
 * ConnectedToCell — admin-editable multi-select of which Specialists (and
 * The Analyst) a Resource is connected to. Lives in the Resources area
 * table, one cell per row. Backed by `resource_specialist_connections`
 * via PUT /api/admin/resources/:id/connections.
 *
 * The popover lists the catalog of connection targets returned by
 * `/api/admin/connection-targets` so we don't hardcode the 12+1 set on the
 * client. Saving optimistically updates the cached connection set so the
 * pill list redraws immediately.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ConnectionTarget {
  target: string;
  label: string;
  group: "analyst" | "specialist";
}

export function ConnectedToCell({ resourceId }: { resourceId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: targets = [] } = useQuery<ConnectionTarget[]>({
    queryKey: ["/api/admin/connection-targets"],
  });
  const { data: current } = useQuery<{ resourceId: number; targets: string[] }>({
    queryKey: [`/api/admin/resources/${resourceId}/connections`],
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Re-hydrate the local selection from the server every time the popover
  // opens (or whenever the server-side set changes). This guarantees that
  // closing/cancelling and reopening starts from the saved truth, not the
  // user's previously-discarded edits.
  useEffect(() => {
    if (open && current?.targets) {
      setSelected(new Set(current.targets));
    }
  }, [open, current?.targets]);

  const labelByTarget = useMemo(
    () => new Map(targets.map((t) => [t.target, t.label] as const)),
    [targets],
  );

  const save = useMutation({
    mutationFn: async (targetList: string[]) => {
      const res = await apiRequest("PUT", `/api/admin/resources/${resourceId}/connections`, {
        targets: targetList,
      });
      return (await res.json()) as { resourceId: number; targets: string[] };
    },
    onSuccess: (resp) => {
      queryClient.setQueryData([`/api/admin/resources/${resourceId}/connections`], resp);
      // Specialist/analyst Sources tabs cache by their endpoint; the safest
      // bet is to invalidate any sources query so the affected tab reloads
      // next time it mounts.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analyst/sources"] });
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return typeof k === "string" && k.startsWith("/api/admin/specialists/") && k.endsWith("/sources");
        },
      });
      toast({ title: "Connections updated" });
      setOpen(false);
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to update connections",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const currentTargets = current?.targets ?? [];

  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid={`connected-to-${resourceId}`}>
      {currentTargets.length === 0 ? (
        <span className="text-xs text-muted-foreground italic">— none —</span>
      ) : (
        currentTargets.slice(0, 3).map((t) => (
          <Badge
            key={t}
            variant="secondary"
            className="text-[10px]"
            data-testid={`connected-pill-${resourceId}-${t}`}
          >
            {labelByTarget.get(t) ?? t}
          </Badge>
        ))
      )}
      {currentTargets.length > 3 && (
        <Badge variant="outline" className="text-[10px]">+{currentTargets.length - 3}</Badge>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            data-testid={`button-edit-connections-${resourceId}`}
          >
            Edit
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-2" align="end">
          <div className="text-xs font-medium text-muted-foreground">Connect to</div>
          <div className="max-h-72 overflow-auto space-y-1.5 pr-1">
            {targets.map((t) => {
              const isOn = selected.has(t.target);
              return (
                <label
                  key={t.target}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  data-testid={`connection-option-${resourceId}-${t.target}`}
                >
                  <Checkbox
                    checked={isOn}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v) next.add(t.target);
                      else next.delete(t.target);
                      setSelected(next);
                    }}
                  />
                  <span className="truncate">{t.label}</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => save.mutate(Array.from(selected))}
              disabled={save.isPending}
              data-testid={`button-save-connections-${resourceId}`}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default ConnectedToCell;
