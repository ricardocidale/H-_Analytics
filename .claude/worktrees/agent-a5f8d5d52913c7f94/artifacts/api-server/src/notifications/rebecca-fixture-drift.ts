/**
 * Notify admins when a Rebecca preview fixture drifts (or errors) on a
 * scheduled replay cycle (Task #559).
 *
 * Per-admin loop, one event per recipient with `metadata.recipientEmail`
 * set so `processNotificationEvent` mails them when Resend is enabled.
 * Mirrors the per-Specialist band-drop notify path in
 * `server/jobs/specialist-quality-recompute.ts::notifyAdminsOfBandDrop`.
 *
 * The scheduler honors a per-org kill switch (`rebecca_fixture_drift_disabled`)
 * BEFORE calling this function, so this helper does not check it again —
 * the suppression-fingerprint update happens in the scheduler regardless,
 * matching the constants-refresh-digest precedent.
 */
import { storage } from "../storage";
import { processNotificationEvent } from "./engine";
import { createEvent } from "./events";
import { isAdminRole } from "@shared/constants";
import { logger } from "../logger";
import { getAppUrl } from "../providers/config";

const SOURCE = "rebecca-fixture-drift";

export interface RebeccaFixtureDriftEvent {
  fixtureId: number;
  fixtureName: string;
  status: "drifted" | "errored";
  totalTurns: number;
  /** Drift-only counts; both 0 when status='errored' before any turn ran. */
  matched: number;
  differed: number;
  errored: number;
  /** First error message, when status='errored'. */
  errorMessage?: string;
}

export function rebeccaFixtureDeepLink(): string {
  // The Test Chat fixtures panel is rendered as part of the AI Agents
  // admin section. There is no per-fixture deep link today (the panel
  // shows the full list); landing on the section is the closest we can
  // get without changing the panel's URL surface.
  return `${getAppUrl()}/admin?section=ai-agents`;
}

export async function notifyAdminsOfFixtureDrift(
  ev: RebeccaFixtureDriftEvent,
): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
    if (admins.length === 0) return;

    const link = rebeccaFixtureDeepLink();
    const message =
      ev.status === "errored"
        ? `Rebecca fixture "${ev.fixtureName}" failed to replay: ${ev.errorMessage ?? "(no error message)"}. Open the Test Chat fixtures panel to investigate.`
        : `Rebecca fixture "${ev.fixtureName}" drifted from its saved baseline: ${ev.differed}/${ev.totalTurns} turn(s) differ, ${ev.errored} errored, ${ev.matched} matched. Open the Test Chat fixtures panel to review the diff.`;

    for (const admin of admins) {
      const event = createEvent("REBECCA_FIXTURE_DRIFTED", {
        message,
        link,
        metadata: {
          recipientEmail: admin.email,
          fixtureId: ev.fixtureId,
          fixtureName: ev.fixtureName,
          status: ev.status,
          totalTurns: ev.totalTurns,
          matched: ev.matched,
          differed: ev.differed,
          errored: ev.errored,
          errorMessage: ev.errorMessage,
          link,
        },
      });
      await processNotificationEvent(event);
    }

    logger.info(
      `[${SOURCE}] Notified ${admins.length} admin(s) of ${ev.status} for "${ev.fixtureName}"`,
      SOURCE,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[${SOURCE}] Failed to notify admins of fixture drift for "${ev.fixtureName}": ${msg}`,
      SOURCE,
    );
  }
}
