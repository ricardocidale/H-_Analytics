/**
 * Shared types for the LlmWorkflows page section components and hooks.
 *
 * These were inlined in LlmWorkflowsPage.tsx before the refactor.
 */

export interface SlotConfig {
  modelSlug?: string | null;
}

export interface ModelConfig {
  vendor?: string;
  modelId?: string;
}

export interface SpecialistOverrideListItem {
  id: string;
  displayName?: string | null;
  realName?: string | null;
  humanName?: string | null;
  hasLlmOverrides?: boolean;
}

export interface VendorStatus {
  vendor: string;
  available: boolean;
  modelCount: number;
  avgLatencyMs: number | null;
  error?: string;
}
