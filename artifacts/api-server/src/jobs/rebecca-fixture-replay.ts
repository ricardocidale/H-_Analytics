/**
 * Scheduled Rebecca preview-fixture replayer (Task #559).
 *
 * Admins save (settings + transcript) snapshots in the Test Chat fixtures
 * panel and can manually replay them by walking each user turn through
 * /api/chat. That manual flow is great for an admin sanity-check after
 * editing settings, but nobody hits the button on a schedule, so a
 * regression that lands at 2am sits unflagged until someone notices.
 *
 * This job replays every fixture once per day through the server-side
 * runner (`server/ai/rebecca-preview-runner.ts`), classifies each turn
 * as pass / differ / no-baseline / error against the fixture's saved
 * assistant turns, and writes a rolled-up summary to
 * `rebecca_preview_fixtures.last_replay_*` so the admin panel can
 * render a per-fixture badge without re-running the replay.
 *
 * The replay deliberately runs against the LIVE production Rebecca
 * config (system actor's `globalAssumptions.rebeccaConfig`), NOT the
 * settings snapshot saved on the fixture row. That is the entire
 * point: fixtures are pinned baselines that must survive intact when
 * an admin tweaks a slider in `RebeccaConfig.tsx`. Using the fixture
 * snapshot would always pass and never catch the regression we built
 * this for. See server/ai/rebecca-preview-runner.ts file header for
 * the full rationale.
 *
 * Drift suppression (mirrors the per-Specialist band-drop pattern in
 * `server/jobs/specialist-quality-recompute.ts`, but with a durability
 * upgrade so it survives process restarts):
 *   - The "drift fingerprint" is a stable hash of the per-turn status
 *     shape (`idx:status` joined). Same fingerprint two cycles in a
 *     row → no email, the drift event hasn't changed.
 *   - A passing cycle (status='pass') CLEARS the fingerprint so the
 *     next genuine drift event re-notifies admins instead of being
 *     silently suppressed by a stale match.
 *   - Both passing fixtures and drifted fixtures have their
 *     `last_replay_fingerprint` column overwritten every cycle (with
 *     `null` on a pass). The suppression check first looks at the
 *     in-memory `lastNotifiedFingerprintByFixture` map (fast path,
 *     same-process repeats) and then falls back to the fixture row's
 *     `lastReplayFingerprint` column (slow path, post-restart) so a
 *     server restart does not re-spam admins with an already-notified
 *     drift event. Specialist-quality-recompute predates this pattern
 *     and would benefit from the same fix in a follow-up.
 *
 * Per-fixture try/catch: a failure on one fixture is logged and the
 * cycle continues across the rest. The fixture's row is updated with
 * `lastReplayStatus='errored'` and the error message goes into the
 * per-turn entries the UI displays.
 *
 * Concurrency-guard + kill-switch + recordSchedulerCycle pattern is
 * the same one specialist-quality-recompute follows, intentionally
 * duplicated rather than abstracted because each scheduler's failure
 * surface is slightly different.
 */
import { storage } from "../storage";
import { logger, log as serverLog } from "../logger";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import { runFixtureReplayTurn, type FixtureReplayHistoryTurn } from "../ai/rebecca-preview-runner";
import { notifyAdminsOfFixtureDrift } from "../notifications/rebecca-fixture-drift";
import { db } from "../db";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";
import type {
  RebeccaFixtureReplaySummary,
  RebeccaFixtureReplayTurn,
  RebeccaFixtureReplayTurnStatus,
} from "@workspace/db";
import crypto from "crypto";

const SOURCE = "rebecca-fixture-replay-scheduler";
const SNIPPET_LIMIT = 400;

let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
// Per-fixture suppression: fixtureId → last drift fingerprint we emailed
// admins about. A repeat of the same fingerprint is suppressed; a fresh
// drift shape (different per-turn statuses) overrides it and re-notifies.
const lastNotifiedFingerprintByFixture = new Map<number, string>();

function clipSnippet(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s);
  return t.length <= SNIPPET_LIMIT ? t : t.slice(0, SNIPPET_LIMIT) + "…";
}

function normalizeForCompare(s: string): string {
  return s.trim();
}

/**
 * Stable hash of the per-turn status shape. Two cycles with identical
 * `[index:status, …]` lists produce the same fingerprint regardless of
 * the actual response text — drift = "this fixture is failing in this
 * shape", and we only re-email when the shape changes. Errored fixtures
 * include the error message in the fingerprint so a different upstream
 * failure (e.g. a fresh provider outage) re-notifies even when the
 * top-line status stays "errored".
 */
function fingerprintForSummary(summary: RebeccaFixtureReplaySummary): string {
  const parts: string[] = [];
  for (const t of summary.perTurn) {
    if (t.status === "error") {
      parts.push(`${t.index}:error:${t.error ?? ""}`);
    } else {
      parts.push(`${t.index}:${t.status}`);
    }
  }
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

let cachedSystemActorId: number | null | undefined;
async function resolveSystemActorId(): Promise<number | null> {
  if (cachedSystemActorId !== undefined) return cachedSystemActorId;
  try {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "super_admin"))
      .orderBy(users.id)
      .limit(1);
    cachedSystemActorId = row?.id ?? null;
  } catch {
    cachedSystemActorId = null;
  }
  return cachedSystemActorId;
}

/** Test seam — clear cached actor between tests. */
export function __resetFixtureReplayStateForTest(): void {
  lastNotifiedFingerprintByFixture.clear();
  isRunning = false;
  cachedSystemActorId = undefined;
}

interface PerFixtureOutcome {
  fixtureId: number;
  fixtureName: string;
  status: "pass" | "drifted" | "errored";
  summary: RebeccaFixtureReplaySummary;
  fingerprint: string | null;
}

export interface FixtureReplayCycleSummary {
  considered: number;
  passed: number;
  drifted: number;
  errored: number;
  notified: number;
  suppressed: number;
  errors: { fixtureId: number; fixtureName: string; message: string }[];
}

async function replayFixture(
  fixture: { id: number; name: string; turns: Array<{ role: "user" | "assistant"; content: string; ts?: number }> },
  systemActorId: number | null,
): Promise<PerFixtureOutcome> {
  const startedAt = Date.now();
  const perTurn: RebeccaFixtureReplayTurn[] = [];
  const history: FixtureReplayHistoryTurn[] = [];

  // Walk the saved transcript turn-by-turn. For each user turn we send
  // through the runner with the prior reconstructed history (built from
  // OUR replay's responses, not the saved baseline) so a drifted earlier
  // turn cascades into the next prompt — same shape as the manual
  // client-side replay.
  let turnIndex = -1;
  for (let i = 0; i < fixture.turns.length; i += 1) {
    const turn = fixture.turns[i];
    if (turn.role !== "user") continue;
    turnIndex += 1;

    const expectedNext = fixture.turns[i + 1];
    const expected = expectedNext && expectedNext.role === "assistant" ? expectedNext.content : null;

    let status: RebeccaFixtureReplayTurnStatus;
    let actual: string | null = null;
    let errorMessage: string | undefined;

    try {
      const result = await runFixtureReplayTurn({
        history: [...history],
        message: turn.content,
        systemActorId,
      });
      actual = result.response;
      if (expected == null) {
        status = "no-baseline";
      } else if (normalizeForCompare(actual) === normalizeForCompare(expected)) {
        status = "pass";
      } else {
        status = "differ";
      }
      // Push the actual response into the running history so the next
      // user turn gets a faithful conversation context.
      history.push({ role: "user", content: turn.content });
      history.push({ role: "assistant", content: actual });
    } catch (err: unknown) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      // Stop the cascade — once a turn errored we cannot replay
      // subsequent turns meaningfully (they would all error against
      // a missing prior assistant turn). Mark remaining user turns as
      // 'error' with a "skipped after upstream failure" note.
      perTurn.push({
        index: turnIndex,
        status,
        prompt: clipSnippet(turn.content) ?? "",
        expectedSnippet: clipSnippet(expected),
        actualSnippet: null,
        error: errorMessage,
      });
      for (let j = i + 2; j < fixture.turns.length; j += 1) {
        const t = fixture.turns[j];
        if (t.role !== "user") continue;
        turnIndex += 1;
        const exp = fixture.turns[j + 1];
        perTurn.push({
          index: turnIndex,
          status: "error",
          prompt: clipSnippet(t.content) ?? "",
          expectedSnippet: clipSnippet(exp && exp.role === "assistant" ? exp.content : null),
          actualSnippet: null,
          error: "Skipped after upstream replay failure",
        });
      }
      break;
    }

    perTurn.push({
      index: turnIndex,
      status,
      prompt: clipSnippet(turn.content) ?? "",
      expectedSnippet: clipSnippet(expected),
      actualSnippet: clipSnippet(actual),
      error: errorMessage,
    });
  }

  const matched = perTurn.filter((t) => t.status === "pass").length;
  const differed = perTurn.filter((t) => t.status === "differ").length;
  const noBaseline = perTurn.filter((t) => t.status === "no-baseline").length;
  const errored = perTurn.filter((t) => t.status === "error").length;
  const summary: RebeccaFixtureReplaySummary = {
    totalTurns: perTurn.length,
    matched,
    differed,
    noBaseline,
    errored,
    durationMs: Date.now() - startedAt,
    perTurn,
  };

  // A fixture with zero user turns can't drift (nothing to replay) — we
  // still record a "pass" so the panel shows it was visited.
  let status: "pass" | "drifted" | "errored";
  if (errored > 0) status = "errored";
  else if (differed > 0) status = "drifted";
  else status = "pass";

  return {
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    status,
    summary,
    fingerprint: status === "pass" ? null : fingerprintForSummary(summary),
  };
}

export async function runRebeccaFixtureReplayCycle(): Promise<FixtureReplayCycleSummary> {
  const summary: FixtureReplayCycleSummary = {
    considered: 0,
    passed: 0,
    drifted: 0,
    errored: 0,
    notified: 0,
    suppressed: 0,
    errors: [],
  };
  if (isRunning) {
    serverLog("Cycle already in progress — skipping", SOURCE, "warn");
    return summary;
  }
  isRunning = true;
  const cycleStart = Date.now();
  let cycleThrew = false;
  let cycleErrorMessage: string | null = null;

  try {
    const systemActorId = await resolveSystemActorId();
    const fixtures = await storage.listRebeccaPreviewFixtures();
    const disabled =
      (await storage.getNotificationSetting("rebecca_fixture_drift_disabled")) === "true";

    for (const fx of fixtures) {
      summary.considered += 1;
      // Hydrate the in-memory suppression map from the fixture row's
      // persisted fingerprint on first encounter, so a process restart
      // does not lose the "we already emailed admins about this" state.
      // Once the in-memory entry exists it wins (same-process behavior
      // is unchanged from the specialist-quality-recompute precedent).
      if (!lastNotifiedFingerprintByFixture.has(fx.id) && fx.lastReplayFingerprint) {
        lastNotifiedFingerprintByFixture.set(fx.id, fx.lastReplayFingerprint);
      }
      let outcome: PerFixtureOutcome;
      try {
        outcome = await replayFixture(
          {
            id: fx.id,
            name: fx.name,
            turns: fx.turns,
          },
          systemActorId,
        );
      } catch (err: unknown) {
        // Any throw NOT caught by the per-turn try/catch (e.g. a hard
        // failure inside replayFixture's bookkeeping) — record it as
        // an error outcome so the fixture row still gets updated.
        const message = err instanceof Error ? err.message : String(err);
        summary.errors.push({ fixtureId: fx.id, fixtureName: fx.name, message });
        logger.warn(`[${SOURCE}] Fixture "${fx.name}" replay failed unexpectedly: ${message}`);
        outcome = {
          fixtureId: fx.id,
          fixtureName: fx.name,
          status: "errored",
          summary: {
            totalTurns: 0,
            matched: 0,
            differed: 0,
            noBaseline: 0,
            errored: 1,
            durationMs: 0,
            perTurn: [{
              index: 0,
              status: "error",
              prompt: "",
              expectedSnippet: null,
              actualSnippet: null,
              error: message,
            }],
          },
          fingerprint: null,
        };
        outcome.fingerprint = fingerprintForSummary(outcome.summary);
      }

      if (outcome.status === "pass") summary.passed += 1;
      else if (outcome.status === "drifted") summary.drifted += 1;
      else summary.errored += 1;

      try {
        await storage.recordRebeccaFixtureReplayResult(fx.id, {
          lastReplayAt: new Date(),
          lastReplayStatus: outcome.status,
          lastReplaySummary: outcome.summary,
          lastReplayFingerprint: outcome.fingerprint,
        });
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        logger.warn(`[${SOURCE}] Failed to persist replay result for fixture ${fx.id}: ${m}`);
      }

      if (outcome.status === "pass") {
        // Recovery — clear the suppression entry so the next genuine
        // drift event re-notifies admins.
        lastNotifiedFingerprintByFixture.delete(fx.id);
        continue;
      }

      // Drift / errored — emit a notification unless the kill switch
      // is on or we already notified for this exact drift shape.
      if (disabled) {
        summary.suppressed += 1;
        serverLog(
          `Suppressed drift notification for fixture "${fx.name}" (kill switch enabled)`,
          SOURCE,
        );
        continue;
      }
      const previous = lastNotifiedFingerprintByFixture.get(fx.id);
      if (previous && outcome.fingerprint && previous === outcome.fingerprint) {
        summary.suppressed += 1;
        serverLog(
          `Suppressed duplicate drift notification for fixture "${fx.name}" (${outcome.fingerprint})`,
          SOURCE,
        );
        continue;
      }
      const firstError = outcome.summary.perTurn.find((t) => t.status === "error")?.error;
      await notifyAdminsOfFixtureDrift({
        fixtureId: fx.id,
        fixtureName: fx.name,
        status: outcome.status,
        totalTurns: outcome.summary.totalTurns,
        matched: outcome.summary.matched,
        differed: outcome.summary.differed,
        errored: outcome.summary.errored,
        errorMessage: firstError,
      });
      summary.notified += 1;
      if (outcome.fingerprint) {
        lastNotifiedFingerprintByFixture.set(fx.id, outcome.fingerprint);
      }
    }

    serverLog(
      `Cycle complete: ${summary.passed} pass, ${summary.drifted} drifted, ${summary.errored} errored ` +
        `(of ${summary.considered}); notified=${summary.notified}, suppressed=${summary.suppressed}`,
      SOURCE,
    );
    return summary;
  } catch (err: unknown) {
    cycleThrew = true;
    cycleErrorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    const status: "ok" | "warn" | "error" = cycleThrew
      ? "error"
      : summary.errored > 0
        ? "error"
        : summary.drifted > 0
          ? "warn"
          : "ok";
    const notes = cycleThrew
      ? truncateNotes(cycleErrorMessage)
      : summary.errored > 0 || summary.drifted > 0
        ? `${summary.drifted} drifted, ${summary.errored} errored, ${summary.notified} notified`
        : null;
    void recordSchedulerCycle({
      key: "rebecca-fixture-replay",
      considered: summary.considered,
      succeeded: summary.passed,
      failed: summary.errored,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
  }
}

const CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const STARTUP_DELAY_MS = 90 * 1000; // settle after migrations + other schedulers

export function startRebeccaFixtureReplayScheduler(): void {
  serverLog(
    `Starting — initial replay in ${STARTUP_DELAY_MS / 1000}s, then every ${CYCLE_INTERVAL_MS / 3_600_000}h`,
    SOURCE,
  );
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runRebeccaFixtureReplayCycle().catch((err) => {
      const m = err instanceof Error ? err.message : String(err);
      serverLog(`Initial cycle failed: ${m}`, SOURCE, "error");
    });
    schedulerInterval = setInterval(() => {
      runRebeccaFixtureReplayCycle().catch((err) => {
        const m = err instanceof Error ? err.message : String(err);
        serverLog(`Periodic cycle failed: ${m}`, SOURCE, "error");
      });
    }, CYCLE_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopRebeccaFixtureReplayScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  serverLog("Stopped", SOURCE);
}
