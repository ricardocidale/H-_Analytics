import { NextResponse } from "next/server";

/**
 * Standard JSON envelope for app API routes (see README HTTP API).
 * Success: `{ ok: true, data }`. Failure: `{ ok: false, error: { message, code?, details? } }`.
 *
 * **Conventional `error.code` values** (not exhaustive; routes may add more):
 * - `UNAUTHORIZED` — no session
 * - `FORBIDDEN` — signed in but not allowed (e.g. non-admin on `/api/admin/*`)
 * - `VALIDATION` / `INVALID_JSON` — bad input
 * - `NOT_FOUND` — missing resource
 * - `SYNC_FAILED` — provider sync returned failure (`422` on `/api/sync/*`)
 * - `UPSTREAM_*` — vendor API errors from probes or integrations
 */
export type ApiErrorBody = {
  message: string;
  code?: string;
  details?: unknown;
};

export type ApiSuccessEnvelope<T> = { ok: true; data: T };
export type ApiFailureEnvelope = { ok: false; error: ApiErrorBody };
export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiFailureEnvelope;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccessEnvelope<T>> {
  return NextResponse.json({ ok: true as const, data }, init);
}

export function jsonErr(
  message: string,
  status: number,
  opts?: { code?: string; details?: unknown; init?: ResponseInit },
): NextResponse<ApiFailureEnvelope> {
  const error: ApiErrorBody = { message };
  if (opts?.code) error.code = opts.code;
  if (opts?.details !== undefined) error.details = opts.details;
  return NextResponse.json(
    { ok: false as const, error },
    { status, ...opts?.init },
  );
}

/** Parse a standard error message from a JSON body (client-side). */
export function apiErrorMessageFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.ok === false && o.error && typeof o.error === "object") {
    const e = o.error as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
  }
  return null;
}

/** When `res.ok`, read `data` from a success envelope; otherwise undefined. */
export function unwrapApiSuccessData<T>(body: unknown): T | undefined {
  if (!body || typeof body !== "object") return undefined;
  const o = body as Partial<ApiSuccessEnvelope<T>>;
  if (o.ok === true && o.data !== undefined) return o.data;
  return undefined;
}
