import { storage } from "../storage";
import { isAdminRole } from "@shared/constants";

export const RESEARCH_ESTIMATED_MINUTES = 2;

export type ToolContext = { userId: number };

export const KB_CONTENT_VECTOR_PREVIEW_CHARS = 3_000;

export type DataChangedEntry = {
  entityType: "property" | "scenario" | "slide_factory_run" | "analyst_table" | "lb_deck_config"
            | "kb_entry" | "global_assumptions" | "research_job" | "iris_run" | "iris_gap" | "data_source" | "compliance_run"
            | "company" | "market_rate" | "property_finder" | "service_template" | "portfolio";
  entityId: number;
};

/** Extracts a required numeric ID from LLM-supplied args, returning an error
 *  result if the value is absent or not a finite number. LLMs sometimes return
 *  string IDs ("123") rather than numbers — catching that here prevents silent
 *  type confusion reaching the storage layer. */
export function requireNumericArg(
  args: Record<string, unknown>,
  key: string,
): { ok: true; value: number } | { ok: false; result: { result: { error: string } } } {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return { ok: false, result: { result: { error: `${key} must be a number` } } };
  }
  return { ok: true, value: v };
}

/** Extracts a required object from LLM-supplied args. */
export function requireObjectArg(
  args: Record<string, unknown>,
  key: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; result: { result: { error: string } } } {
  const v = args[key];
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return { ok: false, result: { result: { error: `${key} must be an object` } } };
  }
  return { ok: true, value: v as Record<string, unknown> };
}

/**
 * Returns an error result if the caller is not an admin, null otherwise.
 * Mirrors the `requireAdmin` middleware used in routes/admin/iris.ts.
 */
export async function requireAdminCtx(ctx: ToolContext): Promise<{ result: { error: string } } | null> {
  const user = await storage.getUserById(ctx.userId);
  if (!user || !isAdminRole(user.role)) {
    return { result: { error: "This action requires admin access" } };
  }
  return null;
}
