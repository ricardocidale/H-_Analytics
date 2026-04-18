/**
 * analyst-refresh-guards.ts — 7 composable security checks for the Analyst
 * Tables refresh endpoint. Each guard is exported individually so they can be
 * unit-tested in isolation, then composed into a single middleware
 * `analystRefreshGuards()` that runs them in order.
 *
 * Guards (in execution order):
 *   1. requireAdminGuard         — server-side admin role check (403)
 *   2. csrfTokenGuard            — `x-csrf-token` header must equal session id (403)
 *   3. perAdminRateLimitGuard    — ≤10 refreshes per rolling hour per admin (429)
 *   4. allowListGuard            — only known table IDs accepted (400)
 *   5. singleFlightGuard         — one in-flight refresh per tableId (409)
 *   6. auditPrepareGuard         — write a "pending" audit-log row immediately (6)
 *   7. suspiciousActivityTracker — bump banner if >5 refreshes in 10 min globally
 *
 * The audit log finalization happens in the route handler when the work
 * completes — the guard only opens the row.
 */
import type { Request, Response, NextFunction } from "express";
import { isAdminRole } from "@shared/constants";
import { storage } from "../storage";
import { logger } from "../logger";

export const ANALYST_TABLE_ALLOW_LIST = ["capital_raise_benchmarks", "exit_multiples"] as const;
export type AnalystTableId = typeof ANALYST_TABLE_ALLOW_LIST[number];

export const RATE_LIMIT_PER_HOUR = 10;
export const SUSPICIOUS_THRESHOLD = 5;
export const SUSPICIOUS_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const SUSPICIOUS_CLEAR_MS = 60 * 60 * 1000;  // 1 hour

// In-memory single-flight registry. Map<tableId, startedAt>.
const inFlight = new Map<string, number>();

// In-memory rate counters as a fallback (the audit log is the source of truth).
const adminRateCounters = new Map<number, number[]>();

export function clearGuardState() {
  inFlight.clear();
  adminRateCounters.clear();
}

export function getInFlight(tableId: string): number | undefined {
  return inFlight.get(tableId);
}

export function acquireInFlight(tableId: string): boolean {
  if (inFlight.has(tableId)) return false;
  inFlight.set(tableId, Date.now());
  return true;
}

export function releaseInFlight(tableId: string): void {
  inFlight.delete(tableId);
}

// ── Guard 1: admin role ─────────────────────────────────────────
export function requireAdminGuard(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (!isAdminRole(req.user.role)) return res.status(403).json({ error: "Admin access required" });
  next();
}

// ── Guard 2: CSRF token ─────────────────────────────────────────
// We use a double-submit pattern: the client must include the session cookie
// in a header (`x-csrf-token`) so cross-origin requests (which can't read
// cookies) cannot forge state-changing calls.
const SESSION_COOKIE = "session_id";
export function csrfTokenGuard(req: Request, res: Response, next: NextFunction) {
  const headerToken = (req.headers["x-csrf-token"] || req.headers["x-xsrf-token"]) as string | undefined;
  const cookies = (req.headers.cookie || "")
    .split(";")
    .map(s => s.trim())
    .reduce<Record<string, string>>((acc, s) => {
      const [k, ...v] = s.split("=");
      if (k) acc[k] = decodeURIComponent(v.join("="));
      return acc;
    }, {});
  const sessionToken = cookies[SESSION_COOKIE];
  if (!headerToken || !sessionToken || headerToken !== sessionToken) {
    return res.status(403).json({ error: "CSRF token missing or invalid" });
  }
  next();
}

// ── Guard 3: per-admin rate limit ───────────────────────────────
export async function perAdminRateLimitGuard(req: Request, res: Response, next: NextFunction) {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: "Authentication required" });
  try {
    const count = await storage.countAnalystRefreshAttempts({
      adminId,
      sinceMs: 60 * 60 * 1000,
    });
    if (count >= RATE_LIMIT_PER_HOUR) {
      res.setHeader("Retry-After", "3600");
      return res.status(429).json({
        error: "Rate limit exceeded: max 10 refreshes per hour",
        retryAfterSeconds: 3600,
      });
    }
  } catch (err) {
    // Fall back to in-memory counter if DB read fails — fail open isn't great,
    // but we still need a soft limit so the API doesn't fall down.
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000;
    const stamps = (adminRateCounters.get(adminId) ?? []).filter(t => t > windowStart);
    if (stamps.length >= RATE_LIMIT_PER_HOUR) {
      res.setHeader("Retry-After", "3600");
      return res.status(429).json({ error: "Rate limit exceeded", retryAfterSeconds: 3600 });
    }
    stamps.push(now);
    adminRateCounters.set(adminId, stamps);
    logger.warn(`analyst-refresh rate-limit DB read failed, using in-memory: ${String(err)}`, "analyst-refresh");
  }
  next();
}

// ── Guard 4: allow-list ─────────────────────────────────────────
export function allowListGuard(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id as string;
  if (!ANALYST_TABLE_ALLOW_LIST.includes(id as AnalystTableId)) {
    return res.status(400).json({ error: `Unknown table id: ${id}` });
  }
  next();
}

// ── Guard 5: single-flight concurrency ──────────────────────────
export function singleFlightGuard(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id as string;
  if (!acquireInFlight(id)) {
    return res.status(409).json({ error: `Refresh already in flight for ${id}` });
  }
  // Release on response finish so we never leak the lock.
  res.on("close", () => releaseInFlight(id));
  next();
}

// ── Guard 6: open audit-log row ─────────────────────────────────
// Stashes the row id on res.locals for the route to finalize.
export async function auditPrepareGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const tableId = req.params.id as string;
    const row = await storage.createAnalystRefreshAuditLog({
      tableId,
      adminId: req.user?.id ?? null,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      status: "pending",
    });
    res.locals.analystRefreshAuditId = row.id;
    next();
  } catch (err) {
    logger.error(`Failed to write analyst-refresh audit log: ${String(err)}`, "analyst-refresh");
    next(); // don't block the refresh
  }
}

// ── Guard 7: suspicious-pattern tracker ─────────────────────────
// Looks at *all* admins. If >SUSPICIOUS_THRESHOLD refreshes happen within
// SUSPICIOUS_WINDOW_MS, set lastSuspiciousAlertAt so the sidebar banner shows.
export async function suspiciousActivityTracker(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await storage.countAnalystRefreshAttempts({ sinceMs: SUSPICIOUS_WINDOW_MS });
    if (count > SUSPICIOUS_THRESHOLD) {
      await storage.updateAnalystRefreshSettings({ lastSuspiciousAlertAt: new Date() });
      logger.warn(`Suspicious analyst-refresh pattern detected: ${count} refreshes in 10min`, "analyst-refresh");
    }
  } catch (err) {
    logger.warn(`Suspicious tracker failed: ${String(err)}`, "analyst-refresh");
  }
  next();
}

// ── Composer ────────────────────────────────────────────────────
export function analystRefreshGuards() {
  return [
    requireAdminGuard,
    csrfTokenGuard,
    perAdminRateLimitGuard,
    allowListGuard,
    singleFlightGuard,
    auditPrepareGuard,
    suspiciousActivityTracker,
  ];
}
