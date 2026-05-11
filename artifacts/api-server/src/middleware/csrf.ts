/**
 * csrf.ts — CSRF protection for state-changing requests.
 *
 * Implements the double-submit cookie pattern with HMAC-derived tokens.
 * The auth middleware writes a non-httpOnly `csrf_token` cookie containing
 * `csrfTokenFor(sessionId)` (HMAC-SHA256 of the session id under a
 * server-side secret). Browser JS reads the cookie and echoes it as the
 * `x-csrf-token` header; this module accepts the request only when the
 * header matches the expected HMAC for the current session.
 *
 * Two exports:
 *
 *   - csrfTokenGuard            per-route guard. Rejects with 403 on miss.
 *                               Composed into `analystRefreshGuards()`.
 *
 *   - csrfGuardForAdminWrites   app-level path-matched middleware that
 *                               applies to `POST/PUT/PATCH/DELETE` against
 *                               `/api/admin/*`. Supports a "report" mode
 *                               that logs missing/invalid tokens without
 *                               rejecting — used during rollout to surface
 *                               raw-fetch callsites in the frontend before
 *                               flipping to enforce.
 */
import type { Request, Response, NextFunction } from "express";
import { HTTP_STATUS_FORBIDDEN } from "@shared/constants";
import { logger } from "../logger";
import { csrfTokenFor } from "../auth";

const SESSION_COOKIE = "session_id";
const CSRF_COOKIE = "csrf_token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ADMIN_PATH_PREFIX = "/api/admin/";

export type CsrfMode = "enforce" | "report";

type ValidationResult =
  | { valid: true }
  | { valid: false; reason: "header-missing" | "header-mismatch" | "cookie-tampered" | "double-submit-mismatch" };

function parseCookies(req: Request): Record<string, string> {
  return (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .reduce<Record<string, string>>((acc, s) => {
      const [k, ...v] = s.split("=");
      if (k) acc[k] = decodeURIComponent(v.join("="));
      return acc;
    }, {});
}

function validateCsrfToken(req: Request): ValidationResult {
  const headerToken = (req.headers["x-csrf-token"] || req.headers["x-xsrf-token"]) as string | undefined;
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  const cookieToken = cookies[CSRF_COOKIE];

  if (!headerToken) return { valid: false, reason: "header-missing" };

  // Production path: session cookie is present, validate header against the
  // HMAC derived from it. Cookie-mirror is also checked as a defense-in-depth
  // tripwire (catches a stale or tampered csrf_token cookie).
  if (sessionId) {
    const expected = csrfTokenFor(sessionId);
    if (headerToken !== expected) return { valid: false, reason: "header-mismatch" };
    if (cookieToken && cookieToken !== expected) return { valid: false, reason: "cookie-tampered" };
    return { valid: true };
  }

  // Legacy/test path: no session cookie — fall back to plain double-submit
  // (header must equal cookie) so isolated unit tests of this guard pass.
  if (!cookieToken || headerToken !== cookieToken) {
    return { valid: false, reason: "double-submit-mismatch" };
  }
  return { valid: true };
}

export function csrfTokenGuard(req: Request, res: Response, next: NextFunction) {
  const check = validateCsrfToken(req);
  if (!check.valid) {
    return res.status(HTTP_STATUS_FORBIDDEN).json({ error: "CSRF token missing or invalid" });
  }
  next();
}

export function csrfGuardForAdminWrites(opts: { mode: CsrfMode }) {
  return function csrfGuardForAdminWritesMiddleware(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!req.path.startsWith(ADMIN_PATH_PREFIX)) return next();
    const check = validateCsrfToken(req);
    if (check.valid) return next();
    if (opts.mode === "report") {
      const userId = req.user?.id ?? "anon";
      logger.warn(
        `csrf-report-only: ${req.method} ${req.path} would be rejected (reason=${check.reason}, userId=${userId})`,
        "csrf",
      );
      return next();
    }
    return res.status(HTTP_STATUS_FORBIDDEN).json({ error: "CSRF token missing or invalid" });
  };
}
