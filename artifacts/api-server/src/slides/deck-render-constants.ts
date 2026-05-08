/**
 * Shared Playwright/PDF render constants for the LB investor deck.
 * Imported by both the full-deck route (property-deck-pdf.ts) and the
 * per-slide route (property-deck-slide.ts) so the values live in one place.
 */
export const TOTAL_SLIDES = 6;
export const PDF_RENDER_TIMEOUT_MS = 90 * 1000;
export const DECK_READY_POLL_TIMEOUT_MS = 60 * 1000;
export const DECK_VIEWPORT_WIDTH = 1920;
export const DECK_VIEWPORT_HEIGHT = 1080;
export const PDF_CONTENT_TYPE = "application/pdf";

/** Aldo canvas width (px) — coordinate space Aldo maps PDF elements into */
export const ALDO_CANVAS_WIDTH = 960;
/** Aldo canvas height (px) */
export const ALDO_CANVAS_HEIGHT = 540;
/** pdftotext subprocess timeout for Aldo (ms) */
export const ALDO_PDFTOTEXT_TIMEOUT_MS = 30_000;
/** Minimum element count Aldo requires before accepting an extraction */
export const ALDO_MIN_ELEMENT_COUNT = 10;
/** Decimal precision factor for Aldo coordinate rounding (1 decimal place: 10^1) */
export const ALDO_COORD_PRECISION = 10;
/** UUID prefix length used for temporary file IDs throughout the slide pipeline */
export const SLIDE_TEMP_UUID_PREFIX_LENGTH = 8;

// ── Lorenzo vision constants (Units 3c–3f) ──────────────────────────────────

/** Anthropic model used by Lorenzo-03 (vision reconciler) and Lorenzo-05 (inspector) */
export const LORENZO_VISION_MODEL = "claude-opus-4-7";
/** max_tokens for Lorenzo-03 per-slide enrichment call */
export const LORENZO_03_MAX_TOKENS = 4096;
/** max_tokens for Lorenzo-05 holistic inspector call */
export const LORENZO_05_MAX_TOKENS = 2048;
/** Schema version tag written into LorenzoCanonicalSpec.schemaVersion */
export const LORENZO_SCHEMA_VERSION = "1.0.0";
/**
 * Maximum y-coordinate difference (canvas px) for two Aldo word elements to be
 * considered on the same text line during pre-grouping.
 */
export const ALDO_LINE_GROUP_Y_THRESHOLD_PX = 3;

// ── Lucca draft constants (Unit 4b) ─────────────────────────────────────────

/** Anthropic model used by Lucca-01 batch-draft calls */
export const LUCCA_DRAFT_MODEL = LORENZO_VISION_MODEL;
/** max_tokens for each Lucca-01 per-group draft call */
export const LUCCA_MAX_TOKENS = 2048;

// ── Carlo validation bounds ──────────────────────────────────────────────────

/** Minimum valid CSS font-weight value */
export const CARLO_FONT_WEIGHT_MIN = 100;
/** Maximum valid CSS font-weight value */
export const CARLO_FONT_WEIGHT_MAX = 900;
/** Max number of blocking errors to include in a single error message string */
export const CARLO_MAX_ERRORS_IN_MSG = 5;

// ── Marco orchestrator constants (Unit 1 — paired with Unit 4 swarm framework) ──

/**
 * Anthropic model used by Marco. Orchestration is text-only (no vision needed),
 * so Sonnet is the cost-appropriate tier per CLAUDE.md §12. Marco's job is
 * sequencing primitive tool calls, not creative generation.
 */
export const MARCO_MODEL = "claude-sonnet-4-6";

/** max_tokens per Marco LLM turn — small because turns are mostly tool-use blocks */
export const MARCO_MAX_TOKENS = 1024;

/**
 * Upper bound on Marco's agent loop iterations (one iteration = one
 * messages.create round-trip). With U7 Maya + Dino + U3 produce_deck the
 * natural call count is
 *   read_run(1) + 6×(dispatch+maya+dino+update)(24) + transition(1)
 *     + produce_deck(1) + complete_task(1) ≈ 28 turns;
 * 50 gives ~78% headroom for retries and non-tool turns.
 */
export const MARCO_MAX_TOOL_DEPTH = 50;

// ── Maya cross-app verification (Unit 7) ────────────────────────────────────

/** Anthropic model used by Maya (cross-app holistic content judge). Opus tier: judgment-intensive. */
export const MAYA_MODEL = "claude-opus-4-7";
/** max_tokens for Maya per-slide verdict call */
export const MAYA_MAX_TOKENS = 1024;
/** Max characters of serialised payloadV2 sent to Maya (truncated for token budget) */
export const MAYA_PAYLOAD_TRUNCATE_CHARS = 4000;
/** Max characters of serialised slotDrafts sent to Maya (truncated for token budget) */
export const MAYA_DRAFTS_TRUNCATE_CHARS = 2000;

// ── Dino pixel-diff agent (Unit 7) ──────────────────────────────────────────

/** RGB channel count in a raw RGBA buffer (always 4: R, G, B, A) */
export const DINO_RGBA_CHANNELS = 4;
/** Playwright poll interval while waiting for __deckReady (ms) */
export const DINO_POLL_INTERVAL_MS = 500;

/** Maximum pixel-diff percentage before Dino flags a slide as visually divergent */
export const DINO_PIXEL_DIFF_THRESHOLD_PCT = 5;
/** Viewport width for Dino single-slide screenshots (matches canonical slide dimensions) */
export const DINO_VIEWPORT_WIDTH = 960;
/** Viewport height for Dino single-slide screenshots */
export const DINO_VIEWPORT_HEIGHT = 540;
/** Per-channel RGB delta above which a pixel is counted as "different" (0–255) */
export const DINO_CHANNEL_DIFF_TOLERANCE = 10;
/** Local reverse-proxy port used to render the LB deck via Playwright */
export const SLIDE_INTERNAL_PROXY_PORT = 80;

// ── Swarm team constants (Units 5–6) ────────────────────────────────────────

/**
 * Anthropic model used by all swarm team Builders (Sofia-02, Bianca-02, etc.).
 * Sonnet is cost-appropriate for constraint-fitting / slot-assembly tasks;
 * escalate to Opus for slides with high visual-judgment demands (§12).
 */
export const SWARM_BUILDER_MODEL = "claude-sonnet-4-6";

/** max_tokens per swarm Builder call. */
export const SWARM_BUILDER_MAX_TOKENS = 2048;

/**
 * max_tokens per swarm Inspector Pass 2 (LLM-vision) call. Shared across all
 * six Inspector roles; Inspector Pass 2 uses LORENZO_VISION_MODEL (Opus 4.7).
 */
export const SWARM_INSPECTOR_MAX_TOKENS = 1024;

/**
 * Number of projection years used by Felix-01 (Aggregator) for the slide-6
 * USALI income-statement aggregate. Fixed at 10 per the canonical deck spec.
 */
export const FELIX_PROJECTION_YEARS = 10;
