import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendError,
  logAndSendError,
  fullName,
  userResponse,
  loginSchema,
  createUserSchema,
  createScenarioSchema,
  researchGenerateSchema,
  MAX_SCENARIOS_PER_USER,
  VALID_RESEARCH_TYPES,
} from "../../server/routes/helpers";

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// sendError
// ---------------------------------------------------------------------------
describe("sendError", () => {
  it("calls res.status and res.json with the correct arguments", () => {
    const res = mockRes();
    sendError(res, 400, "Bad request");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Bad request" });
  });

  it("works with 404 status", () => {
    const res = mockRes();
    sendError(res, 404, "Not found");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Not found" });
  });
});

// ---------------------------------------------------------------------------
// logAndSendError
// ---------------------------------------------------------------------------
describe("logAndSendError", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs via structured logger and sends a 500 response", () => {
    const res = mockRes();
    const err = new Error("boom");
    logAndSendError(res, "Failed", err);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR]"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Failed: boom"),
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed" });
  });

  it("logs with domain source when provided", () => {
    const res = mockRes();
    const err = new Error("timeout");
    logAndSendError(res, "Request failed", err, "api");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("[api]"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Request failed: timeout"),
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("handles non-Error objects as the error argument", () => {
    const res = mockRes();
    logAndSendError(res, "Something broke", "string error");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Something broke: string error"),
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// fullName
// ---------------------------------------------------------------------------
describe("fullName", () => {
  it("returns 'John Doe' when both names are present", () => {
    expect(fullName({ firstName: "John", lastName: "Doe" })).toBe("John Doe");
  });

  it("returns first name only when lastName is missing", () => {
    expect(fullName({ firstName: "John" })).toBe("John");
  });

  it("returns last name only when firstName is missing", () => {
    expect(fullName({ lastName: "Doe" })).toBe("Doe");
  });

  it("returns null when both names are empty/missing", () => {
    expect(fullName({})).toBeNull();
  });

  it("returns null when both names are null", () => {
    expect(fullName({ firstName: null, lastName: null })).toBeNull();
  });

  it("ignores empty strings (treated as falsy by filter(Boolean))", () => {
    expect(fullName({ firstName: "", lastName: "" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// userResponse
// ---------------------------------------------------------------------------
describe("userResponse", () => {
  const mockUser = {
    id: 42,
    email: "test@example.com",
    firstName: "Jane",
    lastName: "Smith",
    company: "Acme Corp",
    title: "CFO",
    role: "user",
    passwordHash: "supersecret_hash_should_not_appear",
    hideTourPrompt: true,
  };

  it("includes expected public fields", () => {
    const result = userResponse(mockUser);
    expect(result.id).toBe(42);
    expect(result.email).toBe("test@example.com");
    expect(result.firstName).toBe("Jane");
    expect(result.lastName).toBe("Smith");
    expect(result.name).toBe("Jane Smith");
    expect(result.company).toBe("Acme Corp");
    expect(result.title).toBe("CFO");
    expect(result.role).toBe("user");
    expect(result.hideTourPrompt).toBe(true);
  });

  it("strips passwordHash from the response", () => {
    const result = userResponse(mockUser);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("defaults hideTourPrompt to false when missing", () => {
    const result = userResponse({ id: 1, email: "a@b.com", role: "admin" });
    expect(result.hideTourPrompt).toBe(false);
  });

  it("merges extra fields when provided", () => {
    const result = userResponse(mockUser, { token: "abc123" });
    expect(result.token).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({ email: "admin", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "admin", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ email: "admin" }).success).toBe(false);
    expect(loginSchema.safeParse({ password: "x" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createUserSchema
// ---------------------------------------------------------------------------
describe("createUserSchema", () => {
  it("accepts valid user with all optional fields", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      password: "longpassword",
      firstName: "John",
      lastName: "Doe",
      company: "Acme",
      title: "CEO",
      role: "admin",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal valid input (email + password) and defaults role to user", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      password: "longpassword",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("user");
    }
  });

  it("rejects invalid email format", () => {
    const result = createUserSchema.safeParse({
      email: "not-an-email",
      password: "longpassword",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role enum value", () => {
    const result = createUserSchema.safeParse({
      email: "user@example.com",
      password: "longpassword",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid role values", () => {
    for (const role of ["admin", "user", "checker", "investor"]) {
      const result = createUserSchema.safeParse({
        email: "u@e.com",
        password: "longpassword",
        role,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// createScenarioSchema
// ---------------------------------------------------------------------------
describe("createScenarioSchema", () => {
  it("accepts valid name with description", () => {
    const result = createScenarioSchema.safeParse({
      name: "Optimistic Case",
      description: "Higher ADR growth",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid name without description", () => {
    const result = createScenarioSchema.safeParse({ name: "Base" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createScenarioSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 60 characters", () => {
    const result = createScenarioSchema.safeParse({ name: "x".repeat(61) });
    expect(result.success).toBe(false);
  });

  it("accepts name at exactly 60 characters", () => {
    const result = createScenarioSchema.safeParse({ name: "x".repeat(60) });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// researchGenerateSchema
// ---------------------------------------------------------------------------
describe("researchGenerateSchema", () => {
  it("accepts valid property research request", () => {
    const result = researchGenerateSchema.safeParse({
      type: "property",
      propertyId: 1,
      propertyContext: { name: "Hotel X" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal request with just type", () => {
    const result = researchGenerateSchema.safeParse({ type: "global" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = researchGenerateSchema.safeParse({ type: "invalid" });
    expect(result.success).toBe(false);
  });

  it("accepts researchVariables with all optional sub-fields", () => {
    const result = researchGenerateSchema.safeParse({
      type: "company",
      researchVariables: {
        focusAreas: ["market", "competition"],
        regions: ["North America"],
        timeHorizon: "5 years",
        customQuestions: "What about wellness?",
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("constants", () => {
  it("MAX_SCENARIOS_PER_USER is 20", () => {
    expect(MAX_SCENARIOS_PER_USER).toBe(20);
  });

  it("VALID_RESEARCH_TYPES contains the three research types", () => {
    expect(VALID_RESEARCH_TYPES).toEqual(["property", "company", "global"]);
  });
});
