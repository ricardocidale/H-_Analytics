/**
 * phaseToDiscovery.ts — Map raw orchestrator phase strings into
 * human-language "discoveries" for The Analyst working view.
 *
 * The research orchestrator emits phase events like:
 *   "Launching parallel research panels…"
 *   "Analyst A (gemini-2.5-pro): quantitative market analysis"
 *   "Panels complete — A: 12.3s | B: 14.1s"
 *
 * The user shouldn't see internal model names or "Launching panels."
 * Translate those into what The Analyst is FINDING.
 */

export interface AnalystSource {
  key: string;
  label: string;
  icon: string;
  status: "waiting" | "active" | "complete";
}

const DEFAULT_SOURCES: AnalystSource[] = [
  { key: "fred", label: "FRED", icon: "🏛️", status: "waiting" },
  { key: "benchmarks", label: "Benchmarks", icon: "📊", status: "waiting" },
  { key: "knowledge", label: "Knowledge Base", icon: "🧠", status: "waiting" },
  { key: "panels", label: "Analyst Panels", icon: "👥", status: "waiting" },
  { key: "synthesis", label: "Synthesis", icon: "✨", status: "waiting" },
];

/**
 * Convert a single phase string into a discovery sentence.
 * Returns null if the phase should be hidden from the user.
 */
export function phaseToDiscovery(phase: string): string | null {
  const lower = phase.toLowerCase();

  // Hide pure routing/internal noise
  if (lower.includes("falling back to single-model")) {
    return "Adjusting research strategy to focus on the strongest signal…";
  }

  // Progressive relaxation
  if (lower.includes("running progressive relaxation")) {
    return "Searching for comparable properties in your market…";
  }
  const relaxMatch = phase.match(/relaxation complete .*L(\d+),\s*(\d+) comparables.*evidence:\s*([\d.]+)/i);
  if (relaxMatch) {
    const [, level, count, evidence] = relaxMatch;
    const evidenceLabel = parseFloat(evidence) >= 0.7 ? "strong" : parseFloat(evidence) >= 0.4 ? "moderate" : "thin";
    return `Identified ${count} comparable propert${count === "1" ? "y" : "ies"} (level ${level} match, ${evidenceLabel} evidence)`;
  }
  if (lower.includes("relaxation skipped")) {
    return "Skipping comparable search — using direct benchmarks instead";
  }

  // Panels
  if (lower.includes("launching parallel research panels")) {
    return "Convening two analyst panels for cross-validation…";
  }
  if (lower.startsWith("analyst a") && lower.includes("quantitative")) {
    return "Panel A: digging into the quantitative market data";
  }
  if (lower.startsWith("analyst b") && lower.includes("strategy")) {
    return "Panel B: examining strategic positioning and risk";
  }
  const urlsMatch = phase.match(/Retrieved (\d+) validated property URLs/i);
  if (urlsMatch) {
    return `Pulled ${urlsMatch[1]} verified property listings from the knowledge base`;
  }
  const panelsMatch = phase.match(/Panels complete — A:\s*(.+?)\s*\|\s*B:\s*(.+)/i);
  if (panelsMatch) {
    const [, a, b] = panelsMatch;
    if (a.includes("FAILED") || b.includes("FAILED")) {
      return `Both panels weighed in — synthesizing the strongest signal (A: ${a.trim()}, B: ${b.trim()})`;
    }
    return `Both panels delivered their reads — Panel A in ${a.trim()}, Panel B in ${b.trim()}`;
  }
  const panelFailedMatch = phase.match(/Panel (A|B) failed.*proceeding with single-panel synthesis/i);
  if (panelFailedMatch) {
    return `One panel hit a snag — proceeding with the surviving panel's analysis`;
  }

  // Validation
  if (lower.includes("validating analyst estimates against live market")) {
    return "Cross-checking panel estimates against live market data…";
  }

  // Memory / knowledge
  const priorMatch = phase.match(/Retrieved (\d+) similar prior research/i);
  if (priorMatch) {
    return `Recalled ${priorMatch[1]} similar prior research result${priorMatch[1] === "1" ? "" : "s"} from memory`;
  }

  // Synthesis
  if (lower.startsWith("synthesizing with")) {
    return "Synthesizing findings into actionable assumption ranges…";
  }

  // Generic phase strings that already read like discoveries — pass through
  if (phase.length > 0 && phase.length < 220 && !lower.startsWith("debug:")) {
    return phase;
  }

  return null;
}

/**
 * Derive the source-pill states from the cumulative phases array.
 * Each phase advances the relevant source from waiting → active → complete.
 */
export function deriveSourcesFromPhases(phases: string[]): AnalystSource[] {
  const sources = DEFAULT_SOURCES.map(s => ({ ...s }));
  const update = (key: string, status: AnalystSource["status"]) => {
    const s = sources.find(x => x.key === key);
    if (!s) return;
    // Don't downgrade
    const order: AnalystSource["status"][] = ["waiting", "active", "complete"];
    if (order.indexOf(status) > order.indexOf(s.status)) {
      s.status = status;
    }
  };

  for (const phase of phases) {
    const lower = phase.toLowerCase();

    if (lower.includes("running progressive relaxation")) update("benchmarks", "active");
    if (lower.includes("relaxation complete")) update("benchmarks", "complete");

    if (lower.includes("validated property urls")) update("knowledge", "complete");
    if (lower.includes("similar prior research")) update("knowledge", "complete");

    if (lower.includes("launching parallel research panels")) {
      update("panels", "active");
      update("fred", "active");
    }
    if (lower.includes("analyst a (")) update("panels", "active");
    if (lower.includes("panels complete")) {
      update("panels", "complete");
      update("fred", "complete");
    }

    if (lower.includes("validating analyst estimates")) update("benchmarks", "complete");

    if (lower.startsWith("synthesizing with")) update("synthesis", "active");
  }

  // Last phase finished synthesis if we've seen that and panels are done
  if (sources.find(s => s.key === "panels")?.status === "complete") {
    const synth = sources.find(s => s.key === "synthesis");
    if (synth && synth.status === "active") {
      // keep active until done event flips isGenerating
    }
  }

  return sources;
}
