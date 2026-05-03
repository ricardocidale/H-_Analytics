/**
 * Signed action tokens for one-click email actions on Constants rows.
 *
 * Why this exists:
 *   The overdue-digest email lists Constants sources whose owning
 *   Specialist has gone silent past 2× cadence. Without a one-click
 *   action, the admin has to deep-link into the Constants tab, find
 *   the right row, and click "Refresh research" — three steps that
 *   discourage closing the loop. This module mints (and verifies)
 *   tamper-resistant action tokens that the digest embeds into a
 *   per-row "Re-fetch from authority" link, so a single click on the
 *   email triggers the silent specialist for that exact tuple.
 *
 * Threat model:
 *   The action endpoint is also `requireAdmin`-gated, so the token's
 *   sole job is to bind the URL to a specific (key, country,
 *   subdivision) tuple and to a TTL — it does NOT grant authority by
 *   itself. An admin who lifts another admin's URL still gets in
 *   (they're an admin too), but they cannot construct a URL targeting
 *   a tuple they didn't get a real digest for, and they cannot replay
 *   a months-old URL after the TTL has lapsed.
 *
 * Idempotency:
 *   The token also carries `issuedAt` so the action route can compare
 *   it against the latest successful research run for the row. If a
 *   run has already completed AFTER the digest went out, the second
 *   click becomes a no-op (rendered as "already refreshed since this
 *   email") instead of double-firing the specialist. See
 *   `refresh-from-email` in `server/routes/admin/model-constants.ts`.
 */
import crypto from "crypto";

/**
 * Stable per-process secret used to sign action tokens. Prefers
 * `SESSION_SECRET` (set in production) so tokens survive process
 * restarts; falls back to a random key generated once at boot for
 * dev/test. Mirrors the CSRF-token secret derivation in
 * `server/auth.ts` so the operational story is consistent: rotate
 * `SESSION_SECRET` and every signed surface re-mints.
 */
const ACTION_TOKEN_SECRET: Buffer = process.env.SESSION_SECRET
  ? Buffer.from(process.env.SESSION_SECRET, "utf8")
  : crypto.randomBytes(32);

/**
 * Token TTL. Sized to comfortably outlast the digest cadence (hourly
 * today; capped at 14 days so a long PTO doesn't render every link
 * dead). Tokens older than this are rejected as `expired`.
 */
export const REFRESH_ACTION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface RefreshActionPayload {
  key: string;
  country: string | null;
  subdivision: string | null;
  /** Token mint time, ms since epoch. */
  issuedAt: number;
}

/**
 * Compact payload encoding. Keys are short to keep the URL short
 * enough to survive aggressive email-client truncation (some clients
 * collapse anything over ~2000 chars).
 */
interface WirePayload {
  k: string;
  c: string | null;
  s: string | null;
  t: number;
}

function toWire(p: RefreshActionPayload): WirePayload {
  return { k: p.key, c: p.country, s: p.subdivision, t: p.issuedAt };
}

function fromWire(w: WirePayload): RefreshActionPayload {
  return {
    key: w.k,
    country: w.c ?? null,
    subdivision: w.s ?? null,
    issuedAt: w.t,
  };
}

function hmac(bodyB64: string): string {
  return crypto.createHmac("sha256", ACTION_TOKEN_SECRET).update(bodyB64).digest("base64url");
}

/**
 * Sign a refresh-action payload. The returned token is `<bodyB64>.<sig>`
 * — URL-safe (base64url) and free of characters that need escaping in
 * `<a href>` attributes inside an HTML email.
 */
export function signRefreshAction(p: RefreshActionPayload): string {
  const json = JSON.stringify(toWire(p));
  const bodyB64 = Buffer.from(json, "utf8").toString("base64url");
  return `${bodyB64}.${hmac(bodyB64)}`;
}

export type RefreshActionVerifyResult =
  | { ok: true; payload: RefreshActionPayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

/**
 * Verify a token. Returns the parsed payload on success, or a tagged
 * failure reason that the route handler maps to a user-facing message
 * (e.g. "this link has expired — open the Constants tab manually").
 *
 * `now` is injectable for deterministic TTL tests.
 */
export function verifyRefreshAction(
  token: unknown,
  now: number = Date.now(),
): RefreshActionVerifyResult {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed" };
  }
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const bodyB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(bodyB64);
  // Constant-time compare. base64url has no length variability for the
  // same input, so unequal lengths are an automatic mismatch.
  if (sig.length !== expected.length) return { ok: false, reason: "bad-signature" };
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return { ok: false, reason: "bad-signature" };
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: "bad-signature" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as WirePayload).k !== "string" ||
    (parsed as WirePayload).k.length === 0 ||
    typeof (parsed as WirePayload).t !== "number" ||
    !Number.isFinite((parsed as WirePayload).t)
  ) {
    return { ok: false, reason: "malformed" };
  }
  const wire = parsed as WirePayload;
  if (wire.c !== null && typeof wire.c !== "string") return { ok: false, reason: "malformed" };
  if (wire.s !== null && typeof wire.s !== "string") return { ok: false, reason: "malformed" };
  if (now - wire.t > REFRESH_ACTION_TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload: fromWire(wire) };
}
