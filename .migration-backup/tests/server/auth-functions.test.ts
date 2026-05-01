import { describe, it, expect, beforeEach } from "vitest";
import { validatePassword, isRateLimited, recordLoginAttempt, hashPassword, verifyPassword, sanitizeEmail, getSessionExpiryDate } from "../../server/auth";

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 chars", () => {
    const result = validatePassword("Ab1cdef");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("8");
  });

  it("accepts exactly 8 chars with all requirements", () => {
    const result = validatePassword("Abcdef1x");
    expect(result.valid).toBe(true);
  });

  it("rejects password without uppercase", () => {
    const result = validatePassword("abcdef12");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("uppercase");
  });

  it("rejects password without lowercase", () => {
    const result = validatePassword("ABCDEF12");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("lowercase");
  });

  it("rejects password without digit", () => {
    const result = validatePassword("Abcdefgh");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("number");
  });

  it("rejects empty string", () => {
    const result = validatePassword("");
    expect(result.valid).toBe(false);
  });

  it("accepts strong password", () => {
    const result = validatePassword("SecurePass123");
    expect(result.valid).toBe(true);
  });
});

describe("hashPassword and verifyPassword", () => {
  it("hashed password verifies correctly", async () => {
    const hash = await hashPassword("TestPass1");
    const result = await verifyPassword("TestPass1", hash);
    expect(result).toBe(true);
  }, 15_000);

  it("wrong password does not verify", async () => {
    const hash = await hashPassword("TestPass1");
    const result = await verifyPassword("WrongPass1", hash);
    expect(result).toBe(false);
  }, 15_000);
});

describe("sanitizeEmail", () => {
  it("lowercases email", () => {
    expect(sanitizeEmail("Admin@Example.COM")).toBe("admin@example.com");
  });

  it("trims whitespace", () => {
    expect(sanitizeEmail("  user@test.com  ")).toBe("user@test.com");
  });

  it("handles already clean email", () => {
    expect(sanitizeEmail("user@test.com")).toBe("user@test.com");
  });
});

describe("getSessionExpiryDate", () => {
  it("returns a date in the future", () => {
    const expiry = getSessionExpiryDate();
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns a date approximately 7 days from now", () => {
    const expiry = getSessionExpiryDate();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const diff = expiry.getTime() - Date.now();
    // Allow 10 second tolerance
    expect(Math.abs(diff - sevenDaysMs)).toBeLessThan(10000);
  });
});
