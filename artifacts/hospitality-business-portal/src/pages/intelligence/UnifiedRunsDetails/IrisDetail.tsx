import { IconAlertCircle } from "@/components/icons/status-icons";
import {
  formatAbsoluteTime,
  formatDuration,
  type UnifiedRun,
  type IrisHealthSummary,
} from "../unified-runs-utils";

/** Iris detail: shows chunksIndexed, errorsEncountered, trigger, modelUsed, and health summary. */
export function IrisDetail({ run }: { run: UnifiedRun }) {
  const meta = run.meta ?? {};
  const hasErrors = (meta.errorsEncountered ?? 0) > 0;
  const health = meta.healthSummary as IrisHealthSummary | null | undefined;
  const isError = run.status === "error";

  return (
    <div className="space-y-4 mt-2">
      {/* Metadata */}
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1.5 text-xs">
        {meta.trigger && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Trigger</span>
            <span className="text-foreground capitalize">{String(meta.trigger)}</span>
          </div>
        )}
        {meta.modelUsed && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Model</span>
            <span className="font-mono">{String(meta.modelUsed)}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-muted-foreground w-28 shrink-0">Started</span>
          <span className="font-mono">{formatAbsoluteTime(run.startedAt)}</span>
        </div>
        {run.durationMs != null && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Duration</span>
            <span className="font-mono tabular-nums">{formatDuration(run.durationMs)}</span>
          </div>
        )}
        {health?.toolsInvoked != null && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-28 shrink-0">Tools invoked</span>
            <span className="font-mono tabular-nums">
              {Array.isArray(health.toolsInvoked)
                ? health.toolsInvoked.length
                : health.toolsInvoked}
            </span>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5 text-center">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {meta.chunksIndexed ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Chunks indexed</p>
        </div>
        <div className={`rounded-md border px-3 py-2.5 text-center ${
          hasErrors ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-muted/10"
        }`}>
          <p className={`text-2xl font-semibold tabular-nums ${hasErrors ? "text-destructive" : "text-foreground"}`}>
            {meta.errorsEncountered ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Errors encountered</p>
        </div>
      </div>

      {/* Error message from healthSummary */}
      {isError && health?.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <div className="flex items-start gap-2 mb-1.5">
            <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-destructive">Error details</p>
          </div>
          <p className="text-xs text-destructive/90 break-words font-mono leading-relaxed pl-5">
            {health.error}
          </p>
        </div>
      )}

      {/* Agent summary from healthSummary (on success) */}
      {!isError && health?.summary && (
        <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Agent summary</p>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {health.summary}
          </p>
        </div>
      )}

      {/* Individual error list (preferred when available) */}
      {hasErrors && !health?.error && health?.errors && health.errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2 mb-1">
            <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0" />
            <p className="text-xs font-medium text-destructive">
              {health.errors.length} error{health.errors.length !== 1 ? "s" : ""} during indexing
            </p>
          </div>
          <ul className="space-y-1 pl-5">
            {health.errors.map((msg, i) => (
              <li key={i} className="text-xs text-destructive/90 font-mono leading-relaxed break-words">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fallback: error count with no individual messages */}
      {hasErrors && !health?.error && (!health?.errors || health.errors.length === 0) && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <IconAlertCircle weight="fill" className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            {meta.errorsEncountered} error{Number(meta.errorsEncountered) !== 1 ? "s" : ""} were encountered during indexing.
          </p>
        </div>
      )}
    </div>
  );
}
