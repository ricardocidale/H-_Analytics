/**
 * Phase B bracket-mix feature flag tests
 *
 * U5 of the ICP bracket-mix peer-derived rebuild plan. Verifies that
 * `isPhaseBBracketMixEnabled()` interprets the env var explicitly and
 * defaults correctly per environment (on for dev/staging/test, off for
 * production).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPhaseBBracketMixEnabled } from "../services/bracketMix/featureFlag";

// These tests manipulate process.env in `beforeEach` to exercise both branches
// of `isProductionDeployment()`. Only the env vars this suite actually mutates
// are saved/restored — Replit-specific signals are deliberately excluded so the
// `check:replit-independence` gate stays clean.
const ORIGINAL_PHASE_B = process.env.BRACKET_MIX_PHASE_B;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_RAILWAY = process.env.RAILWAY_SERVICE_ID;

function reset(): void {
  delete process.env.BRACKET_MIX_PHASE_B;
  delete process.env.NODE_ENV;
  delete process.env.RAILWAY_SERVICE_ID;
}

beforeEach(reset);

afterEach(() => {
  reset();
  if (ORIGINAL_PHASE_B !== undefined) process.env.BRACKET_MIX_PHASE_B = ORIGINAL_PHASE_B;
  if (ORIGINAL_NODE_ENV !== undefined) process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_RAILWAY !== undefined) process.env.RAILWAY_SERVICE_ID = ORIGINAL_RAILWAY;
});

describe("isPhaseBBracketMixEnabled — explicit env-var values", () => {
  it.each(["on", "ON", "true", "True", "1"])("'%s' → enabled", (value) => {
    process.env.BRACKET_MIX_PHASE_B = value;
    process.env.NODE_ENV = "production";
    expect(isPhaseBBracketMixEnabled()).toBe(true);
  });

  it.each(["off", "OFF", "false", "False", "0"])("'%s' → disabled", (value) => {
    process.env.BRACKET_MIX_PHASE_B = value;
    expect(isPhaseBBracketMixEnabled()).toBe(false);
  });
});

describe("isPhaseBBracketMixEnabled — default behaviour by environment", () => {
  it("unset env var + production NODE_ENV → disabled (R12)", () => {
    process.env.NODE_ENV = "production";
    expect(isPhaseBBracketMixEnabled()).toBe(false);
  });

  it("unset env var + development NODE_ENV → enabled (gather diff data)", () => {
    process.env.NODE_ENV = "development";
    expect(isPhaseBBracketMixEnabled()).toBe(true);
  });

  it("unset env var + test NODE_ENV → enabled", () => {
    process.env.NODE_ENV = "test";
    expect(isPhaseBBracketMixEnabled()).toBe(true);
  });

  it("unset env var + no NODE_ENV → enabled (dev default)", () => {
    expect(isPhaseBBracketMixEnabled()).toBe(true);
  });
});

describe("isPhaseBBracketMixEnabled — explicit value wins over default", () => {
  it("env=on overrides production default", () => {
    process.env.NODE_ENV = "production";
    process.env.BRACKET_MIX_PHASE_B = "on";
    expect(isPhaseBBracketMixEnabled()).toBe(true);
  });

  it("env=off overrides dev default", () => {
    process.env.NODE_ENV = "development";
    process.env.BRACKET_MIX_PHASE_B = "off";
    expect(isPhaseBBracketMixEnabled()).toBe(false);
  });
});
