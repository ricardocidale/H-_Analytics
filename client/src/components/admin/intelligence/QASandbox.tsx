import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ContextPackResponse {
  entityType: string;
  entityId: number;
  entityName: string;
  contextPack: Record<string, unknown>;
}

interface PromptPreviewResponse {
  entityType: string;
  entityId: number;
  entityName: string;
  tier: number;
  prompt: string;
  tokenEstimate: number;
  estimatedCostUsd: number;
  promptLengthChars: number;
}

interface PropertyOption { id: number; name: string }

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (typeof data === "boolean") {
    return <span className={data ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{String(data)}</span>;
  }
  if (typeof data === "number") {
    return <span className="text-blue-600 dark:text-blue-400">{data.toLocaleString()}</span>;
  }
  if (typeof data === "string") {
    if (data.length > 120) {
      return <span className="text-foreground/80">&quot;{data.slice(0, 120)}...&quot;</span>;
    }
    return <span className="text-foreground/80">&quot;{data}&quot;</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <div className="pl-4 border-l border-border/40">
        {data.map((item, i) => (
          <div key={i} className="py-0.5">
            <span className="text-muted-foreground text-[10px] mr-1.5">[{i}]</span>
            <JsonTree data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
    return (
      <div className={cn(depth > 0 && "pl-4 border-l border-border/40")}>
        {entries.map(([key, val]) => (
          <div key={key} className="py-0.5">
            <span className="text-primary/80 font-medium text-xs">{key}</span>
            <span className="text-muted-foreground mx-1">:</span>
            {typeof val === "object" && val !== null ? (
              <div className="mt-0.5"><JsonTree data={val} depth={depth + 1} /></div>
            ) : (
              <JsonTree data={val} depth={depth + 1} />
            )}
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(data)}</span>;
}

export default function QASandbox() {
  const [entityType, setEntityType] = useState<"property" | "company">("property");
  const [entityId, setEntityId] = useState<number>(0);
  const [tier, setTier] = useState<1 | 2>(1);
  const [activeView, setActiveView] = useState<"context-pack" | "prompt" | null>(null);

  const { data: propList } = useQuery<PropertyOption[]>({
    queryKey: ["admin-qa-properties"],
    queryFn: async () => {
      const res = await fetch("/api/properties");
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (propList?.length && entityId === 0) {
      setEntityId(propList[0].id);
    }
  }, [propList, entityId]);

  const contextPackMutation = useMutation<ContextPackResponse, Error>({
    mutationFn: async () => {
      const body: Record<string, unknown> = { entityType };
      if (entityType === "property") body.entityId = entityId;
      const res = await fetch("/api/admin/qa/preview-context-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate context pack");
      }
      return res.json();
    },
    onSuccess: () => setActiveView("context-pack"),
  });

  const promptMutation = useMutation<PromptPreviewResponse, Error>({
    mutationFn: async () => {
      const body: Record<string, unknown> = { entityType, tier };
      if (entityType === "property") body.entityId = entityId;
      const res = await fetch("/api/admin/qa/preview-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate prompt preview");
      }
      return res.json();
    },
    onSuccess: () => setActiveView("prompt"),
  });

  return (
    <div className="space-y-6" data-testid="qa-sandbox">
      <p className="text-sm text-muted-foreground">
        Preview the context pack and assembled prompt for any entity — without consuming LLM tokens. Inspect exactly what the AI sees before running research.
      </p>

      <div className="rounded-xl border border-border/80 bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Entity Selection</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Entity Type</label>
            <select
              value={entityType}
              onChange={e => { setEntityType(e.target.value as "property" | "company"); setEntityId(propList?.[0]?.id ?? 0); }}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground min-w-[160px]"
              data-testid="select-entity-type"
            >
              <option value="property">Property</option>
              <option value="company">Company</option>
            </select>
          </div>

          {entityType === "property" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Property</label>
              <select
                value={entityId}
                onChange={e => setEntityId(Number(e.target.value))}
                className="text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground min-w-[220px]"
                data-testid="select-entity-id"
              >
                {propList?.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Research Tier</label>
            <select
              value={tier}
              onChange={e => setTier(Number(e.target.value) as 1 | 2)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground min-w-[180px]"
              data-testid="select-tier"
            >
              <option value={1}>Tier 1 — Full Research</option>
              <option value={2}>Tier 2 — Quick Refresh</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => contextPackMutation.mutate()}
              disabled={contextPackMutation.isPending}
              data-testid="button-preview-context-pack"
            >
              {contextPackMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
                  Building...
                </span>
              ) : "Preview Context Pack"}
            </Button>
            <Button
              size="sm"
              onClick={() => promptMutation.mutate()}
              disabled={promptMutation.isPending}
              data-testid="button-preview-prompt"
            >
              {promptMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="animate-spin w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
                  Assembling...
                </span>
              ) : "Preview Prompt"}
            </Button>
          </div>
        </div>
      </div>

      {activeView === "context-pack" && contextPackMutation.data && (
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden" data-testid="context-pack-result">
          <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between bg-muted/30">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Context Pack — {contextPackMutation.data.entityName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {contextPackMutation.data.entityType === "property" ? "Property" : "Company"} context pack (structured data the AI will receive)
              </p>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {JSON.stringify(contextPackMutation.data.contextPack).length.toLocaleString()} chars
            </span>
          </div>
          <div className="p-5 max-h-[500px] overflow-y-auto scrollbar-thin font-mono text-xs">
            <JsonTree data={contextPackMutation.data.contextPack} />
          </div>
        </div>
      )}

      {activeView === "prompt" && promptMutation.data && (
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden" data-testid="prompt-result">
          <div className="px-5 py-3 border-b border-border/60 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Assembled Prompt — {promptMutation.data.entityName}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                Tier {promptMutation.data.tier}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {promptMutation.data.tokenEstimate.toLocaleString()} tokens (est.)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                ${promptMutation.data.estimatedCostUsd.toFixed(4)} (est.)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {promptMutation.data.promptLengthChars.toLocaleString()} chars
              </span>
            </div>
          </div>
          <div className="p-5 max-h-[600px] overflow-y-auto scrollbar-thin">
            <pre className="text-xs font-mono text-foreground/85 whitespace-pre-wrap leading-relaxed">{promptMutation.data.prompt}</pre>
          </div>
        </div>
      )}

      {contextPackMutation.isError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400" data-testid="qa-error">
          {contextPackMutation.error?.message || "Failed to build context pack."}
        </div>
      )}
      {promptMutation.isError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400" data-testid="qa-error">
          {promptMutation.error?.message || "Failed to assemble prompt."}
        </div>
      )}
    </div>
  );
}
