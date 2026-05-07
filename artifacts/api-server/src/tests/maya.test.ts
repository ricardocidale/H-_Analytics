/**
 * Maya — Unit 7 tests.
 *
 * Six scenarios covering the three error paths (client unavailable, no
 * tool_use, LLM throws) and the three happy verdicts (ok, advisory, block).
 * All error paths must return verdict="block" — Maya may not silently pass a
 * slide it could not inspect.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../ai/clients", () => ({
  getAnthropicClient: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getAnthropicClient } from "../ai/clients";
import { runMaya } from "../slides/maya";
import type { LuccaSlotDraft } from "@workspace/db";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SLIDE_NUM = 2 as const;

const SLOT_DRAFTS: Record<string, LuccaSlotDraft> = {
  "slide2.operationalModelText": {
    value: "Full-service boutique hotel",
    approved: true,
    approvedAt: "2026-05-07T00:00:00Z",
    source: "lucca",
  },
};

const PAYLOAD_V2 = { slideNumber: 2, property: { name: "Loch Sheldrake" } };

function makeToolUseResponse(verdict: string, headline: string, notes: string | null = null) {
  return {
    content: [
      {
        type: "tool_use" as const,
        id: "tu_maya_01",
        name: "report_maya_verdict",
        input: { verdict, headline, notes },
      },
    ],
    stop_reason: "tool_use" as const,
  };
}

function makeAnthropicClient(response: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue(response),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("runMaya", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ok verdict — returns { verdict: 'ok', headline, notes: null }", async () => {
    (getAnthropicClient as Mock).mockReturnValue(
      makeAnthropicClient(makeToolUseResponse("ok", "Content is investor-ready", null)),
    );

    const out = await runMaya(SLIDE_NUM, PAYLOAD_V2, SLOT_DRAFTS);

    expect(out.verdict).toBe("ok");
    expect(out.headline).toBe("Content is investor-ready");
    expect(out.notes).toBeNull();
  });

  it("advisory verdict — passes through without blocking", async () => {
    (getAnthropicClient as Mock).mockReturnValue(
      makeAnthropicClient(
        makeToolUseResponse("advisory", "Minor phrasing", "Sentence 3 is verbose"),
      ),
    );

    const out = await runMaya(SLIDE_NUM, PAYLOAD_V2, SLOT_DRAFTS);

    expect(out.verdict).toBe("advisory");
    expect(out.notes).toBe("Sentence 3 is verbose");
  });

  it("block verdict — returned exactly as received", async () => {
    (getAnthropicClient as Mock).mockReturnValue(
      makeAnthropicClient(
        makeToolUseResponse("block", "Revenue figures unverifiable", "No source data provided"),
      ),
    );

    const out = await runMaya(SLIDE_NUM, PAYLOAD_V2, SLOT_DRAFTS);

    expect(out.verdict).toBe("block");
    expect(out.headline).toContain("unverifiable");
  });

  it("no tool_use in response — returns block with diagnostic headline", async () => {
    (getAnthropicClient as Mock).mockReturnValue(
      makeAnthropicClient({
        content: [{ type: "text", text: "I reviewed it and it looks fine." }],
        stop_reason: "end_turn",
      }),
    );

    const out = await runMaya(SLIDE_NUM, PAYLOAD_V2, SLOT_DRAFTS);

    expect(out.verdict).toBe("block");
    expect(out.headline).toMatch(/did not call/i);
  });

  it("LLM throws — returns block with diagnostic headline", async () => {
    (getAnthropicClient as Mock).mockReturnValue({
      messages: {
        create: vi.fn().mockRejectedValue(new Error("upstream timeout")),
      },
    });

    const out = await runMaya(SLIDE_NUM, PAYLOAD_V2, SLOT_DRAFTS);

    expect(out.verdict).toBe("block");
    expect(out.headline).toMatch(/LLM call failed|could not inspect/i);
  });

  it("Anthropic client unavailable — returns block without calling messages.create", async () => {
    (getAnthropicClient as Mock).mockImplementation(() => {
      throw new Error("no API key configured");
    });

    const out = await runMaya(SLIDE_NUM, PAYLOAD_V2, SLOT_DRAFTS);

    expect(out.verdict).toBe("block");
    expect(out.headline).toMatch(/client unavailable|could not inspect/i);
  });
});
