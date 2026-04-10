import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IconFileText, IconClock, IconHash, IconStickyNote, IconCheck } from "@/components/icons";
import { ChevronRight, Search, Loader2 } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";

interface AuditLogSummary {
  id: number;
  scenarioId: number;
  propertyId: number;
  userId: number;
  computedAt: string;
  engineVersion: string;
  inputHash: string;
  outputHash: string;
  auditOpinion: string;
  durationMs: number;
  totalSteps: number;
}

interface AuditEntry {
  step: number;
  module: string;
  label: string;
  formula: string;
  inputs: Record<string, number>;
  output: number;
  note?: string;
}

interface AuditLogDetail extends AuditLogSummary {
  logEntries: AuditEntry[];
}

function useCalcAuditLogs(scenarioId: number | null) {
  return useQuery<AuditLogSummary[]>({
    queryKey: ["/api/calc-audit", scenarioId],
    queryFn: async () => {
      if (scenarioId === null) return [];
      const res = await fetch(`/api/calc-audit/${scenarioId}?limit=50`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    enabled: scenarioId !== null,
  });
}

function useCalcAuditDetail(id: number | null) {
  return useQuery<AuditLogDetail>({
    queryKey: ["/api/calc-audit/detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/calc-audit/detail/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit detail");
      return res.json();
    },
    enabled: id !== null,
  });
}

function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, stepIndex, note }: { logId: number; stepIndex: number; note: string }) => {
      const res = await fetch(`/api/calc-audit/${logId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stepIndex, note }),
      });
      if (!res.ok) throw new Error("Failed to update note");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calc-audit/detail", variables.logId] });
    },
  });
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(4);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function opinionColor(opinion: string): string {
  if (opinion === "UNQUALIFIED") return "text-green-600 dark:text-green-400";
  if (opinion === "QUALIFIED") return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function opinionBadgeVariant(opinion: string): "default" | "secondary" | "destructive" {
  if (opinion === "UNQUALIFIED") return "default";
  if (opinion === "QUALIFIED") return "secondary";
  return "destructive";
}

function NoteEditor({ logId, stepIndex, currentNote }: { logId: number; stepIndex: number; currentNote?: string }) {
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState(currentNote ?? "");
  const updateNote = useUpdateNote();

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`btn-edit-note-${stepIndex}`}
      >
        <IconStickyNote className="w-3 h-3" />
        {currentNote ? currentNote : "Add note"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Input
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        className="h-7 text-xs w-48"
        placeholder="Checker note..."
        maxLength={500}
        autoFocus
        data-testid={`input-note-${stepIndex}`}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            updateNote.mutate({ logId, stepIndex, note: noteText });
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        disabled={updateNote.isPending}
        onClick={() => {
          updateNote.mutate({ logId, stepIndex, note: noteText });
          setEditing(false);
        }}
        data-testid={`btn-save-note-${stepIndex}`}
      >
        {updateNote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <IconCheck className="w-3 h-3" />}
      </Button>
    </div>
  );
}

interface ModuleGroup {
  module: string;
  entries: AuditEntry[];
}

function groupByModule(entries: AuditEntry[]): ModuleGroup[] {
  const map = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const arr = map.get(e.module);
    if (arr) arr.push(e); else map.set(e.module, [e]);
  }
  return Array.from(map.entries()).map(([module, entries]) => ({ module, entries }));
}

function parseModuleLabel(module: string): { property: string; period: string } {
  const lastSlash = module.lastIndexOf("/");
  if (lastSlash === -1) return { property: module, period: "" };
  return { property: module.slice(0, lastSlash), period: module.slice(lastSlash + 1) };
}

function AuditEntryRow({ entry, logId }: { entry: AuditEntry; logId: number }) {
  const inputEntries = Object.entries(entry.inputs);
  return (
    <div className="grid grid-cols-12 gap-2 items-start py-1.5 px-3 hover:bg-muted/50 rounded text-xs border-b border-border/40 last:border-0" data-testid={`audit-entry-${entry.step}`}>
      <div className="col-span-1 text-muted-foreground font-mono tabular-nums">
        #{entry.step}
      </div>
      <div className="col-span-2 font-medium text-foreground">
        {entry.label}
      </div>
      <div className="col-span-3 font-mono text-muted-foreground text-[11px]">
        {entry.formula}
      </div>
      <div className="col-span-3 text-[11px]">
        {inputEntries.length > 0 ? (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {inputEntries.map(([k, v]) => (
              <span key={k} className="text-muted-foreground">
                <span className="text-foreground/70">{k}</span>=<span className="font-mono">{formatNumber(v)}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </div>
      <div className="col-span-1 font-mono font-semibold text-foreground tabular-nums text-right">
        {formatNumber(entry.output)}
      </div>
      <div className="col-span-2">
        <NoteEditor logId={logId} stepIndex={entry.step} currentNote={entry.note} />
      </div>
    </div>
  );
}

function ModuleSection({ group, logId }: { group: ModuleGroup; logId: number }) {
  const [open, setOpen] = useState(false);
  const { property, period } = parseModuleLabel(group.module);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 px-3 hover:bg-muted/60 rounded-md transition-colors text-left" data-testid={`module-${group.module}`}>
        <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="text-sm font-medium text-foreground">{property}</span>
        {period && <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{period}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{group.entries.length} steps</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 border-l-2 border-border/40 pl-2 mb-2">
          <div className="grid grid-cols-12 gap-2 py-1 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-bold border-b border-border">
            <div className="col-span-1">Step</div>
            <div className="col-span-2">Label</div>
            <div className="col-span-3">Formula</div>
            <div className="col-span-3">Inputs</div>
            <div className="col-span-1 text-right">Output</div>
            <div className="col-span-2">Note</div>
          </div>
          {group.entries.map((e) => (
            <AuditEntryRow key={e.step} entry={e} logId={logId} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PropertyGroup({ property, modules, logId }: { property: string; modules: ModuleGroup[]; logId: number }) {
  const [open, setOpen] = useState(false);
  const totalSteps = modules.reduce((s, m) => s + m.entries.length, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2.5 px-4 bg-muted/30 hover:bg-muted/60 rounded-lg transition-colors text-left border border-border/50" data-testid={`property-group-${property}`}>
        <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="text-sm font-semibold text-foreground">{property}</span>
        <span className="ml-auto text-xs text-muted-foreground">{modules.length} periods · {totalSteps} steps</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 mt-1 space-y-0.5">
          {modules.map((g) => (
            <ModuleSection key={g.module} group={g} logId={logId} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AuditDetailView({ logId }: { logId: number }) {
  const { data: detail, isLoading, error } = useCalcAuditDetail(logId);
  const [searchFilter, setSearchFilter] = useState("");

  const propertyGroups = useMemo(() => {
    if (!detail?.logEntries) return [];
    const modules = groupByModule(detail.logEntries);
    const propertyMap = new Map<string, ModuleGroup[]>();
    for (const m of modules) {
      const { property } = parseModuleLabel(m.module);
      const arr = propertyMap.get(property);
      if (arr) arr.push(m); else propertyMap.set(property, [m]);
    }
    return Array.from(propertyMap.entries()).map(([property, modules]) => ({ property, modules }));
  }, [detail?.logEntries]);

  const filteredGroups = useMemo(() => {
    if (!searchFilter.trim()) return propertyGroups;
    const q = searchFilter.toLowerCase();
    return propertyGroups
      .map(({ property, modules }) => ({
        property,
        modules: modules
          .map((m) => ({
            ...m,
            entries: m.entries.filter(
              (e) =>
                e.label.toLowerCase().includes(q) ||
                e.formula.toLowerCase().includes(q) ||
                e.module.toLowerCase().includes(q)
            ),
          }))
          .filter((m) => m.entries.length > 0),
      }))
      .filter((g) => g.modules.length > 0);
  }, [propertyGroups, searchFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading audit trail...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Failed to load audit detail.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Opinion</p>
          <Badge variant={opinionBadgeVariant(detail.auditOpinion)} data-testid="text-audit-opinion">
            {detail.auditOpinion}
          </Badge>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Engine</p>
          <p className="text-sm font-mono" data-testid="text-engine-version">{detail.engineVersion}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Duration</p>
          <p className="text-sm font-mono" data-testid="text-duration">{formatDuration(detail.durationMs)}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Total Steps</p>
          <p className="text-sm font-mono font-semibold" data-testid="text-total-steps">{detail.totalSteps}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Output Hash</p>
          <p className="text-xs font-mono text-muted-foreground truncate" title={detail.outputHash} data-testid="text-output-hash">{detail.outputHash.slice(0, 12)}…</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter by label, formula, or module..."
          className="pl-8 h-8 text-sm"
          data-testid="input-audit-search"
        />
      </div>

      <div className="space-y-1">
        {filteredGroups.map(({ property, modules }) => (
          <PropertyGroup key={property} property={property} modules={modules} logId={logId} />
        ))}
        {filteredGroups.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            {searchFilter ? "No entries match your search." : "No audit entries found."}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CalcAuditViewer() {
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [scenarioInput, setScenarioInput] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

  const { data: logs, isLoading: logsLoading } = useCalcAuditLogs(scenarioId);

  const handleSearch = () => {
    const parsed = parseInt(scenarioInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setScenarioId(parsed);
      setSelectedLogId(null);
    }
  };

  if (selectedLogId !== null) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedLogId(null)}
          data-testid="btn-back-to-list"
        >
          ← Back to audit logs
        </Button>
        <AuditDetailView logId={selectedLogId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconFileText className="w-4 h-4" />
            Calculation Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Input
              value={scenarioInput}
              onChange={(e) => setScenarioInput(e.target.value)}
              placeholder="Enter scenario ID..."
              className="w-48 h-9"
              type="number"
              min={1}
              data-testid="input-scenario-id"
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            />
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={!scenarioInput.trim()}
              data-testid="btn-search-audit"
            >
              <Search className="w-3.5 h-3.5 mr-1.5" />
              Search
            </Button>
          </div>

          {scenarioId === null && (
            <div className="text-center py-12 text-muted-foreground">
              <IconFileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Enter a scenario ID to view its calculation audit trail.</p>
              <p className="text-xs mt-1">Audit trails are generated when computations are run with the audit flag enabled.</p>
            </div>
          )}

          {logsLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading audit logs...
            </div>
          )}

          {logs && logs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No audit logs found for scenario #{scenarioId}.</p>
              <p className="text-xs mt-1">Run a computation with <code className="bg-muted px-1 py-0.5 rounded">?audit=true</code> to generate one.</p>
            </div>
          )}

          {logs && logs.length > 0 && (
            <div className="space-y-2">
              {logs.map((log) => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLogId(log.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                  data-testid={`audit-log-${log.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={opinionBadgeVariant(log.auditOpinion)} className="text-[10px]">
                        {log.auditOpinion}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">v{log.engineVersion}</span>
                      <span className="text-xs text-muted-foreground">
                        Property #{log.propertyId}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <IconClock className="w-3 h-3" />
                        {new Date(log.computedAt).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <IconHash className="w-3 h-3" />
                        {log.totalSteps} steps
                      </span>
                      <span>{formatDuration(log.durationMs)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
