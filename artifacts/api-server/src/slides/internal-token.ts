/**
 * internal-token.ts
 *
 * HMAC-SHA256 short-TTL tokens that authorize headless Chromium (Playwright)
 * to render the internal deck route at `/internal/deck/:propertyId`.
 *
 * Why a token instead of a session cookie:
 *   The Playwright instance running inside the api-server has no session
 *   cookie and cannot easily share one with the browser context. A signed
 *   token in the URL is a self-contained capability that:
 *     - binds to a single propertyId (cannot be replayed against another)
 *     - expires (default ~5 min) so leaked URLs do not stay valid
 *     - is HMAC-signed with the same TOKEN_ENCRYPTION_KEY used for OAuth
 *       token storage, so no new secret is required
 *
 * Format:  `${propertyId}.${expiresAtMs}.${sigBase64Url}`
 *
 * Both server-issued routes (`/api/properties/:id/deck.pdf`, the deck-payload
 * endpoint) and the portal’s internal deck route honor the same scheme.
 */

import crypto from "node:crypto";

const DECK_TOKEN_TTL_MS = 5 * 60 * 1000;

function getKey(): Buffer {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required to sign internal deck tokens");
  }
  return Buffer.from(k, "utf8");
}

function sign(propertyId: number, expiresAtMs: number): string {
  const h = crypto.createHmac("sha256", getKey());
  h.update(`${propertyId}:${expiresAtMs}`);
  return h.digest("base64url");
}

export interface SignedDeckToken {
  token: string;
  expiresAtMs: number;
}

/** Mint a token authorizing render of one specific property. */
export function signDeckToken(propertyId: number, ttlMs: number = DECK_TOKEN_TTL_MS): SignedDeckToken {
  const expiresAtMs = Date.now() + ttlMs;
  const sig = sign(propertyId, expiresAtMs);
  return { token: `${propertyId}.${expiresAtMs}.${sig}`, expiresAtMs };
}

export type VerifyResult =
  | { ok: true; propertyId: number; expiresAtMs: number }
  | { ok: false; reason: "malformed" | "expired" | "invalid-signature" | "property-mismatch" };

/**
 * Verify a token. If `expectedPropertyId` is supplied, also enforces the
 * token was minted for that exact property (defense against URL swapping).
 */
export function verifyDeckToken(token: string, expectedPropertyId?: number): VerifyResult {
  if (!token) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [pidStr, expStr, sig] = parts;
  const propertyId = Number(pidStr);
  const expiresAtMs = Number(expStr);
  if (!Number.isFinite(propertyId) || !Number.isFinite(expiresAtMs)) {
    return { ok: false, reason: "malformed" };
  }
  if (expectedPropertyId != null && propertyId !== expectedPropertyId) {
    return { ok: false, reason: "property-mismatch" };
  }
  if (Date.now() > expiresAtMs) return { ok: false, reason: "expired" };

  const expected = sign(propertyId, expiresAtMs);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid-signature" };
  }
  return { ok: true, propertyId, expiresAtMs };
}
