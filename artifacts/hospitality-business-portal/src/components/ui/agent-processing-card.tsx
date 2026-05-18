/**
 * AgentProcessingCard — floating wait-state card for analyst / research jobs.
 *
 * Mounted once in Layout.tsx. Controlled via useProcessingCardStore (spawn /
 * update / dismiss). Renders via createPortal so it escapes any stacking
 * context on any page. z-[60]: above dialogs (z-50), below toasts (z-100).
 *
 * Skill doc: .agents/skills/analyst-processing-card/SKILL.md
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { IconX } from "@/components/icons";
import { useProcessingCardStore } from "@/lib/processing-card";
import { AnalystSwissCube } from "@/components/agent-animations/AnalystSwissCube";
import { useReducedMotion } from "@/components/agent-animations/useReducedMotion";

function formatElapsed(s: number): string {
  if (s < 5) return "";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function StaticMonogram() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 80,
        height: 80,
        borderRadius: "50%",
        background: "hsl(var(--muted))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        fontWeight: 700,
        fontSize: 32,
        color: "hsl(var(--muted-foreground))",
      }}
    >
      A
    </div>
  );
}

function ProcessingCardInner() {
  const { job, dismiss } = useProcessingCardStore();
  const reducedMotion = useReducedMotion();
  const [captionIdx, setCaptionIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!job || job.captions.length <= 1) return;
    const id = setInterval(
      () => setCaptionIdx((i) => (i + 1) % job.captions.length),
      3500,
    );
    return () => clearInterval(id);
  }, [job?.captions]);

  if (!job) return null;

  const progress =
    job.progress !== undefined
      ? job.progress
      : Math.min(90, 90 * (1 - Math.exp(-elapsed / 22)));

  const liveCaption = job.caption;
  const displayCaption = liveCaption ?? job.captions[captionIdx] ?? "";
  const captionKey = liveCaption ? `live-${liveCaption}` : String(captionIdx);

  const handleCancel = () => {
    job.onCancel?.();
    dismiss();
  };

  const animation = job.animation ?? <AnalystSwissCube size={80} />;

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 18, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 60,
        width: 340,
        background: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 12,
        boxShadow:
          "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Animation stage — dark panel for contrast */}
      <div
        style={{
          background: "#111009",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "28px 0",
        }}
      >
        {reducedMotion ? <StaticMonogram /> : animation}
      </div>

      {/* Header — title + description + close */}
      <div
        style={{
          padding: "16px 20px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 16,
              lineHeight: 1.4,
              letterSpacing: "-0.01em",
              color: "hsl(var(--card-foreground))",
            }}
          >
            {job.title}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "hsl(var(--muted-foreground))",
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            Research in progress
          </div>
        </div>
        <button
          onClick={() => dismiss()}
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "hsl(var(--muted-foreground))",
            flexShrink: 0,
            marginTop: 2,
          }}
          aria-label="Dismiss"
        >
          <IconX className="w-[14px] h-[14px]" />
        </button>
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: "hsl(var(--border))" }} />

      {/* Content — caption + progress */}
      <div style={{ padding: "16px 24px" }}>
        <div
          style={{ height: 40, overflow: "hidden", position: "relative" }}
          aria-live="polite"
        >
          <AnimatePresence mode="wait">
            <motion.p
              key={captionKey}
              initial={{ opacity: 0, filter: "blur(4px)", x: 8 }}
              animate={{ opacity: 1, filter: "blur(0px)", x: 0 }}
              exit={{ opacity: 0, filter: "blur(4px)", x: -8 }}
              transition={{ duration: 0.35 }}
              style={{
                position: "absolute",
                inset: 0,
                fontSize: 14,
                lineHeight: 1.5,
                color: "hsl(var(--muted-foreground))",
                margin: 0,
              }}
            >
              {displayCaption}
            </motion.p>
          </AnimatePresence>
        </div>
        <div
          style={{
            marginTop: 14,
            width: "100%",
            height: 4,
            background: "hsl(var(--muted))",
            borderRadius: 99,
            overflow: "hidden",
          }}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            style={{
              height: "100%",
              background: "hsl(var(--accent-pop))",
              borderRadius: 99,
              originX: 0,
            }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: "hsl(var(--border))" }} />

      {/* Footer — elapsed + cancel */}
      <div
        style={{
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
            fontFamily: "'JetBrains Mono', monospace",
            opacity: elapsed >= 5 ? 1 : 0,
            transition: "opacity 0.4s",
            minWidth: 32,
          }}
        >
          {formatElapsed(elapsed)}
        </span>
        <button
          onClick={handleCancel}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 500,
            padding: "6px 14px",
            borderRadius: "var(--radius-sm, 6px)",
            background: "transparent",
            border: "1px solid hsl(var(--border))",
            cursor: "pointer",
            color: "hsl(var(--foreground))",
          }}
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

export function AgentProcessingCard() {
  const job = useProcessingCardStore((s) => s.job);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {job && <ProcessingCardInner key={job.id} />}
    </AnimatePresence>,
    document.body,
  );
}
