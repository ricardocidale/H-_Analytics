import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fireResearchConfetti } from "@/lib/confetti";
import { MissingRequiredFieldsPrompt } from "@/components/analyst/MissingRequiredFieldsPrompt";

function CSSBackground() {
  return (
    <>
      <div className="absolute inset-0 overflow-hidden">
        {[
          { color: "hsl(var(--primary))", size: 220, x: "50%", y: "50%", delay: 0, dur: 8 },
          { color: "hsl(var(--chart-3))", size: 160, x: "30%", y: "40%", delay: 1, dur: 10 },
          { color: "hsl(var(--accent-pop))", size: 130, x: "70%", y: "60%", delay: 2, dur: 12 },
        ].map((sphere, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: sphere.size,
              height: sphere.size,
              left: sphere.x,
              top: sphere.y,
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle at 35% 35%, ${sphere.color}80, ${sphere.color}20, transparent)`,
              animation: `researchFloat${i} ${sphere.dur}s ease-in-out ${sphere.delay}s infinite`,
            }}
          />
        ))}

        {[2, 3, 3.8].map((radius, i) => (
          <div
            key={`ring-${i}`}
            className="absolute rounded-full border"
            style={{
              width: radius * 100,
              height: radius * 100,
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              borderColor: i === 0 ? "hsl(var(--primary) / 0.3)" : i === 1 ? "hsl(var(--chart-3) / 0.25)" : "hsl(var(--accent-pop) / 0.2)",
              animation: `researchRingSpin ${8 + i * 4}s linear infinite${i % 2 ? " reverse" : ""}`,
            }}
          />
        ))}

        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const r = 35 + Math.sin(i * 1.5) * 8;
          const colors = ["hsl(var(--primary))", "hsl(var(--chart-3))", "hsl(var(--accent-pop))", "hsl(var(--chart-3))"];
          return (
            <div
              key={`particle-${i}`}
              className="absolute rounded-full"
              style={{
                width: 6,
                height: 6,
                left: `calc(50% + ${Math.cos(angle) * r}%)`,
                top: `calc(50% + ${Math.sin(angle) * r * 0.4}%)`,
                background: colors[i % 4],
                opacity: 0.7,
                boxShadow: `0 0 8px ${colors[i % 4]}`,
                animation: `researchParticle ${3 + (i % 3)}s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          );
        })}

        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute rounded-full bg-white"
            style={{
              width: 2,
              height: 2,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.15 + Math.random() * 0.35,
              animation: `researchStarTwinkle ${2 + Math.random() * 3}s ease-in-out ${Math.random() * 2}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes researchFloat0 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          33% { transform: translate(-48%, -53%) scale(1.05); }
          66% { transform: translate(-52%, -47%) scale(0.95); }
        }
        @keyframes researchFloat1 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-45%, -55%) scale(1.08); }
        }
        @keyframes researchFloat2 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-55%, -45%) scale(1.1); }
        }
        @keyframes researchRingSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes researchParticle {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.4); opacity: 1; }
        }
        @keyframes researchStarTwinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>
  );
}

interface ResearchRefreshOverlayProps {
  onComplete: (skipped?: boolean) => void;
}

interface SkippedRecord {
  propertyId: number;
  name: string;
  missingFields: { key: string; label: string; surface: string; surfaceAnchor?: string }[];
}

export function ResearchRefreshOverlay({ onComplete }: ResearchRefreshOverlayProps) {
  const [skippedPrompt, setSkippedPrompt] = useState<{
    open: boolean;
    firstSkipped: SkippedRecord | null;
    totalSkipped: number;
  }>({ open: false, firstSkipped: null, totalSkipped: 0 });
  const [progress, setProgress] = useState(0);
  const [currentProperty, setCurrentProperty] = useState("");
  const [phase, setPhase] = useState<"loading" | "researching" | "done">("loading");
  const [totalProperties, setTotalProperties] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const abortRef = useRef(false);
  const bgRef = useRef<HTMLDivElement>(null);

  const refreshResearch = useCallback(async () => {
    try {
      // 1. Fetch Refresh Config & Properties
      const [configRes, propRes] = await Promise.all([
        fetch("/api/research/refresh-config", { credentials: "include" }),
        fetch("/api/properties", { credentials: "include" }),
      ]);

      const config = configRes.ok ? await configRes.json() : {};
      const props = propRes.ok ? await propRes.json() : [];
      
      const totalSteps = props.length + 2; // +1 for company, +1 for global
      let completedSteps = 0;
      setTotalProperties(props.length);
      setPhase("researching");

      const checkStale = async (type: "property" | "company" | "global", id?: number) => {
        const url = id ? `/api/research/property?propertyId=${id}` : `/api/market-research?type=${type}`;
        try {
          const res = await fetch(url, { credentials: "include" });
          if (res.ok) {
            const existing = await res.json();
            if (existing && existing.updatedAt) {
              const isSeedData = existing.llmModel === "seed-data";
              if (!isSeedData) {
                const age = Date.now() - new Date(existing.updatedAt).getTime();
                const intervalDays = config[type]?.refreshIntervalDays ?? 7;
                const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
                return age >= intervalMs;
              }
            }
          }
        } catch { /* optional check */ }
        return true;
      };

      const { collectMissingLockedHardFields } = await import(
        "@/lib/locked-hard-preflight"
      );
      const skipped: SkippedRecord[] = [];
      const generate = async (type: "property" | "company" | "global", id?: number, context?: unknown, entity?: Record<string, unknown>) => {
        try {
          // Preflight against the full entity; surface skips via prompt.
          if (type === "property" && entity && id !== undefined) {
            const missing = collectMissingLockedHardFields(
              ["property.risk-intelligence", "property.executive-summary"],
              entity,
            );
            if (missing.length > 0) {
              skipped.push({
                propertyId: id,
                name: String(entity.name ?? `Property ${id}`),
                missingFields: missing,
              });
              return;
            }
          }
          const res = await fetch("/api/research/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ type, propertyId: id, propertyContext: context }),
          });

          if (res.ok && res.headers.get("content-type")?.includes("text/event-stream")) {
            const reader = res.body?.getReader();
            if (reader) {
              const decoder = new TextDecoder();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value);
                if (text.includes('"done":true')) break;
              }
            }
          }
        } catch { /* optional gen */ }
      };

      // 2. Refresh Property Research
      for (let i = 0; i < props.length; i++) {
        if (abortRef.current) break;
        const prop = props[i];
        setCurrentProperty(prop.name || `Property ${i + 1}`);
        setProgress(Math.round((completedSteps / totalSteps) * 100));

        const isStale = await checkStale("property", prop.id);
        if (isStale) {
          await generate("property", prop.id, {
            name: prop.name,
            location: prop.location,
            market: prop.market,
            roomCount: prop.roomCount,
          }, prop as Record<string, unknown>);
        }
        completedSteps++;
        setCompletedCount(i + 1);
      }

      // 3. Refresh Company Research
      if (!abortRef.current) {
        setCurrentProperty("Company Benchmarks");
        setProgress(Math.round((completedSteps / totalSteps) * 100));
        const isStale = await checkStale("company");
        if (isStale) await generate("company");
        completedSteps++;
      }

      // 4. Refresh Global Research
      if (!abortRef.current) {
        setCurrentProperty("Global Market Trends");
        setProgress(Math.round((completedSteps / totalSteps) * 100));
        const isStale = await checkStale("global");
        if (isStale) await generate("global");
        completedSteps++;
      }

      setProgress(100);
      setPhase("done");
      fireResearchConfetti();
      if (skipped.length > 0) {
        // Hold the overlay open until the prompt is dismissed so the
        // user can act on the deep links.
        setSkippedPrompt({
          open: true,
          firstSkipped: skipped[0],
          totalSkipped: skipped.length,
        });
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
      onComplete();
    } catch {
      onComplete(true);
    }
  }, [onComplete]);

  useEffect(() => {
    refreshResearch();
    return () => { abortRef.current = true; };
  }, [refreshResearch]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
        style={{ background: "hsl(var(--background))" }}
      >
        <div ref={bgRef} className="absolute inset-0">
          <CSSBackground />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-md text-center px-6">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h2 className="text-2xl font-display text-white/90 mb-2">
              {phase === "loading" && "Preparing Research Engine"}
              {phase === "researching" && "Updating Market Research"}
              {phase === "done" && "Research Complete"}
            </h2>
            <p className="text-sm text-white/50">
              {phase === "loading" && "Connecting to market data sources..."}
              {phase === "researching" && (
                <>Analyzing <span className="text-primary font-medium">{currentProperty}</span> ({completedCount}/{totalProperties})</>
              )}
              {phase === "done" && "All properties are up to date"}
            </p>
          </motion.div>

          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="w-full"
          >
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <p className="text-xs text-white/30 mt-2">{progress}% complete</p>
          </motion.div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            onClick={() => { abortRef.current = true; onComplete(true); }}
            className="text-xs text-white/30 hover:text-white/60 transition-colors underline underline-offset-4 mt-4"
          >
            Skip and continue to dashboard
          </motion.button>
        </div>
      </motion.div>
      <MissingRequiredFieldsPrompt
        open={skippedPrompt.open}
        onOpenChange={(open) => {
          setSkippedPrompt((s) => ({ ...s, open }));
          if (!open) onComplete();
        }}
        specialistLabel={
          skippedPrompt.totalSkipped > 1
            ? `${skippedPrompt.firstSkipped?.name ?? "Property"} (+${skippedPrompt.totalSkipped - 1} more skipped)`
            : (skippedPrompt.firstSkipped?.name ?? "Property")
        }
        missingFields={skippedPrompt.firstSkipped?.missingFields ?? []}
        navContext={{ propertyId: skippedPrompt.firstSkipped?.propertyId }}
      />
    </AnimatePresence>
  );
}
