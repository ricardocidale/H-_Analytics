import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Pencil } from "@/components/icons/themed-icons";
import type { ConstantRow } from "./_shared";

export function OverrideDialog({ row, country }: { row: ConstantRow; country: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [authority, setAuthority] = useState<string>("");
  const [referenceUrl, setReferenceUrl] = useState<string>("");

  const save = useMutation({
    mutationFn: async () => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error("Enter a numeric value.");
      const res = await apiRequest("PUT", `/api/admin/model-constants/${row.key}`, {
        value: numeric,
        source: "manual",
        country: row.locality === "universal" ? null : country,
        countrySubdivision: null,
        overrideNote: note || null,
        authority: authority || null,
        referenceUrl: referenceUrl || null,
      }, {
        fallbackMessage: "Override failed",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-model-constants"] });
      toast({ title: "Override saved", description: row.label });
      setOpen(false);
    },
    onError: (e) => {
      toast({
        title: "Override failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-override-${row.key}`}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          Override
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Override {row.label}</DialogTitle>
          <DialogDescription>
            Free-form override for non-Specialist-owned constants only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Value</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={String(row.factoryValue)}
              data-testid={`input-override-value-${row.key}`}
            />
          </div>
          <div className="space-y-1">
            <Label>Authority</Label>
            <Input value={authority} onChange={(e) => setAuthority(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Reference URL</Label>
            <Input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-accent-pop" />}
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
