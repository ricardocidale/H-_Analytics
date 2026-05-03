/**
 * Nightly hero-photo-URL audit (Task #937).
 *
 * Companion to `script/resync-property-image-url.ts` — that one-shot
 * repair walks the album, recomputes the canonical hero URL, and
 * rewrites the `properties.image_url` cache. This nightly job is the
 * standing alarm: it scans the same data every 24h and emails on-call
 * admins the moment the cache and the album disagree again, or the
 * resolved URL stops returning a healthy status, so we hear about a
 * portfolio-card 404 the next morning instead of from a customer.
 *
 * Behaviour mirrors `legacy-storage-url-audit.ts`:
 *   1. Per-property drift + liveness scan against the same hero ?? first
 *      -photo-by-id rule the resync script uses, so the audit and the
 *      repair stay in lockstep.
 *   2. Records a one-row cycle summary in `scheduler_runs` so the
 *      Admin → Observability page shows "last run, what happened, did
 *      it fail" and warns when the scheduler stops ticking.
 *   3. On non-zero failures, emits one `HERO_PHOTO_URL_BROKEN`
 *      notification per admin recipient through `processNotificationEvent`.
 *   4. Suppresses repeat emails when the failure set hasn't changed: the
 *      "fingerprint" is the sorted `propertyId:reason` list, so the same
 *      bad rows on consecutive nights only notify once. A new failure or
 *      a property recovering forces a fresh notification. Once the audit
 *      comes back clean, the fingerprint resets so the next regression
 *      notifies again.
 *   5. Honors `hero_photo_url_audit_disabled` ("true" mutes admin emails
 *      while still recording cycle summaries and keeping the scanner
 *      running). Mirrors `legacy_storage_url_audit_disabled`.
 *
 * URL liveness:
 *   - `/api/property-photos/:id/image` → DB-level: the photo row with
 *     that id must exist (the route itself is auth-protected, so an
 *     out-of-band HEAD would 401 regardless of whether the binary is
 *     present; checking the row gives the same "is the underlying asset
 *     reachable" answer without an HTTP round-trip).
 *   - `/api/media/:filename` → DB-level: the `media_assets` row must
 *     exist. Same reasoning — content-addressable rows are the source of
 *     truth.
 *   - `/objects/...` and absolute http(s) URLs → real HTTP HEAD via
 *     `fetchWithTimeout`, resolved against `getAppUrl()` for relative
 *     paths. These shapes are routed by Express to public storage
 *     handlers (no auth), so a HEAD response is a faithful
 *     "does the resolved URL still serve" probe.
 *
 * Scheduling: hooked from `server/index.ts`. Initial run after a settle
 * delay so migrations + seeds + sibling schedulers have a chance to
 * land first; then once every 24h. Concurrency-guarded so a manual
 * "Run now" admin click cannot race with a scheduled cycle.
 */
import { db } from "../db";
import { storage } from "../storage";
import { properties, propertyPhotos } from "@workspace/db";
import { logger, log as serverLog } from "../logger";
import { processNotificationEvent } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import { isAdminRole } from "@shared/constants";
import { recordSchedulerCycle, truncateNotes } from "./scheduler-run-tracker";
import { getAppUrl } from "../providers/config";
import { fetchWithTimeout } from "../lib/fetch-with-timeout";
import { isBlockedHostResolved } from "../routes/ssrf-guard";

const SOURCE = "hero-photo-url-audit";

const CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000; // nightly
// Settle alongside sibling schedulers — same family of "give the
// process a minute to finish migrations + seeds + sibling boots
// before we start hammering the DB" delay used by the legacy-storage
// audit. 1 minute is well past the worst-case warm-start in practice.
const STARTUP_DELAY_MS = 60 * 1000;
const HEAD_TIMEOUT_MS = 8_000;

let schedulerInterval: NodeJS.Timeout | null = null;
let startupTimeout: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Last fingerprint we emailed admins about. Cleared when the audit comes
 * back clean so the next regression is a fresh event and re-notifies.
 * Module-level (not persisted) — a server restart resets the
 * fingerprint, which is fine: at worst admins get one extra email after
 * a restart, never one too few.
 */
let lastNotifiedFingerprint: string | null = null;

export function _resetHeroPhotoAuditStateForTest(): void {
  lastNotifiedFingerprint = null;
  isRunning = false;
}

export type HeroPhotoFailureReason =
  | "cache-drift"
  | "missing-photo-row"
  | "missing-media-asset"
  | "head-bad-status"
  | "head-error"
  | "head-blocked-host";

export interface HeroPhotoFailure {
  propertyId: number;
  propertyName: string;
  /** What the cache currently points at (`properties.image_url`). */
  currentUrl: string | null;
  /** What the album says it should be (hero ?? first-photo-by-id). */
  expectedUrl: string | null;
  /** Which URL the liveness check actually probed (resolved/expected). */
  resolvedUrl: string | null;
  reason: HeroPhotoFailureReason;
  detail: string;
}

export interface HeroPhotoAuditReport {
  propertiesScanned: number;
  propertiesWithoutPhotos: number;
  failures: HeroPhotoFailure[];
}

/**
 * Stable signature of the audit's failure set. Sorted by
 * `propertyId:reason` so the same bad properties on consecutive nights
 * suppress, but a property recovering or a new failure mode appearing
 * forces a fresh notification.
 */
export function fingerprintReport(report: HeroPhotoAuditReport): string {
  if (report.failures.length === 0) return "clean";
  return [...report.failures]
    .map((f) => `${f.propertyId}:${f.reason}`)
    .sort()
    .join("|");
}

/**
 * URL-shape classification. Internal `/api/...` routes are checked at
 * the DB layer (the routes that serve them are auth-protected or
 * content-addressable, so a DB existence check is a faithful liveness
 * probe). `/objects/...` and absolute http(s) URLs are HEAD-probed
 * over HTTP because those shapes are served by public route handlers.
 */
type UrlKind =
  | { kind: "photo-image"; photoId: number }
  | { kind: "media"; filename: string }
  | { kind: "objects"; path: string }
  | { kind: "absolute"; url: string }
  | { kind: "unknown" };

function classifyPath(path: string): UrlKind {
  // `/api/property-photos/:id/image` — DB-served binary.
  const photoMatch = path.match(/^\/api\/property-photos\/(\d+)\/image\b/);
  if (photoMatch) return { kind: "photo-image", photoId: Number(photoMatch[1]) };
  // `/api/media/:filename` — content-addressable bytea row in `media_assets`.
  const mediaMatch = path.match(/^\/api\/media\/([^/?#]+)/);
  if (mediaMatch) return { kind: "media", filename: mediaMatch[1] };
  // `/objects/...` — public object storage proxy.
  if (path.startsWith("/objects/")) return { kind: "objects", path };
  return { kind: "unknown" };
}

/**
 * Hostname of `getAppUrl()`. Resolved lazily so test environments and
 * env-var changes are picked up correctly. Returns `null` on parse
 * failure so callers fall through to "treat as remote".
 */
function getAppHostname(): string | null {
  try {
    return new URL(getAppUrl()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyUrl(raw: string): UrlKind {
  const url = raw.trim();
  if (!url) return { kind: "unknown" };

  if (/^https?:\/\//i.test(url)) {
    // Same-origin absolute URLs are written by older code paths and
    // by manual admin edits. Re-classify by pathname so an absolute
    // `https://<app>/api/property-photos/.../image` is checked at
    // the DB layer (the same way the relative form is) instead of
    // being unauthenticated-HEADed and 401'ing.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { kind: "absolute", url };
    }
    const appHost = getAppHostname();
    if (appHost && parsed.hostname.toLowerCase() === appHost) {
      const innerPath = `${parsed.pathname}${parsed.search}`;
      const inner = classifyPath(innerPath);
      // Only collapse to an internal classifier when the path is
      // recognized; otherwise probe the absolute URL.
      if (inner.kind !== "unknown") return inner;
    }
    return { kind: "absolute", url };
  }

  return classifyPath(url);
}

async function probeUrlLiveness(
  resolvedUrl: string,
  photoRowExists: boolean,
): Promise<{ ok: true } | { ok: false; reason: HeroPhotoFailureReason; detail: string }> {
  const kind = classifyUrl(resolvedUrl);
  switch (kind.kind) {
    case "photo-image": {
      // The route is auth-protected, so HEAD would 401 regardless of
      // whether the row exists. The album row's presence is the
      // faithful liveness signal: the route streams `imageData` (or
      // 302s to `imageUrl`) directly from this row.
      if (!photoRowExists) {
        return {
          ok: false,
          reason: "missing-photo-row",
          detail: `property_photos id=${kind.photoId} not found`,
        };
      }
      return { ok: true };
    }
    case "media": {
      const asset = await storage.getMediaByFilename(kind.filename);
      if (!asset) {
        return {
          ok: false,
          reason: "missing-media-asset",
          detail: `media_assets filename=${kind.filename} not found`,
        };
      }
      return { ok: true };
    }
    case "objects":
    case "absolute": {
      const target =
        kind.kind === "absolute"
          ? kind.url
          : `${getAppUrl().replace(/\/+$/, "")}${kind.path}`;
      return probeHttpHead(target, "");
    }
    case "unknown": {
      // Unrecognized shape — probe the resolved (likely relative) URL
      // so an operator notices the new shape rather than silently
      // passing.
      const target = `${getAppUrl().replace(/\/+$/, "")}/${resolvedUrl.replace(/^\/+/, "")}`;
      return probeHttpHead(target, " (unrecognized URL shape)");
    }
  }
}

/**
 * SSRF-guarded HEAD probe.
 *
 * Hero URLs in the DB can include absolute http(s) URLs (legacy stock
 * photos, manual pastes), and this nightly job will faithfully probe
 * every one. Without a host guard, a malicious or compromised row
 * would turn the audit into a recurring SSRF gadget pointed at
 * private IPs, link-local metadata services, or `localhost`. So
 * before any outbound request, parse the URL, resolve the host, and
 * fail closed (record `head-blocked-host`) if the target resolves to
 * a private/internal address. Reuses the same `isBlockedHostResolved`
 * the in-band routes already trust.
 */
async function probeHttpHead(
  target: string,
  detailSuffix: string,
): Promise<{ ok: true } | { ok: false; reason: HeroPhotoFailureReason; detail: string }> {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "head-error",
      detail: `Could not parse "${target}" as URL: ${msg}${detailSuffix}`,
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: "head-blocked-host",
      detail: `Refusing to probe non-http(s) URL ${target}${detailSuffix}`,
    };
  }
  if (await isBlockedHostResolved(parsed.hostname)) {
    return {
      ok: false,
      reason: "head-blocked-host",
      detail: `Refusing to probe ${target}: host ${parsed.hostname} resolves to a blocked/internal address${detailSuffix}`,
    };
  }
  try {
    const res = await fetchWithTimeout(target, { method: "HEAD" }, HEAD_TIMEOUT_MS);
    if (!res.ok) {
      return {
        ok: false,
        reason: "head-bad-status",
        detail: `HEAD ${target} -> ${res.status}${detailSuffix}`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "head-error",
      detail: `HEAD ${target} threw: ${msg}${detailSuffix}`,
    };
  }
}

/**
 * Run one scan of every property, comparing the cache against the
 * album hero (with the resync script's first-photo-by-id fallback) and
 * HEAD-checking the resolved URL.
 */
export async function scanHeroPhotoUrls(): Promise<HeroPhotoAuditReport> {
  const allProps = await db.select().from(properties);
  const allPhotos = await db.select().from(propertyPhotos);

  // Same indexing rule the resync script uses, so drift detection here
  // and the repair there can never disagree about what "expected" is.
  const heroByPropertyId = new Map<number, typeof allPhotos[number]>();
  const firstPhotoByPropertyId = new Map<number, typeof allPhotos[number]>();
  const photoById = new Map<number, typeof allPhotos[number]>();
  const sortedPhotos = [...allPhotos].sort((a, b) => a.id - b.id);
  for (const photo of sortedPhotos) {
    photoById.set(photo.id, photo);
    if (photo.isHero) heroByPropertyId.set(photo.propertyId, photo);
    if (!firstPhotoByPropertyId.has(photo.propertyId)) {
      firstPhotoByPropertyId.set(photo.propertyId, photo);
    }
  }

  const failures: HeroPhotoFailure[] = [];
  let propertiesWithoutPhotos = 0;

  for (const prop of allProps) {
    const hero = heroByPropertyId.get(prop.id);
    const fallback = !hero ? firstPhotoByPropertyId.get(prop.id) : undefined;
    const source = hero ?? fallback;

    if (!source) {
      // No album → cache should be null/empty; if it has a value we
      // can't verify against an album, but it might be a manual paste
      // pre-album. Skip silently — a property with no photos is not a
      // broken hero.
      propertiesWithoutPhotos++;
      continue;
    }

    const expected = source.imageUrl;
    const current = prop.imageUrl;

    // Drift: cache !== album expected.
    if (current !== expected) {
      failures.push({
        propertyId: prop.id,
        propertyName: prop.name,
        currentUrl: current ?? null,
        expectedUrl: expected,
        resolvedUrl: expected,
        reason: "cache-drift",
        detail: `properties.image_url=${JSON.stringify(current)} but hero photo is ${JSON.stringify(expected)}`,
      });
      // Still HEAD-check the *expected* URL so we don't have to wait
      // for the resync script + a second nightly cycle to learn the
      // canonical URL is also dead.
    }

    const probedUrl = expected;
    const photoMatch = classifyUrl(probedUrl);
    const photoRowExists =
      photoMatch.kind === "photo-image" ? photoById.has(photoMatch.photoId) : true;

    const liveness = await probeUrlLiveness(probedUrl, photoRowExists);
    if (!liveness.ok) {
      failures.push({
        propertyId: prop.id,
        propertyName: prop.name,
        currentUrl: current ?? null,
        expectedUrl: expected,
        resolvedUrl: probedUrl,
        reason: liveness.reason,
        detail: liveness.detail,
      });
    }
  }

  return {
    propertiesScanned: allProps.length,
    propertiesWithoutPhotos,
    failures,
  };
}

// Cap how many failing rows we serialize into the email body and
// notification metadata. 24 is one row per hour of the day — small
// enough to keep the email readable when something goes badly wrong
// portfolio-wide, large enough to cover the whole portfolio in the
// normal case.
const ROW_SAMPLE_LIMIT = 24;

function buildEmailMessage(
  report: HeroPhotoAuditReport,
  dashboardUrl: string,
): string {
  const samples = report.failures.slice(0, ROW_SAMPLE_LIMIT);
  const rowLines = samples
    .map(
      (f) =>
        `• [${f.propertyId}] ${f.propertyName} — ${f.reason}\n` +
        `    current : ${f.currentUrl ?? "(null)"}\n` +
        `    expected: ${f.expectedUrl ?? "(null)"}\n` +
        `    detail  : ${f.detail}`,
    )
    .join("\n");
  const more =
    report.failures.length > samples.length
      ? `\n…and ${report.failures.length - samples.length} more property/ies.`
      : "";
  const byReason = report.failures.reduce<Record<string, number>>((acc, f) => {
    acc[f.reason] = (acc[f.reason] ?? 0) + 1;
    return acc;
  }, {});
  const reasonLines = Object.entries(byReason)
    .sort(([, a], [, b]) => b - a)
    .map(([r, n]) => `• ${r} — ${n}`)
    .join("\n");

  return (
    `The nightly hero-photo URL audit flagged <strong>${report.failures.length}</strong> ` +
    `propert${report.failures.length === 1 ? "y" : "ies"} whose cached hero URL ` +
    `drifts from the album hero or fails its liveness probe.<br/><br/>` +
    `<strong>By reason:</strong><pre style="white-space:pre-wrap">${reasonLines}</pre>` +
    `<strong>Affected (first ${samples.length}):</strong>` +
    `<pre style="white-space:pre-wrap">${rowLines}${more}</pre>` +
    `Run <code>npx tsx artifacts/api-server/src/scripts/resync-property-image-url.ts</code> ` +
    `to repair drift, then re-run the audit (or wait one cycle) to confirm clean.<br/><br/>` +
    `<a href="${dashboardUrl}">Open the Observability dashboard</a> to inspect the cycle history.`
  );
}

async function notifyAdminsOfFailures(report: HeroPhotoAuditReport): Promise<{
  recipients: number;
  sent: number;
  failed: number;
}> {
  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter((u) => u.email && isAdminRole(u.role));
  if (admins.length === 0) return { recipients: 0, sent: 0, failed: 0 };

  const dashboardUrl = `${getAppUrl().replace(/\/+$/, "")}/admin?section=observability`;
  const message = buildEmailMessage(report, dashboardUrl);
  const sharedMetadata = {
    failureCount: report.failures.length,
    propertiesScanned: report.propertiesScanned,
    fingerprint: fingerprintReport(report),
    affectedProperties: report.failures.slice(0, ROW_SAMPLE_LIMIT).map((f) => ({
      propertyId: f.propertyId,
      propertyName: f.propertyName,
      reason: f.reason,
      currentUrl: f.currentUrl,
      expectedUrl: f.expectedUrl,
      resolvedUrl: f.resolvedUrl,
      detail: f.detail,
    })),
    affectedTruncated: report.failures.length > ROW_SAMPLE_LIMIT,
  };

  let sent = 0;
  let failed = 0;
  for (const admin of admins) {
    try {
      const event = createEvent("HERO_PHOTO_URL_BROKEN", {
        message,
        link: dashboardUrl,
        metadata: {
          recipientEmail: admin.email,
          ...sharedMetadata,
        },
      });
      await processNotificationEvent(event);
      sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${SOURCE}: notify ${admin.email} failed: ${msg}`, SOURCE);
      failed++;
    }
  }

  return { recipients: admins.length, sent, failed };
}

export interface HeroPhotoAuditCycleSummary {
  failureCount: number;
  propertiesScanned: number;
  fingerprint: string;
  notification:
    | { status: "clean" }
    | { status: "disabled"; reason: string }
    | { status: "suppressed"; reason: string }
    | { status: "no-admins" }
    | { status: "sent"; recipients: number; sent: number; failed: number };
}

export async function runHeroPhotoUrlAuditCycle(): Promise<HeroPhotoAuditCycleSummary> {
  if (isRunning) {
    serverLog("Cycle already in progress — skipping", SOURCE, "warn");
    return {
      failureCount: 0,
      propertiesScanned: 0,
      fingerprint: "skipped",
      notification: { status: "suppressed", reason: "cycle-in-progress" },
    };
  }
  isRunning = true;
  const cycleStart = Date.now();
  let cycleThrew = false;
  let cycleErrorMessage: string | null = null;
  let report: HeroPhotoAuditReport | null = null;
  let notification: HeroPhotoAuditCycleSummary["notification"] = { status: "clean" };

  try {
    report = await scanHeroPhotoUrls();

    if (report.failures.length === 0) {
      if (lastNotifiedFingerprint !== null && lastNotifiedFingerprint !== "clean") {
        serverLog(
          `Audit recovered to clean state (was: ${lastNotifiedFingerprint})`,
          SOURCE,
        );
      }
      lastNotifiedFingerprint = "clean";
      notification = { status: "clean" };
    } else {
      const fingerprint = fingerprintReport(report);
      if (lastNotifiedFingerprint === fingerprint) {
        serverLog(
          `Suppressed duplicate notification (fingerprint=${fingerprint})`,
          SOURCE,
        );
        notification = { status: "suppressed", reason: "duplicate-fingerprint" };
      } else {
        const disabled =
          (await storage.getNotificationSetting("hero_photo_url_audit_disabled")) === "true";
        if (disabled) {
          serverLog(
            `Suppressed notification (disabled by admin); ${report.failures.length} failure(s)`,
            SOURCE,
          );
          notification = { status: "disabled", reason: "admin-muted" };
          // Do NOT update fingerprint while disabled — re-enabling
          // should immediately surface the next genuine cycle as a
          // fresh event.
        } else {
          const result = await notifyAdminsOfFailures(report);
          if (result.recipients === 0) {
            serverLog(
              `No admin recipients to notify; ${report.failures.length} failure(s)`,
              SOURCE,
              "warn",
            );
            notification = { status: "no-admins" };
            // Do NOT update fingerprint — once an admin exists they
            // should be notified of the still-present problem.
          } else {
            serverLog(
              `Notified ${result.sent}/${result.recipients} admin(s) (${result.failed} failed) about ${report.failures.length} failure(s)`,
              SOURCE,
            );
            notification = {
              status: "sent",
              recipients: result.recipients,
              sent: result.sent,
              failed: result.failed,
            };
            lastNotifiedFingerprint = fingerprint;
          }
        }
      }
    }

    return {
      failureCount: report.failures.length,
      propertiesScanned: report.propertiesScanned,
      fingerprint: fingerprintReport(report),
      notification,
    };
  } catch (err: unknown) {
    cycleThrew = true;
    cycleErrorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    isRunning = false;
    const failureCount = report?.failures.length ?? 0;
    // Count distinct failing properties — a single property can emit
    // multiple failures (e.g. cache-drift AND head-bad-status), so
    // counting raw failures would let `succeeded = scanned - failed`
    // go negative and corrupt the Observability cycle metrics.
    const distinctFailedProperties = report
      ? new Set(report.failures.map((f) => f.propertyId)).size
      : 0;
    const status: "ok" | "warn" | "error" = cycleThrew
      ? "error"
      : failureCount > 0
        ? "warn"
        : "ok";
    const notes = cycleThrew
      ? truncateNotes(cycleErrorMessage)
      : failureCount === 0
        ? `Clean (${report?.propertiesScanned ?? 0} property/ies scanned, ${report?.propertiesWithoutPhotos ?? 0} without photos)`
        : truncateNotes(
            `${failureCount} failure(s) across ${distinctFailedProperties} of ${report?.propertiesScanned ?? 0} property/ies; notification=${notification.status}`,
          );
    void recordSchedulerCycle({
      key: "hero-photo-url-audit",
      considered: report?.propertiesScanned ?? 0,
      succeeded: report ? report.propertiesScanned - distinctFailedProperties : 0,
      failed: cycleThrew ? 1 : distinctFailedProperties,
      status,
      notes,
      durationMs: Date.now() - cycleStart,
    });
  }
}

export function startHeroPhotoUrlAuditScheduler(): void {
  if (startupTimeout || schedulerInterval) return;
  serverLog(
    `Starting — initial audit in ${STARTUP_DELAY_MS / 1000}s, then every ${CYCLE_INTERVAL_MS / 3_600_000}h`,
    SOURCE,
  );
  startupTimeout = setTimeout(() => {
    startupTimeout = null;
    runHeroPhotoUrlAuditCycle().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      serverLog(`Initial cycle failed: ${msg}`, SOURCE, "error");
    });
    schedulerInterval = setInterval(() => {
      runHeroPhotoUrlAuditCycle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        serverLog(`Periodic cycle failed: ${msg}`, SOURCE, "error");
      });
    }, CYCLE_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopHeroPhotoUrlAuditScheduler(): void {
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
