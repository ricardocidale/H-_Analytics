/**
 * Scheduled alert: emails admins a daily digest of "perennial offender"
 * Specialist recommendations — candidate fields where a Specialist has
 * recommended a value at least 3 times (`appearances >= 3`) and no
 * admin has ever promoted it (`lastPromotedAt IS NULL`).
 *
 * Why this exists:
 *   The cross-Specialist roll-up at Admin → Properties → Required
 *   Fields shows the same list in-app, but admins who never open that
 *   page never see chronic gaps. This evaluator pushes the same
 *   information into their inbox on a cadence, mirroring the
 *   constants-refresh failure-digest pattern next door.
 *
 * Cycle model:
 *   The contract is "at most one digest per UTC day". The scheduler
 *   ticks every PERENNIAL_RECOMMENDATIONS_DIGEST_INTERVAL_MS; the
 *   evaluator dedupes by scanning recent notification logs for
 *   `status = "sent"` rows whose metadata carries today's digestKey.
 *   A previously-failed delivery does NOT count as "already sent",
 *   so the next tick will retry.
 *
 * Failure model:
 *   - An empty offender set is a no-op (no admin spam when nothing is
 *     wrong).
 *   - Resend disabled (or feature kill-switched) → returns "disabled"
 *     without any side effects.
 *   - Per-recipient send failures are caught, logged with
 *     `status = "failed"` in `notification_logs`, and reported on the
 *     result so the scheduler can surface them. A failure for one
 *     admin does not block the next.
 *   - Recipient-resolution failures fall back to a `no-admins` result
 *     rather than throwing.
 *
 * Catalog enrichment:
 *   Storage rows reference Specialist ids and field keys that may have
 *   been removed from the catalog between when the recommendation was
 *   recorded and now. Those orphan rows are dropped here for the same
 *   reason the API endpoint drops them: nothing the digest could link
 *   to would render.
 */
import { storage } from "../storage";
import { db } from "../db";
import { desc, eq } from "drizzle-orm";
import { notificationLogs } from "@shared/schema";
import { getEventLabel } from "./events";
import { isAdminRole, APP_BRAND_NAME } from "@shared/constants";
import { getAppUrl } from "../providers/config";
import { logger } from "../logger";
import { sendNotificationEmail } from "../integrations/resend";
import { SPECIALIST_CATALOG } from "../../engine/analyst/registry/specialist-catalog";
import { specialistDisplayName } from "@shared/schema/specialist";
import {
  PERENNIAL_RECOMMENDATIONS_DIGEST_LIMIT,
  PERENNIAL_RECOMMENDATIONS_MIN_APPEARANCES,
} from "../constants";

export const PERENNIAL_OFFENDERS_PATH = "/admin?section=required-fields";

export interface PerennialOffenderRow {
  specialistId: string;
  specialistLetter: string;
  specialistDisplayName: string;
  fieldKey: string;
  fieldLabel: string;
  fieldSurface: string;
  appearances: number;
  lastObservedAt: string | null;
}

export interface PerennialRecommendationsDigestResult {
  status: "disabled" | "no-offenders" | "no-admins" | "already-sent" | "ok";
  digestKey?: string;
  offenders?: number;
  recipients?: number;
  sent?: number;
  failed?: number;
}

function digestKeyForDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns true iff a `notification_logs` row exists for this event
 * type with `status === "sent"` AND `metadata.digestKey === digestKey`.
 *
 * Status-aware dedupe (mirroring the constants-refresh-failure-digest
 * pattern): a previously *failed* send for today does NOT block a
 * retry on the next scheduler tick.
 */
async function alreadySentForDigest(digestKey: string): Promise<boolean> {
  const rows = await db
    .select({
      metadata: notificationLogs.metadata,
      status: notificationLogs.status,
    })
    .from(notificationLogs)
    .where(eq(notificationLogs.eventType, "PERENNIAL_RECOMMENDATIONS_DIGEST"))
    .orderBy(desc(notificationLogs.createdAt))
    .limit(100);
  return rows.some((r) => {
    if (r.status !== "sent") return false;
    const meta = r.metadata as Record<string, unknown> | null;
    return !!meta && typeof meta.digestKey === "string" && meta.digestKey === digestKey;
  });
}

function buildDigestBody(rows: PerennialOffenderRow[], rollupUrl: string): string {
  const items = rows
    .slice(0, 50)
    .map((r) => {
      const safeLabel = String(r.fieldLabel).slice(0, 200).replace(/[<>]/g, "");
      const safeWho = String(r.specialistDisplayName).slice(0, 120).replace(/[<>]/g, "");
      return (
        `<li><strong>${safeWho} (${r.specialistLetter})</strong> — ${safeLabel} ` +
        `<span style="color:#666">[${r.fieldSurface}]</span> · ` +
        `recommended <strong>${r.appearances}×</strong> · never promoted</li>`
      );
    })
    .join("");
  const more = rows.length > 50 ? `<p>…and ${rows.length - 50} more.</p>` : "";
  return (
    `<p>${rows.length} candidate field(s) have been recommended by a Specialist ` +
    `${PERENNIAL_RECOMMENDATIONS_MIN_APPEARANCES}+ times without an admin ever ` +
    `promoting the recommendation. These are chronic gaps — either the ` +
    `recommendation is wrong (tighten the Specialist) or the field is missing ` +
    `from the property/company surface (promote it).</p>` +
    `<strong>Perennial offenders:</strong><ul>${items}</ul>${more}` +
    `<p><a href="${rollupUrl}">Open the Required Fields rollup</a> to triage. ` +
    `Each row links to the owning Specialist's Recommendations card.</p>`
  );
}

/**
 * Pull the perennial offender set from storage, enrich with catalog
 * metadata (dropping orphan rows whose specialist or field key no
 * longer exists), and email each admin recipient directly so the
 * per-recipient `sent`/`failed` accounting reflects the actual SMTP
 * outcome (not just "we handed it to the engine"). Deduped per UTC
 * day on `status = "sent"` rows so frequent scheduler ticks are safe
 * AND failed sends naturally retry on the next tick.
 */
export async function evaluatePerennialRecommendationsDigest(
  now: Date = new Date(),
): Promise<PerennialRecommendationsDigestResult> {
  const resendEnabled = await storage.getNotificationSetting("resend_enabled");
  if (resendEnabled !== "true") return { status: "disabled" };

  const raw = await storage.getTopPerennialRecommendationOffenders(
    PERENNIAL_RECOMMENDATIONS_DIGEST_LIMIT,
  );

  const enriched: PerennialOffenderRow[] = [];
  for (const row of raw) {
    const specialist = SPECIALIST_CATALOG.find((s) => s.id === row.specialistId);
    if (!specialist) continue;
    const field = (specialist.candidateFields ?? []).find(
      (f) => f.key === row.fieldKey,
    );
    if (!field) continue;
    enriched.push({
      specialistId: row.specialistId,
      specialistLetter: specialist.letter,
      specialistDisplayName: specialistDisplayName(specialist),
      fieldKey: row.fieldKey,
      fieldLabel: field.label,
      fieldSurface: field.surface,
      appearances: row.appearances,
      lastObservedAt: row.lastObservedAt ?? null,
    });
  }

  if (enriched.length === 0) {
    return { status: "no-offenders" };
  }

  const digestKey = digestKeyForDay(now);
  if (await alreadySentForDigest(digestKey)) {
    return { status: "already-sent", digestKey, offenders: enriched.length };
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
      `perennial-recommendations-digest: failed to resolve admin recipients: ${msg}`,
      "notifications",
    );
    return { status: "no-admins", digestKey, offenders: enriched.length };
  }

  if (admins.length === 0) {
    return { status: "no-admins", digestKey, offenders: enriched.length };
  }

  const rollupUrl = `${getAppUrl().replace(/\/+$/, "")}${PERENNIAL_OFFENDERS_PATH}`;
  const subject = `${getEventLabel("PERENNIAL_RECOMMENDATIONS_DIGEST")} — ${APP_BRAND_NAME}`;
  const body = buildDigestBody(enriched, rollupUrl);
  const sharedMetadata = {
    digestKey,
    offenderCount: enriched.length,
    rows: enriched.slice(0, 50).map((r) => ({
      specialistId: r.specialistId,
      specialistLetter: r.specialistLetter,
      specialistDisplayName: r.specialistDisplayName,
      fieldKey: r.fieldKey,
      fieldLabel: r.fieldLabel,
      fieldSurface: r.fieldSurface,
      appearances: r.appearances,
      lastObservedAt: r.lastObservedAt,
    })),
  };

  let sent = 0;
  let failed = 0;
  for (const admin of admins) {
    try {
      await sendNotificationEmail({
        to: admin.email,
        subject,
        title: getEventLabel("PERENNIAL_RECOMMENDATIONS_DIGEST"),
        body,
        actionUrl: rollupUrl,
        actionLabel: "Open Required Fields Rollup",
      });
      await storage.createNotificationLog({
        eventType: "PERENNIAL_RECOMMENDATIONS_DIGEST",
        channel: "email",
        recipient: admin.email,
        subject,
        status: "sent",
        metadata: sharedMetadata,
      });
      sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `perennial-recommendations-digest: notify ${admin.email} failed: ${msg}`,
        "notifications",
      );
      await storage.createNotificationLog({
        eventType: "PERENNIAL_RECOMMENDATIONS_DIGEST",
        channel: "email",
        recipient: admin.email,
        subject,
        status: "failed",
        errorMessage: msg,
        metadata: sharedMetadata,
      });
      failed++;
    }
  }

  logger.info(
    `perennial-recommendations-digest: digestKey=${digestKey} offenders=${enriched.length} admins=${admins.length} sent=${sent} failed=${failed}`,
    "notifications",
  );
  return {
    status: "ok",
    digestKey,
    offenders: enriched.length,
    recipients: admins.length,
    sent,
    failed,
  };
}
