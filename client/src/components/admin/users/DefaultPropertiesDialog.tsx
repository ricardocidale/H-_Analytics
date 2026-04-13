import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "@/components/icons/themed-icons";
import { useToast } from "@/hooks/use-toast";
import { useProperties } from "@/lib/api";
import { ChevronRight } from "lucide-react";

interface DefaultPropertiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  userName: string;
}

export default function DefaultPropertiesDialog({ open, onOpenChange, userId, userName }: DefaultPropertiesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: properties = [] } = useProperties();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: assignedIds, isLoading } = useQuery<number[]>({
    queryKey: ["admin", "user-default-properties", userId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/default-properties`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (assignedIds) setSelectedIds(new Set(assignedIds));
  }, [assignedIds]);

  const saveMutation = useMutation({
    mutationFn: async (propertyIds: number[]) => {
      const res = await fetch(`/api/admin/users/${userId}/default-properties`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ propertyIds }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-default-properties", userId] });
      toast({ title: "Default properties updated" });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save", variant: "destructive" });
    },
  });

  const toggleProperty = (propId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(propId)) next.delete(propId);
      else next.add(propId);
      return next;
    });
  };

  const formatCurrency = (v: number | null | undefined) =>
    v != null ? `$${v.toLocaleString()}` : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-default-properties">
        <DialogHeader>
          <DialogTitle>Default Properties for: {userName}</DialogTitle>
          <DialogDescription>Toggle which properties this user sees by default in their portfolio view.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-1 mt-2">
            {properties.map((prop: any) => (
              <div key={prop.id} className="border rounded-lg">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setExpandedId(expandedId === prop.id ? null : prop.id)}
                      data-testid={`expand-property-${prop.id}`}
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform ${expandedId === prop.id ? "rotate-90" : ""}`} />
                    </button>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate" data-testid={`text-property-name-${prop.id}`}>{prop.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {prop.location && <span>{prop.location}</span>}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {prop.businessModel === "vrbo" ? "VRBO/STR" : prop.businessModel === "lodge" ? "Lodge" : "Hotel"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={selectedIds.has(prop.id)}
                    onCheckedChange={() => toggleProperty(prop.id)}
                    data-testid={`switch-property-${prop.id}`}
                  />
                </div>
                {expandedId === prop.id && (
                  <div className="px-4 pb-3 pt-0 grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t mx-4 mt-0 pt-2">
                    <div>
                      <span className="font-medium">Rooms:</span> {prop.roomCount ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium">ADR:</span> {formatCurrency(prop.startAdr)}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span>{" "}
                      <Badge variant={prop.status === "active" ? "default" : "secondary"} className="text-[10px] px-1 py-0">
                        {prop.status || "draft"}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {properties.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No properties found.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-defaults">Cancel</Button>
          <Button onClick={() => saveMutation.mutate(Array.from(selectedIds))} disabled={saveMutation.isPending} data-testid="button-save-defaults">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
