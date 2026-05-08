/**
 * factory-token.ts
 *
 * HMAC-SHA256 short-TTL tokens for the slide-factory deck render route.
 *
 * Parallel to `lb-token.ts` but carries a `runId` payload field so the
 * internal-deck route (U4) can discriminate between legacy LB-deck renders
 * and factory-run renders. Cross-type token reuse is rejected at verify time
 * because the prefix (`factory.` vs `lb.`) is part of the signed payload.
 *
 * Token format:  `factory.${runId}.${expiresAtMs}.${sigBase64Url}`
 *   — prefix "factory" distinguishes from per-property and lb tokens
 *   — runId is included in the signing payload so a token cannot be replayed
 *     against a different run
 *   — same TOKEN_ENCRYPTION_KEY (no new secret required)
 */

import crypto from "node:crypto";

/** 5 minutes — unit conversion: 5min × 60s × 1000ms */
const FACTORY_DECK_TOKEN_TTL_MS = 5 * 60 * 1000;

function getKey(): Buffer {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY is required to sign factory deck tokens");
  return Buffer.from(k, "utf8");
}

function sign(runId: number, expiresAtMs: number): string {
  const h = crypto.createHmac("sha256", getKey());
  h.update(`factory:${runId}:${expiresAtMs}`);
  return h.digest("base64url");
}

export interface SignedFactoryDeckToken {
  token: string;
  expiresAtMs: number;
}

/** Mint a short-TTL factory deck token bound to `runId`. */
export function signFactoryDeckToken(
  runId: number,
  ttlMs: number = FACTORY_DECK_TOKEN_TTL_MS,
): SignedFactoryDeckToken {
  const expiresAtMs = Date.now() + ttlMs;
  const sig = sign(runId, expiresAtMs);
  return { token: `factory.${runId}.${expiresAtMs}.${sig}`, expiresAtMs };
}

export type VerifyFactoryResult =
  | { ok: true; runId: number; expiresAtMs: number }
  | { ok: false; reason: "malformed" | "expired" | "invalid-signature" | "wrong-kind" };

/**
 * Verify a factory deck token. Returns `{ ok: true, runId }` on success.
 * Rejects lb / per-property tokens (wrong-kind).
 */
export function verifyFactoryDeckToken(token: string): VerifyFactoryResult {
  if (!token) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  const FACTORY_TOKEN_PART_COUNT = 4;
  if (parts.length !== FACTORY_TOKEN_PART_COUNT) return { ok: false, reason: "malformed" };
  const [kind, runIdStr, expStr, sig] = parts;
  if (kind !== "factory") return { ok: false, reason: "wrong-kind" };
  const runId = Number(runIdStr);
  const expiresAtMs = Number(expStr);
  if (!Number.isFinite(runId) || !Number.isFinite(expiresAtMs)) {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() > expiresAtMs) return { ok: false, reason: "expired" };
  const expected = sign(runId, expiresAtMs);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid-signature" };
  }
  return { ok: true, runId, expiresAtMs };
}
