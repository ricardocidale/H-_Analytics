/**
 * Tests for the LLM-registry-refresh admin email kill switch
 * (server/ai/llm-registry-manager.ts).
 *
 * The refresher emails admins about admin-overridden model issues. When the
 * `llm_registry_refresh_disabled` notification setting is "true", the
 * notification path must be skipped entirely AND the suppression
 * fingerprint must NOT be advanced — so the very next genuine cycle after
 * an admin re-enables the channel still fires (rather than being treated
 * as a duplicate of a fingerprint captured while muted).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getNotificationSetting = vi.fn();
const getAllUsers = vi.fn();
const getGlobalAssumptions = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    getNotificationSetting: (k: string) => getNotificationSetting(k),
    getAllUsers: () => getAllUsers(),
    getGlobalAssumptions: () => getGlobalAssumptions(),
  },
}));

const probeAllVendors = vi.fn();
vi.mock("../../server/ai/llm-health-probe", () => ({
  probeAllVendors: () => probeAllVendors(),
}));

const computeRecommendations = vi.fn();
const detectAdminOverrideIssues = vi.fn();
const applyRecommendations = vi.fn();
const setLastRegistryState = vi.fn();
const getLastRegistryState = vi.fn();
vi.mock("../../server/ai/llm-recommender", () => ({
  computeRecommendations: (...args: unknown[]) => computeRecommendations(...args),
  detectAdminOverrideIssues: (...args: unknown[]) => detectAdminOverrideIssues(...args),
  applyRecommendations: (...args: unknown[]) => applyRecommendations(...args),
  setLastRegistryState: (s: unknown) => setLastRegistryState(s),
  getLastRegistryState: () => getLastRegistryState(),
}));

const processEvent = vi.fn();
vi.mock("../../server/notifications/engine", () => ({
  processNotificationEvent: (e: unknown) => processEvent(e),
}));

vi.mock("../../server/notifications/events", () => ({
  createEvent: (type: string, payload: Record<string, unknown>) => ({ type, ...payload }),
}));

vi.mock("../../server/logger", () => ({
  log: vi.fn(),
}));

import {
  refreshLlmRegistry,
  __resetLlmRegistryNotifyStateForTest,
} from "../../server/ai/llm-registry-manager";

const ISSUES = [
  { domain: "router", currentModel: "old-model", issue: "deprecated", message: "router model deprecated" },
  { domain: "extractor", currentModel: "gone", issue: "offline", message: "extractor model offline" },
];

beforeEach(() => {
  getNotificationSetting.mockReset();
  getAllUsers.mockReset();
  getGlobalAssumptions.mockReset();
  probeAllVendors.mockReset();
  computeRecommendations.mockReset();
  detectAdminOverrideIssues.mockReset();
  applyRecommendations.mockReset();
  setLastRegistryState.mockReset();
  processEvent.mockReset();

  getNotificationSetting.mockResolvedValue(null);
  getAllUsers.mockResolvedValue([
    { id: 1, email: "admin@example.com", role: "super_admin" },
  ]);
  getGlobalAssumptions.mockResolvedValue({ researchConfig: {} });
  probeAllVendors.mockResolvedValue({
    models: [],
    vendorStatuses: [],
    probedAt: new Date().toISOString(),
    durationMs: 1,
  });
  computeRecommendations.mockReturnValue([]);
  detectAdminOverrideIssues.mockReturnValue(ISSUES);
  applyRecommendations.mockResolvedValue({ applied: [] });
  __resetLlmRegistryNotifyStateForTest();
});

describe("refreshLlmRegistry — llm_registry_refresh_disabled kill switch", () => {
  it("notifies admins when the kill switch is unset (one event per admin)", async () => {
    await refreshLlmRegistry();
    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(processEvent.mock.calls[0][0]).toMatchObject({ type: "LLM_MODEL_ISSUE" });
  });

  it("skips the notification when llm_registry_refresh_disabled is 'true'", async () => {
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(k === "llm_registry_refresh_disabled" ? "true" : null),
    );
    await refreshLlmRegistry();
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("does NOT advance the suppression fingerprint while muted, so the next cycle after re-enabling still fires", async () => {
    // Cycle 1: muted. No notification. Crucially, no fingerprint capture.
    getNotificationSetting.mockImplementation((k: string) =>
      Promise.resolve(k === "llm_registry_refresh_disabled" ? "true" : null),
    );
    await refreshLlmRegistry();
    expect(processEvent).not.toHaveBeenCalled();

    // Cycle 2: admin re-enables. Same issues — should still notify, because
    // we never captured a stale fingerprint while muted.
    getNotificationSetting.mockResolvedValue(null);
    await refreshLlmRegistry();
    expect(processEvent).toHaveBeenCalledTimes(1);
  });

  it("still suppresses true duplicates when the kill switch is unset", async () => {
    await refreshLlmRegistry();
    await refreshLlmRegistry();
    // Same fingerprint two cycles in a row → only one notification.
    expect(processEvent).toHaveBeenCalledTimes(1);
  });
});
