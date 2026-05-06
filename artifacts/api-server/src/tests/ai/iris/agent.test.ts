/**
 * Unit tests for the Iris agent executor (U3).
 *
 * callLlm, dispatchIrisTool, and all workspace helpers are mocked so that
 * tests run without a live LLM key, vector store, or filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of the mocked modules.
// Vitest hoists vi.mock() calls to the top of the file.
// ---------------------------------------------------------------------------

vi.mock("../../../routes/chat", () => ({
  callLlm: vi.fn(async () => ({
    text: "Health check complete",
    stopReason: "end_turn",
    toolCalls: [],
  })),
}));

vi.mock("../../../ai/iris/tools", () => ({
  getIrisTools: vi.fn(() => []),
  dispatchIrisTool: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../../ai/iris/workspace", () => ({
  readIrisGaps: vi.fn(async () => []),
  readIrisHealth: vi.fn(async () => ""),
  appendRunHistory: vi.fn(async () => undefined),
  clearIrisGaps: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { runIrisAgent, type IrisRunResult, type IrisTrigger } from "../../../ai/iris/agent";
import * as chatModule from "../../../routes/chat";
import * as irisTools from "../../../ai/iris/tools";
import * as workspace from "../../../ai/iris/workspace";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMockedCallLlm() {
  return vi.mocked(chatModule.callLlm);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runIrisAgent — model selection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses Haiku model for scheduled-health trigger", async () => {
    const result = await runIrisAgent("scheduled-health");
    const callArgs = getMockedCallLlm().mock.calls[0];
    // callLlm signature: (provider, model, systemPrompt, history, userMessage, sampling, ...)
    const modelArg = callArgs[1];
    expect(modelArg).toBe("claude-haiku-4-5-20251001");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("uses Sonnet model for manual trigger", async () => {
    const result = await runIrisAgent("manual");
    const callArgs = getMockedCallLlm().mock.calls[0];
    const modelArg = callArgs[1];
    expect(modelArg).toBe("claude-sonnet-4-6");
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  it("uses Sonnet model for scheduled-reindex trigger", async () => {
    await runIrisAgent("scheduled-reindex");
    const modelArg = getMockedCallLlm().mock.calls[0][1];
    expect(modelArg).toBe("claude-sonnet-4-6");
  });

  it("uses Sonnet model for gap-signal trigger", async () => {
    await runIrisAgent("gap-signal");
    const modelArg = getMockedCallLlm().mock.calls[0][1];
    expect(modelArg).toBe("claude-sonnet-4-6");
  });
});

describe("runIrisAgent — gap-signal clears gaps after reading", () => {
  beforeEach(() => {
    vi.mocked(workspace.readIrisGaps).mockResolvedValue(["missing cap rate data", "missing occupancy data"]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads gaps before clearing them on gap-signal", async () => {
    await runIrisAgent("gap-signal");

    const readCall = vi.mocked(workspace.readIrisGaps).mock.invocationCallOrder[0];
    const clearCall = vi.mocked(workspace.clearIrisGaps).mock.invocationCallOrder[0];

    // readIrisGaps must have been called before clearIrisGaps
    expect(readCall).toBeLessThan(clearCall);
    expect(vi.mocked(workspace.clearIrisGaps)).toHaveBeenCalledOnce();
  });

  it("does NOT call clearIrisGaps for manual trigger", async () => {
    await runIrisAgent("manual");
    expect(vi.mocked(workspace.clearIrisGaps)).not.toHaveBeenCalled();
  });

  it("does NOT call clearIrisGaps for scheduled-health trigger", async () => {
    await runIrisAgent("scheduled-health");
    expect(vi.mocked(workspace.clearIrisGaps)).not.toHaveBeenCalled();
  });

  it("does NOT call clearIrisGaps for scheduled-reindex trigger", async () => {
    await runIrisAgent("scheduled-reindex");
    expect(vi.mocked(workspace.clearIrisGaps)).not.toHaveBeenCalled();
  });
});

describe("runIrisAgent — result shape", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a result with the correct shape for manual trigger", async () => {
    const result: IrisRunResult = await runIrisAgent("manual");

    expect(typeof result.runId).toBe("string");
    expect(result.runId.length).toBeGreaterThan(0);
    expect(result.trigger).toBe("manual");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(Array.isArray(result.toolsInvoked)).toBe(true);
    expect(typeof result.chunksIndexed).toBe("number");
    expect(typeof result.errorsEncountered).toBe("number");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.summary).toBe("string");
  });

  it("runId is unique per invocation", async () => {
    const r1 = await runIrisAgent("manual");
    const r2 = await runIrisAgent("manual");
    expect(r1.runId).not.toBe(r2.runId);
  });

  it("trigger field reflects the argument passed in", async () => {
    const triggers: IrisTrigger[] = ["manual", "scheduled-health", "scheduled-reindex", "gap-signal"];
    for (const trigger of triggers) {
      vi.clearAllMocks();
      const result = await runIrisAgent(trigger);
      expect(result.trigger).toBe(trigger);
    }
  });

  it("summary reflects the LLM text response", async () => {
    getMockedCallLlm().mockResolvedValueOnce({
      text: "All systems healthy.",
      stopReason: "end_turn",
      toolCalls: [],
    });
    const result = await runIrisAgent("scheduled-health");
    expect(result.summary).toBe("All systems healthy.");
  });
});

describe("runIrisAgent — tool invocation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accumulates toolsInvoked when LLM returns tool calls", async () => {
    // First call returns tool call, second call returns end_turn
    getMockedCallLlm()
      .mockResolvedValueOnce({
        text: "",
        stopReason: "tool_use",
        toolCalls: [
          { id: "tc-1", name: "test_api_connection", arguments: { sourceId: "1", url: "https://example.com" } },
        ],
      })
      .mockResolvedValueOnce({
        text: "Done",
        stopReason: "end_turn",
        toolCalls: [],
      });

    vi.mocked(irisTools.dispatchIrisTool).mockResolvedValue({ reachable: true, latencyMs: 45 });

    const result = await runIrisAgent("manual");
    expect(result.toolsInvoked).toContain("test_api_connection");
    expect(vi.mocked(irisTools.dispatchIrisTool)).toHaveBeenCalledWith(
      "test_api_connection",
      { sourceId: "1", url: "https://example.com" },
    );
  });

  it("accumulates chunksIndexed from ingest_document tool result", async () => {
    getMockedCallLlm()
      .mockResolvedValueOnce({
        text: "",
        stopReason: "tool_use",
        toolCalls: [
          { id: "tc-ingest", name: "ingest_document", arguments: { url: "https://example.com", category: "reference" } },
        ],
      })
      .mockResolvedValueOnce({
        text: "Indexed successfully.",
        stopReason: "end_turn",
        toolCalls: [],
      });

    vi.mocked(irisTools.dispatchIrisTool).mockResolvedValue({
      success: true,
      chunksIndexed: 7,
    });

    const result = await runIrisAgent("scheduled-reindex");
    expect(result.chunksIndexed).toBe(7);
    expect(result.errorsEncountered).toBe(0);
  });

  it("increments errorsEncountered when tool result has error", async () => {
    getMockedCallLlm()
      .mockResolvedValueOnce({
        text: "",
        stopReason: "tool_use",
        toolCalls: [
          { id: "tc-fail", name: "test_api_connection", arguments: { sourceId: "1", url: "https://unreachable.invalid" } },
        ],
      })
      .mockResolvedValueOnce({
        text: "Connection failed.",
        stopReason: "end_turn",
        toolCalls: [],
      });

    vi.mocked(irisTools.dispatchIrisTool).mockResolvedValue({
      reachable: false,
      latencyMs: 5000,
      errorMessage: "ECONNREFUSED",
    });

    const result = await runIrisAgent("manual");
    expect(result.errorsEncountered).toBe(1);
  });
});

describe("runIrisAgent — workspace helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls readIrisGaps and readIrisHealth on every run", async () => {
    await runIrisAgent("manual");
    expect(vi.mocked(workspace.readIrisGaps)).toHaveBeenCalledOnce();
    expect(vi.mocked(workspace.readIrisHealth)).toHaveBeenCalledOnce();
  });

  it("calls appendRunHistory after the loop", async () => {
    await runIrisAgent("manual");
    expect(vi.mocked(workspace.appendRunHistory)).toHaveBeenCalledOnce();
    const [date, entry] = vi.mocked(workspace.appendRunHistory).mock.calls[0];
    // Date should be YYYY-MM-DD format
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof entry).toBe("string");
    expect(entry.length).toBeGreaterThan(0);
  });
});
