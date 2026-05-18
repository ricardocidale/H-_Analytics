import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import "./_group.css";

const CAPTIONS = [
  "Cross-referencing industry benchmarks…",
  "Analyzing revenue comparables in your market…",
  "Computing occupancy rate adjustments…",
  "Synthesizing operational cost assumptions…",
  "Validating GOP margin projections…",
  "Running RevPAR sensitivity analysis…",
];

function formatElapsed(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

// RebeccaOrbit (Swiss Orbit) — inlined from artifacts/hospitality-business-portal/src/components/agent-animations/RebeccaSwissOrbit.tsx
function RebeccaOrbit({ size = 112, className = "" }: { size?: number; className?: string }) {
  const palette = ["#f5f5f4", "#d6d3d1", "#a8a29e", "#78716c", "#44403c"];

  const tracks = useMemo(() => ([
    { tilt: "rotateX(70deg)",              beads: 6, radius: 0.40, keyframes: [0, 80, 95, 110, 220, 360],    times: [0, 0.18, 0.34, 0.52, 0.78, 1], duration: 9  },
    { tilt: "rotateY(70deg)",              beads: 5, radius: 0.34, keyframes: [0, -110, -130, -240, -360],   times: [0, 0.28, 0.46, 0.70, 1],       duration: 11 },
    { tilt: "rotateZ(45deg) rotateX(60deg)", beads: 4, radius: 0.28, keyframes: [0, 60, 90, 200, 240, 360], times: [0, 0.14, 0.30, 0.50, 0.66, 1], duration: 13 },
  ]), []);

  const [spark, setSpark] = useState<{ t: number; b: number; key: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const fire = () => {
      if (cancelled) return;
      const t = Math.floor(Math.random() * tracks.length);
      const b = Math.floor(Math.random() * tracks[t].beads);
      setSpark((prev) => ({ t, b, key: (prev?.key ?? 0) + 1 }));
      timeoutId = window.setTimeout(fire, 280 + Math.random() * 820);
    };
    timeoutId = window.setTimeout(fire, 250);
    return () => { cancelled = true; if (timeoutId !== undefined) window.clearTimeout(timeoutId); };
  }, [tracks]);

  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const tick = () => {
      if (cancelled) return;
      setPulseKey((k) => k + 1);
      timeoutId = window.setTimeout(tick, 1600 + Math.random() * 1600);
    };
    timeoutId = window.setTimeout(tick, 800);
    return () => { cancelled = true; if (timeoutId !== undefined) window.clearTimeout(timeoutId); };
  }, []);

  const half = size / 2;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, perspective: "600px" }}
    >
      <div className="relative" style={{ width: size, height: size, transformStyle: "preserve-3d", transform: "rotateX(-15deg)" }}>
        {/* Pulsing core */}
        <motion.div
          className="absolute rounded-full"
          style={{ left: "50%", top: "50%", width: size * 0.18, height: size * 0.18, marginLeft: -(size * 0.09), marginTop: -(size * 0.09), background: "radial-gradient(circle at 32% 28%, #f5f5f4, #44403c)", border: "1.25px solid #000", zIndex: 4 }}
          animate={{ scale: [1, 1.08, 1.04, 1.32, 1.12, 1.0, 1.18, 1.0], opacity: [1, 1, 0.95, 1, 0.88, 1, 1, 1] }}
          transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut", times: [0, 0.10, 0.22, 0.38, 0.52, 0.68, 0.84, 1] }}
        />
        {/* Pulse ring */}
        <motion.div
          key={`pulse-${pulseKey}`}
          className="absolute rounded-full"
          style={{ left: "50%", top: "50%", width: size * 0.18, height: size * 0.18, marginLeft: -(size * 0.09), marginTop: -(size * 0.09), border: "1.25px solid #000", background: "transparent", zIndex: 3, pointerEvents: "none" }}
          initial={{ scale: 1, opacity: 0.85 }}
          animate={{ scale: 5, opacity: 0 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />

        {tracks.map((track, ti) => {
          const r = size * track.radius;
          return (
            <motion.div
              key={ti}
              className="absolute"
              style={{ left: "50%", top: "50%", width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, transformStyle: "preserve-3d", transform: track.tilt }}
              animate={{ rotateZ: track.keyframes }}
              transition={{ duration: track.duration, repeat: Infinity, ease: "easeInOut", times: track.times }}
            >
              <div className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(0,0,0,0.55)" }} />
              {Array.from({ length: track.beads }).map((_, bi) => {
                const angle = (bi / track.beads) * Math.PI * 2;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                const beadSize = size * 0.11;
                const bg = palette[(ti * 2 + bi) % palette.length];
                const isSpark = spark?.t === ti && spark?.b === bi;
                return (
                  <Fragment key={`bead-${ti}-${bi}`}>
                    <motion.div
                      key={isSpark ? `spark-${spark!.key}` : `idle-${bi}`}
                      className="absolute rounded-full"
                      style={{ left: "50%", top: "50%", width: beadSize, height: beadSize, marginLeft: -beadSize / 2, marginTop: -beadSize / 2, background: isSpark ? `radial-gradient(circle at 32% 28%, #ffffff, #fafaf9 50%, ${bg} 90%)` : `radial-gradient(circle at 32% 28%, #ffffff, ${bg} 55%, #1c1917 130%)`, border: "1px solid #000", boxShadow: isSpark ? `0 0 ${size * 0.28}px rgba(255,255,255,0.95), 0 0 ${size * 0.10}px rgba(255,255,255,1)` : "none", zIndex: isSpark ? 6 : 1 }}
                      initial={false}
                      animate={isSpark ? { x: [x, x * 0.25, x * 0.6, x], y: [y, y * 0.25, y * 0.6, y], scale: [1, 2.1, 1.3, 1] } : { x, y, scale: 1 }}
                      transition={isSpark ? { duration: 1.0, ease: [0.2, 0.8, 0.2, 1], times: [0, 0.35, 0.65, 1] } : { duration: 0.4, ease: "easeOut" }}
                    />
                    {isSpark && (
                      <motion.div
                        key={`trail-${spark!.key}`}
                        className="absolute"
                        style={{ left: "50%", top: "50%", width: Math.hypot(x, y), height: 1.25, marginTop: -0.625, background: "linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0))", transformOrigin: "0 50%", transform: `rotate(${Math.atan2(y, x)}rad)`, zIndex: 5, pointerEvents: "none" }}
                        initial={{ opacity: 0.95, scaleX: 1 }}
                        animate={{ opacity: 0, scaleX: 0.2 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                      />
                    )}
                  </Fragment>
                );
              })}
            </motion.div>
          );
        })}

        {/* Outer ring */}
        <div className="absolute rounded-full" style={{ left: half - size * 0.46, top: half - size * 0.46, width: size * 0.92, height: size * 0.92, border: "1px solid rgba(0,0,0,0.35)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

function IndeterminateBar() {
  return (
    <div
      style={{
        width: "100%",
        height: 3,
        background: "hsl(var(--muted))",
        borderRadius: 99,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "hsl(var(--accent-pop))",
          borderRadius: 99,
          animation: "progress-indeterminate 1.8s ease-in-out infinite",
          transformOrigin: "left center",
        }}
      />
    </div>
  );
}

function ProcessingCard({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const [captionIdx, setCaptionIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setElapsed(0);
    setCaptionIdx(0);
    intervalRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      setCaptionIdx((i) => (i + 1) % CAPTIONS.length);
    }, 3500);
    return () => clearInterval(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="card"
          initial={{ opacity: 0, y: 18, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            width: 340,
            // shadcn Card: rounded-xl border bg-card text-card-foreground shadow
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12, // rounded-xl
            boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
            overflow: "hidden",
            fontFamily: "var(--font-sans)",
          }}
        >
          {/* CardHeader — p-6, flex row with animation + text + close */}
          <div
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 16,
            }}
          >
            <RebeccaOrbit size={80} />

            {/* CardTitle + CardDescription */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              {/* CardTitle: font-semibold leading-none tracking-tight */}
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  lineHeight: 1,
                  letterSpacing: "-0.01em",
                  color: "hsl(var(--card-foreground))",
                }}
              >
                Analyst
              </div>
              {/* CardDescription: text-sm text-muted-foreground, mt-1.5 */}
              <div
                style={{
                  fontSize: 14,
                  color: "hsl(var(--muted-foreground))",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                Research in progress
              </div>
            </div>

            {/* Close button — top-right, ghost */}
            <button
              onClick={onDismiss}
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
                transition: "background 0.15s",
                flexShrink: 0,
                marginTop: -2,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "hsl(var(--accent))")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: "hsl(var(--border))", marginBottom: 0 }} />

          {/* CardContent — px-6 py-4 */}
          <div style={{ padding: "16px 24px" }}>
            {/* Animated caption */}
            <div
              style={{
                height: 40,
                overflow: "hidden",
                position: "relative",
              }}
              aria-live="polite"
            >
              <AnimatePresence mode="wait">
                <motion.p
                  key={captionIdx}
                  initial={{ opacity: 0, filter: "blur(4px)", x: 8 }}
                  animate={{ opacity: 1, filter: "blur(0px)", x: 0 }}
                  exit={{ opacity: 0, filter: "blur(4px)", x: -8 }}
                  transition={{ duration: 0.35 }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "hsl(var(--muted-foreground))",
                    margin: 0,
                  }}
                >
                  {CAPTIONS[captionIdx]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 14 }}>
              <IndeterminateBar />
            </div>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: "hsl(var(--border))" }} />

          {/* CardFooter — px-6 py-4, flex justify-between */}
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
              }}
            >
              {formatElapsed(elapsed)}
            </span>
            <button
              onClick={onDismiss}
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: "6px 14px",
                borderRadius: 6,
                background: "transparent",
                border: "1px solid hsl(var(--border))",
                cursor: "pointer",
                color: "hsl(var(--foreground))",
                fontFamily: "var(--font-sans)",
                transition: "background 0.15s",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "hsl(var(--accent))")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MockPage() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        fontFamily: "var(--font-sans)",
        background: "hsl(var(--background))",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 56,
          background: "hsl(var(--card))",
          borderRight: "1px solid hsl(var(--border))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "12px 0",
          flexShrink: 0,
        }}
      >
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background:
                i === 1 ? "hsl(var(--accent-pop) / 0.12)" : "hsl(var(--muted))",
              border: i === 1 ? "1px solid hsl(var(--accent-pop) / 0.3)" : "none",
            }}
          />
        ))}
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div
          style={{
            height: 48,
            borderBottom: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 120,
              height: 14,
              borderRadius: 4,
              background: "hsl(var(--muted))",
            }}
          />
          <div style={{ flex: 1 }} />
          <div
            style={{
              width: 64,
              height: 28,
              borderRadius: 6,
              background: "hsl(var(--accent-pop) / 0.15)",
              border: "1px solid hsl(var(--accent-pop) / 0.3)",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 16, overflow: "hidden" }}>
          {/* Section header */}
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 80, height: 18, borderRadius: 4, background: "hsl(var(--foreground) / 0.12)" }} />
            <div style={{ width: 48, height: 18, borderRadius: 4, background: "hsl(var(--muted))" }} />
          </div>
          {/* Cards grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ width: "60%", height: 10, borderRadius: 3, background: "hsl(var(--muted))" }} />
                <div style={{ width: "40%", height: 20, borderRadius: 4, background: "hsl(var(--foreground) / 0.08)" }} />
                <div style={{ width: "80%", height: 8, borderRadius: 3, background: "hsl(var(--muted))" }} />
              </div>
            ))}
          </div>
          {/* Table area */}
          <div
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: i < 4 ? "1px solid hsl(var(--border))" : "none",
                  opacity: 1 - i * 0.07,
                }}
              >
                <div style={{ width: 24, height: 24, borderRadius: 6, background: "hsl(var(--muted))", flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ width: `${60 + i * 8}%`, height: 9, borderRadius: 3, background: "hsl(var(--foreground) / 0.1)" }} />
                  <div style={{ width: "40%", height: 7, borderRadius: 3, background: "hsl(var(--muted))" }} />
                </div>
                <div style={{ width: 48, height: 22, borderRadius: 5, background: "hsl(var(--muted))" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentProcessingCard() {
  const [visible, setVisible] = useState(true);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => {
        setShowButton(true);
      }, 600);
      return () => clearTimeout(t);
    } else {
      setShowButton(false);
    }
  }, [visible]);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        background: "hsl(var(--background))",
        fontFamily: "var(--font-sans)",
      }}
    >
      <MockPage />

      {/* Subtle overlay to show card is "above" the page */}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              inset: 0,
              background: "hsl(var(--foreground) / 0.03)",
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      <ProcessingCard visible={visible} onDismiss={() => setVisible(false)} />

      {/* Re-launch button after cancel */}
      <AnimatePresence>
        {showButton && (
          <motion.div
            key="relaunch"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              position: "absolute",
              bottom: 24,
              right: 24,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>
              Card dismissed ↑
            </span>
            <button
              onClick={() => setVisible(true)}
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: "6px 14px",
                borderRadius: 8,
                background: "hsl(var(--accent-pop))",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--accent-pop-foreground))",
                fontFamily: "var(--font-sans)",
                letterSpacing: "0.01em",
              }}
            >
              Relaunch card →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
