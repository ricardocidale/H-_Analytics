/**
 * Display constants and navigation helpers shared across SpecialistPage
 * tabs. Kept out of the React tree so unit tests can import them without
 * pulling in the full component graph.
 */
import type { ResourceHealthStatus, ResourceKind } from "@shared/schema";
import { setAiIntelligenceSection } from "@/lib/ai-intelligence-nav";
import type { AiIntelligenceSection } from "@/components/ai-intelligence/AiIntelligenceSidebar";

export const HEALTH_BAND: Record<
  ResourceHealthStatus,
  { label: string; cls: string }
> = {
  green: { label: "Healthy", cls: "bg-emerald-500" },
  amber: { label: "Stale or skipped", cls: "bg-amber-500" },
  red: { label: "Failing", cls: "bg-rose-500" },
  gray: { label: "Never checked", cls: "bg-slate-400" },
};

export const RESOURCE_KIND_TO_SECTION: Record<ResourceKind, AiIntelligenceSection> = {
  api: "resources",
  source: "resources",
  table: "resources-tables",
  benchmark: "resources",
  model: "resources",
  llm_slot: "resources",
};

export function navigateToResources(
  setLocation: (path: string) => void,
  section: AiIntelligenceSection,
) {
  setAiIntelligenceSection(section);
  setLocation("/ai-intelligence");
}

/**
 * Open the per-resource transparency detail. The detail is URL-addressable
 * via `?resource=<id>` so deep links, browser back/forward, and shareable
 * URLs all work — the dialog is just a UX wrapper around the route.
 */
export function navigateToResourceDetail(
  setLocation: (path: string) => void,
  section: AiIntelligenceSection,
  resourceId: number,
) {
  setAiIntelligenceSection(section);
  setLocation(`/ai-intelligence?resource=${resourceId}`);
}
