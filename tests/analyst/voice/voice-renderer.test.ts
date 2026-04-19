import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createVoiceRenderer,
  FORBIDDEN_VOICE_PATTERNS,
  PersonaViolationError,
  __testEnforce,
  __testSanitize,
} from "@engine/analyst/voice/voice-renderer";
import {
  __castVoiceRendered,
  type Evidence,
  type PersonaContext,
  type VerdictDimension,
  type VoiceRenderInputs,
} from "@engine/analyst/contracts/verdict";

const PERSONA: PersonaContext = { segment: "L+B", tier: "luxury", market: "US" };
const evidence: Evidence[] = [
  { source: "HVS 2024", tier: "db_table", asOf: "2025-06-01", personaFit: 1 },
  { source: "STR 2024", tier: "api", asOf: "2025-06-01", personaFit: 0.9 },
];

function baseInputs(overrides: Partial<VoiceRenderInputs> = {}): VoiceRenderInputs {
  return {
    field: "marketing_cost_rate",
    severity: "ok",
    range: { low: 0.03, mid: 0.04, high: 0.05, unit: "%" },
    qualityScore: 75,
    evidence,
    intent: "within-range",
    personaContext: PERSONA,
    ...overrides,
  };
}

describe("Voice Renderer — forbidden patterns", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("exports a non-empty forbidden pattern list", () => {
    expect(FORBIDDEN_VOICE_PATTERNS.length).toBeGreaterThan(0);
  });

  it("throws on plural 'the analysts'", () => {
    expect(() => __testEnforce("Consult the analysts about this.")).toThrow(PersonaViolationError);
  });

  it("throws on 'our analysts' and 'your analysts'", () => {
    expect(() => __testEnforce("Our analysts said hi.")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("Your analysts reviewed this.")).toThrow(PersonaViolationError);
  });

  it("throws on lowercase 'the analyst' noun", () => {
    expect(() => __testEnforce("the analyst reviewed this.")).toThrow(PersonaViolationError);
  });

  it("allows capitalized 'The Analyst'", () => {
    expect(() => __testEnforce("The Analyst reviewed this.")).not.toThrow();
  });

  it("throws on 'the system generated'", () => {
    expect(() => __testEnforce("the system generated these numbers")).toThrow(PersonaViolationError);
  });

  it("throws on 'the algorithm'", () => {
    expect(() => __testEnforce("trust the algorithm here.")).toThrow(PersonaViolationError);
  });

  it("throws on Rebecca-scoped phrases", () => {
    expect(() => __testEnforce("the chatbot handles this")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("the assistant will help")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("call the AI helper")).toThrow(PersonaViolationError);
  });

  it("throws on 'Save Changes' / 'Save changes' button phrasing", () => {
    expect(() => __testEnforce("Click Save Changes to finish.")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("Click Save changes to finish.")).toThrow(PersonaViolationError);
  });

  it("throws on 'Ask the Analyst' literal", () => {
    expect(() => __testEnforce("Ask the Analyst about this range.")).toThrow(PersonaViolationError);
  });

  it("throws on legacy 'Regenerate Intelligence' / 'No Intelligence'", () => {
    expect(() => __testEnforce("Regenerate Intelligence here.")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("No Intelligence available.")).toThrow(PersonaViolationError);
  });

  it("throws on internal team vocabulary", () => {
    expect(() => __testEnforce("The Surface Specialist said so.")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("The Cognitive Engine ran.")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("via Surface Router")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("Voice Renderer output")).toThrow(PersonaViolationError);
    expect(() => __testEnforce("Quality Scorer produced 60.")).toThrow(PersonaViolationError);
  });
});

describe("Voice Renderer — production-mode sanitization", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("does NOT throw in production; returns sanitized text", () => {
    expect(() => __testEnforce("our analysts reviewed")).not.toThrow();
    const sanitized = __testEnforce("our analysts reviewed this");
    expect(sanitized).not.toMatch(/our\s+analysts/i);
    expect(sanitized).toMatch(/The Analyst/);
  });

  it("sanitize replaces forbidden tokens", () => {
    const out = __testSanitize("the chatbot is ready — the system generated this");
    expect(out).not.toMatch(/the\s+chatbot/i);
    expect(out).not.toMatch(/the\s+system\s+generated/i);
  });
});

describe("Voice Renderer — composition", () => {
  const renderer = createVoiceRenderer();

  it("produces a headline that mentions the range and conviction", () => {
    const out = renderer.renderDimension(
      baseInputs({ severity: "advisory", intent: "below-range", qualityScore: 65 }),
    );
    expect(out.headline).toMatch(/Marketing Cost Rate/);
    expect(out.headline).toMatch(/3\.0%/);
    expect(out.headline).toMatch(/moderate conviction/);
    expect(out.headline).toMatch(/L\+B/);
  });

  it("produces a headline for severity 'block'", () => {
    const out = renderer.renderDimension(
      baseInputs({ severity: "block", intent: "block" }),
    );
    expect(out.headline).toMatch(/will not endorse/);
  });

  it("omits range and emits developing-data text when below the conviction floor", () => {
    const out = renderer.renderDimension(
      baseInputs({ severity: "ok", range: { low: 0.03, mid: 0.04, high: 0.05, unit: "%" }, qualityScore: 20 }),
    );
    expect(out.headline).toMatch(/developing data/i);
    expect(out.headline).not.toMatch(/3\.0%/);
    expect(out.detail).toBeUndefined();
  });

  it("is deterministic: same inputs → same output over 100 calls", () => {
    const inputs = baseInputs({ severity: "advisory", intent: "above-range", qualityScore: 72 });
    const first = renderer.renderDimension(inputs);
    for (let i = 0; i < 100; i++) {
      const next = renderer.renderDimension(inputs);
      expect(next.headline).toBe(first.headline);
      expect(next.detail).toBe(first.detail);
    }
  });

  it("renderSurface composes a top-line summary", () => {
    const dims: VerdictDimension[] = [
      {
        field: "adr",
        isNumericField: true,
        severity: "warning",
        range: { low: 200, mid: 300, high: 400, unit: "$" },
        qualityScore: 70,
        evidence,
        voice: { headline: __castVoiceRendered("x"), detail: __castVoiceRendered("y") },
        actions: [],
      },
      {
        field: "occupancy",
        isNumericField: true,
        severity: "ok",
        range: { low: 0.6, mid: 0.7, high: 0.8, unit: "%" },
        qualityScore: 80,
        evidence,
        voice: { headline: __castVoiceRendered("x"), detail: __castVoiceRendered("y") },
        actions: [],
      },
    ];
    const out = renderer.renderSurface(dims);
    expect(out.headline).toMatch(/1 dimension/);
    expect(out.headline).toMatch(/flags/);
  });
});

describe("Voice Renderer — quality-conviction mapping", () => {
  const renderer = createVoiceRenderer();

  it("high conviction for >= 80", () => {
    const out = renderer.renderDimension(baseInputs({ severity: "advisory", qualityScore: 90 }));
    expect(out.headline).toMatch(/high conviction/);
  });

  it("moderate conviction for 60-79", () => {
    const out = renderer.renderDimension(baseInputs({ severity: "advisory", qualityScore: 65 }));
    expect(out.headline).toMatch(/moderate conviction/);
  });

  it("developing conviction for 40-59", () => {
    const out = renderer.renderDimension(baseInputs({ severity: "advisory", qualityScore: 45 }));
    expect(out.headline).toMatch(/developing conviction/);
  });
});
