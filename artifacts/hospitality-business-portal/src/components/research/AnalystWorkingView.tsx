/**
 * AnalystWorkingView.tsx — Inline "The Analyst is studying" view.
 *
 * Replaces the old "Consulting sources" modal with an inline section that
 * takes over the property edit content area while research runs. Shows what
 * The Analyst is FINDING (discoveries), not what it's DOING (process steps).
 *
 * Two zones (Zone 3 / SourceConnectionMap removed to reduce height):
 *   1. Analyst header — pulsing brain avatar, progress, source pills, cancel
 *   2. Discovery feed — scrolling, FadeInUp on each new line; animated
 *      AnalystStudyingIndicator shown when no discoveries have arrived yet
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FadeInUp, AnimatedCounter } from "@/components/ui/animated";
import { cn } from "@/lib/utils";
import { AnalystStudyingIndicator } from "@/components/analyst/AnalystStudyingIndicator";
import { phaseToDiscovery, deriveSourcesFromPhases, type AnalystSource } from "./phaseToDiscovery";

interface AnalystWorkingViewProps {
  propertyName: string;
  phases: string[];
  streamedContent: string;
  startedAt: number | null;
  estimatedSeconds?: number;
  onCancel?: () => void;
}

const DEFAULT_ETA_SECONDS = 60;

export function AnalystWorkingView({
  propertyName,
  phases,
  streamedContent,
  startedAt,
  estimatedSeconds = DEFAULT_ETA_SECONDS,
  onCancel,
}: AnalystWorkingViewProps) {
  // Map raw phase strings to human discovery sentences (drop nulls)
  const discoveries = useMemo(
    () => phases.map(phaseToDiscovery).filter((d): d is string => d !== null),
    [phases],
  );

  const sources = useMemo(() => deriveSourcesFromPhases(phases), [phases]);
  const completedSources = sources.filter(s => s.status === "complete").length;
  const totalSources = sources.length;

  // Has any meaningful phase data arrived yet?
  const hasStarted = phases.length > 0;

  // Determinate progress once phases arrive; indeterminate shimmer until then
  const progressPercent = hasStarted
    ? (totalSources > 0 ? (completedSources / totalSources) * 100 : Math.min(95, discoveries.length * 8))
    : null;

  // Approximate data-point count from streamed content length + sources
  const dataPointCount = useMemo(() => {
    const fromStream = Math.floor(streamedContent.length / 60);
    return fromStream + completedSources * 8;
  }, [streamedContent, completedSources]);

  // Live "remaining seconds" countdown
  const [remainingSeconds, setRemainingSeconds] = useState(estimatedSeconds);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, Math.ceil(estimatedSeconds - elapsed));
      setRemainingSeconds(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, estimatedSeconds]);

  // Auto-scroll the discovery feed to the latest line
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [discoveries.length]);

  const isActivelyWorking = sources.some(s => s.status === "active");

  return (
    <Card
      data-testid="analyst-working-view"
      className="relative overflow-hidden border-amber-500/20 bg-gradient-to-b from-zinc-950/80 via-zinc-950/60 to-zinc-900/80 dark:from-zinc-950 dark:to-zinc-900 shadow-2xl"
    >
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />

      {/* Zone 1: Analyst Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-500/10">
        {/* Pulsing brain avatar */}
        <div className="relative shrink-0">
          <span className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping" style={{ animationDuration: "2.4s" }} />
          <span className="absolute -inset-0.5 rounded-full border border-amber-500/20" />
          <div className="relative w-9 h-9 rounded-full bg-amber-500/20 ring-1 ring-amber-500/40 flex items-center justify-center">
            <BrainIcon className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        {/* Title + meta row */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-zinc-100 truncate" data-testid="text-analyst-studying">
              The Analyst is studying <span className="text-amber-400">{propertyName}</span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            {/* Progress bar — indeterminate shimmer until phases arrive */}
            {progressPercent === null ? (
              <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full w-1/2 rounded-full bg-amber-500/60 animate-pulse" />
              </div>
            ) : (
              <Progress value={progressPercent} className="w-24 h-1.5 bg-zinc-800 [&>div]:bg-amber-500 [&>div]:transition-all [&>div]:duration-700" />
            )}

            <span className="text-xs text-zinc-400" data-testid="text-source-count">
              {completedSources}/{totalSources} sources
            </span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <AnimatedCounter value={dataPointCount} duration={0.6} className="font-medium text-zinc-200 tabular-nums" />
              <span>pts</span>
            </span>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-xs text-zinc-400" data-testid="text-eta">~{remainingSeconds}s</span>
          </div>

          {/* Source pills — compact horizontal strip */}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <AnimatePresence initial={false}>
                {sources.map(source => (
                  <motion.div
                    key={source.key}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <SourcePill source={source} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            data-testid="button-cancel-research"
            className="shrink-0 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 h-7 px-2 text-xs"
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Zone 2: Discovery Feed */}
      <div
        ref={feedRef}
        className="px-4 py-3 max-h-[160px] overflow-y-auto scroll-smooth"
        data-testid="discovery-feed"
      >
        {discoveries.length === 0 ? (
          /* Animated warm-up state — never shows as frozen */
          <div className="py-1" data-testid="warmup-indicator">
            <AnalystStudyingIndicator
              topic="hospitality-benchmarks"
              size="sm"
              variant="block"
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {discoveries.map((text, i) => (
                <FadeInUp key={`${i}-${text.slice(0, 24)}`} delay={0} duration={0.45}>
                  <div className="flex gap-2.5">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                    <p className="text-xs text-zinc-300 leading-relaxed italic">
                      &ldquo;{text}&rdquo;
                    </p>
                  </div>
                </FadeInUp>
              ))}
            </AnimatePresence>

            {/* Bouncing dots only shown after first discoveries arrive and work is still active */}
            {isActivelyWorking && (
              <div className="flex gap-1.5 ml-4 pt-0.5" data-testid="typing-indicator">
                {[0, 150, 300].map(d => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-bounce"
                    style={{ animationDelay: `${d}ms`, animationDuration: "1.2s" }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Source pill — compact status chip
// ───────────────────────────────────────────────────────────────────────────

function SourcePill({ source }: { source: AnalystSource }) {
  return (
    <div
      data-testid={`source-pill-${source.key}`}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors duration-300",
        source.status === "complete" && "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
        source.status === "active" && "border-amber-500/40 text-amber-300 bg-amber-500/10",
        source.status === "waiting" && "border-zinc-700 text-zinc-500 bg-zinc-900/40",
      )}
    >
      <span className="text-xs leading-none">{source.icon}</span>
      <span>{source.label}</span>
      {source.status === "complete" && <span className="text-emerald-400 text-[10px]">✓</span>}
      {source.status === "active" && (
        <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
      )}
    </div>
  );
}

// Inline brain icon — avoids dependency on lucide imports here
function BrainIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
