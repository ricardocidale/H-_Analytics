/**
 * Task #510 — golden tests for the Rebecca persona overlay and the
 * source-toggle gating in `assembleSystemPrompt`.
 *
 * `buildPersonaOverlay()` translates personality dials and voice settings
 * into prompt text; without snapshots, tweaks could silently change
 * Rebecca's voice across every conversation. These inline snapshots make
 * any unintentional change to the prompt template fail loudly.
 *
 * `assembleSystemPrompt()` is the single source of truth for source-block
 * gating used by `server/routes/chat.ts`. The toggle tests below ensure
 * that disabling a Knowledge & Sources toggle removes the corresponding
 * block from the assembled prompt.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_REBECCA_SETTINGS,
  assembleSystemPrompt,
  buildPersonaOverlay,
  computeBlocksIncluded,
  mergeRebeccaSettings,
  REBECCA_SOURCE_LABELS,
  type RebeccaSettings,
  type SourceBlockPresence,
} from "@shared/rebecca-settings";

function withDials(
  overrides: Partial<RebeccaSettings["personality"]>,
  voice: Partial<RebeccaSettings["voice"]> = {},
  identity: Partial<RebeccaSettings["identity"]> = {},
  behavior: Partial<RebeccaSettings["behavior"]> = {},
): RebeccaSettings {
  return mergeRebeccaSettings({
    identity: { ...DEFAULT_REBECCA_SETTINGS.identity, ...identity },
    personality: { ...DEFAULT_REBECCA_SETTINGS.personality, ...overrides },
    voice: { ...DEFAULT_REBECCA_SETTINGS.voice, ...voice },
    behavior: { ...DEFAULT_REBECCA_SETTINGS.behavior, ...behavior },
    llm: DEFAULT_REBECCA_SETTINGS.llm,
    sources: DEFAULT_REBECCA_SETTINGS.sources,
  });
}

describe("buildPersonaOverlay — golden snapshots", () => {
  it("default dials produce the canonical balanced overlay", () => {
    const overlay = buildPersonaOverlay(DEFAULT_REBECCA_SETTINGS, "Rebecca");
    expect(overlay).toMatchInlineSnapshot(`
"

## Agent Persona (admin-configured)
You are "Rebecca".

Personality dials:
- Warmth: 60/100 (balanced).
- Formality: 55/100 (balanced).
- Humor: 25/100 (no jokes).
- Verbosity: 50/100 (balanced).
- Confidence: 70/100 (balanced).
- Proactiveness: 55/100 (balanced).

Voice & Tone:
- Tone preset: professional.
- Length preference: balanced.
- Reading level: professional.
- Emoji: do not use.
- Voice: speak in first person ('I').
- Clarifying questions: ask if the request is ambiguous.

Conversation behavior:
- Follow-ups: suggest a relevant follow-up at the end.
- Long answers: lead with a one-line summary when answers exceed a paragraph.
- Citations: use inline citation style.
- Uncertainty: explicitly acknowledge uncertainty.
- Push back: respectfully challenge bad assumptions."
`);
  });

  it("fully warm + casual dials swap descriptors and length/voice copy", () => {
    const settings = withDials(
      {
        warmth: 100,
        formality: 0,
        humor: 90,
        verbosity: 80,
        confidence: 50,
        proactiveness: 100,
      },
      {
        tonePreset: "playful",
        useEmoji: true,
        useFirstPerson: true,
        askClarifying: true,
        lengthPreference: "thorough",
        readingLevel: "simple",
      },
    );
    const overlay = buildPersonaOverlay(settings, "Rebecca");
    expect(overlay).toMatchInlineSnapshot(`
"

## Agent Persona (admin-configured)
You are "Rebecca".

Personality dials:
- Warmth: 100/100 (warm and supportive).
- Formality: 0/100 (casual).
- Humor: 90/100 (dry wit welcome).
- Verbosity: 80/100 (thorough).
- Confidence: 50/100 (balanced).
- Proactiveness: 100/100 (anticipate next questions).

Voice & Tone:
- Tone preset: playful.
- Length preference: thorough.
- Reading level: simple.
- Emoji: OK to use sparingly.
- Voice: speak in first person ('I').
- Clarifying questions: ask if the request is ambiguous.

Conversation behavior:
- Follow-ups: suggest a relevant follow-up at the end.
- Long answers: lead with a one-line summary when answers exceed a paragraph.
- Citations: use inline citation style.
- Uncertainty: explicitly acknowledge uncertainty.
- Push back: respectfully challenge bad assumptions."
`);
  });

  it("fully formal + terse dials produce reserved/decisive copy and skip-citations behavior", () => {
    const settings = withDials(
      {
        warmth: 0,
        formality: 100,
        humor: 0,
        verbosity: 10,
        confidence: 100,
        proactiveness: 5,
      },
      {
        tonePreset: "concise",
        useEmoji: false,
        useFirstPerson: false,
        askClarifying: false,
        lengthPreference: "terse",
        readingLevel: "expert",
      },
      {},
      {
        proactiveFollowups: false,
        summarizeLong: false,
        citationStyle: "none",
        uncertaintyHandling: "skip",
        pushBackOnAssumptions: false,
      },
    );
    const overlay = buildPersonaOverlay(settings, "Rebecca");
    expect(overlay).toMatchInlineSnapshot(`
"

## Agent Persona (admin-configured)
You are "Rebecca".

Personality dials:
- Warmth: 0/100 (reserved).
- Formality: 100/100 (formal).
- Humor: 0/100 (no jokes).
- Verbosity: 10/100 (very brief).
- Confidence: 100/100 (decisive).
- Proactiveness: 5/100 (answer only what's asked).

Voice & Tone:
- Tone preset: concise.
- Length preference: terse.
- Reading level: expert.
- Emoji: do not use.
- Voice: avoid first person.
- Clarifying questions: answer directly without clarifying questions.

Conversation behavior:
- Follow-ups: do not append follow-up suggestions.
- Long answers: skip summary preamble.
- Citations: do not cite sources.
- Uncertainty: do not flag uncertainty.
- Push back: do not push back on user assumptions."
`);
  });

  it("identity fields, hedge uncertainty, and non-default locale appear in the overlay", () => {
    const settings = withDials(
      { warmth: 60, formality: 55, humor: 25, verbosity: 50, confidence: 70, proactiveness: 55, notes: "Always reference HBG portfolio context." },
      { locale: "es-MX" },
      {
        roleTitle: "Chief Hospitality Strategist",
        pronouns: "she/her",
        subtitle: "Your portfolio's analyst-on-call",
        greeting: "Hi! How can I help today?",
        signoff: "— Rebecca",
        fallbackMessage: "I don't have that on hand — let me dig in and follow up.",
      },
      { uncertaintyHandling: "hedge" },
    );
    const overlay = buildPersonaOverlay(settings, "Rebecca");
    expect(overlay).toMatchInlineSnapshot(`
"

## Agent Persona (admin-configured)
You are "Rebecca".
Role: Chief Hospitality Strategist.
Pronouns: she/her.
Tagline: Your portfolio's analyst-on-call.

Personality dials:
- Warmth: 60/100 (balanced).
- Formality: 55/100 (balanced).
- Humor: 25/100 (no jokes).
- Verbosity: 50/100 (balanced).
- Confidence: 70/100 (balanced).
- Proactiveness: 55/100 (balanced).
Personality notes: Always reference HBG portfolio context.

Voice & Tone:
- Tone preset: professional.
- Length preference: balanced.
- Reading level: professional.
- Emoji: do not use.
- Voice: speak in first person ('I').
- Clarifying questions: ask if the request is ambiguous.
- Locale: es-MX.

Conversation behavior:
- Follow-ups: suggest a relevant follow-up at the end.
- Long answers: lead with a one-line summary when answers exceed a paragraph.
- Citations: use inline citation style.
- Uncertainty: soft-hedge uncertain claims.
- Push back: respectfully challenge bad assumptions.

Default opening greeting: Hi! How can I help today?
Default sign-off: — Rebecca
When you don't know an answer, say: I don't have that on hand — let me dig in and follow up."
`);
  });

  it("custom display name replaces the agent name in the persona overlay", () => {
    const overlay = buildPersonaOverlay(DEFAULT_REBECCA_SETTINGS, "Atlas");
    expect(overlay).toContain('You are "Atlas".');
    expect(overlay).not.toContain('You are "Rebecca".');
  });
});

describe("assembleSystemPrompt — source toggle gating", () => {
  const PORTFOLIO = "\n\nPORTFOLIO_BLOCK_MARKER";
  const FIELD = "\n\nFIELD_BLOCK_MARKER";
  const RAG = "\n\nRAG_BLOCK_MARKER";
  const DOCS = "\n\nDOCS_BLOCK_MARKER";
  const ASSETS = "\n\nASSETS_BLOCK_MARKER";

  function buildAllBlocksParts() {
    return {
      baseSystem: "BASE_SYSTEM",
      personaOverlay: "PERSONA_OVERLAY",
      guardrailBlock: "GUARDRAIL_BLOCK",
      modePromptOverlay: "MODE_OVERLAY",
      languageOverlay: "LANG_OVERLAY",
      promptInjectionGuard: "INJECT_GUARD",
      portfolioBlock: PORTFOLIO,
      fieldBlock: FIELD,
      ragBlock: RAG,
      documentBlock: DOCS,
      assetBlock: ASSETS,
    };
  }

  it("includes every block when all sources are enabled", () => {
    const sources: RebeccaSettings["sources"] = {
      knowledgeBase: { enabled: true, weight: 70 },
      portfolio: { enabled: true, weight: 90 },
      research: { enabled: true, weight: 60 },
      documents: { enabled: true, weight: 50 },
      webSearch: { enabled: true, weight: 30 },
      uploadedFiles: { enabled: true, weight: 50 },
    };
    const out = assembleSystemPrompt(buildAllBlocksParts(), sources);
    expect(out).toContain("PORTFOLIO_BLOCK_MARKER");
    expect(out).toContain("FIELD_BLOCK_MARKER");
    expect(out).toContain("RAG_BLOCK_MARKER");
    expect(out).toContain("DOCS_BLOCK_MARKER");
    expect(out).toContain("ASSETS_BLOCK_MARKER");
  });

  it("disabling sources.portfolio removes the portfolio block but leaves the rest intact", () => {
    const sources = {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      portfolio: { enabled: false, weight: 0 },
    };
    const out = assembleSystemPrompt(buildAllBlocksParts(), sources);
    expect(out).not.toContain("PORTFOLIO_BLOCK_MARKER");
    expect(out).toContain("FIELD_BLOCK_MARKER");
    expect(out).toContain("RAG_BLOCK_MARKER");
    expect(out).toContain("DOCS_BLOCK_MARKER");
    expect(out).toContain("ASSETS_BLOCK_MARKER");
  });

  it("disabling sources.documents removes the document block", () => {
    const sources = {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      documents: { enabled: false, weight: 0 },
    };
    const out = assembleSystemPrompt(buildAllBlocksParts(), sources);
    expect(out).not.toContain("DOCS_BLOCK_MARKER");
    expect(out).toContain("PORTFOLIO_BLOCK_MARKER");
    expect(out).toContain("RAG_BLOCK_MARKER");
    expect(out).toContain("ASSETS_BLOCK_MARKER");
  });

  it("disabling sources.uploadedFiles removes the asset block", () => {
    const sources = {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      uploadedFiles: { enabled: false, weight: 0 },
    };
    const out = assembleSystemPrompt(buildAllBlocksParts(), sources);
    expect(out).not.toContain("ASSETS_BLOCK_MARKER");
    expect(out).toContain("PORTFOLIO_BLOCK_MARKER");
    expect(out).toContain("RAG_BLOCK_MARKER");
    expect(out).toContain("DOCS_BLOCK_MARKER");
  });

  it("RAG block is suppressed only when BOTH knowledgeBase and research are disabled", () => {
    // KB off, research on → RAG still included
    const kbOffOnly = {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      knowledgeBase: { enabled: false, weight: 0 },
    };
    expect(assembleSystemPrompt(buildAllBlocksParts(), kbOffOnly)).toContain("RAG_BLOCK_MARKER");

    // Research off, KB on → RAG still included
    const researchOffOnly = {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      research: { enabled: false, weight: 0 },
    };
    expect(assembleSystemPrompt(buildAllBlocksParts(), researchOffOnly)).toContain("RAG_BLOCK_MARKER");

    // Both off → RAG dropped
    const bothOff = {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      knowledgeBase: { enabled: false, weight: 0 },
      research: { enabled: false, weight: 0 },
    };
    expect(assembleSystemPrompt(buildAllBlocksParts(), bothOff)).not.toContain("RAG_BLOCK_MARKER");
  });

  it("non-source blocks (guardrails, mode, language, injection guard, field) are not affected by source toggles", () => {
    const allOff: RebeccaSettings["sources"] = {
      knowledgeBase: { enabled: false, weight: 0 },
      portfolio: { enabled: false, weight: 0 },
      research: { enabled: false, weight: 0 },
      documents: { enabled: false, weight: 0 },
      webSearch: { enabled: false, weight: 0 },
      uploadedFiles: { enabled: false, weight: 0 },
    };
    const out = assembleSystemPrompt(buildAllBlocksParts(), allOff);
    expect(out).toContain("BASE_SYSTEM");
    expect(out).toContain("PERSONA_OVERLAY");
    expect(out).toContain("GUARDRAIL_BLOCK");
    expect(out).toContain("MODE_OVERLAY");
    expect(out).toContain("LANG_OVERLAY");
    expect(out).toContain("INJECT_GUARD");
    expect(out).toContain("FIELD_BLOCK_MARKER");
    // every source-gated block is removed
    expect(out).not.toContain("PORTFOLIO_BLOCK_MARKER");
    expect(out).not.toContain("RAG_BLOCK_MARKER");
    expect(out).not.toContain("DOCS_BLOCK_MARKER");
    expect(out).not.toContain("ASSETS_BLOCK_MARKER");
  });

  it("preserves the canonical block ordering: base → persona → guard → mode → lang → injection → portfolio → field → rag → docs → assets", () => {
    const out = assembleSystemPrompt(buildAllBlocksParts(), DEFAULT_REBECCA_SETTINGS.sources);
    const order = [
      "BASE_SYSTEM",
      "PERSONA_OVERLAY",
      "GUARDRAIL_BLOCK",
      "MODE_OVERLAY",
      "LANG_OVERLAY",
      "INJECT_GUARD",
      "PORTFOLIO_BLOCK_MARKER",
      "FIELD_BLOCK_MARKER",
      "RAG_BLOCK_MARKER",
      "DOCS_BLOCK_MARKER",
      "ASSETS_BLOCK_MARKER",
    ];
    let lastIdx = -1;
    for (const marker of order) {
      const idx = out.indexOf(marker);
      expect(idx, `marker ${marker} should appear in order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });
});

/**
 * Task #532 — `computeBlocksIncluded` powers the admin-only "Blocks
 * included" badge list under each Test Chat reply. It must agree with
 * `assembleSystemPrompt`'s gating: a block only counts as "included" when
 * the source toggle is on AND the chat route actually had content for that
 * block.
 */
describe("computeBlocksIncluded — admin Test Chat blocks badge", () => {
  const ALL_PRESENT: SourceBlockPresence = {
    portfolio: true,
    knowledgeBase: true,
    research: true,
    documents: true,
    uploadedFiles: true,
    webSearch: true,
  };

  it("returns every source key when all toggles are on and every block contributed", () => {
    const sources: RebeccaSettings["sources"] = {
      knowledgeBase: { enabled: true, weight: 70 },
      portfolio: { enabled: true, weight: 90 },
      research: { enabled: true, weight: 60 },
      documents: { enabled: true, weight: 50 },
      webSearch: { enabled: true, weight: 30 },
      uploadedFiles: { enabled: true, weight: 50 },
    };
    expect(computeBlocksIncluded(ALL_PRESENT, sources)).toEqual([
      "portfolio",
      "knowledgeBase",
      "research",
      "documents",
      "uploadedFiles",
      "webSearch",
    ]);
  });

  it("drops a block when its toggle is disabled even if the route had content for it", () => {
    const sources = {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      documents: { enabled: false, weight: 0 },
    };
    const out = computeBlocksIncluded(ALL_PRESENT, sources);
    expect(out).not.toContain("documents");
    // A disabled toggle is the exact failure mode the badge list exists to
    // expose, so the rest of the included blocks must remain visible.
    expect(out).toContain("portfolio");
    expect(out).toContain("knowledgeBase");
    expect(out).toContain("research");
    expect(out).toContain("uploadedFiles");
  });

  it("drops a block when the toggle is enabled but the route had no content for it", () => {
    const presence: SourceBlockPresence = {
      ...ALL_PRESENT,
      research: false,
      uploadedFiles: false,
    };
    const out = computeBlocksIncluded(presence, DEFAULT_REBECCA_SETTINGS.sources);
    expect(out).not.toContain("research");
    expect(out).not.toContain("uploadedFiles");
    // KB still in because it had content AND its toggle is enabled by default.
    expect(out).toContain("knowledgeBase");
  });

  it("returns an empty list when every toggle is disabled, regardless of presence", () => {
    const allOff: RebeccaSettings["sources"] = {
      knowledgeBase: { enabled: false, weight: 0 },
      portfolio: { enabled: false, weight: 0 },
      research: { enabled: false, weight: 0 },
      documents: { enabled: false, weight: 0 },
      webSearch: { enabled: false, weight: 0 },
      uploadedFiles: { enabled: false, weight: 0 },
    };
    expect(computeBlocksIncluded(ALL_PRESENT, allOff)).toEqual([]);
  });

  it("returns an empty list when no block had content, regardless of toggles", () => {
    const noPresence: SourceBlockPresence = {
      portfolio: false,
      knowledgeBase: false,
      research: false,
      documents: false,
      uploadedFiles: false,
      webSearch: false,
    };
    expect(computeBlocksIncluded(noPresence, DEFAULT_REBECCA_SETTINGS.sources)).toEqual([]);
  });

  it("preserves a stable ordering matching the source-key declaration order", () => {
    const sources = DEFAULT_REBECCA_SETTINGS.sources;
    // Default settings have webSearch off; toggle it on so all six keys are
    // eligible, then verify the canonical order isn't accidentally sorted.
    const allOn: RebeccaSettings["sources"] = {
      ...sources,
      webSearch: { enabled: true, weight: 30 },
    };
    expect(computeBlocksIncluded(ALL_PRESENT, allOn)).toEqual([
      "portfolio",
      "knowledgeBase",
      "research",
      "documents",
      "uploadedFiles",
      "webSearch",
    ]);
  });

  it("REBECCA_SOURCE_LABELS provides a friendly label for every source key", () => {
    // The Test Chat badges look up labels by key; missing entries would
    // render as raw camelCase identifiers, which would defeat the point
    // of the badge.
    expect(REBECCA_SOURCE_LABELS).toEqual({
      portfolio: "portfolio",
      knowledgeBase: "knowledge base",
      research: "research",
      documents: "documents",
      uploadedFiles: "uploaded files",
      webSearch: "web search",
    });
  });
});
