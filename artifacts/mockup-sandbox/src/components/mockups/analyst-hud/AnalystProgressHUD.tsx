/**
 * AnalystProgressHUD — concept mockup.
 *
 * A small floating rectangle that hovers in front of page content
 * (fixed-positioned, not embedded in the layout plane) while the
 * Analyst is processing. Inspired by Claude Code's compacting bar:
 * elapsed time, character-art progress bar, rotating study line.
 *
 * Design decisions for H+:
 *   • Amber/gold accent (brand "AI at work" signal)
 *   • JetBrains Mono for the progress bar (data-viz feel)
 *   • Backdrop blur so page content shows through subtly
 *   • Framer Motion slide-up entrance + leading-dot pulse
 *   • Bottom-right anchoring — stays out of the workflow
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Constants ──────────────────────────────────────────────────────────────

const BAR_SEGMENTS = 22;

const STUDY_LINES = [
  "Benchmarking RevPAR against Catskills comps…",
  "Pulling labor cost data from FRED…",
  "Calibrating F&B margin assumptions…",
  "Cross-referencing STR chain-scale benchmarks…",
  "Weighing market ADR trends…",
  "Reviewing comp-set occupancy patterns…",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function useElapsedTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

function useRotatingLine(lines: string[], intervalMs = 3200) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % lines.length), intervalMs);
    return () => clearInterval(id);
  }, [lines.length, intervalMs]);
  return lines[index];
}

// ── Animated progress bar ─────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  const filled = Math.round((Math.min(100, Math.max(0, progress)) / 100) * BAR_SEGMENTS);
  const pct = Math.round(progress);

  return (
    <div className="flex items-center gap-2.5">
      <span
        className="tracking-[0.05em] leading-none select-none"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "11px" }}
        aria-hidden
      >
        {Array.from({ length: BAR_SEGMENTS }, (_, i) => {
          const isFilled = i < filled;
          const isLeading = i === filled - 1 && filled > 0;
          if (isLeading) {
            return (
              <motion.span
                key={i}
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                style={{ color: "hsl(38 92% 56%)" }}
              >
                ●
              </motion.span>
            );
          }
          return (
            <span
              key={i}
              style={{ color: isFilled ? "hsl(38 92% 56%)" : "rgba(255,255,255,0.12)" }}
            >
              {isFilled ? "●" : "○"}
            </span>
          );
        })}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: "11px",
          color: "rgba(255,255,255,0.55)",
          minWidth: "2.5rem",
          tabularNums: "true",
        } as React.CSSProperties}
      >
        {pct}%
      </span>
    </div>
  );
}

// ── Sparkle icon (inline — no external dep) ────────────────────────────────

function Sparkle({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

// ── The HUD ────────────────────────────────────────────────────────────────

function AnalystHUD({ progress, visible }: { progress: number; visible: boolean }) {
  const elapsed = useElapsedTimer(visible);
  const line = useRotatingLine(STUDY_LINES);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="analyst-hud"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            width: "340px",
            zIndex: 9999,
            /* glass card */
            background: "rgba(9,9,11,0.93)",
            backdropFilter: "blur(16px) saturate(1.4)",
            WebkitBackdropFilter: "blur(16px) saturate(1.4)",
            borderRadius: "10px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset",
            border: "1px solid rgba(245,158,11,0.22)",
          }}
        >
          {/* Amber top accent line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "16px",
              right: "16px",
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.7), transparent)",
              borderRadius: "999px",
            }}
          />

          <div style={{ padding: "12px 16px 13px", display: "flex", flexDirection: "column", gap: "8px" }}>

            {/* Row 1: sparkle + "Analyst" + elapsed */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <motion.span
                  animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  style={{ color: "hsl(38 92% 56%)", display: "inline-flex" }}
                >
                  <Sparkle size={12} />
                </motion.span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.88)", letterSpacing: "0.01em", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
                  Analyst
                </span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>—</span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>studying</span>
              </div>
              {elapsed >= 2 && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.35)",
                    tabularNums: "true",
                  } as React.CSSProperties}
                >
                  {formatElapsed(elapsed)}
                </motion.span>
              )}
            </div>

            {/* Row 2: rotating study line */}
            <div style={{ overflow: "hidden", height: "16px", position: "relative" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={line}
                  initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.45)",
                    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {line}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Row 3: character-art progress bar */}
            <ProgressBar progress={progress} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Demo page (simulates app content behind the HUD) ──────────────────────

export default function AnalystProgressHUDDemo() {
  const [progress, setProgress] = useState(12);
  const [visible, setVisible] = useState(true);
  const [done, setDone] = useState(false);

  // Auto-advance progress, then auto-replay after a pause
  useEffect(() => {
    if (!visible || done) return;
    const id = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(id);
          setDone(true);
          // HUD exit pause, then reset and replay
          setTimeout(() => {
            setVisible(false);
            setTimeout(() => {
              setProgress(8);
              setDone(false);
              setVisible(true);
            }, 1800);
          }, 900);
          return 100;
        }
        return Math.min(100, p + (Math.random() * 2.8 + 0.6));
      });
    }, 400);
    return () => clearInterval(id);
  }, [visible, done]);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f1f4", position: "relative", overflow: "hidden" }}>

      {/* ── Simulated app content (light page, slightly dimmed to show HUD focus) ── */}
      <div style={{ opacity: 0.55, padding: "28px 32px", display: "flex", flexDirection: "column", gap: "20px", userSelect: "none", pointerEvents: "none" }}>
        {/* Fake header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#fff", borderRadius: 10, padding: "12px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(245,158,11,0.85)" }} />
          <div style={{ width: 160, height: 13, borderRadius: 4, background: "#e2e3e8" }} />
          <div style={{ width: 90, height: 13, borderRadius: 4, background: "#ebebef", marginLeft: 24 }} />
          <div style={{ width: 90, height: 13, borderRadius: 4, background: "#ebebef" }} />
          <div style={{ marginLeft: "auto", width: 76, height: 30, borderRadius: 6, background: "#f3f4f6", border: "1px solid #e2e3e8" }} />
          <div style={{ width: 76, height: 30, borderRadius: 6, background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.3)" }} />
        </div>

        {/* Fake KPI cards row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "RevPAR", val: "$187", delta: "+12%" },
            { label: "ADR", val: "$248", delta: "+8%" },
            { label: "Occupancy", val: "75.4%", delta: "+3%" },
            { label: "NOI", val: "$2.1M", delta: "+18%" },
          ].map(({ label, val, delta }) => (
            <div key={label} style={{ background: "#fff", border: "1px solid #e6e7ec", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontFamily: "system-ui" }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#111", fontFamily: "system-ui", marginBottom: 4 }}>{val}</div>
              <div style={{ fontSize: 11, color: "#22c55e", fontFamily: "system-ui" }}>{delta}</div>
            </div>
          ))}
        </div>

        {/* Fake two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid #e6e7ec", borderRadius: 10, padding: "20px", height: 240, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ width: 140, height: 12, borderRadius: 3, background: "#e9eaee", marginBottom: 20 }} />
            {[100, 72, 88, 61, 94, 53].map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 28, height: 8, borderRadius: 2, background: "#f0f1f4" }} />
                <div style={{ flex: 1, height: 8, background: "#f0f1f4", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${w}%`, height: "100%", background: "rgba(245,158,11,0.55)", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "1px solid #e6e7ec", borderRadius: 10, padding: "18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ width: 90, height: 12, borderRadius: 3, background: "#e9eaee", marginBottom: 16 }} />
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: "#f0f1f4", flexShrink: 0 }} />
                <div>
                  <div style={{ width: 88, height: 9, borderRadius: 2, background: "#e4e5ea", marginBottom: 5 }} />
                  <div style={{ width: 54, height: 8, borderRadius: 2, background: "#eeeff3" }} />
                </div>
                <div style={{ marginLeft: "auto", width: 44, height: 9, borderRadius: 2, background: "#e4e5ea" }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── HUD (floating, above page) ── */}
      <AnalystHUD progress={progress} visible={visible} />

    </div>
  );
}
