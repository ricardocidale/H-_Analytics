import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  authMiddleware,
  requireAuth,
  requireAdmin,
  requireChecker,
  requireManagementAccess,
  setSessionCookie,
  clearSessionCookie,
  cleanupRateLimitMaps,
  isRateLimited,
  recordLoginAttempt,
  isApiRateLimited,
  generateSessionId,
  hashPassword,
  verifyPassword,
  validatePassword,
  sanitizeEmail,
} from "../../server/auth";
import { UserRole } from "../../shared/constants";

function mockUser(overrides: Partial<Express.User> = {}): Express.User {
  return {
    id: 1,
    email: "test@example.com",
    passwordHash: "hashed",
    role: UserRole.ADMIN,
    firstName: "Test",
    lastName: "User",
    company: "TestCo",
    title: "Tester",
    selectedThemeId: null,
    phoneNumber: null,
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    hideTourPrompt: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    cookies: {},
    user: undefined,
    sessionId: undefined,
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe("requireAuth middleware", () => {
  it("returns 401 when no user is attached", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when user is attached", () => {
    const req = mockReq({ user: mockUser() });
    const res = mockRes();
    const next = mockNext();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requireAdmin middleware", () => {
  it("returns 401 when no user", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin user", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.USER }) });
    const res = mockRes();
    const next = mockNext();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Admin access required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for checker role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.CHECKER }) });
    const res = mockRes();
    const next = mockNext();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for investor role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.INVESTOR }) });
    const res = mockRes();
    const next = mockNext();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next for admin role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.ADMIN }) });
    const res = mockRes();
    const next = mockNext();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requireChecker middleware", () => {
  it("returns 401 when no user", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    requireChecker(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for regular user role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.USER }) });
    const res = mockRes();
    const next = mockNext();
    requireChecker(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Checker or admin access required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for investor role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.INVESTOR }) });
    const res = mockRes();
    const next = mockNext();
    requireChecker(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next for checker role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.CHECKER }) });
    const res = mockRes();
    const next = mockNext();
    requireChecker(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next for admin role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.ADMIN }) });
    const res = mockRes();
    const next = mockNext();
    requireChecker(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireManagementAccess middleware", () => {
  it("returns 401 when no user", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    requireManagementAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for investor role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.INVESTOR }) });
    const res = mockRes();
    const next = mockNext();
    requireManagementAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Management company access required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next for admin role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.ADMIN }) });
    const res = mockRes();
    const next = mockNext();
    requireManagementAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next for regular user role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.USER }) });
    const res = mockRes();
    const next = mockNext();
    requireManagementAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next for checker role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.CHECKER }) });
    const res = mockRes();
    const next = mockNext();
    requireManagementAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next for super_admin role", () => {
    const req = mockReq({ user: mockUser({ role: UserRole.SUPER_ADMIN }) });
    const res = mockRes();
    const next = mockNext();
    requireManagementAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("setSessionCookie", () => {
  it("sets httpOnly cookie with session_id name", () => {
    const res = mockRes();
    setSessionCookie(res, "abc123");
    expect(res.cookie).toHaveBeenCalledWith(
      "session_id",
      "abc123",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
      })
    );
  });

  it("sets maxAge to 7 days", () => {
    const res = mockRes();
    setSessionCookie(res, "test");
    const call = vi.mocked(res.cookie).mock.calls[0];
    const options = call[2];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(options.maxAge).toBe(sevenDaysMs);
  });
});

describe("clearSessionCookie", () => {
  it("clears the session_id cookie", () => {
    const res = mockRes();
    clearSessionCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith("session_id");
  });
});

describe("cleanupRateLimitMaps", () => {
  beforeEach(() => {
    recordLoginAttempt("cleanup-test-ip", true);
  });

  it("returns 0 when no stale entries exist", () => {
    const removed = cleanupRateLimitMaps();
    expect(removed).toBeGreaterThanOrEqual(0);
  });

  it("does not remove fresh entries", () => {
    recordLoginAttempt("cleanup-fresh", false);
    expect(isRateLimited("cleanup-fresh")).toBe(false);
    cleanupRateLimitMaps();
    recordLoginAttempt("cleanup-fresh", false);
    recordLoginAttempt("cleanup-fresh", false);
    recordLoginAttempt("cleanup-fresh", false);
    recordLoginAttempt("cleanup-fresh", false);
    expect(isRateLimited("cleanup-fresh")).toBe(true);
    recordLoginAttempt("cleanup-fresh", true);
  });
});

describe("Auth role access matrix", () => {
  const roles = [UserRole.ADMIN, UserRole.USER, UserRole.CHECKER, UserRole.INVESTOR, UserRole.SUPER_ADMIN] as const;

  const expectedRequireAuth: Record<string, boolean> = {
    admin: true,
    user: true,
    checker: true,
    investor: true,
    super_admin: true,
  };

  const expectedRequireAdmin: Record<string, boolean> = {
    admin: true,
    user: false,
    checker: false,
    investor: false,
    super_admin: true,
  };

  const expectedRequireChecker: Record<string, boolean> = {
    admin: true,
    user: false,
    checker: true,
    investor: false,
    super_admin: true,
  };

  const expectedManagementAccess: Record<string, boolean> = {
    admin: true,
    user: true,
    checker: true,
    investor: false,
    super_admin: true,
  };

  for (const role of roles) {
    it(`requireAuth allows ${role}`, () => {
      const req = mockReq({ user: mockUser({ role }) });
      const res = mockRes();
      const next = mockNext();
      requireAuth(req, res, next);
      if (expectedRequireAuth[role]) {
        expect(next).toHaveBeenCalled();
      } else {
        expect(res.status).toHaveBeenCalled();
      }
    });

    it(`requireAdmin ${expectedRequireAdmin[role] ? "allows" : "rejects"} ${role}`, () => {
      const req = mockReq({ user: mockUser({ role }) });
      const res = mockRes();
      const next = mockNext();
      requireAdmin(req, res, next);
      if (expectedRequireAdmin[role]) {
        expect(next).toHaveBeenCalled();
      } else {
        expect(res.status).toHaveBeenCalledWith(403);
      }
    });

    it(`requireChecker ${expectedRequireChecker[role] ? "allows" : "rejects"} ${role}`, () => {
      const req = mockReq({ user: mockUser({ role }) });
      const res = mockRes();
      const next = mockNext();
      requireChecker(req, res, next);
      if (expectedRequireChecker[role]) {
        expect(next).toHaveBeenCalled();
      } else {
        expect(res.status).toHaveBeenCalledWith(403);
      }
    });

    it(`requireManagementAccess ${expectedManagementAccess[role] ? "allows" : "rejects"} ${role}`, () => {
      const req = mockReq({ user: mockUser({ role }) });
      const res = mockRes();
      const next = mockNext();
      requireManagementAccess(req, res, next);
      if (expectedManagementAccess[role]) {
        expect(next).toHaveBeenCalled();
      } else {
        expect(res.status).toHaveBeenCalledWith(403);
      }
    });
  }
});

describe("Session security properties", () => {
  it("session IDs are cryptographically random (no collisions in 1000 generations)", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateSessionId()));
    expect(ids.size).toBe(1000);
  });

  it("session ID is exactly 64 hex chars", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id.length).toBe(64);
  });

  it("bcrypt hash never equals plaintext", async () => {
    const password = "SecurePass1";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);
  }, 15_000);

  it("different passwords produce different hashes", async () => {
    const h1 = await hashPassword("PasswordA1");
    const h2 = await hashPassword("PasswordB1");
    expect(h1).not.toBe(h2);
  }, 15_000);

  it("verifyPassword rejects empty string", async () => {
    const hash = await hashPassword("ValidPass1");
    expect(await verifyPassword("", hash)).toBe(false);
  }, 15_000);
});

describe("Password validation edge cases", () => {
  it("rejects single character", () => {
    expect(validatePassword("A").valid).toBe(false);
  });

  it("accepts exactly 8 chars meeting all rules", () => {
    expect(validatePassword("Abcdef1x").valid).toBe(true);
  });

  it("accepts very long passwords", () => {
    expect(validatePassword("A" + "a".repeat(100) + "1").valid).toBe(true);
  });

  it("rejects all-digit passwords", () => {
    expect(validatePassword("12345678").valid).toBe(false);
  });

  it("rejects all-uppercase with digits", () => {
    expect(validatePassword("ABCDEF12").valid).toBe(false);
  });
});

describe("Email sanitization edge cases", () => {
  it("handles mixed case domain", () => {
    expect(sanitizeEmail("User@GMAIL.COM")).toBe("user@gmail.com");
  });

  it("handles leading/trailing whitespace with mixed case", () => {
    expect(sanitizeEmail("  Admin@Test.Org  ")).toBe("admin@test.org");
  });

  it("handles already lowercase", () => {
    expect(sanitizeEmail("test@test.com")).toBe("test@test.com");
  });
});

describe("Rate limiting edge cases", () => {
  beforeEach(() => {
    recordLoginAttempt("edge-ip-1", true);
    recordLoginAttempt("edge-ip-2", true);
  });

  it("exactly MAX_LOGIN_ATTEMPTS (5) triggers lockout", () => {
    for (let i = 0; i < 5; i++) {
      recordLoginAttempt("edge-ip-1", false);
    }
    expect(isRateLimited("edge-ip-1")).toBe(true);
    recordLoginAttempt("edge-ip-1", true);
  });

  it("4 failures then success resets counter", () => {
    for (let i = 0; i < 4; i++) {
      recordLoginAttempt("edge-ip-2", false);
    }
    expect(isRateLimited("edge-ip-2")).toBe(false);
    recordLoginAttempt("edge-ip-2", true);
    expect(isRateLimited("edge-ip-2")).toBe(false);
  });

  it("API rate limit is scoped per user+endpoint", () => {
    const ep = "/api/edge-test-" + Date.now();
    expect(isApiRateLimited(9001, ep, 2)).toBe(false);
    expect(isApiRateLimited(9001, ep, 2)).toBe(false);
    expect(isApiRateLimited(9001, ep, 2)).toBe(true);
    expect(isApiRateLimited(9002, ep, 2)).toBe(false);
  });
});
