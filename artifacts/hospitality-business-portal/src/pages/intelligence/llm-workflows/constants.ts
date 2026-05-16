/**
 * Module-level constants for the LlmWorkflows page.
 *
 * Extracted from LlmWorkflowsPage.tsx during the section split. These define
 * the slot grouping shown in the accordion, the reverse specialist-id lookup,
 * and the function-area default tab items.
 *
 * Category mapping (Task #1390):
 *   Agents    — assistants tab; Specialists section
 *   Research  — research tab; financial, research, property-docs slot groups;
 *               OrchestratorDefaults (N+1 pipeline)
 *   Graphics  — image-gen slot group
 *   Other     — operations + exports tabs; data-extraction + system slot groups
 */

import {
  SPECIALIST_SECTION_TO_ID,
  type SpecialistSection,
} from "@/components/admin/AdminSidebar";

// Reverse of SPECIALIST_SECTION_TO_ID (id → section)
export const SPECIALIST_ID_TO_SECTION: Record<string, SpecialistSection> =
  Object.fromEntries(
    (
      Object.entries(SPECIALIST_SECTION_TO_ID) as [SpecialistSection, string][]
    ).map(([section, id]) => [id, section]),
  );

export type LlmCategory = "agents" | "research" | "graphics" | "other";

/**
 * Maps each tab key (from LLM_TAB_ITEMS) to the LLM sidebar category that
 * owns it. This is the single source of truth for category filtering.
 */
export const TAB_CATEGORY_MAP: Record<string, LlmCategory> = {
  assistants:  "agents",
  research:    "research",
  operations:  "other",
  exports:     "other",
};

/**
 * Maps each slot-group id (from SLOT_GROUPS) to the LLM sidebar category that
 * owns it. This is the single source of truth for slot-group filtering.
 */
export const SLOT_GROUP_CATEGORY_MAP: Record<string, LlmCategory> = {
  financial:       "research",
  research:        "research",
  "property-docs": "research",
  "data-extraction": "other",
  "image-gen":     "graphics",
  system:          "other",
};

export const SLOT_GROUPS: {
  id: string;
  label: string;
  description: string;
  slots: string[];
}[] = [
  {
    id: "financial",
    label: "Financial Analysis",
    description:
      "Pro forma generation, quant/market panels, and primary research synthesis",
    slots: [
      "specialist-prompt-engineer",
      "specialist-quant-panel",
      "specialist-market-panel",
      "specialist-primary",
    ],
  },
  {
    id: "research",
    label: "Research Orchestration",
    description:
      "Multi-model pipeline: Analyst A/B sub-tasks and synthesis verdict",
    slots: ["research-analyst-a", "research-analyst-b", "research-synthesis"],
  },
  {
    id: "property-docs",
    label: "Property Documents",
    description:
      "Vision extraction, executive summaries, risk briefs, and ICP intelligence",
    slots: [
      "vision",
      "executive-summary-property",
      "executive-summary-portfolio",
      "risk-brief",
      "icp-intelligence",
    ],
  },
  {
    id: "data-extraction",
    label: "Data Extraction",
    description: "URL scraping, grounded web research, PDF OCR, and bulk synthesis",
    slots: [
      "url-extraction",
      "grounded-web-research",
      "pdf-ocr-extraction",
      "structured-extraction",
      "bulk-text-synthesis",
    ],
  },
  {
    id: "image-gen",
    label: "Image Generation",
    description: "AI image rendering via Replicate (primary and fallback)",
    slots: ["image-generation", "image-generation-fallback"],
  },
  {
    id: "system",
    label: "System Operations",
    description: "Analyst table refresh, constants regeneration, and Costantino orchestration",
    slots: ["analyst-table-refresh", "regen-constants", "costantino-orchestration"],
  },
];

export const LLM_TAB_ITEMS: {
  key: string;
  label: string;
  description: string;
  fn: string;
}[] = [
  {
    key: "research",
    label: "Research",
    description:
      "Default vendor and model for all research domains (Company, Property, Market).",
    fn: "research-deep",
  },
  {
    key: "operations",
    label: "Operations",
    description: "Default vendor and model for AI utility tasks.",
    fn: "operations",
  },
  {
    key: "assistants",
    label: "Assistants",
    description: "Default vendor and model for AI assistants (Rebecca).",
    fn: "chat",
  },
  {
    key: "exports",
    label: "Exports",
    description: "Default vendor and model for premium document exports.",
    fn: "exports",
  },
];
