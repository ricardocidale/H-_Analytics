/**
 * factory-v2-constants.ts — Slide-factory v2 operational constants.
 *
 * These are slide-factory-local OPERATIONAL constants (subprocess timeouts,
 * retry budgets, R2 key prefixes, MIME types). They live here — not in
 * `lib/shared/src/constants.ts` — because:
 *
 *   1. CLAUDE.md §9 ("Financial Engine Authoring Authority") protects
 *      `lib/shared/src/constants*.ts` as part of the financial-engine surface.
 *      Slide-factory operational tunables don't belong there.
 *
 *   2. CLAUDE.md "Slide Deck Factory rule" — `artifacts/api-server/src/slides/`
 *      is a pure consumer of financial assumptions (via
 *      `storage.getGlobalAssumptions()`) but is the natural home for its own
 *      operational tunables.
 *
 * All cadence/timeout values are admin-overridable at runtime via the
 * admin_resources parameter row 'factory-v2-soffice-timeout-ms'. These
 * compile-time defaults are the conservative fallback used when the row is
 * missing or malformed. The production value will be tuned in U8 once
 * real-deck conversion times have been measured.
 */

// ──────────────────────────────────────────────────────────
// FACTORY V2 — `soffice` PPTX → PDF SUBPROCESS CONSTANTS (U7)
// ──────────────────────────────────────────────────────────

/** admin_resources parameter row holding the runtime-editable soffice timeout. */
export const FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG = "factory-v2-soffice-timeout-ms";

/**
 * Default per-attempt soffice conversion timeout — 180 s.
 *
 * Rationale (U7, conservative pending U8 measurement):
 *   - The U2 smoke test uses 60 s for a synthetic 1-slide deck.
 *   - A Factory v2 deck has 6 canonical slides + optional wish-list slide and
 *     a high-DPI rendered slide-6 income-statement image embed.
 *   - First-time-after-boot conversions on a cold LibreOffice profile
 *     consistently take 2–3× the warm-cache time.
 *   - 180 s gives 3× headroom over the smoke-test budget; large enough to
 *     hide cold-start jitter, small enough that a hung soffice is killed
 *     before the deploy healthcheck windows tighten.
 *
 * Tuned in U8 once production timing data is available. Operators can
 * shorten/lengthen via the `factory-v2-soffice-timeout-ms` admin_resources
 * parameter row without a code deploy.
 */
// DB: factory-v2-soffice-timeout-ms — admin_resources parameter row holds the live value
export const DEFAULT_FACTORY_V2_SOFFICE_TIMEOUT_MS = 180 * 1000;

/** Lower clamp on the soffice timeout — 10 s. Protects against accidentally-too-low admin overrides. */
// DB: fixed lower bound — architectural safety clamp, not admin-configurable
export const FACTORY_V2_SOFFICE_TIMEOUT_MIN_MS = 10 * 1000;

/** Upper clamp on the soffice timeout — 15 min. Protects against runaway subprocess hold. */
// DB: fixed upper bound — architectural safety clamp, not admin-configurable
export const FACTORY_V2_SOFFICE_TIMEOUT_MAX_MS = 15 * 60 * 1000;

/**
 * Grace period between SIGTERM and SIGKILL when killing a hung soffice
 * subprocess — 5 s. soffice's signal handler runs document-recovery sweeps
 * (lock-file cleanup, profile flush) on SIGTERM that we want to finish
 * before escalating. 5 s is the LibreOffice mailing-list-recommended value.
 */
export const FACTORY_V2_SOFFICE_KILL_GRACE_MS = 5 * 1000;

/**
 * Retry budget for a single soffice conversion request. One additional
 * attempt after the first failure (total = 2 attempts). Per the U7 plan:
 * "Retry once on exit code 1 with fresh tmp dir." We extend the retry
 * trigger to include timeouts (transient resource pressure) per advisor
 * guidance; clean exit-0-with-bogus-PDF is NOT retried.
 */
export const FACTORY_V2_SOFFICE_MAX_ATTEMPTS = 2;

/**
 * Maximum number of stderr characters preserved on a SofficeConvertError
 * for upstream telemetry. soffice can emit lengthy font-init traces; we
 * keep the tail so the operator sees the most recent (and usually most
 * useful) lines without flooding the run record.
 */
export const FACTORY_V2_SOFFICE_STDERR_TAIL_CHARS = 2000;

/**
 * Bound on the per-stream stdio buffer accumulated while soffice runs.
 * A soffice instance in a font-init crash loop can emit MB of warnings
 * before `close` fires; bounding the accumulator at append time prevents
 * RSS balloon. 64 KiB gives plenty of headroom over the stderr tail we
 * actually surface in error reports — newer data wins via tail-trim.
 */
export const FACTORY_V2_SOFFICE_STREAM_BUFFER_MAX_BYTES = 64 * 1024;

/** R2 key prefix for Factory v2 deck artifacts (per-run). */
export const FACTORY_V2_DECK_R2_KEY_PREFIX = "factory-v2/runs";

/** MIME type for PPTX uploads — used on R2 metadata + download responses. */
export const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
