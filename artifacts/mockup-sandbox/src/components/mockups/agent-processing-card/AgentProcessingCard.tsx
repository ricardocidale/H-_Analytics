import { useState, useEffect, useRef } from "react";
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

// Real AnalystSwissCube — inlined from artifacts/hospitality-business-portal/src/components/agent-animations/AnalystSwissCube.tsx
function AnalystSwissCube({ size = 112, className = "" }: { size?: number; className?: string }) {
  const cubieSize = 14;
  const gap = 1;
  const offset = cubieSize + gap;

  const faces = [
    { dir: "rotateY(0deg)",   bg: "#f5f5f4" },
    { dir: "rotateY(90deg)",  bg: "#d6d3d1" },
    { dir: "rotateY(180deg)", bg: "#a8a29e" },
    { dir: "rotateY(-90deg)", bg: "#78716c" },
    { dir: "rotateX(90deg)",  bg: "#e7e5e4" },
    { dir: "rotateX(-90deg)", bg: "#44403c" },
  ];

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, perspective: "1000px" }}
    >
      <motion.div
        className="relative z-10 flex items-center justify-center"
        style={{ width: cubieSize, height: cubieSize, transformStyle: "preserve-3d", rotateX: -25 }}
        animate={{ rotateY: [0, 360] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      >
        {[-1, 0, 1].map((x) =>
          [-1, 0, 1].map((y) =>
            [-1, 0, 1].map((z) => (
              <motion.div
                key={`orbit-${x}-${y}-${z}`}
                className="absolute inset-0 flex items-center justify-center"
                style={{ transformStyle: "preserve-3d" }}
                animate={{
                  rotateX: [0, x * 90, x * 90, 0,       0,       0,       x * -90, x * -90, 0, 0],
                  rotateY: [0, 0,      y * 90, y * 90,  y * 90,  0,       0,       y * -90, 0, 0],
                  rotateZ: [0, 0,      0,      0,       z * 90,  z * 90,  0,       0,       0, 0],
                }}
                transition={{
                  duration: 6, repeat: Infinity, ease: "backInOut",
                  times: [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 0.96, 1],
                }}
              >
                <motion.div
                  className="absolute"
                  style={{ width: cubieSize, height: cubieSize, transformStyle: "preserve-3d" }}
                  animate={{
                    x: [x*offset, x*offset*1.3, x*offset, x*offset, x*offset*1.6, x*offset, x*offset, x*offset*1.2, x*offset],
                    y: [y*offset, y*offset*1.3, y*offset, y*offset, y*offset*1.6, y*offset, y*offset, y*offset*1.2, y*offset],
                    z: [z*offset, z*offset*1.3, z*offset, z*offset, z*offset*1.6, z*offset, z*offset, z*offset*1.2, z*offset],
                  }}
                  transition={{
                    duration: 6, repeat: Infinity, ease: "easeInOut",
                    times: [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 1],
                  }}
                >
                  {faces.map((face, i) => (
                    <div
                      key={i}
                      className="absolute inset-0 border-[1.5px] border-black"
                      style={{
                        backgroundColor: face.bg,
                        transform: `${face.dir} translateZ(${cubieSize / 2}px)`,
                        backfaceVisibility: "hidden",
                      }}
                    />
                  ))}
                </motion.div>
              </motion.div>
            ))
          )
        )}
      </motion.div>
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
            width: 308,
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border) / 0.7)",
            borderRadius: 14,
            boxShadow:
              "0 20px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
            backdropFilter: "blur(8px)",
            overflow: "hidden",
            fontFamily: "var(--font-sans)",
          }}
        >
          {/* Subtle top accent line */}
          <div
            style={{
              height: 2,
              background: "hsl(var(--accent-pop))",
              opacity: 0.7,
            }}
          />

          <div style={{ padding: "14px 16px 16px" }}>
            {/* Row 1: animation + title + close */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <AnalystSwissCube size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "hsl(var(--foreground))",
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  Analyst
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                    letterSpacing: "0.01em",
                  }}
                >
                  Research in progress
                </div>
              </div>
              <button
                onClick={onDismiss}
                style={{
                  width: 24,
                  height: 24,
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
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "hsl(var(--muted))")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </div>

            {/* Row 2: animated caption */}
            <div
              style={{
                height: 36,
                marginBottom: 12,
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
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "hsl(var(--muted-foreground))",
                    margin: 0,
                    fontStyle: "italic",
                  }}
                >
                  {CAPTIONS[captionIdx]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Row 3: progress bar */}
            <div style={{ marginBottom: 12 }}>
              <IndeterminateBar />
            </div>

            {/* Row 4: elapsed + cancel */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 11,
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
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "transparent",
                  border: "1px solid hsl(var(--border))",
                  cursor: "pointer",
                  color: "hsl(var(--foreground))",
                  fontFamily: "var(--font-sans)",
                  transition: "background 0.15s, border-color 0.15s",
                  letterSpacing: "0.01em",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "hsl(var(--muted))";
                  e.currentTarget.style.borderColor = "hsl(var(--border))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "hsl(var(--border))";
                }}
              >
                Cancel
              </button>
            </div>
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
