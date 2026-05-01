import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";

export type ChatSourceUsed = {
  title: string;
  namespace: string;
  score: number;
  weight: number;
};

const NAMESPACE_LABELS: Record<string, string> = {
  "knowledge-base": "Knowledge Base",
  "research-history": "Research History",
  "assumption-guidance": "Assumption Guidance",
  documents: "Documents",
  "uploaded-files": "Uploaded Files",
};

export function SourcesUsedPanel({
  sources,
  turnIndex,
}: {
  sources: ChatSourceUsed[];
  turnIndex: number | string;
}) {
  const [open, setOpen] = useState(false);
  const count = sources.length;
  return (
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
            {sources.map((s, i) => (
              <li
                key={`${s.namespace}-${s.title}-${i}`}
                className="flex items-start gap-2 text-[11px]"
                data-testid={`source-${turnIndex}-${i}`}
              >
                <Badge
                  variant="outline"
                  className="text-[9px] py-0 px-1.5 h-4 font-medium shrink-0"
                  data-testid={`badge-source-namespace-${turnIndex}-${i}`}
                >
                  {NAMESPACE_LABELS[s.namespace] ?? s.namespace}
                </Badge>
                <span
                  className="flex-1 truncate text-foreground/90"
                  title={s.title}
                  data-testid={`text-source-title-${turnIndex}-${i}`}
                >
                  {s.title}
                </span>
                <span
                  className="font-mono text-muted-foreground shrink-0"
                  data-testid={`text-source-score-${turnIndex}-${i}`}
                >
                  {s.score.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
