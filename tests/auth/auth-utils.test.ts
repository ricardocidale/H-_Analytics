import { describe, it, expect, beforeEach } from "vitest";
import {
  isRateLimited,
  recordLoginAttempt,
  isApiRateLimited,
  validatePassword,
  sanitizeEmail,
  hashPassword,
  verifyPassword,
  generateSessionId,
  getSessionExpiryDate,
} from "../../server/auth";

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const result = validatePassword("Abc1234");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/8 characters/);
  });

  it("rejects passwords without uppercase", () => {
    const result = validatePassword("abcdefg1");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/uppercase/);
  });

  it("rejects passwords without lowercase", () => {
    const result = validatePassword("ABCDEFG1");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/lowercase/);
  });

  it("rejects passwords without a digit", () => {
    const result = validatePassword("Abcdefgh");
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/number/);
  });

  it("accepts valid passwords", () => {
    expect(validatePassword("Abcdefg1").valid).toBe(true);
    expect(validatePassword("P@ssw0rd").valid).toBe(true);
    expect(validatePassword("MyStr0ngPwd!xyz").valid).toBe(true);
  });
});

describe("sanitizeEmail", () => {
  it("lowercases email", () => {
    expect(sanitizeEmail("Admin@Example.COM")).toBe("admin@example.com");
  });

  it("trims whitespace", () => {
    expect(sanitizeEmail("  admin  ")).toBe("admin");
  });

  it("handles already clean emails", () => {
    expect(sanitizeEmail("user@test.com")).toBe("user@test.com");
  });
});

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies correctly", async () => {
    const hash = await hashPassword("TestPass1");
    expect(hash).not.toBe("TestPass1");
    expect(await verifyPassword("TestPass1", hash)).toBe(true);
  }, 15_000);

  it("rejects wrong password", async () => {
    const hash = await hashPassword("TestPass1");
    expect(await verifyPassword("WrongPass1", hash)).toBe(false);
  }, 15_000);

  it("produces different hashes for same password (salt)", async () => {
    const hash1 = await hashPassword("TestPass1");
    const hash2 = await hashPassword("TestPass1");
    expect(hash1).not.toBe(hash2);
  }, 15_000);
});

describe("generateSessionId", () => {
  it("produces 64-char hex string (32 bytes)", () => {
    const id = generateSessionId();
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    expect(ids.size).toBe(100);
  });
});

describe("getSessionExpiryDate", () => {
  it("returns a date 7 days in the future", () => {
    const before = Date.now();
    const expiry = getSessionExpiryDate();
    const after = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 100);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 100);
  });
});

describe("isRateLimited / recordLoginAttempt", () => {
  beforeEach(() => {
    // Clear rate limit state by recording a success for our test IPs
    recordLoginAttempt("test-ip-1", true);
    recordLoginAttempt("test-ip-2", true);
  });

  it("is not rate limited on first attempt", () => {
    expect(isRateLimited("fresh-ip")).toBe(false);
  });

  it("is not rate limited after 4 failed attempts", () => {
    for (let i = 0; i < 4; i++) {
      recordLoginAttempt("test-ip-1", false);
    }
    expect(isRateLimited("test-ip-1")).toBe(false);
  });

  it("is rate limited after 5 failed attempts", () => {
    for (let i = 0; i < 5; i++) {
      recordLoginAttempt("test-ip-1", false);
    }
    expect(isRateLimited("test-ip-1")).toBe(true);
  });

  it("resets on successful login", () => {
    for (let i = 0; i < 5; i++) {
      recordLoginAttempt("test-ip-1", false);
    }
    expect(isRateLimited("test-ip-1")).toBe(true);
    recordLoginAttempt("test-ip-1", true);
    expect(isRateLimited("test-ip-1")).toBe(false);
  });

  it("rate limits are per-IP (different IPs are independent)", () => {
    for (let i = 0; i < 5; i++) {
      recordLoginAttempt("test-ip-1", false);
    }
    expect(isRateLimited("test-ip-1")).toBe(true);
    expect(isRateLimited("test-ip-2")).toBe(false);
  });
});

describe("isApiRateLimited", () => {
  it("allows first request", () => {
    expect(isApiRateLimited(999, "/api/test-unique", 5)).toBe(false);
  });

  it("allows up to maxRequests", () => {
    const userId = 998;
    const endpoint = "/api/test-limit";
    for (let i = 0; i < 4; i++) {
      expect(isApiRateLimited(userId, endpoint, 5)).toBe(false);
    }
  });

  it("blocks after exceeding maxRequests", () => {
    const userId = 997;
    const endpoint = "/api/test-exceed";
    // First 5 are OK (count: 1 through 5)
    for (let i = 0; i < 5; i++) {
      isApiRateLimited(userId, endpoint, 5);
    }
    // 6th should be blocked (count > 5)
    expect(isApiRateLimited(userId, endpoint, 5)).toBe(true);
  });

  it("different endpoints have independent limits", () => {
    const userId = 996;
    for (let i = 0; i < 6; i++) {
      isApiRateLimited(userId, "/api/endpoint-a", 5);
    }
    expect(isApiRateLimited(userId, "/api/endpoint-a", 5)).toBe(true);
    expect(isApiRateLimited(userId, "/api/endpoint-b", 5)).toBe(false);
  });
});
