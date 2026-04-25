/**
 * Roll-up notification: per refresh cycle, email admins about Constants
 * (specialist, key, locality) rows whose most recent successful research
 * run is older than **2× the effective refresh cadence**.
 *
 * Why this exists:
 *   The Constants tab already shows a per-row "Stale" badge when a row has
 *   gone past its (admin-overridable) cadence. But nothing actively pings
 *   admins when a Specialist they slowed down — say, by setting a 365-day
 *   cadence on `taxRate` — is now consistently overdue. This evaluator
 *   closes that loop: every cycle, the scheduler hands us the rows that
 *   have crossed the 2× line and we route a single rolled-up notification
 *   through the same admin-notification path that `llm-registry` uses for
 *   model-configuration issues (createEvent + processNotificationEvent).
 *
 * Cycle model:
 *   The contract is "one rolled-up notification per cycle". We do NOT
 *   dedupe across cycles: as long as the scheduler hands us a non-empty
 *   overdue set, every cycle emits. Admins who want fewer pings should
 *   raise the cadence override on the offending Specialist (which, by
 *   raising the 2× threshold, naturally drops the row out of the set).
 *
 *   The scheduler currently runs every 60 minutes, so an unresolved
 *   silent source produces hourly reminders — intentional and matched to
 *   the failure-digest pattern next door.
 *
 * Failure model:
 *   Per-recipient send failures are caught and reported in the result
 *   so the scheduler can log them. Recipient-resolution failures fall
 *   back to a `no-admins` result rather than throwing, so a transient
 *   DB blip never aborts the cycle.
 */
import { storage } from "../storage";
import { processNotificationEvent } from "./engine";
import { createEvent } from "./events";
import { isAdminRole } from "@shared/constants";
import { getAppUrl } from "../providers/config";
import { logger } from "../logger";

export const CONSTANTS_TAB_PATH = "/admin?section=model-defaults&tab=model-constants";

export interface OverdueConstantRow {
  specialistId: string | null;
  specialistLetter: string | null;
  specialistName: string | null;
  key: string;
  country: string | null;
  subdivision: string | null;
  cadenceDays: number;
  ageDays: number;
}

export interface ConstantsOverdueDigestResult {
  status: "no-overdue" | "no-admins" | "ok";
  count?: number;
  recipients?: number;
  sent?: number;
  failed?: number;
}

function localityLabel(country: string | null, subdivision: string | null): string {
  if (!country) return "universal";
  return subdivision ? `${country} / ${subdivision}` : country;
}

function buildMessage(rows: OverdueConstantRow[], tabUrl: string): string {
  const lines = rows
    .slice(0, 50)
    .map((r) => {
      const who = r.specialistName
        ? `${r.specialistName}${r.specialistLetter ? ` (${r.specialistLetter})` : ""}`
        : r.specialistLetter
          ? `Specialist ${r.specialistLetter}`
          : "Unowned";
      return (
        `• ${r.key} (${localityLabel(r.country, r.subdivision)}) — owner: ${who}; ` +
        `cadence ${r.cadenceDays}d; ${Math.round(r.ageDays)}d since last successful refresh`
      );
    })
    .join("\n");
  const more = rows.length > 50 ? `\n…and ${rows.length - 50} more.` : "";
  return (
    `${rows.length} Constants source(s) have been silent past 2× their effective ` +
    `refresh cadence. The owning Specialist has not produced a successful research ` +
    `run for these rows in the time window an admin configured.\n\n${lines}${more}\n\n` +
    `Open the Constants tab (${tabUrl}) to investigate or refresh manually.`
  );
}

/**
 * Emit one rolled-up notification per cycle for the given overdue rows.
 * Empty input is a no-op (no admins are spammed when nothing is wrong).
 * Otherwise, every admin recipient gets one event routed through
 * processNotificationEvent — the same path llm-registry issues use.
 */
export async function notifyAdminsOfOverdueConstants(
  rows: OverdueConstantRow[],
): Promise<ConstantsOverdueDigestResult> {
  if (rows.length === 0) {
    return { status: "no-overdue" };
  }

  let admins: { id: number; email: string }[];
  try {
    const allUsers = await storage.getAllUsers();
    admins = allUsers
      .filter((u) => !!u.email && isAdminRole(u.role))
      .map((u) => ({ id: u.id, email: u.email as string }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      `constants-overdue-digest: failed to resolve admin recipients: ${msg}`,
      "notifications",
    );
    return { status: "no-admins", count: rows.length };
  }

  if (admins.length === 0) {
    return { status: "no-admins", count: rows.length };
  }

  const tabUrl = `${getAppUrl().replace(/\/+$/, "")}${CONSTANTS_TAB_PATH}`;
  const message = buildMessage(rows, tabUrl);
  const sharedMetadata = {
    overdueCount: rows.length,
    rows: rows.slice(0, 50).map((r) => ({
      specialistId: r.specialistId,
      specialistLetter: r.specialistLetter,
      key: r.key,
      country: r.country,
      subdivision: r.subdivision,
      cadenceDays: r.cadenceDays,
      ageDays: Math.round(r.ageDays),
    })),
  };

  let sent = 0;
  let failed = 0;
  for (const admin of admins) {
    try {
      const event = createEvent("CONSTANTS_REFRESH_OVERDUE", {
        message,
        link: tabUrl,
        metadata: {
          recipientEmail: admin.email,
          ...sharedMetadata,
        },
      });
      await processNotificationEvent(event);
      sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `constants-overdue-digest: notify ${admin.email} failed: ${msg}`,
        "notifications",
      );
      failed++;
    }
  }

  logger.info(
    `constants-overdue-digest: overdue=${rows.length} admins=${admins.length} sent=${sent} failed=${failed}`,
    "notifications",
  );
  return {
    status: "ok",
    count: rows.length,
    recipients: admins.length,
    sent,
    failed,
  };
}

/**
 * Test-only no-op kept for symmetry with sibling notifiers
 * (constants-refresh-failure-digest exposes a reset). The cross-cycle
 * dedupe was removed per spec ("one notification per cycle"), so this
 * function has nothing to clear.
 */
export function _resetConstantsOverdueFingerprint(): void {
  // intentionally empty — no module-local dedupe state
}
