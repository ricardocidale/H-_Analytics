import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface RangePillSpec {
  fieldName: string;
  display: string;
  variant: "flagged" | "acked";
}

interface RangePillsLayerProps {
  pills: RangePillSpec[];
  /** Stable key (typically the active tab) — when it changes the layer
   *  re-runs its DOM lookup on the next animation frame so newly-mounted
   *  inputs (after a tab switch) are picked up without a body-wide
   *  MutationObserver. */
  reKey?: string;
}

/**
 * Renders a small "expected range" chip next to every input that either has
 * an active warning (variant: "flagged") or has been intentionally
 * acknowledged outside the recommended range (variant: "acked"). Targets are
 * located by the `data-field={fieldName}` attribute that section components
 * place on the input wrapper.
 *
 * Implementation note: this layer deliberately does NOT install any
 * page-level mutation listener. Earlier revisions observed the document
 * root, which thrashed on every unrelated DOM change (toasts, modals,
 * sidebar opens). Instead we rely on a `reKey` prop that callers bump on
 * tab change + a one-shot rAF after mount to catch async input mounting.
 * Stale targets simply render `null` portals — no error, no leak.
 */
export function RangePillsLayer({ pills, reKey }: RangePillsLayerProps) {
  const [tick, setTick] = useState(0);

  // Bump tick on mount and whenever `reKey` changes so the next render
  // re-runs querySelector for each pill against the freshly-mounted DOM.
  useEffect(() => {
    const id = requestAnimationFrame(() => setTick((t) => t + 1));
    return () => cancelAnimationFrame(id);
  }, [reKey, pills]);

  return (
    <>
      {pills.map((pill) => {
        // Read tick to ensure re-evaluation after reKey/pills changes.
        void tick;
        const target = document.querySelector<HTMLElement>(
          `[data-field="${pill.fieldName}"]`,
        );
        if (!target) return null;
        return createPortal(
          <span
            key={pill.fieldName}
            className={cn(
              "ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none align-middle",
              pill.variant === "flagged"
                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-muted-foreground/30 bg-muted text-muted-foreground",
            )}
            data-testid={`range-pill-${pill.fieldName}`}
            title={
              pill.variant === "flagged"
                ? `Outside expected range ${pill.display}`
                : `Kept value · expected range ${pill.display}`
            }
          >
            {pill.variant === "flagged" ? "Expected " : "Range "}
            {pill.display}
          </span>,
          target,
        );
      })}
    </>
  );
}
