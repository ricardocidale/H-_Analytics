/**
 * Tiago — Bracket-Mix Specialist
 *
 * Phase B U3 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * One LLM call per target (a single peer brand, or a Mgmt-Co's comp set),
 * grounded by GroundedResearchService (Tavily/Perplexity), produces:
 *   - brand-level archetype split (slug → weight, sums to 1.0)
 *   - roster-size estimate
 *   - 5–10 sample properties + citations
 *
 * Successful runs are persisted to `bracket_mix_runs` and (for peer runs)
 * the peer's `last_research_run_id` pointer is updated atomically in the
 * same transaction. Failures return `{ ok: false, errors }` cleanly —
 * never throw across the public API boundary.
 *
 * The barrel `index.ts` for this directory is deferred until a second
 * Specialist module lands (per the ce-doc-review handoff brief that
 * supersedes the Phase B plan on this point).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";

import { db as defaultDb } from "../../../db";
import { logger } from "../../../logger";
import {
  bracketMixRuns,
  icpPeerCompanies,
  icpBrackets,
  type InsertBracketMixRun,
  type BracketEntry,
  type BracketMixData,
  type BrandArchetypeSplit,
  type SplitEvidence,
} from "@workspace/db";
import { GroundedResearchService } from "../../../services/GroundedResearchService";
import { resolveLlmFor } from "../../llm-config-resolver";
import {
  getAnthropicClient,
  getOpenAIClient,
  getGeminiClient,
} from "../../clients";

const TAG = "[specialist:tiago]";

/** admin_resources llm_slot slug — admin retargetable. */
const TIAGO_LLM_SLOT = "tiago-bracket-mix-specialist";

/** R1: 5–10 sample properties per peer/comp-set is the citation bound. */
const MIN_SAMPLE_PROPERTIES = 5;
const MAX_SAMPLE_PROPERTIES = 10;

/** Float tolerance for "weights sum to 1.0". */
const WEIGHT_SUM_EPSILON = 1e-6;

/** Max output tokens for the structured LLM completion. */
const TIAGO_MAX_OUTPUT_TOKENS = 4096;

// ── Zod schema for the LLM's structured output (Carlo-style validation) ─────

const LlmOutputSchema = z.object({
  brandArchetypeSplit: z.object({
    entries: z
      .array(
        z.object({
          bracketSlug: z.string().min(1),
          weight: z.number().min(0).max(1),
        }),
      )
      .min(1),
  }),
  rosterSizeEstimate: z.number().int().nonnegative(),
  splitEvidence: z.object({
    citations: z.array(
      z.object({
        url: z.string().url(),
        title: z.string().optional(),
        snippet: z.string().optional(),
      }),
    ),
    sampleProperties: z
      .array(
        z.object({
          name: z.string().min(1),
          bracketSlug: z.string().optional(),
          url: z.string().url().optional(),
        }),
      )
      .min(MIN_SAMPLE_PROPERTIES)
      .max(MAX_SAMPLE_PROPERTIES),
  }),
});

type LlmOutput = z.infer<typeof LlmOutputSchema>;

// ── Public output / result shape ────────────────────────────────────────────

export interface BracketMixSpecialistOutput {
  brandArchetypeSplit: BrandArchetypeSplit;
  rosterSizeEstimate: number;
  splitEvidence: SplitEvidence;
  /** Full BracketMixData (hydrated from icp_brackets) ready for engine read. */
  mix: BracketMixData;
  /** Model id Tiago used for this run (admin_resources.config.modelId). */
  model: string;
}

export type TiagoResult =
  | { ok: true; runId: number; output: BracketMixSpecialistOutput }
  | { ok: false; errors: string[] };

// ── Injectable deps for testability ─────────────────────────────────────────

export interface TiagoDeps {
  db: typeof defaultDb;
  /** Returns search results for a list of queries. */
  groundedSearch: (queries: string[]) => Promise<
    Array<{ query: string; answer: string; sources: Array<{ url: string; title: string; snippet: string }> }>
  >;
  /** Returns the LLM's raw text response given system + user prompts. */
  callLlm: (args: {
    vendor: string;
    modelId: string;
    system: string;
    user: string;
  }) => Promise<string>;
  /** Returns the resolved llm_slot — admin-editable. */
  resolveLlm: () => Promise<{ vendor: string; modelId: string; modelSlug: string }>;
}

function defaultDeps(): TiagoDeps {
  return {
    db: defaultDb,
    groundedSearch: defaultGroundedSearch,
    callLlm: defaultCallLlm,
    resolveLlm: () => resolveLlmFor(TIAGO_LLM_SLOT),
  };
}

async function defaultGroundedSearch(
  queries: string[],
): Promise<
  Array<{ query: string; answer: string; sources: Array<{ url: string; title: string; snippet: string }> }>
> {
  const grs = new GroundedResearchService();
  if (!grs.isAvailable()) {
    throw new Error("GroundedResearchService unavailable (no Perplexity/Tavily key)");
  }
  const results = await grs.search(queries.map((query) => ({ query })));
  return results.map((r) => ({
    query: r.query,
    answer: r.answer,
    sources: (r.sources ?? []).map((s) => ({
      url: s.url,
      title: s.title,
      snippet: s.snippet,
    })),
  }));
}

async function defaultCallLlm(args: {
  vendor: string;
  modelId: string;
  system: string;
  user: string;
}): Promise<string> {
  const { vendor, modelId, system, user } = args;
  if (vendor === "anthropic") {
    const client = getAnthropicClient();
    const completion = await client.messages.create({
      model: modelId,
      max_tokens: TIAGO_MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    const block = completion.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }
  if (vendor === "openai") {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: modelId,
      max_tokens: TIAGO_MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  }
  if (vendor === "google") {
    const client = getGeminiClient();
    const completion = await client.models.generateContent({
      model: modelId,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: {
        systemInstruction: system,
        maxOutputTokens: TIAGO_MAX_OUTPUT_TOKENS,
      },
    });
    return completion.text ?? "";
  }
  throw new Error(`Unsupported LLM vendor for Tiago: "${vendor}"`);
}

// ── Prompt construction ─────────────────────────────────────────────────────

function buildSystemPrompt(activeBracketSlugs: readonly string[]): string {
  return [
    "You are Tiago, the H+ Analytics Bracket-Mix Specialist.",
    "Your job: estimate how a hospitality brand's property roster distributes across these archetype slugs:",
    activeBracketSlugs.map((s) => `  - ${s}`).join("\n"),
    "",
    "Rules:",
    "- Output a SINGLE JSON object with keys: brandArchetypeSplit, rosterSizeEstimate, splitEvidence.",
    `- splitEvidence.sampleProperties must contain ${MIN_SAMPLE_PROPERTIES}–${MAX_SAMPLE_PROPERTIES} real example properties.`,
    "- brandArchetypeSplit.entries[*].weight values must sum to 1.0 across all entries.",
    "- Only use bracketSlug values from the list above; ignore any other archetypes.",
    "- Every citations[*].url must be a real URL from the supplied grounded search results.",
    "- No prose outside the JSON object.",
  ].join("\n");
}

function buildPeerUserPrompt(
  peer: { name: string; nicheTags: string[] | null },
  searchAnswers: Array<{ query: string; answer: string; sources: Array<{ url: string; title: string; snippet: string }> }>,
): string {
  const tags = peer.nicheTags?.join(", ") ?? "(none)";
  const snippets = searchAnswers
    .map((r, i) => `Query ${i + 1}: ${r.query}\nAnswer: ${r.answer}\nSources:\n${r.sources.map((s) => `  - ${s.title} <${s.url}>: ${s.snippet}`).join("\n")}`)
    .join("\n\n");
  return [
    `Peer brand: ${peer.name}`,
    `Niche tags: ${tags}`,
    "",
    "Grounded research:",
    snippets || "(no grounded results returned)",
    "",
    "Produce the JSON object now.",
  ].join("\n");
}

function buildCompanyUserPrompt(
  compSetSlugs: readonly string[],
  searchAnswers: Array<{ query: string; answer: string; sources: Array<{ url: string; title: string; snippet: string }> }>,
): string {
  const snippets = searchAnswers
    .map((r, i) => `Query ${i + 1}: ${r.query}\nAnswer: ${r.answer}\nSources:\n${r.sources.map((s) => `  - ${s.title} <${s.url}>: ${s.snippet}`).join("\n")}`)
    .join("\n\n");
  return [
    `Mgmt-Co comp set: ${compSetSlugs.join(", ")}`,
    "",
    "Grounded research across this comp set's brands:",
    snippets || "(no grounded results returned)",
    "",
    "Produce the JSON object describing the COMBINED archetype mix across the comp set.",
  ].join("\n");
}

// ── Core helpers ────────────────────────────────────────────────────────────

function parseLlmOutput(raw: string): LlmOutput {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error("LLM output contains no JSON object");
  }
  const candidate = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(candidate);
  return LlmOutputSchema.parse(parsed);
}

function assertWeightsSumToOne(split: LlmOutput["brandArchetypeSplit"]): void {
  const total = split.entries.reduce((sum, e) => sum + e.weight, 0);
  if (Math.abs(total - 1) > WEIGHT_SUM_EPSILON) {
    throw new Error(`brandArchetypeSplit weights must sum to 1.0; got ${total}`);
  }
}

function hydrateBracketMix(
  split: LlmOutput["brandArchetypeSplit"],
  brackets: Array<{ slug: string; name: string; archetypeLabel: string; customerType: string }>,
  evidenceLabel: string,
): BracketMixData {
  const bySlug = new Map(brackets.map((b) => [b.slug, b]));
  const entries: BracketEntry[] = [];
  for (const entry of split.entries) {
    const bracket = bySlug.get(entry.bracketSlug);
    if (!bracket) continue; // unknown slug — silently skip per R3 deterministic skip rule
    entries.push({
      id: bracket.slug,
      name: bracket.name,
      archetypeLabel: bracket.archetypeLabel,
      serviceConsumption: bracket.customerType === "str" ? "str" : "hotel",
      weight: entry.weight,
    });
  }
  return {
    entries,
    assignedAt: new Date().toISOString(),
    evidence: evidenceLabel,
  };
}

async function fetchActiveBrackets(
  database: typeof defaultDb,
): Promise<Array<{ slug: string; name: string; archetypeLabel: string; customerType: string }>> {
  const rows = await database
    .select({
      slug: icpBrackets.slug,
      name: icpBrackets.name,
      archetypeLabel: icpBrackets.archetypeLabel,
      customerType: icpBrackets.customerType,
    })
    .from(icpBrackets)
    .where(eq(icpBrackets.isActive, true));
  return rows;
}

async function runGroundedAndLlm(args: {
  deps: TiagoDeps;
  queries: string[];
  systemPrompt: string;
  buildUserPrompt: (
    searchAnswers: Array<{
      query: string;
      answer: string;
      sources: Array<{ url: string; title: string; snippet: string }>;
    }>,
  ) => string;
}): Promise<{ output: LlmOutput; modelId: string; modelSlug: string }> {
  const { deps, queries, systemPrompt, buildUserPrompt } = args;

  const searchAnswers = await deps.groundedSearch(queries);
  const resolved = await deps.resolveLlm();
  const userPrompt = buildUserPrompt(searchAnswers);
  const raw = await deps.callLlm({
    vendor: resolved.vendor,
    modelId: resolved.modelId,
    system: systemPrompt,
    user: userPrompt,
  });
  const output = parseLlmOutput(raw);
  assertWeightsSumToOne(output.brandArchetypeSplit);
  return { output, modelId: resolved.modelId, modelSlug: resolved.modelSlug };
}

// ── Public entry points ─────────────────────────────────────────────────────

/**
 * Run Tiago against a single registered peer. Persists one
 * `bracket_mix_runs` row (kind='peer') and updates the peer's
 * `last_research_run_id` atomically.
 */
export async function runForPeer(
  peerId: number,
  deps: TiagoDeps = defaultDeps(),
): Promise<TiagoResult> {
  try {
    const [peer] = await deps.db
      .select({
        id: icpPeerCompanies.id,
        name: icpPeerCompanies.name,
        nicheTags: icpPeerCompanies.nicheTags,
      })
      .from(icpPeerCompanies)
      .where(eq(icpPeerCompanies.id, peerId));

    if (!peer) {
      return { ok: false, errors: [`peer ${peerId} not found`] };
    }

    const activeBrackets = await fetchActiveBrackets(deps.db);
    if (activeBrackets.length === 0) {
      return { ok: false, errors: ["no active icp_brackets to classify against"] };
    }

    const queries = [
      `${peer.name} hospitality brand property portfolio archetype mix sample properties`,
      `${peer.name} number of properties total roster size active`,
    ];

    const { output, modelId, modelSlug } = await runGroundedAndLlm({
      deps,
      queries,
      systemPrompt: buildSystemPrompt(activeBrackets.map((b) => b.slug)),
      buildUserPrompt: (searchAnswers) =>
        buildPeerUserPrompt({ name: peer.name, nicheTags: peer.nicheTags }, searchAnswers),
    });

    const mix = hydrateBracketMix(
      output.brandArchetypeSplit,
      activeBrackets,
      `Tiago run for peer "${peer.name}" via ${modelSlug}`,
    );

    const runId = await persistPeerRun({
      deps,
      peerId: peer.id,
      output,
      mix,
      model: modelId,
    });

    return {
      ok: true,
      runId,
      output: {
        brandArchetypeSplit: output.brandArchetypeSplit,
        rosterSizeEstimate: output.rosterSizeEstimate,
        splitEvidence: output.splitEvidence,
        mix,
        model: modelId,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${TAG} runForPeer(${peerId}) failed: ${msg}`);
    return { ok: false, errors: [msg] };
  }
}

/**
 * Run Tiago against a Mgmt-Co's comp set (collection of peer slugs).
 * Persists one `bracket_mix_runs` row (kind='company') and returns its
 * id so U6's override-set route can write it into
 * `global_assumptions.bracket_mix_override_run_id`.
 *
 * Caller-owned: the company-id binding to the run is established at
 * write-time by U6, not here — this entry point is comp-set-shaped
 * because that's what the LLM grounds on.
 */
export async function runForCompanyOverride(
  companyId: number,
  compSetSlugs: readonly string[],
  deps: TiagoDeps = defaultDeps(),
): Promise<TiagoResult> {
  try {
    if (compSetSlugs.length === 0) {
      return { ok: false, errors: ["compSetSlugs must contain at least one slug"] };
    }

    const activeBrackets = await fetchActiveBrackets(deps.db);
    if (activeBrackets.length === 0) {
      return { ok: false, errors: ["no active icp_brackets to classify against"] };
    }

    const queries = compSetSlugs.map(
      (slug) => `${slug} hospitality brand property portfolio archetype mix sample properties`,
    );

    const { output, modelId, modelSlug } = await runGroundedAndLlm({
      deps,
      queries,
      systemPrompt: buildSystemPrompt(activeBrackets.map((b) => b.slug)),
      buildUserPrompt: (searchAnswers) => buildCompanyUserPrompt(compSetSlugs, searchAnswers),
    });

    const mix = hydrateBracketMix(
      output.brandArchetypeSplit,
      activeBrackets,
      `Tiago run for company ${companyId} comp set [${compSetSlugs.join(", ")}] via ${modelSlug}`,
    );

    const runId = await persistCompanyRun({
      deps,
      companyId,
      output,
      mix,
      model: modelId,
    });

    return {
      ok: true,
      runId,
      output: {
        brandArchetypeSplit: output.brandArchetypeSplit,
        rosterSizeEstimate: output.rosterSizeEstimate,
        splitEvidence: output.splitEvidence,
        mix,
        model: modelId,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${TAG} runForCompanyOverride(${companyId}, [${compSetSlugs.join(", ")}]) failed: ${msg}`);
    return { ok: false, errors: [msg] };
  }
}

// ── Persistence (transactional) ─────────────────────────────────────────────

async function persistPeerRun(args: {
  deps: TiagoDeps;
  peerId: number;
  output: LlmOutput;
  mix: BracketMixData;
  model: string;
}): Promise<number> {
  const { deps, peerId, output, mix, model } = args;
  return deps.db.transaction(async (tx) => {
    const insert: InsertBracketMixRun = {
      targetKind: "peer",
      targetId: peerId,
      model,
      sources: output.splitEvidence,
      mixValue: mix,
      rosterSizeEstimate: output.rosterSizeEstimate,
      provisional: false,
    };
    const [row] = await tx
      .insert(bracketMixRuns)
      .values(insert)
      .returning({ id: bracketMixRuns.id });
    if (!row) throw new Error("bracket_mix_runs insert returned no rows");

    await tx
      .update(icpPeerCompanies)
      .set({
        brandArchetypeSplit: output.brandArchetypeSplit,
        rosterSizeEstimate: output.rosterSizeEstimate,
        splitEvidence: output.splitEvidence,
        lastResearchRunId: row.id,
        lastResearchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(icpPeerCompanies.id, peerId));

    return row.id;
  });
}

async function persistCompanyRun(args: {
  deps: TiagoDeps;
  companyId: number;
  output: LlmOutput;
  mix: BracketMixData;
  model: string;
}): Promise<number> {
  const { deps, companyId, output, mix, model } = args;
  return deps.db.transaction(async (tx) => {
    const insert: InsertBracketMixRun = {
      targetKind: "company",
      targetId: companyId,
      model,
      sources: output.splitEvidence,
      mixValue: mix,
      rosterSizeEstimate: output.rosterSizeEstimate,
      provisional: false,
    };
    const [row] = await tx
      .insert(bracketMixRuns)
      .values(insert)
      .returning({ id: bracketMixRuns.id });
    if (!row) throw new Error("bracket_mix_runs insert returned no rows");
    return row.id;
  });
}

// ── Test seam (named exports used only by tests) ───────────────────────────

export const __testing = {
  LlmOutputSchema,
  parseLlmOutput,
  assertWeightsSumToOne,
  hydrateBracketMix,
  TIAGO_LLM_SLOT,
  WEIGHT_SUM_EPSILON,
  MIN_SAMPLE_PROPERTIES,
  MAX_SAMPLE_PROPERTIES,
};
