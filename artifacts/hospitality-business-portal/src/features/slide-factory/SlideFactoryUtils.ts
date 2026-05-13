import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  DINO_FAIL_THRESHOLD_PCT,
  DINO_WARN_THRESHOLD_PCT,
  LORENZO_PIPELINE_STEPS,
  SLOT_LABELS,
} from "./SlideFactoryConstants";
import type {
  DinoVerdict,
  FactoryStatus,
  FactoryTab,
  Property,
  SlideAgentResultFE,
  SlideFactoryRun,
  StepStatus,
} from "./SlideFactoryTypes";

export function dinoPctVerdict(pct: number): DinoVerdict {
  if (pct >= DINO_FAIL_THRESHOLD_PCT) return "fail";
  if (pct >= DINO_WARN_THRESHOLD_PCT) return "warn";
  return "pass";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function isTerminal(run: SlideFactoryRun | null): boolean {
  return !run || run.status === "complete" || run.status === "error";
}

// Derives the per-slide display status from agentResults, coercing non-terminal
// per-slide states to terminal when the run itself is terminal. A slide left in
// 'running'/'pending' or missing entirely on a complete run is shown as
// 'approved' (run completed = all slides passed); on an errored run it becomes
// 'rejected' (we don't know which slide passed, fail-closed in the UI).
// Exported so test fixtures consume the same source-of-truth as the Panel.
export function deriveSlotStatus(
  resultStatus: SlideAgentResultFE["status"] | undefined,
  runStatus: "building" | "complete" | "error",
): SlideAgentResultFE["status"] | null {
  if (runStatus === "complete") {
    if (!resultStatus || resultStatus === "running" || resultStatus === "pending") {
      return "approved";
    }
    return resultStatus;
  }
  if (runStatus === "error") {
    if (!resultStatus || resultStatus === "running" || resultStatus === "pending") {
      return "rejected";
    }
    return resultStatus;
  }
  return resultStatus ?? "pending";
}

export function statusToTab(status: FactoryStatus | undefined): FactoryTab {
  switch (status) {
    case "new":
    case "brief_ready":
      return "f-brief";
    case "ingesting":
      return "f-lorenzo";
    case "ingested":
      return "f-properties";
    case "drafting":
    case "draft_review":
      return "f-lucca";
    case "building":
      return "f-agents";
    case "complete":
    case "rebuilding":
      return "f-download";
    default:
      return "f-brief";
  }
}

export function statusBadge(status: FactoryStatus): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  const map: Record<
    FactoryStatus,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    new:          { label: "New",           variant: "secondary" },
    brief_ready:  { label: "Brief ready",   variant: "outline" },
    ingesting:    { label: "Ingesting…",    variant: "outline" },
    ingested:     { label: "Ingested",      variant: "outline" },
    drafting:     { label: "Drafting…",     variant: "outline" },
    draft_review: { label: "Draft review",  variant: "outline" },
    building:     { label: "Building…",     variant: "outline" },
    complete:     { label: "Complete",      variant: "default" },
    rebuilding:   { label: "Rebuilding…",  variant: "outline" },
    error:        { label: "Error",         variant: "destructive" },
  };
  return map[status] ?? { label: status, variant: "secondary" };
}

export function isValidBriefFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return ACCEPTED_EXTENSIONS.has(ext);
}

export function propLabel(properties: Property[], id: number | null): string {
  if (!id) return "";
  const p = properties.find((x) => x.id === id);
  if (!p) return String(id);
  return `${p.name}${p.city ? ` — ${p.city}${p.stateProvince ? `, ${p.stateProvince}` : ""}` : ""}`;
}

export function slotLabel(key: string): string {
  return SLOT_LABELS[key] ?? key;
}

export function getLorenzoStepStatus(stepIndex: number, elapsedS: number): StepStatus {
  const step = LORENZO_PIPELINE_STEPS[stepIndex];
  const prev = stepIndex > 0 ? LORENZO_PIPELINE_STEPS[stepIndex - 1] : null;
  if (elapsedS >= step.completeSecs) return "complete";
  if (!prev || elapsedS >= prev.completeSecs) return "running";
  return "waiting";
}

/**
 * Validates a user-supplied URL before using it as an <img src>.
 *
 * Returns the URL only if it parses as http:/https:/blob:/relative — all
 * other protocols (javascript:, data:, vbscript:, file:, etc.) return "".
 *
 * Without this, an admin pasting `javascript:alert(1)` into the photo-
 * override field of `AgentsOverridePanel` would execute script when the
 * preview <img> renders (CodeQL alert #94 / js/xss-through-dom).
 *
 * Used by photo-override preview rendering only. Server-side ingestion
 * still has to validate independently; this is the front-end belt of the
 * belt-and-suspenders.
 */
export function safeImageSrc(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    // Relative URLs (no protocol prefix) — accept; the browser will resolve
    // them against the current origin, which is the app itself.
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "blob:") {
      return trimmed;
    }
  } catch {
    return "";
  }
  return "";
}
