import { z } from "zod";

export const REBECCA_TONE_PRESETS = ["professional", "conversational", "coaching", "concise", "playful"] as const;
export type RebeccaTonePreset = typeof REBECCA_TONE_PRESETS[number];

export const REBECCA_LENGTH_PREFERENCES = ["terse", "balanced", "thorough"] as const;
export const REBECCA_READING_LEVELS = ["simple", "professional", "expert"] as const;
export const REBECCA_CITATION_STYLES = ["inline", "footnotes", "none"] as const;
export const REBECCA_UNCERTAINTY = ["acknowledge", "hedge", "skip"] as const;

export const REBECCA_SOURCE_KEYS = ["knowledgeBase", "portfolio", "research", "documents", "webSearch", "uploadedFiles"] as const;

/** Maximum number of AI-generated chip suggestions persisted per user. */
export const REBECCA_SUGGESTED_CHIPS_MAX_COUNT = 8;
/** Maximum character length per individual chip suggestion string. */
export const REBECCA_SUGGESTED_CHIP_MAX_LENGTH = 200;
export type RebeccaSourceKey = typeof REBECCA_SOURCE_KEYS[number];

const sourceSchema = z.object({
  enabled: z.boolean(),
  weight: z.number().int().min(0).max(100),
});

export const rebeccaSettingsSchema = z.object({
  identity: z.object({
    avatarInitials: z.string().max(4).default(""),
    subtitle: z.string().max(120).default(""),
    roleTitle: z.string().max(80).default(""),
    pronouns: z.string().max(30).default(""),
    signoff: z.string().max(120).default(""),
    greeting: z.string().max(500).default(""),
    fallbackMessage: z.string().max(500).default(""),
  }),
  personality: z.object({
    warmth: z.number().int().min(0).max(100).default(60),
    formality: z.number().int().min(0).max(100).default(55),
    humor: z.number().int().min(0).max(100).default(25),
    verbosity: z.number().int().min(0).max(100).default(50),
    confidence: z.number().int().min(0).max(100).default(70),
    proactiveness: z.number().int().min(0).max(100).default(55),
    notes: z.string().max(1000).default(""),
  }),
  voice: z.object({
    tonePreset: z.enum(REBECCA_TONE_PRESETS).default("professional"),
    useEmoji: z.boolean().default(false),
    useFirstPerson: z.boolean().default(true),
    askClarifying: z.boolean().default(true),
    lengthPreference: z.enum(REBECCA_LENGTH_PREFERENCES).default("balanced"),
    readingLevel: z.enum(REBECCA_READING_LEVELS).default("professional"),
    locale: z.string().max(10).default("en-US"),
  }),
  behavior: z.object({
    proactiveFollowups: z.boolean().default(true),
    summarizeLong: z.boolean().default(true),
    citationStyle: z.enum(REBECCA_CITATION_STYLES).default("inline"),
    uncertaintyHandling: z.enum(REBECCA_UNCERTAINTY).default("acknowledge"),
    pushBackOnAssumptions: z.boolean().default(true),
  }),
  llm: z.object({
    provider: z.string().min(1).max(80).default("gemini"),
    model: z.string().max(80).default("gemini-2.5-flash"),
    temperature: z.number().min(0).max(2).default(0.7),
    maxOutputTokens: z.number().int().min(64).max(16000).default(2048),
    topP: z.number().min(0).max(1).default(0.95),
    fallbackProvider: z.string().max(80).nullable().default(null),
    fallbackModel: z.string().max(80).nullable().default(null),
  }),
  sources: z.object({
    knowledgeBase: sourceSchema.default({ enabled: true, weight: 70 }),
    portfolio: sourceSchema.default({ enabled: true, weight: 90 }),
    research: sourceSchema.default({ enabled: true, weight: 60 }),
    documents: sourceSchema.default({ enabled: true, weight: 50 }),
    webSearch: sourceSchema.default({ enabled: false, weight: 30 }),
    uploadedFiles: sourceSchema.default({ enabled: true, weight: 50 }),
    webSearchProvider: z.string().max(80).default("perplexity"),
  }),
});

export type RebeccaSettings = z.infer<typeof rebeccaSettingsSchema>;

export const DEFAULT_REBECCA_SETTINGS: RebeccaSettings = rebeccaSettingsSchema.parse({
  identity: {},
  personality: {},
  voice: {},
  behavior: {},
  llm: {},
  sources: {},
});

/**
 * Section-by-section spread of a possibly-partial stored config over the
 * defaults. Returns the fully-shaped object that should be fed to
 * `rebeccaSettingsSchema` for strict validation. Shared between the
 * forward-compat helper (which swallows parse failures) and the strict
 * import variant (which surfaces them).
 */
function hydrateRebeccaSettingsShape(stored: unknown): unknown {
  if (!stored || typeof stored !== "object") {
    // Treat null/undefined/non-object as "use all defaults".
    return { ...DEFAULT_REBECCA_SETTINGS };
  }
  const s = stored as Record<string, unknown>;
  const sectionAsRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const sources = sectionAsRecord(s.sources);
  return {
    identity: { ...DEFAULT_REBECCA_SETTINGS.identity, ...sectionAsRecord(s.identity) },
    personality: { ...DEFAULT_REBECCA_SETTINGS.personality, ...sectionAsRecord(s.personality) },
    voice: { ...DEFAULT_REBECCA_SETTINGS.voice, ...sectionAsRecord(s.voice) },
    behavior: { ...DEFAULT_REBECCA_SETTINGS.behavior, ...sectionAsRecord(s.behavior) },
    llm: { ...DEFAULT_REBECCA_SETTINGS.llm, ...sectionAsRecord(s.llm) },
    sources: {
      ...DEFAULT_REBECCA_SETTINGS.sources,
      ...Object.fromEntries(
        REBECCA_SOURCE_KEYS.map(k => [
          k,
          { ...DEFAULT_REBECCA_SETTINGS.sources[k], ...sectionAsRecord(sources[k]) },
        ]),
      ),
    },
  };
}

/**
 * Merge a possibly-partial stored config (or null) with defaults so callers
 * always get a fully-populated, typed `RebeccaSettings`.
 *
 * Designed for the "load from DB" path: if validation fails (e.g. corrupt
 * row in the DB), we fall back to defaults so the chat can still answer.
 * Do NOT use this on user-supplied input you want to reject — see
 * `tryParseRebeccaSettings` for the strict variant used by the import path.
 */
export function mergeRebeccaSettings(stored: unknown): RebeccaSettings {
  const parsed = rebeccaSettingsSchema.safeParse(hydrateRebeccaSettingsShape(stored));
  return parsed.success ? parsed.data : DEFAULT_REBECCA_SETTINGS;
}

/**
 * Strict counterpart to `mergeRebeccaSettings`: hydrates partials with
 * defaults the same way (for forward-compat), then strict-parses with
 * `rebeccaSettingsSchema`. Returns the Zod result directly so callers
 * (notably the fixture import route in Task #560) can surface a precise
 * 400 error instead of silently substituting defaults.
 */
export function tryParseRebeccaSettings(stored: unknown):
  ReturnType<typeof rebeccaSettingsSchema.safeParse> {
  return rebeccaSettingsSchema.safeParse(hydrateRebeccaSettingsShape(stored));
}

export const rebeccaSettingsPatchSchema = z.object({
  identity: rebeccaSettingsSchema.shape.identity.partial().optional(),
  personality: rebeccaSettingsSchema.shape.personality.partial().optional(),
  voice: rebeccaSettingsSchema.shape.voice.partial().optional(),
  behavior: rebeccaSettingsSchema.shape.behavior.partial().optional(),
  llm: rebeccaSettingsSchema.shape.llm.partial().optional(),
  sources: z.object({
    knowledgeBase: sourceSchema.partial().optional(),
    portfolio: sourceSchema.partial().optional(),
    research: sourceSchema.partial().optional(),
    documents: sourceSchema.partial().optional(),
    webSearch: sourceSchema.partial().optional(),
    uploadedFiles: sourceSchema.partial().optional(),
  }).partial().optional(),
});

/** Compose persona/voice/behavior into a system-prompt overlay block. */
export function buildPersonaOverlay(s: RebeccaSettings, displayName: string): string {
  const lines: string[] = [];
  lines.push(`\n\n## Agent Persona (admin-configured)`);
  lines.push(`You are "${displayName}".`);
  if (s.identity.roleTitle) lines.push(`Role: ${s.identity.roleTitle}.`);
  if (s.identity.pronouns) lines.push(`Pronouns: ${s.identity.pronouns}.`);
  if (s.identity.subtitle) lines.push(`Tagline: ${s.identity.subtitle}.`);

  const dial = (n: number, low: string, high: string) =>
    n <= 25 ? low : n >= 75 ? high : "balanced";
  lines.push(`\nPersonality dials:`);
  lines.push(`- Warmth: ${s.personality.warmth}/100 (${dial(s.personality.warmth, "reserved", "warm and supportive")}).`);
  lines.push(`- Formality: ${s.personality.formality}/100 (${dial(s.personality.formality, "casual", "formal")}).`);
  lines.push(`- Humor: ${s.personality.humor}/100 (${dial(s.personality.humor, "no jokes", "dry wit welcome")}).`);
  lines.push(`- Verbosity: ${s.personality.verbosity}/100 (${dial(s.personality.verbosity, "very brief", "thorough")}).`);
  lines.push(`- Confidence: ${s.personality.confidence}/100 (${dial(s.personality.confidence, "tentative", "decisive")}).`);
  lines.push(`- Proactiveness: ${s.personality.proactiveness}/100 (${dial(s.personality.proactiveness, "answer only what's asked", "anticipate next questions")}).`);
  if (s.personality.notes) lines.push(`Personality notes: ${s.personality.notes}`);

  lines.push(`\nVoice & Tone:`);
  lines.push(`- Tone preset: ${s.voice.tonePreset}.`);
  lines.push(`- Length preference: ${s.voice.lengthPreference}.`);
  lines.push(`- Reading level: ${s.voice.readingLevel}.`);
  lines.push(`- Emoji: ${s.voice.useEmoji ? "OK to use sparingly" : "do not use"}.`);
  lines.push(`- Voice: ${s.voice.useFirstPerson ? "speak in first person ('I')" : "avoid first person"}.`);
  lines.push(`- Clarifying questions: ${s.voice.askClarifying ? "ask if the request is ambiguous" : "answer directly without clarifying questions"}.`);
  if (s.voice.locale && s.voice.locale !== "en-US") lines.push(`- Locale: ${s.voice.locale}.`);

  lines.push(`\nConversation behavior:`);
  lines.push(`- Follow-ups: ${s.behavior.proactiveFollowups ? "suggest a relevant follow-up at the end" : "do not append follow-up suggestions"}.`);
  lines.push(`- Long answers: ${s.behavior.summarizeLong ? "lead with a one-line summary when answers exceed a paragraph" : "skip summary preamble"}.`);
  lines.push(`- Citations: ${s.behavior.citationStyle === "none" ? "do not cite sources" : `use ${s.behavior.citationStyle} citation style`}.`);
  lines.push(`- Uncertainty: ${s.behavior.uncertaintyHandling === "skip" ? "do not flag uncertainty" : s.behavior.uncertaintyHandling === "hedge" ? "soft-hedge uncertain claims" : "explicitly acknowledge uncertainty"}.`);
  lines.push(`- Push back: ${s.behavior.pushBackOnAssumptions ? "respectfully challenge bad assumptions" : "do not push back on user assumptions"}.`);

  if (s.identity.greeting) lines.push(`\nDefault opening greeting: ${s.identity.greeting}`);
  if (s.identity.signoff) lines.push(`Default sign-off: ${s.identity.signoff}`);
  if (s.identity.fallbackMessage) lines.push(`When you don't know an answer, say: ${s.identity.fallbackMessage}`);

  return lines.join("\n");
}

/**
 * Pre-built blocks supplied to {@link assembleSystemPrompt}. Blocks that are
 * gated by an admin Knowledge & Sources toggle (portfolio, knowledge base,
 * research, documents, uploaded-files) are passed in already-formatted; the
 * assembler is responsible for honoring the toggle and dropping the block
 * entirely when the source is disabled.
 *
 * Blocks that are NOT source-gated (guardrails, response-mode overlay,
 * language overlay, prompt-injection guard, focused-entity field block) are
 * always concatenated when supplied. This mirrors the exact assembly order
 * used in `server/routes/chat.ts`.
 */
export interface SystemPromptParts {
  baseSystem: string;
  personaOverlay: string;
  guardrailBlock?: string;
  modePromptOverlay?: string;
  languageOverlay?: string;
  promptInjectionGuard?: string;
  /** Source-gated by `sources.portfolio.enabled`. */
  portfolioBlock?: string;
  /** Always included when present (focused entity context, not source-gated). */
  fieldBlock?: string;
  /**
   * Source-gated by `sources.knowledgeBase.enabled || sources.research.enabled`.
   * The caller is expected to have already filtered RAG content to whichever
   * of those two sources are enabled before producing this combined block.
   */
  ragBlock?: string;
  /** Source-gated by `sources.documents.enabled`. */
  documentBlock?: string;
  /** Source-gated by `sources.uploadedFiles.enabled`. */
  assetBlock?: string;
}

/**
 * Concatenate a Rebecca system prompt from its constituent blocks while
 * honoring the admin's Knowledge & Sources toggles. Disabling a source
 * toggle removes the corresponding block entirely from the assembled
 * prompt, even if a non-empty block string is supplied. This is the single
 * source of truth for source-block gating so it can be exercised by tests
 * without standing up the full chat route.
 */
export function assembleSystemPrompt(
  parts: SystemPromptParts,
  sources: RebeccaSettings["sources"],
): string {
  const portfolio = sources.portfolio.enabled ? (parts.portfolioBlock ?? "") : "";
  const ragEnabled = sources.knowledgeBase.enabled || sources.research.enabled;
  const rag = ragEnabled ? (parts.ragBlock ?? "") : "";
  const docs = sources.documents.enabled ? (parts.documentBlock ?? "") : "";
  const assets = sources.uploadedFiles.enabled ? (parts.assetBlock ?? "") : "";
  const guard = parts.guardrailBlock ?? "";
  const mode = parts.modePromptOverlay ?? "";
  const lang = parts.languageOverlay ?? "";
  const inject = parts.promptInjectionGuard ?? "";
  const field = parts.fieldBlock ?? "";
  return `${parts.baseSystem}${parts.personaOverlay}${guard}${mode}${lang}${inject}\n\n${portfolio}${field}${rag}${docs}${assets}`;
}

/**
 * Per-block "did this source actually contribute content?" signals collected
 * by the chat route after retrieval. Mirrors the keys in
 * {@link REBECCA_SOURCE_KEYS} so the assembled prompt and the admin-facing
 * blocks-included list stay in lock-step.
 *
 * - `portfolio` is true when a non-empty portfolioBlock was supplied.
 * - `knowledgeBase` / `research` split the combined RAG block by namespace —
 *   they are true when at least one chunk from that source made it past the
 *   relevance threshold and into the prompt.
 * - `documents` / `uploadedFiles` are true when the corresponding context
 *   block was non-empty.
 * - `webSearch` is true when web search was actually applied to the LLM call
 *   (i.e. the dispatched provider honored the toggle).
 */
export interface SourceBlockPresence {
  portfolio: boolean;
  knowledgeBase: boolean;
  research: boolean;
  documents: boolean;
  uploadedFiles: boolean;
  webSearch: boolean;
}

/**
 * Derive the list of source blocks that *both* survived the admin's
 * Knowledge & Sources gating *and* actually contributed content to the
 * system prompt for this turn. The Test Chat preview surfaces this list as
 * badges so admins can see exactly which blocks made it in.
 *
 * Kept in `shared/` so it's the single source of truth for both the chat
 * route and any future surface that needs the same derivation.
 */
export function computeBlocksIncluded(
  presence: SourceBlockPresence,
  sources: RebeccaSettings["sources"],
): RebeccaSourceKey[] {
  const out: RebeccaSourceKey[] = [];
  if (sources.portfolio.enabled && presence.portfolio) out.push("portfolio");
  if (sources.knowledgeBase.enabled && presence.knowledgeBase) out.push("knowledgeBase");
  if (sources.research.enabled && presence.research) out.push("research");
  if (sources.documents.enabled && presence.documents) out.push("documents");
  if (sources.uploadedFiles.enabled && presence.uploadedFiles) out.push("uploadedFiles");
  if (sources.webSearch.enabled && presence.webSearch) out.push("webSearch");
  return out;
}

/** Short, human-friendly labels for the blocks-included badges. */
export const REBECCA_SOURCE_LABELS: Record<RebeccaSourceKey, string> = {
  portfolio: "portfolio",
  knowledgeBase: "knowledge base",
  research: "research",
  documents: "documents",
  uploadedFiles: "uploaded files",
  webSearch: "web search",
};
