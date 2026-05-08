/**
 * AnalystStudyingIndicator.tsx — the canonical "studying…" affordance shown
 * while The Analyst is doing research. Single visual + voice contract for
 * every research wait state in the app.
 *
 * Visual contract:
 *   • The Analyst's gold sparkle (`IconSparkles` + `text-accent-pop`) with
 *     a slow breathing pulse — the brand mark for "AI is at work here".
 *   • A short rotating sub-line drawn from `studying-lines.ts`, fading
 *     from one to the next every ~3.5s with a brief blur/slide so the
 *     change reads as a thought arriving, not as a flicker.
 *   • An animated three-dot ellipsis after the sub-line for the
 *     Claude-Code "still working" feel (BreathingDots from ai-loader).
 *
 * Voice contract:
 *   • Lines are sourced exclusively from the topic-keyed lexicon in
 *     `studying-lines.ts`. Callers pass a `topic` (preferred) or a
 *     bespoke `lines` array. The lexicon is the brand-voice canon
 *     (`.claude/brand-voice-guidelines.md` §4 + §6); see
 *     `.agents/skills/analyst-research-buttons/SKILL.md` for the rule.
 *
 * Layouts:
 *   • inline   — single-line row, fits inside cards/headers/badges.
 *   • block    — left-aligned, with a slightly larger sparkle. Ideal
 *                directly under a CTA the user just clicked.
 *   • centered — vertically centered with a larger sparkle. Used when
 *                the indicator is the only content on a panel (e.g.
 *                empty-state, full-page research console).
 *
 * Sizes follow the AnalystButton scale so an indicator paired with a
 * `size="sm"` button visually matches it.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconSparkles } from "@/components/icons";
import { BreathingDots } from "@/components/ui/ai-loader";
import { cn } from "@/lib/utils";
import { studyingLinesFor, type StudyTopic } from "./studying-lines";
import { ANALYST_BRAND } from "@/lib/agent-taxonomy";

export type AnalystStudyingSize = "sm" | "md" | "lg";
export type AnalystStudyingVariant = "inline" | "block" | "centered";

export interface AnalystStudyingIndicatorProps {
  /**
   * Topic key into `STUDYING_LINES`. Picks the right curated bank for the
   * surface (e.g. "hospitality-benchmarks", "labor-rates"). Defaults to
   * "general" — safe but generic.
   */
  topic?: StudyTopic;
  /**
   * Override the line bank entirely. Use sparingly — every line MUST
   * still follow the voice rules in `studying-lines.ts` (approved gerund
   * lead, concrete artifact, ellipsis, no exclamation/emoji).
   */
  lines?: readonly string[];
  /** Milliseconds between line transitions. Default: 3500. */
  intervalMs?: number;
  size?: AnalystStudyingSize;
  variant?: AnalystStudyingVariant;
  className?: string;
  /** Override the default test id. */
  dataTestId?: string;
}

const SIZE_CONFIG: Record<
  AnalystStudyingSize,
  { sparkle: string; text: string; gap: string }
> = {
  sm: { sparkle: "w-3.5 h-3.5", text: "text-xs", gap: "gap-1.5" },
  md: { sparkle: "w-4 h-4", text: "text-sm", gap: "gap-2" },
  lg: { sparkle: "w-5 h-5", text: "text-base", gap: "gap-2.5" },
};

const VARIANT_CONFIG: Record<AnalystStudyingVariant, string> = {
  inline: "inline-flex items-center",
  block: "flex items-center",
  centered: "flex flex-col items-center justify-center text-center gap-2 py-6",
};

const DEFAULT_INTERVAL_MS = 3500;

export function AnalystStudyingIndicator({
  topic,
  lines,
  intervalMs = DEFAULT_INTERVAL_MS,
  size = "md",
  variant = "inline",
  className,
  dataTestId = "indicator-analyst-studying",
}: AnalystStudyingIndicatorProps) {
  const bank = lines && lines.length > 0 ? lines : studyingLinesFor(topic);
  const cfg = SIZE_CONFIG[size];
  const [index, setIndex] = useState(0);

  // Use a stable identity key so callers can pass `lines={[…]}` inline
  // (a fresh array reference each render) without thrashing the timer
  // and resetting back to line zero on every parent re-render. The key
  // changes only when the actual bank content changes.
  const bankKey = `${bank.length}:${bank[0] ?? ""}`;

  // Hold the latest bank in a ref so the interval callback always reads
  // the current length without re-creating the timer on every render.
  const bankRef = useRef(bank);
  bankRef.current = bank;

  // Reset to the first line whenever the bank actually changes (topic
  // switch, override change). Keyed on bankKey so a new array reference
  // with the same content does not trigger a reset.
  useEffect(() => {
    setIndex(0);
  }, [bankKey]);

  // Cycle through the bank on the configured interval. A single-line
  // bank short-circuits the timer so we don't schedule a no-op every
  // 3.5s for the entire wait.
  useEffect(() => {
    if (bankRef.current.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % bankRef.current.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [bankKey, intervalMs]);

  const currentLine = bank[index] ?? bank[0] ?? "Studying…";

  const row = (
    <span className={cn("inline-flex items-center", cfg.gap)}>
      <motion.span
        className="relative inline-flex"
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        <IconSparkles className={cn(cfg.sparkle, "text-accent-pop")} />
      </motion.span>
      <span
        className={cn(
          "inline-flex items-center min-w-0",
          cfg.text,
          "text-muted-foreground",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={currentLine}
            initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="truncate"
          >
            {currentLine}
          </motion.span>
        </AnimatePresence>
        <BreathingDots className="ml-1.5" count={3} />
      </span>
    </span>
  );

  // Accessibility: announce a single, stable status to screen readers
  // ("The Analyst is studying.") rather than chattering each 3.5s
  // rotation. The rotating sub-line is decorative for AT users — its
  // information value is visual pacing ("still working"), not new
  // content — so we mark the rendered row aria-hidden and keep one
  // canonical announcement on mount via the visually-hidden status node.
  return (
    <div
      className={cn(VARIANT_CONFIG[variant], className)}
      data-testid={dataTestId}
    >
      <span className="sr-only" role="status">
        {ANALYST_BRAND} is studying.
      </span>
      <span aria-hidden>{row}</span>
    </div>
  );
}
