/**
 * server/constants.ts — Named constants for server infrastructure configuration.
 *
 * Centralizes timeouts, intervals, pool sizes, and thresholds that were previously
 * scattered as magic numbers across server files. Financial constants live in
 * shared/constants.ts; this file covers operational/infrastructure values only.
 */

// ---------------------------------------------------------------------------
// External API timeouts
// ---------------------------------------------------------------------------

/** Timeout for FRED, Frankfurter, and web search API calls (ms) */
export const EXTERNAL_API_TIMEOUT_MS = 8000;

/** Timeout for AI generation calls (Anthropic, Gemini, OpenAI) (ms) */
export const AI_GENERATION_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Database connection pool
// ---------------------------------------------------------------------------

export const DB_POOL_MAX_CONNECTIONS = 8;
export const DB_POOL_MIN_CONNECTIONS = 1;
export const DB_IDLE_TIMEOUT_MS = 30_000;
export const DB_CONNECTION_TIMEOUT_MS = 15_000;
export const DB_CONNECTION_MAX_USES = 7500;
export const DB_POOL_ALLOW_EXIT_ON_IDLE = true;

// ---------------------------------------------------------------------------
// Background task intervals
// ---------------------------------------------------------------------------

/** Market rate + FRED data refresh interval (ms) — 5 minutes */
export const MARKET_RATE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Expired session + rate-limit cleanup interval (ms) — 1 hour */
export const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Market intelligence property cache invalidation interval (ms) — 24 hours */
export const MI_CACHE_INVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Vector benchmark latency alert check interval (ms) — 1 hour */
export const VECTOR_LATENCY_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Constants-refresh-failure digest evaluator tick (ms) — every 6 hours.
 *  The evaluator dedupes by UTC day so frequent ticks are safe. */
export const CONSTANTS_REFRESH_DIGEST_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Perennial-recommendations digest evaluator tick (ms) — every 6 hours.
 *  The evaluator dedupes by UTC day so frequent ticks are safe. */
export const PERENNIAL_RECOMMENDATIONS_DIGEST_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Max rows pulled from storage for the perennial-recommendations digest. */
export const PERENNIAL_RECOMMENDATIONS_DIGEST_LIMIT = 100;

/** Min appearances threshold the digest narrative quotes back to admins.
 *  Storage filters at this same threshold (see specialist-config). */
export const PERENNIAL_RECOMMENDATIONS_MIN_APPEARANCES = 3;

// ---------------------------------------------------------------------------
// HTTP / compression / caching
// ---------------------------------------------------------------------------

/** HTTP 200 OK — standard success response */
export const HTTP_200_OK = 200;

/** HTTP 201 Created — resource was successfully created */
export const HTTP_201_CREATED = 201;

/** HTTP 202 Accepted — request accepted for async processing; client should poll */
export const HTTP_202_ACCEPTED = 202;

/** HTTP 204 No Content — success with no response body */
export const HTTP_204_NO_CONTENT = 204;

/** HTTP 400 Bad Request — the request was malformed or invalid */
export const HTTP_400_BAD_REQUEST = 400;

/** HTTP 401 Unauthorized — authentication is required */
export const HTTP_401_UNAUTHORIZED = 401;

/** HTTP 403 Forbidden — authenticated but not permitted */
export const HTTP_403_FORBIDDEN = 403;

/** HTTP 404 Not Found — the requested resource does not exist */
export const HTTP_404_NOT_FOUND = 404;

/** HTTP 405 Method Not Allowed — the HTTP method is not supported for this route */
export const HTTP_405_METHOD_NOT_ALLOWED = 405;

/** HTTP 409 Conflict — the request conflicts with the current state of the resource */
export const HTTP_409_CONFLICT = 409;

/** HTTP 413 Payload Too Large — the request body exceeds the allowed size */
export const HTTP_413_PAYLOAD_TOO_LARGE = 413;

/** HTTP 422 Unprocessable Entity — request was well-formed but all items in the operation failed */
export const HTTP_422_UNPROCESSABLE_ENTITY = 422;

/** HTTP 429 Too Many Requests — rate limit exceeded */
export const HTTP_429_TOO_MANY_REQUESTS = 429;

/** HTTP 500 Internal Server Error — an unexpected server-side error occurred */
export const HTTP_500_INTERNAL_SERVER_ERROR = 500;

/** HTTP 502 Bad Gateway — upstream service returned an invalid response */
export const HTTP_502_BAD_GATEWAY = 502;

/** HTTP 503 Service Unavailable — the service is temporarily unavailable */
export const HTTP_503_SERVICE_UNAVAILABLE = 503;

/** HTTP 504 Gateway Timeout — upstream service did not respond in time */
export const HTTP_504_GATEWAY_TIMEOUT = 504;

/** Minimum response size to trigger gzip compression (bytes) */
export const COMPRESSION_THRESHOLD_BYTES = 1024;

/** Cache-Control max-age for stable GET endpoints (seconds) */
export const CACHE_MAX_AGE_SECONDS = 300;

/** Cache-Control stale-while-revalidate for stable GET endpoints (seconds) */
export const CACHE_STALE_REVALIDATE_SECONDS = 600;

/** HSTS max-age header value (seconds) — 1 year */
export const HSTS_MAX_AGE_SECONDS = 31536000;

/** PostgreSQL error code for unique constraint violation (duplicate key). */
export const PG_UNIQUE_VIOLATION_CODE = "23505";

/** Standard VARCHAR max length for short user-supplied strings (name, email, filename). */
export const VARCHAR_SHORT_MAX = 255;

// ---------------------------------------------------------------------------
// Circuit breaker / retry defaults
// ---------------------------------------------------------------------------

export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
export const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
export const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 200;
export const RETRY_MAX_DELAY_MS = 5_000;

// ---------------------------------------------------------------------------
// Internal LB-deck payload rate limit (token-gated Playwright fetch)
// ---------------------------------------------------------------------------

/** Max token-gated /api/internal/lb-deck-payload requests per IP per window. Playwright renders make 1 fetch per PDF; wide headroom. */
export const LB_DECK_PAYLOAD_RATE_LIMIT_MAX_REQ = 60;
/** Rate-limit window (ms) — 1 minute. */
export const LB_DECK_PAYLOAD_RATE_LIMIT_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Knowledge base / RAG
// ---------------------------------------------------------------------------

/** Minimum paragraph length to include in RAG chunks (chars) */
export const KB_MIN_PARAGRAPH_LENGTH = 20;

/** Maximum title length for knowledge base entries (chars) */
export const KB_MAX_TITLE_LENGTH = 80;

/** Maximum text length sent to embedding model per input (chars) */
export const KB_EMBEDDING_MAX_LENGTH = 8000;

/** Estimated words per chunk unit for overlap calculation */
export const KB_WORDS_PER_CHUNK_ESTIMATE = 5;

/** Embedding batch size for OpenAI API calls */
export const KB_EMBEDDING_BATCH_SIZE = 20;

// ---------------------------------------------------------------------------
// Route-level limits
// ---------------------------------------------------------------------------

/** Maximum HTML size for HTML-based endpoints (bytes) */
export const MAX_HTML_SIZE = 5 * 1024 * 1024;

/** Maximum document upload size for document extraction (bytes) */
export const MAX_DOC_SIZE = 20 * 1024 * 1024;

/** Maximum chat message length (chars) */
export const MAX_MESSAGE_LENGTH = 2000;

/** Maximum chat history messages sent to LLM */
export const MAX_HISTORY_LENGTH = 20;

/** Maximum scenarios a user may create */
export const MAX_SCENARIOS_PER_USER = 20;

/** Soft-delete purge interval — 1 hour */
export const SCENARIO_PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Soft-delete retention — 30 days (ms) */
export const SCENARIO_PURGE_DAYS = 30;

/** Maximum image upload size (bytes) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Maximum SMS body length before segmenting (chars) */
export const MAX_SMS_LENGTH = 1600;

/** Maximum RAG context chars injected into prompts */
export const MAX_RAG_CONTEXT_CHARS = 4000;

/** Minimum cosine-similarity score for RAG chunk inclusion */
export const KB_MIN_CONFIDENCE = 0.50;

// ---------------------------------------------------------------------------
// Chart / PDF rendering
// ---------------------------------------------------------------------------

/**
 * Vertical headroom multiplier for SVG bar-chart Y-axis.
 * The chart's global max value is scaled up by this factor so the tallest
 * bar never touches the top edge of the chart area.
 * Also used as the reciprocal (1 / CHART_HEADROOM_FACTOR) when converting
 * a Y-pixel back to a data value for axis label placement.
 */
export const CHART_HEADROOM_FACTOR = 1.08;

/**
 * Compact line-height ratio used for dense text blocks in PDF layouts
 * (e.g. cover-company headings). Tighter than normal prose (1.4–1.6) to
 * keep multi-line headings visually compact on a fixed-height cover page.
 */
export const PDF_COMPACT_LINE_HEIGHT = 1.08;

/**
 * SVG chart height used when the PDF page is landscape-oriented (px).
 * Portrait charts use a taller 300 px height (set at the call site).
 * Also used as the default fallback height for standalone SVG chart renders
 * where no explicit height is provided.
 */
export const CHART_SVG_LANDSCAPE_HEIGHT_PX = 260;

/**
 * Label column width for portrait-orientation PDF tables and chart legends (px).
 * The landscape equivalent is `PDF_LANDSCAPE_LABEL_WIDTH_PX` (140 px).
 */
export const PDF_PORTRAIT_LABEL_WIDTH_PX = 110;

/**
 * Maximum pagination offset allowed on admin activity-log query endpoints.
 * Guards against unreasonably deep scans of the activity_log table.
 */
export const MAX_ADMIN_QUERY_OFFSET = 50000;

/**
 * Maximum character length for the prompt field on the AI optimize-prompt endpoint.
 * Prevents oversized payloads from reaching the LLM.
 */
export const MAX_AI_PROMPT_INPUT_CHARS = 50000;

// ---------------------------------------------------------------------------
// AI generation limits
// ---------------------------------------------------------------------------

/** Max tokens for regenerate-constants LLM calls */
export const AI_REGEN_CONSTANTS_MAX_TOKENS = 1024;

/** Max tokens per executive-summary section */
export const AI_EXEC_SUMMARY_SECTION_MAX_TOKENS = 1200;

/** Max tokens for full executive-summary generation */
export const AI_EXEC_SUMMARY_FULL_MAX_TOKENS = 1500;

/**
 * Fallback submarket inventory estimate (keys) used in market-signal calculations
 * when neither subject room count nor pipeline project data is available.
 */
export const MARKET_SIGNAL_SQFT_FALLBACK = 1500;

/**
 * Default operating reserve (USD) used in the seed acquisition package template.
 * Represents a typical pre-opening cash cushion for a standard boutique property.
 */
export const SEED_OPERATING_RESERVE_USD = 250000;

/**
 * Starting annual partner compensation (USD) used in the seed company model
 * (years 4–5 of the 10-year projection).
 */
export const SEED_PARTNER_COMP_PHASE1_USD = 600000;

/**
 * Peak annual partner compensation (USD) used in the seed company model
 * (year 10 of the 10-year projection).
 */
export const SEED_PARTNER_COMP_FINAL_USD = 900000;

/**
 * Vertical offset (inches) from the bottom of a PowerPoint slide to the
 * confidentiality footer text row.
 */
export const PPTX_FOOTER_Y_OFFSET_IN = 0.32;

/** Max tokens for ambient background research scheduler */
export const AI_AMBIENT_RESEARCH_MAX_TOKENS = 6144;

/** Max tokens for a single slot draft call in the deck-payload authoring flow */
export const AI_DECK_SLOT_DRAFT_MAX_TOKENS = 600;

/** Max tokens for a batch group draft call (vision/operational/investment/transformation) */
export const AI_DECK_GROUP_DRAFT_MAX_TOKENS = 1400;

// ─── Benchmark defaults (orchestrator adapter baselines) ─────────────────────

/**
 * Benchmark average F&B cost-rate used in the hotel risk model
 * (Operator Benchmarks — illustrative mid-tier, US/EUR markets).
 */
export const BENCHMARK_FB_COST_RATE = 0.32;

/**
 * Low-tier sales-commission-rate benchmark for boutique hotel properties.
 * Used as the representative low value in the property-defaults
 * benchmark array (Kalibri Labs / STR illustrative data).
 */
export const BENCHMARK_SALES_COMMISSION_RATE_LOW = 0.055;

/**
 * Mid-point CPI benchmark for Emerging Market economies (IMF WEO 2024).
 * Applied as the representative "mid" value in the risk-orchestrator
 * inflation comparables array.
 */
export const BENCHMARK_INFLATION_RATE_EM_MID = 0.055;

/**
 * Mid-tier benchmark corporate tax rate applied to companies in markets
 * such as UK/Canada within the mgmt-co company model.
 */
export const BENCHMARK_COMPANY_TAX_RATE_MID = 0.24;

/**
 * Standard F&B share fraction (as a decimal) used as the representative
 * baseline entry in the revenue-orchestrator benchmark array.
 */
export const BENCHMARK_FB_SHARE_FRACTION_STD = 0.24;

// ─── PDF report layout ────────────────────────────────────────────────────────

/**
 * Column label width (px) in landscape-mode PDF tables where the full
 * landscape page width is distributed across label + data columns.
 */
export const PDF_LANDSCAPE_LABEL_WIDTH_PX = 140;

/**
 * RGB component value (0-255) used for secondary/muted gray text in
 * PDF reports (i.e. `setTextColor(PDF_REPORT_GRAY_RGB, PDF_REPORT_GRAY_RGB, PDF_REPORT_GRAY_RGB)`).
 */
export const PDF_REPORT_GRAY_RGB = 140;

/** Max tokens for ICP research generation */
export const AI_ICP_RESEARCH_MAX_TOKENS = 12000;

// ─── Live-comparables: OTA commission and booking-mix calibration (NAI-35) ──
//
// Booking.com and Airbnb commission rates are publicly documented in their
// partner programmes. The OTA booking-mix fractions reflect typical boutique-
// luxury hotel distribution splits (AHLA Distribution Cost Study 2024).

/** Booking.com host-side commission on confirmed reservations. Standard bracket 15–25% of room revenue; median used. Source: Booking.com Partner Hub 2024. */
export const LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION  = 0.20;

/** Airbnb host-side service fee as fraction of booking subtotal. Source: Airbnb Help Center "Understanding Airbnb fees" 2024 (3% standard host fee). */
export const LIVE_OTA_COMMISSION_AIRBNB_HOST_FRACTION  = 0.03;

/** OTA booking-mix fraction for OTA-heavy urban boutique hotels (~45% of bookings via OTA channels). Source: AHLA Distribution Cost Study 2024. */
export const LIVE_OTA_MIX_HEAVY_FRACTION               = 0.45;

/** OTA booking-mix fraction for standard boutique hotels (~30% of bookings via OTA channels). Source: AHLA Distribution Cost Study 2024. */
export const LIVE_OTA_MIX_STANDARD_FRACTION            = 0.30;

/** OTA booking-mix fraction for direct-booking-optimised boutique hotels (~15% via OTA; strong direct-channel + loyalty programme). Source: AHLA 2024. */
export const LIVE_OTA_MIX_LIGHT_FRACTION               = 0.15;

/** Minimum live PropertyDefaults rows required before falling back to canned dataset. */
export const LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS      = 2;

/** Minimum live Revenue comparable rows required before falling back to canned dataset. */
export const LIVE_MIN_REVENUE_LIVE_ROWS                = 1;

/** Minimum live Overhead comparable rows required before falling back to canned dataset. */
export const LIVE_MIN_OVERHEAD_LIVE_ROWS               = 1;

/** Minimum live Portfolio Raise comparable rows required before falling back to canned dataset. */
export const LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS        = 2;

/** Representative boutique hotel room count used for Booking.com live comp rows (room count is not exposed by the search API). */
export const LIVE_BOOKING_REPRESENTATIVE_ROOM_COUNT    = 40;

/** ADR threshold (USD/night): hotels below this rate are assumed OTA-heavy (price-sensitive guests skew toward OTA channels). */
export const LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD     = 200;

/** Days from today to hotel check-in when sampling live Booking.com rates (2-week lead). */
export const LIVE_BOOKING_CHECKIN_LEAD_DAYS            = 14;

/** Days from today to hotel check-out when sampling live Booking.com rates (3-night stay: check-out = check-in + 3). */
export const LIVE_BOOKING_CHECKOUT_LEAD_DAYS           = 17;

/** Maximum Booking.com hotel results to retain per city for comp-row derivation. */
export const LIVE_BOOKING_MAX_HOTELS_PER_CITY          = 8;

/** CNBC autocomplete API fetch limit (how many raw items to request). */
export const LIVE_CNBC_FETCH_LIMIT                     = 10;

/** CNBC headline slice — number of headlines to retain from the raw fetch. */
export const LIVE_CNBC_HEADLINE_SLICE                  = 5;

/** Maximum number of slide factory runs returned in a list query (newest first). */
export const SLIDE_FACTORY_RUNS_LIST_LIMIT             = 20;

/** Maximum unapproved-slot keys returned in a Rebecca trigger-build error. */
export const SLIDE_FACTORY_UNAPPROVED_SLOTS_PREVIEW    = 10;

/** Max tokens for a slot suggest call (short copywriting improvement; must fit in one response). */
export const AI_SLOT_SUGGEST_MAX_TOKENS = 400;

/** Temperature for slot suggest calls — deterministic-leaning for consistent copywriting output. */
export const AI_SLOT_SUGGEST_TEMPERATURE = 0.4;
