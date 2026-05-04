/**
 * lb-token.ts
 *
 * HMAC-SHA256 short-TTL tokens for the LB Slide Deck render route.
 *
 * Parallel to internal-token.ts (per-property tokens) but uses a separate
 * "lb:" namespace prefix in the signed payload so cross-type token reuse
 * is rejected at verification time.
 *
 * Token format:  `lb.${expiresAtMs}.${sigBase64Url}`
 *   — prefix "lb" distinguishes from per-property tokens
 *   — same TOKEN_ENCRYPTION_KEY (no new secret required)
 */

import crypto from "node:crypto";

const LB_DECK_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getKey(): Buffer {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY is required to sign LB deck tokens");
  return Buffer.from(k, "utf8");
}

function sign(expiresAtMs: number): string {
  const h = crypto.createHmac("sha256", getKey());
  h.update(`lb:${expiresAtMs}`);
  return h.digest("base64url");
}

export interface SignedLbDeckToken {
  token: string;
  expiresAtMs: number;
}

/** Mint a short-TTL LB deck token. */
export function signLbDeckToken(ttlMs: number = LB_DECK_TOKEN_TTL_MS): SignedLbDeckToken {
  const expiresAtMs = Date.now() + ttlMs;
  return { token: `lb.${expiresAtMs}.${sign(expiresAtMs)}`, expiresAtMs };
}

export type VerifyLbResult =
  | { ok: true; expiresAtMs: number }
  | { ok: false; reason: "malformed" | "expired" | "invalid-signature" | "wrong-kind" };

/** Verify an LB deck token. Rejects per-property tokens (wrong-kind). */
export function verifyLbDeckToken(token: string): VerifyLbResult {
  if (!token) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [kind, expStr, sig] = parts;
  if (kind !== "lb") return { ok: false, reason: "wrong-kind" };
  const expiresAtMs = Number(expStr);
  if (!Number.isFinite(expiresAtMs)) return { ok: false, reason: "malformed" };
  if (Date.now() > expiresAtMs) return { ok: false, reason: "expired" };
  const expected = sign(expiresAtMs);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid-signature" };
  }
  return { ok: true, expiresAtMs };
}
