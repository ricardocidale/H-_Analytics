/**
 * minion-self-test-constants.ts — Scheduler operational constants for the
 * minion self-test loop (Task #1397).
 *
 * These are job-layer operational constants (scheduler key, cadence default,
 * clamp bounds, admin_resources parameter slug, costantino_findings target
 * kind). They live here — not in `lib/shared/src/constants.ts` — because:
 *
 *   1. CLAUDE.md §9 ("Financial Engine Authoring Authority") protects
 *      `lib/shared/src/constants*.ts` as part of the financial-engine surface.
 *      Minion-scheduler operational tunables don't belong there.
 *
 *   2. Cohesion: these constants are only consumed by the scheduler, its
 *      run-tracker, and the agent-roster admin route. Co-locating them with
 *      the scheduler makes the contract easier to find.
 *
 * Cadence is admin-tunable at runtime via the `minion-self-test-cycle-interval-ms`
 * admin_resources parameter row; these compile-time values are the conservative
 * fallback + clamp bounds.
 */

// ──────────────────────────────────────────────────────────
// Minion self-test scheduler (Task #1397).
// Periodic background loop that runs every entry in
// MINION_SELF_TESTS, opens a costantino_findings row when one
// fails, and resolves the open finding when it passes again.
// ──────────────────────────────────────────────────────────

/** Scheduler key registered in SCHEDULER_REGISTRY. */
export const MINION_SELF_TEST_SCHEDULER_KEY = "minion-self-tests";

/** admin_resources parameter row holding the runtime-editable cadence. */
export const MINION_SELF_TEST_CADENCE_PARAM_SLUG = "minion-self-test-cycle-interval-ms";

/** Default cycle interval — 30 days (Task #1403 unified cadence). Used when the parameter row is absent or malformed. */
// DB: minion-self-test-cycle-interval-ms — admin_resources parameter row holds the live value
export const DEFAULT_MINION_SELF_TEST_CYCLE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** Lower clamp on the cadence — 60 s. Protects against runaway scheduling. */
// DB: fixed lower bound — architectural safety clamp, not admin-configurable
export const DEFAULT_MINION_SELF_TEST_MIN_CYCLE_INTERVAL_MS = 60 * 1000;

/** Upper clamp on the cadence — matches the default 30-day cycle so the default is reachable. */
// DB: fixed upper bound — architectural safety clamp, not admin-configurable
export const DEFAULT_MINION_SELF_TEST_MAX_CYCLE_INTERVAL_MS = DEFAULT_MINION_SELF_TEST_CYCLE_INTERVAL_MS;

/** target_kind value used on costantino_findings rows opened by the minion self-test scheduler. */
export const MINION_FINDING_TARGET_KIND = "minion";
