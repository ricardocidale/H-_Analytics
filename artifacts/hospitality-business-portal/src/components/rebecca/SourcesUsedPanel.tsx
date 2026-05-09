import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "@/components/icons/themed-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";

export type ChatSourceUsed = {
  title: string;
  namespace: string;
  score: number;
  weight: number;
  itemId?: string;
};

const NAMESPACE_LABELS: Record<string, string> = {
  "knowledge-base": "Knowledge Base",
  "research-history": "Research History",
  "assumption-guidance": "Assumption Guidance",
  documents: "Documents",
  "uploaded-files": "Uploaded Files",
};

function KbEntryDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ id: number; title: string; content: string; category: string; source: string }>({
    queryKey: ["kb-entry", entryId],
    queryFn: async () => {
      const res = await fetch(`/api/rebecca/kb/entry/${entryId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    staleTime: 60_000,
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {isLoading ? "Loading…" : (data?.title ?? "Knowledge Base Entry")}
          </DialogTitle>
        </DialogHeader>
        {isLoading && (
          <p className="text-sm text-muted-foreground animate-pulse py-4">Loading entry…</p>
        )}
        {!isLoading && data && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">{data.category}</Badge>
              {data.source && data.source !== "manual" && (
                <span className="text-[10px] text-muted-foreground">Source: {data.source}</span>
              )}
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto border border-border/30 rounded-md px-3 py-2 bg-muted/20">
              {data.content}
            </p>
          </div>
        )}
        {!isLoading && !data && (
          <p className="text-sm text-muted-foreground py-4">This entry is no longer available.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SourcesUsedPanel({
  sources,
  turnIndex,
}: {
  sources: ChatSourceUsed[];
  turnIndex: number | string;
}) {
  const [open, setOpen] = useState(false);
  const [viewingEntryId, setViewingEntryId] = useState<string | null>(null);
  const count = sources.length;

  return (
    <>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="mt-1.5 max-w-[85%] w-full"
        data-testid={`sources-used-${turnIndex}`}
      >
        <CollapsibleTrigger
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground hover:text-foreground transition-colors px-1"
          data-testid={`button-sources-used-${turnIndex}`}
        >
          <ChevronDown
            className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span data-testid={`text-sources-count-${turnIndex}`}>
            Sources used · {count}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {count === 0 ? (
            <p
              className="mt-1 px-2 py-1.5 text-[11px] italic text-muted-foreground/80 border border-dashed border-border/50 rounded-md"
              data-testid={`text-sources-empty-${turnIndex}`}
            >
              No sources were used for this reply.
            </p>
          ) : (
            <ul
              className="mt-1 space-y-1 px-2 py-1.5 border border-border/40 rounded-md bg-muted/20"
              data-testid={`list-sources-${turnIndex}`}
            >
              {sources.map((s, i) => {
                const label = NAMESPACE_LABELS[s.namespace] ?? s.namespace;
                const weightedScore = s.score * s.weight / 100;
                const isKb = s.namespace === "knowledge-base" && s.itemId;
                return (
                  <li
                    key={`${s.namespace}-${s.title}-${i}`}
                    className="flex items-start gap-2 text-[11px]"
                    data-testid={`source-${turnIndex}-${i}`}
                  >
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 px-1.5 h-4 font-medium shrink-0 cursor-default"
                      title={`${label} — weight ${s.weight}/100`}
                      data-testid={`badge-source-namespace-${turnIndex}-${i}`}
                    >
                      {label}
                    </Badge>
                    <span
                      className="flex-1 truncate text-foreground/90"
                      title={s.title}
                      data-testid={`text-source-title-${turnIndex}-${i}`}
                    >
                      {s.title}
                    </span>
                    {isKb && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 px-1.5 text-[9px] text-primary/70 hover:text-primary shrink-0 font-medium"
                        onClick={() => setViewingEntryId(s.itemId!)}
                        data-testid={`button-view-source-${turnIndex}-${i}`}
                      >
                        View
                      </Button>
                    )}
                    <span
                      className="font-mono text-muted-foreground shrink-0 tabular-nums"
                      title={`similarity ${s.score.toFixed(3)} × weight ${s.weight}/100 = ${weightedScore.toFixed(3)}`}
                      data-testid={`text-source-score-${turnIndex}-${i}`}
                    >
                      <span className="text-[9px] text-muted-foreground/60">w{s.weight}</span>
                      {" "}
                      {s.score.toFixed(2)}
                      <span className="text-[9px] text-muted-foreground/50 ml-0.5">→{weightedScore.toFixed(2)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>

      {viewingEntryId && (
        <KbEntryDialog
          entryId={viewingEntryId}
          onClose={() => setViewingEntryId(null)}
        />
      )}
    </>
  );
}
