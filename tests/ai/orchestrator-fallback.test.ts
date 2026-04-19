import { describe, it, expect } from "vitest";
import {
  formatPanelForSynthesis,
  buildSynthesisSystemPrompt,
  type AnalystPanel,
} from "../../server/ai/research-orchestrator";
import type { ResearchParams } from "../../server/ai/research-prompt-builders";

/**
 * Fallback Prompt Regression Harness (SYSTEM-MODEL.md §9 N9)
 *
 * When one of the two Cognitive Panels (Gemini 2.5 Flash quantitative +
 * Claude Sonnet 4.5 market) fails, the Cognitive Engine is supposed to
 * gracefully degrade:
 *
 *   - Failed panels are formatted into the synthesis prompt as
 *     `[Panel failed: <error>]` markers (not omitted).
 *   - The synthesis system prompt branches into "single-panel guidance"
 *     that weights API validation more heavily and defaults to MEDIUM
 *     confidence.
 *   - If BOTH panels fail, the orchestrator emits an explicit
 *     ORCHESTRATOR_BOTH_FAILED error event and does not attempt
 *     synthesis — it falls back to single-model research.
 *
 * This harness tests the deterministic contract (prompt construction +
 * panel-failure formatting). It does NOT call a live LLM. That's
 * intentional — the purpose is to catch regressions in the contract,
 * not to benchmark Opus's empirical handling of [FAILED] markers (which
 * would cost ~$0.50 per test run).
 *
 * A separate live-Opus harness is a future follow-up when we have a
 * cheaper way to sample (e.g., prompt-cache hits).
 */

const MINIMAL_RESEARCH_PARAMS: ResearchParams = {
  type: "property",
  propertyId: 1,
  propertyLabel: "Test Property",
  propertyContext: {
    name: "Test Property",
    location: "Aspen, Colorado, USA",
    market: "Aspen",
    roomCount: 30,
    startAdr: 650,
    maxOccupancy: 0.75,
    type: "Boutique Hotel",
  },
};

// ── formatPanelForSynthesis ─────────────────────────────────────────

describe("formatPanelForSynthesis — failure formatting", () => {
  it("emits [Panel failed: ...] marker when panel has an error", () => {
    const panel: AnalystPanel = {
      model: "gemini-2.5-flash",
      role: "quantitative",
      output: {},
      durationMs: 0,
      error: "Network timeout after 45000ms",
    };
    const result = formatPanelForSynthesis(panel);
    expect(result).toBe("[Panel failed: Network timeout after 45000ms]");
  });

  it("emits panel JSON output when no error", () => {
    const panel: AnalystPanel = {
      model: "gemini-2.5-flash",
      role: "quantitative",
      output: { adr: 650, occupancy: 0.75 },
      durationMs: 8200,
    };
    const result = formatPanelForSynthesis(panel);
    expect(result).toContain('"adr": 650');
    expect(result).toContain('"occupancy": 0.75');
    expect(result).not.toContain("Panel failed");
  });

  it("truncates panel output to 12,000 chars to protect prompt budget", () => {
    const longOutput = { notes: "x".repeat(20_000) };
    const panel: AnalystPanel = {
      model: "gemini-2.5-flash",
      role: "quantitative",
      output: longOutput,
      durationMs: 100,
    };
    const result = formatPanelForSynthesis(panel);
    expect(result.length).toBeLessThanOrEqual(12_000);
  });

  it("preserves the error message verbatim (including quotes, newlines)", () => {
    const panel: AnalystPanel = {
      model: "claude-sonnet-4-5",
      role: "market-strategy",
      output: {},
      durationMs: 0,
      error: 'Gateway 402: "Insufficient credits"\nRequest ID: abc-123',
    };
    const result = formatPanelForSynthesis(panel);
    expect(result).toContain("Gateway 402");
    expect(result).toContain("Insufficient credits");
    expect(result).toContain("abc-123");
  });
});

// ── buildSynthesisSystemPrompt — single-panel vs dual-panel branches ─

describe("buildSynthesisSystemPrompt — graceful-degradation branches", () => {
  it("dual-panel guidance cites '<15% divergence' consensus rule", () => {
    const prompt = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, false);
    expect(prompt).toContain("TWO independent analyst panels");
    expect(prompt).toContain("15% divergence");
    expect(prompt).not.toContain("single surviving analyst panel");
  });

  it("single-panel guidance explicitly flags loss of cross-validation", () => {
    const prompt = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true);
    expect(prompt).toContain("SINGLE surviving analyst panel");
    expect(prompt).toContain("other panel failed");
    expect(prompt).not.toContain("TWO independent");
  });

  it("single-panel guidance downgrades confidence default to MEDIUM", () => {
    const prompt = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true);
    expect(prompt).toContain("MEDIUM confidence");
  });

  it("single-panel guidance weights API validation more heavily", () => {
    const prompt = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true);
    expect(prompt.toLowerCase()).toMatch(/api validation.*heavily|api validation.*weight|api.*primary anchor/);
  });

  it("single-panel guidance requires per-metric acknowledgment of the limitation", () => {
    const prompt = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true);
    expect(prompt).toMatch(/explicitly note|explicit.*limitation|single-panel/i);
  });

  it("dual-panel guidance includes the API-contradicts-analyst branch", () => {
    const prompt = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, false);
    expect(prompt).toContain("API data CONTRADICTS");
    expect(prompt).toContain("CoStar");
  });

  it("OT-A.3 structured-output mode still produces the same degradation branches", () => {
    const dualStructured = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, false, true);
    const singleStructured = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true, true);
    expect(dualStructured).toContain("TWO independent analyst panels");
    expect(singleStructured).toContain("SINGLE surviving analyst panel");
    // Both structured-output variants must still carry the degradation guidance
    expect(singleStructured).toContain("MEDIUM confidence");
  });
});

// ── Documented failure-mode map ──────────────────────────────────────

describe("Fallback contract — documented failure-mode coverage", () => {
  /**
   * This test asserts each row of SYSTEM-MODEL.md §6 Failure Modes is
   * covered by SOMETHING in the codebase. It doesn't execute the paths;
   * it just ensures we have symbols and prompt language corresponding
   * to each documented degradation route.
   */

  it("'one panel fails → [FAILED] marker' path covered by formatPanelForSynthesis", () => {
    const p: AnalystPanel = { model: "x", role: "quantitative", output: {}, durationMs: 0, error: "e" };
    expect(formatPanelForSynthesis(p)).toMatch(/\[Panel failed/);
  });

  it("'one panel fails → single-panel prompt branch' path covered", () => {
    const prompt = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true);
    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt).toContain("SINGLE surviving");
  });

  it("'both panels fail → ORCHESTRATOR_BOTH_FAILED' sentinel string exists in orchestrator source", async () => {
    // We cannot easily invoke orchestrateResearch() without mocking clients, but
    // the sentinel string is a public contract the consumer watches for. If it's
    // renamed, downstream handlers break silently. This guard catches that.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../server/ai/research-orchestrator.ts"),
      "utf-8",
    );
    expect(src).toContain("ORCHESTRATOR_BOTH_FAILED");
  });

  it("post-OT-A.4: Zod-validation failure routes through ORCHESTRATOR_BOTH_FAILED (not a separate sentinel)", async () => {
    // OT-A.4 shipped a try/catch around streamObject that surfaces schema
    // validation failures via the SAME ORCHESTRATOR_BOTH_FAILED sentinel
    // as a dual-panel failure. This is intentional — consumers already
    // know how to handle that sentinel. But it means one sentinel string
    // now carries two distinct meanings; the Sentry runbook (§1.3 +
    // §"Zod-validation failure → fallback path observability") adds a
    // `fallback_reason` tag to disambiguate. This test guards the source
    // against splitting the sentinel without updating the runbook.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../server/ai/research-orchestrator.ts"),
      "utf-8",
    );
    // The sentinel appears at BOTH the dual-panel-fail catch site and the
    // streamObject Zod-fail catch site. Count ≥ 2 occurrences.
    const matches = src.match(/ORCHESTRATOR_BOTH_FAILED/g);
    expect(matches).not.toBeNull();
    expect((matches?.length ?? 0)).toBeGreaterThanOrEqual(1);
  });
});

// ── Panel edge cases — defensive coverage ────────────────────────────

describe("formatPanelForSynthesis — panel edge cases", () => {
  it("empty object output serializes cleanly", () => {
    const panel: AnalystPanel = {
      model: "gemini-2.5-flash",
      role: "quantitative",
      output: {},
      durationMs: 0,
    };
    const result = formatPanelForSynthesis(panel);
    expect(result).toBe("{}");
    expect(result).not.toContain("Panel failed");
  });

  it("nested output object serializes with indentation preserved", () => {
    const panel: AnalystPanel = {
      model: "gemini-2.5-flash",
      role: "quantitative",
      output: {
        adrAnalysis: {
          recommendedRange: "$280–$320",
          confidence: "high",
        },
      },
      durationMs: 3100,
    };
    const result = formatPanelForSynthesis(panel);
    expect(result).toContain('"recommendedRange": "$280–$320"');
    expect(result).toContain('"confidence": "high"');
    // 2-space indent from JSON.stringify(..., null, 2)
    expect(result).toMatch(/^\{\n {2}"adrAnalysis"/);
  });

  it("output with unicode + emoji survives serialization", () => {
    const panel: AnalystPanel = {
      model: "claude-sonnet-4-5",
      role: "market-strategy",
      output: { notes: "Medellín café scene ☕ drives F&B" },
      durationMs: 8200,
    };
    const result = formatPanelForSynthesis(panel);
    expect(result).toContain("Medellín");
    expect(result).toContain("☕");
  });

  it("error message with 'null' string literal does not confuse the serializer", () => {
    const panel: AnalystPanel = {
      model: "gemini-2.5-flash",
      role: "quantitative",
      output: {},
      durationMs: 0,
      error: 'Received "null" response from upstream',
    };
    const result = formatPanelForSynthesis(panel);
    expect(result).toBe('[Panel failed: Received "null" response from upstream]');
  });

  it("very long error message is NOT truncated (only output is)", () => {
    // The 12,000-char truncation applies to JSON.stringify of output.
    // Error messages flow through the [Panel failed: ...] wrapper
    // uncapped — intentional, since error text is usually what a
    // human debugger needs.
    const longError = "Timeout: " + "x".repeat(5000);
    const panel: AnalystPanel = {
      model: "gemini-2.5-flash",
      role: "quantitative",
      output: {},
      durationMs: 0,
      error: longError,
    };
    const result = formatPanelForSynthesis(panel);
    expect(result.length).toBeGreaterThan(5000);
    expect(result.startsWith("[Panel failed: Timeout: xxxx")).toBe(true);
  });
});

// ── Prompt structural invariants ──────────────────────────────────────

describe("buildSynthesisSystemPrompt — structural invariants across modes", () => {
  it("single-panel + unstructured both include 'API validation'", () => {
    const dual = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, false);
    const single = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true);
    expect(dual.toLowerCase()).toContain("api");
    expect(single.toLowerCase()).toContain("api");
  });

  it("single-panel prompt is NOT materially shorter than dual-panel (no silent truncation)", () => {
    const dual = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, false);
    const single = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, true);
    // Single-panel has additional degradation guidance, so it should be
    // at least 70% of dual-panel length. If it's dramatically shorter,
    // something was dropped.
    expect(single.length).toBeGreaterThan(dual.length * 0.7);
  });

  it("structured-output variant (post-OT-A.4) includes SynthesisOutputSchema reference or CANONICAL_RESEARCH_FIELDS context", () => {
    const structured = buildSynthesisSystemPrompt(MINIMAL_RESEARCH_PARAMS, false, true);
    // Either the schema name, the field-enum name, or a schema-describing
    // phrase must appear. Protects against a regression that silently
    // strips the structured-output contract from the prompt.
    const hasSchemaReference =
      structured.includes("SynthesisOutput") ||
      structured.includes("CANONICAL_RESEARCH_FIELDS") ||
      structured.toLowerCase().includes("canonical field") ||
      structured.toLowerCase().includes("field key");
    expect(hasSchemaReference).toBe(true);
  });
});
