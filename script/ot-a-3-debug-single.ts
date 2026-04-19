/**
 * Debug single case for OT-A.3 new path. Captures full error from streamObject.
 */
import { streamObject } from "ai";
import { getAiSdkAnthropic } from "../server/ai/ai-sdk-clients";
import { SynthesisOutputSchema } from "../server/ai/synthesis-schema";

const SYNTHESIS_MODEL = "claude-opus-4-6";

const SYSTEM_PROMPT_LEGACY = `You are the H+ Analytics synthesis engine. Output JSON in legacy shape: { "adrAnalysis": {"recommendedRange": "$NNN-$NNN"}, ... }. Do not output text outside JSON code block.`;

const SYSTEM_PROMPT_NEUTRAL = `You are the H+ Analytics synthesis engine. Produce structured property research for an L+B Hospitality boutique-luxury hotel. Cite at least one source per quantitative value. Use boutique-luxury benchmarks. Be concise.`;

const USER_PROMPT = `Market: Charleston, SC. Property: 32-room historic mansion conversion, oceanfront, ADR target $450, opening Q2 2027. Brand: L+B boutique-luxury, USALI 11th edition, US tax. Synthesize a consolidated research report.`;

async function attempt(label: string, systemPrompt: string) {
  console.log(`\n========== ${label} ==========`);
  console.log(`system prompt length: ${systemPrompt.length}`);
  try {
    const result = streamObject({
      model: getAiSdkAnthropic()(SYNTHESIS_MODEL),
      schema: SynthesisOutputSchema,
      messages: [
        { role: "system", content: systemPrompt, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
        { role: "user", content: USER_PROMPT },
      ],
      maxOutputTokens: 4096,
    });
    let lastPartial: any = null;
    for await (const partial of result.partialObjectStream) {
      lastPartial = partial;
    }
    const obj = await result.object;
    console.log(`SUCCESS — values count=${obj.values.length}, narrative count=${obj.narrative?.length ?? 0}`);
    console.log(`first value:`, JSON.stringify(obj.values[0], null, 2));
    console.log(`overall:`, JSON.stringify(obj.overall, null, 2));
  } catch (err: any) {
    console.log(`FAILED:`);
    console.log(`  name: ${err?.name}`);
    console.log(`  message: ${err?.message?.slice(0, 800)}`);
    if (err?.cause) console.log(`  cause: ${JSON.stringify(err.cause).slice(0, 800)}`);
    if (err?.text) console.log(`  text returned by model: ${String(err.text).slice(0, 1500)}`);
    if (err?.value) console.log(`  parsed value: ${JSON.stringify(err.value).slice(0, 1500)}`);
    if (err?.issues) console.log(`  issues: ${JSON.stringify(err.issues).slice(0, 1500)}`);
    if (err?.response) console.log(`  response: ${JSON.stringify(err.response).slice(0, 800)}`);
  }
}

(async () => {
  await attempt("LEGACY system prompt + Zod schema", SYSTEM_PROMPT_LEGACY);
  await attempt("NEUTRAL system prompt + Zod schema", SYSTEM_PROMPT_NEUTRAL);
})();
