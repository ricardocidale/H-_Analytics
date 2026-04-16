/**
 * AnalystWorkingView.tsx — Inline "The Analyst is studying" view.
 *
 * Replaces the old "Consulting sources" modal with an inline section that
 * takes over the property edit content area while research runs. Shows what
 * The Analyst is FINDING (discoveries), not what it's DOING (process steps).
 *
 * Three zones:
 *   1. Analyst header — pulsing brain avatar, progress, data-point counter
 *   2. Discovery feed — scrolling, FadeInUp on each new line
 *   3. Source connections — animated SVG beams from sources to The Analyst
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FadeInUp, AnimatedCounter } from "@/components/ui/animated";
import { cn } from "@/lib/utils";
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
  const progressPercent = totalSources > 0 ? (completedSources / totalSources) * 100 : Math.min(95, discoveries.length * 8);

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

  const isWaiting = discoveries.length === 0 || (sources.some(s => s.status === "active"));

  return (
    <Card
      data-testid="analyst-working-view"
      className="relative overflow-hidden border-amber-500/20 bg-gradient-to-b from-zinc-950/80 via-zinc-950/60 to-zinc-900/80 dark:from-zinc-950 dark:to-zinc-900 shadow-2xl"
    >
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />

      {/* Zone 1: Analyst Header */}
      <div className="flex items-center gap-4 p-6 border-b border-amber-500/10">
        <div className="relative shrink-0">
          {/* Pulsing rings (CSS) */}
          <span className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping" style={{ animationDuration: "2.4s" }} />
          <span className="absolute -inset-1 rounded-full border border-amber-500/20" />
          <div className="relative w-12 h-12 rounded-full bg-amber-500/20 ring-1 ring-amber-500/40 flex items-center justify-center">
            <BrainIcon className="w-6 h-6 text-amber-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-zinc-100" data-testid="text-analyst-studying">
            The Analyst is studying <span className="text-amber-400">{propertyName}</span>
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 mt-1.5">
            <Progress value={progressPercent} className="w-32 h-1.5 bg-zinc-800 [&>div]:bg-amber-500" />
            <span data-testid="text-source-count">
              {completedSources} of {totalSources} sources
            </span>
            <span className="text-zinc-700">·</span>
            <span className="flex items-center gap-1">
              <AnimatedCounter value={dataPointCount} duration={0.6} className="font-medium text-zinc-200 tabular-nums" />
              <span>data points gathered</span>
            </span>
            <span className="text-zinc-700">·</span>
            <span data-testid="text-eta">~{remainingSeconds}s remaining</span>
          </div>
        </div>

        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            data-testid="button-cancel-research"
            className="text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Zone 2: Discovery Feed */}
      <div
        ref={feedRef}
        className="px-6 py-5 space-y-3.5 max-h-[360px] overflow-y-auto scroll-smooth"
        data-testid="discovery-feed"
      >
        <AnimatePresence initial={false}>
          {discoveries.map((text, i) => (
            <FadeInUp key={`${i}-${text.slice(0, 24)}`} delay={0} duration={0.45}>
              <div className="flex gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                <p className="text-sm text-zinc-300 leading-relaxed italic">
                  &ldquo;{text}&rdquo;
                </p>
              </div>
            </FadeInUp>
          ))}
        </AnimatePresence>

        {isWaiting && (
          <div className="flex gap-1.5 ml-5 pt-1" data-testid="typing-indicator">
            {[0, 150, 300].map(d => (
              <span
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-bounce"
                style={{ animationDelay: `${d}ms`, animationDuration: "1.2s" }}
              />
            ))}
          </div>
        )}

        {discoveries.length === 0 && !isWaiting && (
          <p className="text-xs text-zinc-500 italic">Warming up the research panel…</p>
        )}
      </div>

      {/* Zone 3: Source Connection Animation */}
      <SourceConnectionMap sources={sources} />
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Source connection map — animated SVG beams from sources → The Analyst
// ───────────────────────────────────────────────────────────────────────────

function SourceConnectionMap({ sources }: { sources: AnalystSource[] }) {
  return (
    <div className="relative px-6 py-5 border-t border-amber-500/10 bg-zinc-950/40">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,140px)] items-center gap-6 sm:gap-10">
        {/* Source nodes (left) */}
        <div className="flex flex-wrap gap-2 justify-end">
          {sources.map((source) => (
            <SourcePill key={source.key} source={source} />
          ))}
        </div>

        {/* The Analyst node (center) */}
        <div className="relative shrink-0">
          <span className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl" />
          <div className="relative w-14 h-14 rounded-full bg-zinc-900 border border-amber-500/40 flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.25)]">
            <BrainIcon className="w-7 h-7 text-amber-400" />
          </div>
          <span className="absolute -inset-1 rounded-full border border-amber-500/30 animate-ping" style={{ animationDuration: "2.4s" }} />
        </div>

        {/* Output node (right) */}
        <OutputPill active={sources.some(s => s.status === "complete")} />
      </div>

      {/* Beams overlay */}
      <BeamsOverlay sources={sources} />
    </div>
  );
}

function SourcePill({ source }: { source: AnalystSource }) {
  return (
    <div
      data-testid={`source-pill-${source.key}`}
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors duration-300",
        source.status === "complete" && "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
        source.status === "active" && "border-amber-500/40 text-amber-300 bg-amber-500/10",
        source.status === "waiting" && "border-zinc-700 text-zinc-500 bg-zinc-900/40",
      )}
    >
      <span className="text-sm leading-none">{source.icon}</span>
      <span>{source.label}</span>
      {source.status === "complete" && <span className="text-emerald-400">✓</span>}
      {source.status === "active" && (
        <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
      )}
    </div>
  );
}

function OutputPill({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border w-fit transition-colors duration-500",
        active ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-zinc-700 text-zinc-500 bg-zinc-900/40",
      )}
      data-testid="output-pill-ranges"
    >
      <span>📊</span>
      <span>Ranges</span>
    </div>
  );
}

/**
 * Decorative animated SVG beams connecting source pills to The Analyst.
 * Uses absolute positioning with relative percentages — works without measuring refs.
 */
function BeamsOverlay({ sources }: { sources: AnalystSource[] }) {
  const activeCount = sources.filter(s => s.status !== "waiting").length;
  if (activeCount === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="beam-amber" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
          <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="beam-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {sources.filter(s => s.status !== "waiting").map((source, idx) => {
        const yPct = 30 + (idx * 12) % 40;
        const isComplete = source.status === "complete";
        return (
          <motion.line
            key={source.key}
            x1="35%"
            y1={`${yPct}%`}
            x2="55%"
            y2="50%"
            stroke={`url(#${isComplete ? "beam-emerald" : "beam-amber"})`}
            strokeWidth={1.2}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, delay: idx * 0.15, repeat: Infinity, repeatDelay: 1.5 }}
          />
        );
      })}
      <motion.line
        x1="55%"
        y1="50%"
        x2="78%"
        y2="50%"
        stroke="url(#beam-emerald)"
        strokeWidth={1.4}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
      />
    </svg>
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
