/**
 * csrf middleware tests
 *
 * Covers both exports of `middleware/csrf.ts`:
 *
 *   - csrfTokenGuard (per-route)        — hard 403 on missing/invalid token
 *   - csrfGuardForAdminWrites (global)  — path-matched, mode-aware. In "report"
 *                                         mode logs and passes through; in
 *                                         "enforce" mode behaves like the
 *                                         per-route guard.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { csrfTokenGuard, csrfGuardForAdminWrites } from "../../middleware/csrf";
import { csrfTokenFor } from "../../auth";

function makeReq(opts: {
  method?: string;
  path?: string;
  headerToken?: string;
  cookieToken?: string;
  sessionId?: string;
}): Request {
  const cookieParts: string[] = [];
  if (opts.sessionId) cookieParts.push(`session_id=${opts.sessionId}`);
  if (opts.cookieToken) cookieParts.push(`csrf_token=${opts.cookieToken}`);
  return {
    method: opts.method ?? "POST",
    path: opts.path ?? "/api/admin/users",
    headers: {
      cookie: cookieParts.join("; "),
      ...(opts.headerToken ? { "x-csrf-token": opts.headerToken } : {}),
    },
    user: undefined,
  } as unknown as Request;
}

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res as Response);
  res.json = vi.fn().mockReturnValue(res as Response);
  return res as Response;
}

describe("csrfTokenGuard", () => {
  let next: NextFunction;
  beforeEach(() => {
    next = vi.fn();
  });

  it("rejects requests with no x-csrf-token header", () => {
    const req = makeReq({ cookieToken: "abc" });
    const res = makeRes();
    csrfTokenGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests where header does not match HMAC of session id", () => {
    const sessionId = "sess-1";
    const req = makeReq({
      sessionId,
      headerToken: "wrong-token",
      cookieToken: csrfTokenFor(sessionId),
    });
    const res = makeRes();
    csrfTokenGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts requests where header matches HMAC of session id", () => {
    const sessionId = "sess-1";
    const expected = csrfTokenFor(sessionId);
    const req = makeReq({
      sessionId,
      headerToken: expected,
      cookieToken: expected,
    });
    const res = makeRes();
    csrfTokenGuard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("accepts double-submit (header === cookie) when no session id is present", () => {
    const token = "double-submit-value";
    const req = makeReq({ headerToken: token, cookieToken: token });
    const res = makeRes();
    csrfTokenGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("csrfGuardForAdminWrites", () => {
  let next: NextFunction;
  beforeEach(() => {
    next = vi.fn();
  });

  it("passes through safe methods (GET)", () => {
    const mw = csrfGuardForAdminWrites({ mode: "enforce" });
    const req = makeReq({ method: "GET", path: "/api/admin/users" });
    const res = makeRes();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes through non-admin paths", () => {
    const mw = csrfGuardForAdminWrites({ mode: "enforce" });
    const req = makeReq({ method: "POST", path: "/api/properties" });
    const res = makeRes();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  describe("report mode", () => {
    it("logs and passes through requests missing the header", () => {
      const mw = csrfGuardForAdminWrites({ mode: "report" });
      const req = makeReq({ method: "POST", path: "/api/admin/users" });
      const res = makeRes();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("passes through valid requests without logging a rejection", () => {
      const mw = csrfGuardForAdminWrites({ mode: "report" });
      const sessionId = "sess-r";
      const expected = csrfTokenFor(sessionId);
      const req = makeReq({
        method: "POST",
        path: "/api/admin/users",
        sessionId,
        headerToken: expected,
        cookieToken: expected,
      });
      const res = makeRes();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("enforce mode", () => {
    it("rejects admin writes missing the header with 403", () => {
      const mw = csrfGuardForAdminWrites({ mode: "enforce" });
      const req = makeReq({ method: "POST", path: "/api/admin/users" });
      const res = makeRes();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("accepts admin writes with a valid header", () => {
      const mw = csrfGuardForAdminWrites({ mode: "enforce" });
      const sessionId = "sess-e";
      const expected = csrfTokenFor(sessionId);
      const req = makeReq({
        method: "POST",
        path: "/api/admin/users",
        sessionId,
        headerToken: expected,
        cookieToken: expected,
      });
      const res = makeRes();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects writes where header does not match HMAC of session id", () => {
      const mw = csrfGuardForAdminWrites({ mode: "enforce" });
      const sessionId = "sess-bad";
      const req = makeReq({
        method: "POST",
        path: "/api/admin/users",
        sessionId,
        headerToken: "forged-token",
        cookieToken: csrfTokenFor(sessionId),
      });
      const res = makeRes();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
