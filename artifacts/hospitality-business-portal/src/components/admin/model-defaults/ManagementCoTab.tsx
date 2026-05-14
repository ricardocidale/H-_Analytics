/**
 * ManagementCoTab — Admin UI for editing management_company_fees rows.
 *
 * Shows Tier A fee rates (base management + incentive). Each row has an
 * inline editable percentage input, a range-quality dot sourced from
 * assumption_guardrails, and a per-row Save button.
 *
 * Reads from GET /api/admin/management-company-fees.
 * Writes via PATCH /api/admin/management-company-fees/:id.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "@/components/icons/themed-icons";
import { useAssumptionGuardrail } from "@/hooks/useAssumptionGuardrail";
import { cn } from "@/lib/utils";

interface FeeRow {
  id: number;
  feeType: string;
  rate: number;
  label: string;
  sortOrder: number;
  sourceUrl: string | null;
}

function guardrailKeyForMgmtFee(feeType: string): string {
  return `mgmt_co_fee.${feeType}`;
}

function FeeRangeQualityDot({ guardrailKey, rate }: { guardrailKey: string; rate: number }) {
  const guardrail = useAssumptionGuardrail(guardrailKey);
  if (!guardrail) return null;
  const inRange = rate >= guardrail.low && rate <= guardrail.high;
  const nearRange =
    !inRange &&
    rate >= guardrail.low * 0.9 &&
    rate <= guardrail.high * 1.1;
  return (
    <span
      title={`Guardrail: ${(guardrail.low * 100).toFixed(1)}%–${(guardrail.high * 100).toFixed(1)}%`}
      className={cn(
        "inline-block w-2 h-2 rounded-full shrink-0",
        inRange
          ? "bg-emerald-500"
          : nearRange
            ? "bg-amber-400"
            : "bg-red-500",
      )}
      data-testid="fabio-range-quality-dot"
    />
  );
}

function FeeRowEditor({
  row,
  onSave,
  isPending,
}: {
  row: FeeRow;
  onSave: (id: number, rate: number) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState<string>((row.rate * 100).toFixed(2));
  const guardrailKey = guardrailKeyForMgmtFee(row.feeType);
  const draftNum = parseFloat(draft);
  const isDirty = !isNaN(draftNum) && Math.abs(draftNum / 100 - row.rate) > 1e-6;

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/60 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium text-foreground">{row.label}</Label>
          <FeeRangeQualityDot guardrailKey={guardrailKey} rate={draftNum / 100} />
        </div>
        {row.sourceUrl && (
          <span className="text-xs text-muted-foreground truncate">{row.sourceUrl}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative w-24">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="pr-6 text-right text-sm h-8"
            data-testid={`fee-input-${row.feeType}`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
        </div>
        <Button
          size="sm"
          variant={isDirty ? "default" : "outline"}
          disabled={!isDirty || isNaN(draftNum) || isPending}
          onClick={() => onSave(row.id, draftNum / 100)}
          className="h-8 px-3 text-xs"
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function ManagementCoTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery<FeeRow[]>({
    queryKey: ["/api/admin/management-company-fees"],
    queryFn: async () => {
      const res = await fetch("/api/admin/management-company-fees", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch management company fees");
      return res.json();
    },
  });

  const [savingId, setSavingId] = useState<number | null>(null);
  const updateMutation = useMutation({
    mutationFn: async ({ id, rate }: { id: number; rate: number }) => {
      const res = await fetch(`/api/admin/management-company-fees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rate }),
      });
      if (!res.ok) throw new Error("Failed to update fee");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/management-company-fees"] });
      toast({ title: "Fee updated", description: "Management company fee rate saved." });
      setSavingId(null);
    },
    onError: (err) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setSavingId(null);
    },
  });

  const handleSave = (id: number, rate: number) => {
    setSavingId(id);
    updateMutation.mutate({ id, rate });
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card border border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Tier A — Management Fees</CardTitle>
          <p className="text-sm text-muted-foreground">
            Applied to all properties managed under H+ Analytics. Each property can override these at the entity level.
            Range-quality dots compare values against HVS 2024 survey guardrails.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
            </div>
          ) : rows && rows.length > 0 ? (
            <div>
              {rows.map((row) => (
                <FeeRowEditor
                  key={row.id}
                  row={row}
                  onSave={handleSave}
                  isPending={savingId === row.id && updateMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No management company fee rows found. Run the startup migration to seed them.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
