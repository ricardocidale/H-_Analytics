import { useState } from "react";

interface FactoryProgressPillProps {
  label: string;
  caption?: string;
  elapsed?: number;
  expandable?: React.ReactNode;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function FactoryProgressPill({
  label,
  caption,
  elapsed,
  expandable,
}: FactoryProgressPillProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        width: "100%",
        maxWidth: "480px",
      }}
      className="bg-background border rounded-xl shadow-lg px-5 py-4 space-y-2.5"
    >
      {/* Indeterminate progress bar */}
      <div className="h-1 w-full rounded-full bg-accent-pop/20 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-accent-pop animate-[progress-indeterminate_1.4s_ease-in-out_infinite]" />
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground leading-tight">{label}</span>
        <div className="flex items-center gap-2.5 shrink-0">
          {elapsed != null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
          {expandable && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              <span
                className={`inline-block transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                aria-hidden
              >
                ▶
              </span>
              <span className="ml-1">Details</span>
            </button>
          )}
        </div>
      </div>

      {caption && (
        <p className="text-xs text-muted-foreground leading-relaxed">{caption}</p>
      )}

      {expandable && open && (
        <div className="border-t border-border/50 pt-2">{expandable}</div>
      )}
    </div>
  );
}
