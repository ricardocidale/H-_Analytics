/**
 * Lucca draft pipeline — Unit 4a stub.
 *
 * Implements the status flow: drafting → draft_review (or error).
 * Creates a placeholder LuccaSlotDraft for every slot in SLOT_CONTEXT_MAP so
 * that the Tab 4 review UI can be developed before the real Opus call is wired.
 *
 * Unit 4b will replace this stub with the real Lucca-01 LLM call.
 */
import { logger } from "../logger";
import { updateSlideFactoryRun } from "../storage/slide-factory-runs";
import type { LuccaSlotDraft } from "../storage/slide-factory-runs";
import { SLOT_CONTEXT_MAP } from "./slot-context-map";
import type { DraftSlotKey } from "./slot-context-map";

function buildStubDraft(): Record<string, LuccaSlotDraft> {
  const draft: Record<string, LuccaSlotDraft> = {};
  for (const key of Object.keys(SLOT_CONTEXT_MAP) as DraftSlotKey[]) {
    draft[key] = {
      value: `[Stub draft for ${key}]`,
      approved: false,
      approvedAt: null,
      source: "lucca",
    };
  }
  return draft;
}

export async function runLuccaDraft(runId: number): Promise<void> {
  try {
    await updateSlideFactoryRun(runId, {
      luccaDraft: buildStubDraft(),
      status: "draft_review",
    });
    logger.info(`[lucca] run ${runId} draft complete (stub)`, "slide-factory");
  } catch (err: unknown) {
    logger.error(`[lucca] run ${runId} draft failed: ${String(err)}`, "slide-factory");
    try {
      await updateSlideFactoryRun(runId, { status: "error" });
    } catch {
      // best-effort
    }
  }
}
