/**
 * Rebecca tool implementations — Phase B bracket-mix (R17)
 *
 * Each implementation here mirrors the four mutation routes added in U6:
 *
 *   regenerate_global_bracket_mix     → recomputeGlobalDefault()
 *   refresh_peer_bracket_mix          → tiago.runForPeer(peerId)
 *   set_company_bracket_mix_override  → tiago.runForCompanyOverride + writeEffectiveBracketMix(override-set)
 *   clear_company_bracket_mix_override → clearBracketMixOverride(companyId)
 *
 * Admin-only — all tools route through `requireAdminCtx(ctx)` first.
 *
 * The implementations call into the same services the HTTP routes use,
 * so the agent-native parity test (R17 build gate) verifies that every
 * mutation the UI exposes has a Rebecca tool equivalent.
 */
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { requireAdminCtx, requireNumericArg } from "./rebecca-tool-types";

import { runForPeer, runForCompanyOverride } from "../ai/ambient/specialists/tiago";
import { recomputeGlobalDefault } from "../services/bracketMix/recomputeGlobalDefault";
import {
  writeEffectiveBracketMix,
  clearBracketMixOverride,
} from "../services/bracketMix/effective";

type ToolReturn = {
  result: unknown;
  dataChanged?: DataChangedEntry;
};

export async function toolRegenerateGlobalBracketMix(
  ctx: ToolContext,
): Promise<ToolReturn> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const summary = await recomputeGlobalDefault();
  return {
    result: {
      phaseBRunId: summary.phaseBRunId,
      diffRowId: summary.diffRowId,
      phaseBProvisional: summary.phaseBProvisional,
      phaseBFlagEnabled: summary.phaseBFlagEnabled,
      globalAssumptionsUpdated: summary.globalAssumptionsUpdated,
      skippedOverrides: summary.skippedOverrides,
    },
    dataChanged: { entityType: "global_assumptions", entityId: 0 },
  };
}

export async function toolRefreshPeerBracketMix(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolReturn> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const peerArg = requireNumericArg(args, "peerId");
  if (!peerArg.ok) return peerArg.result;

  const result = await runForPeer(peerArg.value);
  if (!result.ok) {
    return { result: { error: result.errors.join("; ") } };
  }
  return {
    result: {
      peerId: peerArg.value,
      runId: result.runId,
      rosterSizeEstimate: result.output.rosterSizeEstimate,
      model: result.output.model,
    },
  };
}

export async function toolSetCompanyBracketMixOverride(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolReturn> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const companyArg = requireNumericArg(args, "companyId");
  if (!companyArg.ok) return companyArg.result;

  const rawSlugs = args["compSetSlugs"];
  if (!Array.isArray(rawSlugs) || rawSlugs.some((s) => typeof s !== "string" || s.trim().length === 0)) {
    return {
      result: { error: "compSetSlugs must be a non-empty array of strings" },
    };
  }
  const compSetSlugs = (rawSlugs as string[]).filter((s) => s.trim().length > 0);
  if (compSetSlugs.length === 0) {
    return { result: { error: "compSetSlugs must contain at least one slug" } };
  }

  const tiagoResult = await runForCompanyOverride(companyArg.value, compSetSlugs);
  if (!tiagoResult.ok) {
    return { result: { error: tiagoResult.errors.join("; ") } };
  }
  await writeEffectiveBracketMix({
    companyId: companyArg.value,
    mix: tiagoResult.output.mix,
    kind: "override-set",
    overrideRunId: tiagoResult.runId,
    evidenceLabel: `Rebecca set_company_bracket_mix_override [${compSetSlugs.join(", ")}]`,
  });
  return {
    result: {
      companyId: companyArg.value,
      runId: tiagoResult.runId,
      source: "override",
    },
    dataChanged: { entityType: "global_assumptions", entityId: companyArg.value },
  };
}

export async function toolClearCompanyBracketMixOverride(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolReturn> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const companyArg = requireNumericArg(args, "companyId");
  if (!companyArg.ok) return companyArg.result;

  const result = await clearBracketMixOverride(companyArg.value);
  return {
    result: {
      companyId: companyArg.value,
      cleared: result.wasActive,
      mirroredFromRunId: result.mirroredFromRunId,
    },
    dataChanged: result.wasActive
      ? { entityType: "global_assumptions", entityId: companyArg.value }
      : undefined,
  };
}
