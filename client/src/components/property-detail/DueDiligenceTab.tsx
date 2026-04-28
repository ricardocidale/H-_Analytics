/**
 * DueDiligenceTab — Hospitality DD checklist for an acquisition target
 * (Task #811).
 *
 * Renders the canonical workstream-grouped checklist seeded from the
 * code-versioned template, with per-item editable status / owner / due
 * date / vendor / cost / findings. The header summarizes % complete,
 * blocker count, DD spend, and a Go / Caution / Stop indicator computed
 * server-side (any unresolved blocker on a stop-gate item promotes the
 * deal to Stop).
 *
 * The Analyst button posts /api/properties/:id/dd/analyst-review which
 * returns the deterministic open-findings rollup. Wiring that payload
 * into the property risk overlay and the acquisition export are tracked
 * separately as follow-ups; this tab only owns the checklist surface and
 * the rollup computation.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { IconClipboardList } from "@/components/icons";
import { ChevronDown } from "@/components/icons/themed-icons";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import {
  DD_STATUSES,
  DD_STATUS_LABELS,
  DD_WORKSTREAM_LABELS,
  type DdGoIndicator,
  type DdStatus,
  type DdWorkstream,
} from "@shared/dd-template";

interface DdItem {
  id: number;
  propertyId: number;
  templateItemKey: string;
  workstream: DdWorkstream;
  label: string;
  isStopGate: boolean;
  sortOrder: number;
  status: DdStatus;
  ownerName: string | null;
  vendor: string | null;
  dueDate: string | null;
  costEstimate: number | null;
  costActual: number | null;
  findings: string | null;
  documentUrl: string | null;
}

interface DdSummary {
  totalItems: number;
  completedItems: number;
  blockedItems: number;
  blockedStopGateItems: number;
  budgetTotal: number;
  spendCommitted: number;
  goIndicator: DdGoIndicator;
  goReason: string;
  workstreams: Array<{
    workstream: DdWorkstream;
    label: string;
    total: number;
    completed: number;
    blocked: number;
    percentComplete: number;
  }>;
  openFindings: Array<{
    itemKey: string;
    label: string;
    workstream: DdWorkstream;
    status: DdStatus;
    findings: string;
  }>;
}

interface DdResponse {
  items: DdItem[];
  summary: DdSummary;
}

interface Props {
  propertyId: number;
}

const STATUS_BADGE_VARIANT: Record<DdStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  complete: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  na: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const GO_BADGE: Record<DdGoIndicator, { label: string; cls: string }> = {
  go: { label: "Go", cls: "bg-green-600 text-white" },
  caution: { label: "Caution", cls: "bg-amber-500 text-white" },
  stop: { label: "Stop", cls: "bg-red-600 text-white" },
};

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function DueDiligenceTab({ propertyId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["/api/properties", propertyId, "dd"] as const, [propertyId]);

  const { data, isLoading, isError } = useQuery<DdResponse>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/properties/${propertyId}/dd`);
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ itemId, patch }: { itemId: number; patch: Partial<DdItem> }) => {
      const res = await apiRequest("PATCH", `/api/properties/${propertyId}/dd/${itemId}`, patch);
      return res.json() as Promise<{ item: DdItem; summary: DdSummary }>;
    },
    onSuccess: (resp) => {
      // Optimistic refresh by patching only the changed item + summary in cache.
      queryClient.setQueryData<DdResponse>(queryKey, (prev) => {
        if (!prev) return prev;
        return {
          summary: resp.summary,
          items: prev.items.map((i) => (i.id === resp.item.id ? { ...i, ...resp.item } : i)),
        };
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to save", description: err.message });
    },
  });

  const analystMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/properties/${propertyId}/dd/analyst-review`);
      return res.json();
    },
    onSuccess: (resp: { goIndicator: DdGoIndicator; openFindings: unknown[] }) => {
      toast({
        title: `Analyst review: ${GO_BADGE[resp.goIndicator].label}`,
        description: `${resp.openFindings.length} open finding${resp.openFindings.length === 1 ? "" : "s"} packaged for the Risk Specialist and acquisition export.`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Analyst review failed", description: err.message });
    },
  });

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground" data-testid="text-dd-loading">Loading DD checklist…</div>;
  }
  if (isError || !data) {
    return <div className="py-12 text-center text-destructive" data-testid="text-dd-error">Failed to load DD checklist.</div>;
  }

  const { items, summary } = data;
  const itemsByWs = new Map<DdWorkstream, DdItem[]>();
  for (const item of items) {
    const ws = item.workstream;
    const list = itemsByWs.get(ws) ?? [];
    list.push(item);
    itemsByWs.set(ws, list);
  }

  const pctComplete = summary.totalItems === 0
    ? 0
    : Math.round((summary.completedItems / summary.totalItems) * 100);

  return (
    <div className="space-y-6" data-testid="container-dd-checklist">
      {/* Summary header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconClipboardList className="w-5 h-5" />
              Due-Diligence Checklist
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Hospitality acquisition workstreams. Edit any row inline.
            </p>
          </div>
          <AnalystButton
            onClick={() => analystMutation.mutate()}
            isRunning={analystMutation.isPending}
            suffix="DD Review"
            dataTestId="button-analyst-dd"
          />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryStat label="% Complete" value={`${pctComplete}%`} testId="stat-dd-pct" />
            <SummaryStat label="Open blockers" value={String(summary.blockedItems)} testId="stat-dd-blockers" />
            <SummaryStat label="DD budget" value={formatMoney(summary.budgetTotal)} testId="stat-dd-budget" />
            <SummaryStat label="DD spend" value={formatMoney(summary.spendCommitted)} testId="stat-dd-spend" />
            <div className="flex flex-col" data-testid="stat-dd-go">
              <span className="text-xs uppercase text-muted-foreground tracking-wide">Recommendation</span>
              <Badge className={`mt-1 self-start ${GO_BADGE[summary.goIndicator].cls}`} data-testid={`badge-dd-go-${summary.goIndicator}`}>
                {GO_BADGE[summary.goIndicator].label}
              </Badge>
              <span className="text-xs text-muted-foreground mt-1" data-testid="text-dd-go-reason">{summary.goReason}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workstreams */}
      {(Object.keys(DD_WORKSTREAM_LABELS) as DdWorkstream[]).map((ws) => {
        const wsItems = itemsByWs.get(ws);
        if (!wsItems || wsItems.length === 0) return null;
        const wsSummary = summary.workstreams.find((w) => w.workstream === ws);
        return (
          <WorkstreamSection
            key={ws}
            workstream={ws}
            items={wsItems}
            percentComplete={wsSummary?.percentComplete ?? 0}
            blockers={wsSummary?.blocked ?? 0}
            onUpdate={(itemId, patch) => updateMutation.mutate({ itemId, patch })}
            isSaving={updateMutation.isPending}
          />
        );
      })}
    </div>
  );
}

function SummaryStat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className="text-xs uppercase text-muted-foreground tracking-wide">{label}</span>
      <span className="text-2xl font-semibold mt-1">{value}</span>
    </div>
  );
}

function WorkstreamSection({
  workstream,
  items,
  percentComplete,
  blockers,
  onUpdate,
  isSaving,
}: {
  workstream: DdWorkstream;
  items: DdItem[];
  percentComplete: number;
  blockers: number;
  onUpdate: (itemId: number, patch: Partial<DdItem>) => void;
  isSaving: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader
            className="cursor-pointer flex flex-row items-center justify-between gap-4 space-y-0"
            data-testid={`button-workstream-${workstream}`}
          >
            <div className="flex items-center gap-3">
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              <CardTitle className="text-base">{DD_WORKSTREAM_LABELS[workstream]}</CardTitle>
              <Badge variant="outline" data-testid={`badge-workstream-pct-${workstream}`}>{percentComplete}% complete</Badge>
              {blockers > 0 && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`badge-workstream-blockers-${workstream}`}>
                  {blockers} blocker{blockers === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {items.map((item) => (
              <DdItemRow key={item.id} item={item} onUpdate={onUpdate} isSaving={isSaving} />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DdItemRow({
  item,
  onUpdate,
  isSaving,
}: {
  item: DdItem;
  onUpdate: (itemId: number, patch: Partial<DdItem>) => void;
  isSaving: boolean;
}) {
  // Local state lets the user edit text fields without firing a server
  // round-trip on every keystroke; we commit on blur.
  const [owner, setOwner] = useState(item.ownerName ?? "");
  const [vendor, setVendor] = useState(item.vendor ?? "");
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [costEst, setCostEst] = useState(item.costEstimate?.toString() ?? "");
  const [costAct, setCostAct] = useState(item.costActual?.toString() ?? "");
  const [findings, setFindings] = useState(item.findings ?? "");

  const commitText = (field: keyof DdItem, raw: string, allowNumber = false) => {
    let value: string | number | null = raw.trim() === "" ? null : raw.trim();
    if (allowNumber && value !== null) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      value = n;
    }
    if ((item[field] ?? null) === value) return;
    onUpdate(item.id, { [field]: value } as Partial<DdItem>);
  };

  const isBlockedStop = item.status === "blocked" && item.isStopGate;

  return (
    <div
      className={`border rounded-lg p-3 ${isBlockedStop ? "border-red-400 bg-red-50/30 dark:bg-red-950/20" : "border-border"}`}
      data-testid={`row-dd-item-${item.templateItemKey}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate" data-testid={`text-dd-item-label-${item.templateItemKey}`}>{item.label}</span>
          {item.isStopGate && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide" data-testid={`badge-stop-gate-${item.templateItemKey}`}>Stop-gate</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_BADGE_VARIANT[item.status]} data-testid={`badge-dd-status-${item.templateItemKey}`}>
            {DD_STATUS_LABELS[item.status]}
          </Badge>
          <Select
            value={item.status}
            onValueChange={(v) => onUpdate(item.id, { status: v as DdStatus })}
            disabled={isSaving}
          >
            <SelectTrigger className="h-8 w-[150px]" data-testid={`select-dd-status-${item.templateItemKey}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DD_STATUSES.map((s) => (
                <SelectItem key={s} value={s} data-testid={`option-dd-status-${item.templateItemKey}-${s}`}>
                  {DD_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
        <Input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          onBlur={() => commitText("ownerName", owner)}
          placeholder="Owner"
          className="h-8"
          data-testid={`input-dd-owner-${item.templateItemKey}`}
        />
        <Input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          onBlur={() => commitText("vendor", vendor)}
          placeholder="Vendor"
          className="h-8"
          data-testid={`input-dd-vendor-${item.templateItemKey}`}
        />
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          onBlur={() => commitText("dueDate", dueDate)}
          className="h-8"
          data-testid={`input-dd-due-${item.templateItemKey}`}
        />
        <Input
          type="number"
          value={costEst}
          onChange={(e) => setCostEst(e.target.value)}
          onBlur={() => commitText("costEstimate", costEst, true)}
          placeholder="Est. cost"
          className="h-8"
          data-testid={`input-dd-cost-est-${item.templateItemKey}`}
        />
        <Input
          type="number"
          value={costAct}
          onChange={(e) => setCostAct(e.target.value)}
          onBlur={() => commitText("costActual", costAct, true)}
          placeholder="Actual cost"
          className="h-8"
          data-testid={`input-dd-cost-act-${item.templateItemKey}`}
        />
      </div>

      <Textarea
        value={findings}
        onChange={(e) => setFindings(e.target.value)}
        onBlur={() => commitText("findings", findings)}
        placeholder="Findings — what was discovered, who reviewed it, any open items"
        className="mt-2 min-h-[60px] text-sm"
        data-testid={`textarea-dd-findings-${item.templateItemKey}`}
      />
    </div>
  );
}
