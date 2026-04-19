/**
 * tests/ai/ai-sdk-client.smoke.test.ts
 *
 * Throwaway end-to-end connectivity smoke for OT-A.2. Proves a single round
 * trip works through the new Vercel AI SDK + Gateway wrapper. Deleted in
 * OT-A.4 once the SDK is the default synthesis path.
 *
 * Skipped when:
 *   - AI_GATEWAY_API_KEY is missing (environments not yet onboarded), or
 *   - the Gateway host is unreachable from the worker (sandboxed CI runners).
 * Both conditions keep this from gating CI on environments that can't reach
 * the live Gateway. A direct `node -e` invocation will still verify the
 * wrapper works in environments that have full egress.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateText } from "ai";
import { getAiSdkGoogle } from "../../server/ai/ai-sdk-clients";

const GATEWAY_HOST = "https://ai-gateway.vercel.sh/v1";
const hasKey = !!process.env.AI_GATEWAY_API_KEY;

let gatewayReachable = false;

beforeAll(async () => {
  if (!hasKey) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(GATEWAY_HOST, { method: "GET", signal: ctrl.signal });
    clearTimeout(t);
    // Any HTTP response (even 404) means TLS + DNS + routing all work.
    gatewayReachable = !!res;
  } catch {
    gatewayReachable = false;
  }
});

describe.skipIf(!hasKey)("ai-sdk-clients smoke (OT-A.2)", () => {
  it("Gemini Flash via Gateway answers '2 + 2'", async () => {
    if (!gatewayReachable) {
      console.warn("[smoke] Gateway host unreachable from worker — skipping live call.");
      return;
    }
    const google = getAiSdkGoogle();
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: "What is 2 + 2? Respond with just the number.",
      maxOutputTokens: 16,
    });

    expect(result.text).toMatch(/4/);
  }, 30_000);
});
