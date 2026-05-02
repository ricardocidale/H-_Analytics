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
// AI generation limits
// ---------------------------------------------------------------------------

/** Max tokens for regenerate-constants LLM calls */
export const AI_REGEN_CONSTANTS_MAX_TOKENS = 1024;

/** Max tokens per executive-summary section */
export const AI_EXEC_SUMMARY_SECTION_MAX_TOKENS = 1200;

/** Max tokens for full executive-summary generation */
export const AI_EXEC_SUMMARY_FULL_MAX_TOKENS = 1500;

/** Max tokens for ambient background research scheduler */
export const AI_AMBIENT_RESEARCH_MAX_TOKENS = 6144;

/** Max tokens for ICP research generation */
export const AI_ICP_RESEARCH_MAX_TOKENS = 12000;
