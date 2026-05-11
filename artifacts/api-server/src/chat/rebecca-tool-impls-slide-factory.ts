import { storage } from "../storage";
import { logger } from "../logger";
import { SLIDE_FACTORY_UNAPPROVED_SLOTS_PREVIEW } from "../constants";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { requireNumericArg } from "./rebecca-tool-types";

/** Fire-and-forget a detached async operation; logs rejections so they are never silent. */
function dispatchDetached(promise: Promise<unknown>, context: string): void {
  void promise.catch((err) => {
    logger.error(`[slide-factory] ${context} failed: ${String(err)}`, "slide-factory");
  });
}

// ---------------------------------------------------------------------------
// Slide Factory Pipeline tools
// Every UI action in SlideFactoryPanel maps to one tool here. Mutations emit
// dataChanged: { entityType: "slide_factory_run", entityId } so the frontend
// invalidates its run query on SSE done. See parity map.
// ---------------------------------------------------------------------------

export async function toolCreateSlideFactoryRun(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const { createSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await createSlideFactoryRun(ctx.userId);
  return {
    result: { id: run.id, status: run.status, createdAt: run.createdAt },
    dataChanged: { entityType: "slide_factory_run", entityId: run.id },
  };
}

export async function toolListSlideFactoryRuns(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const { listSlideFactoryRuns } = await import("../storage/slide-factory-runs");
  const runs = await listSlideFactoryRuns(ctx.userId);
  return {
    result: runs.map((r) => ({
      id: r.id,
      status: r.status,
      briefFilename: r.briefFilename,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      completedAt: r.completedAt,
    })),
  };
}

export async function toolGetSlideFactoryRun(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  return { result: run };
}

export async function toolRecordSlideFactoryBrief(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  const r2Key = String(args.r2Key ?? "");
  const filename = String(args.filename ?? "");
  if (!Number.isFinite(id) || !r2Key || !filename) {
    return { result: { error: "id, r2Key, and filename are required" } };
  }
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "new") {
    return {
      result: { error: `Brief can only be recorded when status is 'new', current: '${run.status}'` },
    };
  }
  const updated = await updateSlideFactoryRun(id, { briefR2Key: r2Key, briefFilename: filename });
  return {
    result: { id, status: updated?.status, briefFilename: updated?.briefFilename },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolAcceptSlideFactoryBrief(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (!run.briefR2Key) return { result: { error: "No brief recorded yet" } };
  if (run.status !== "new") {
    return {
      result: { error: `Brief can only be accepted when status is 'new', current: '${run.status}'` },
    };
  }
  const updated = await updateSlideFactoryRun(id, {
    briefAccepted: true,
    status: "ingesting",
    startedAt: new Date(),
  });
  // W1.5: side-effect-fire moved out of this tool. Caller must follow up with
  // trigger_lorenzo_ingestion to start the background work.
  return {
    result: {
      id,
      status: updated?.status,
      message: "Brief accepted; status is 'ingesting'. Call trigger_lorenzo_ingestion next to start the background job.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolAssignSlideFactoryProperties(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const slide1PropertyId = args.slide1PropertyId == null ? null : Number(args.slide1PropertyId);
  const slide2PropertyId = args.slide2PropertyId == null ? null : Number(args.slide2PropertyId);
  const slide3PropertyId = args.slide3PropertyId == null ? null : Number(args.slide3PropertyId);
  const slide5PropertyId = args.slide5PropertyId == null ? null : Number(args.slide5PropertyId);

  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "ingested") {
    return {
      result: {
        error: `Property assignment requires status 'ingested', current: '${run.status}'`,
      },
    };
  }
  const slidePropertyIds: Array<[string, number | null]> = [
    ["slide1PropertyId", slide1PropertyId],
    ["slide2PropertyId", slide2PropertyId],
    ["slide3PropertyId", slide3PropertyId],
    ["slide5PropertyId", slide5PropertyId],
  ];
  for (const [field, propId] of slidePropertyIds) {
    if (propId == null) continue;
    const prop = await storage.getProperty(propId);
    if (!prop || prop.userId !== ctx.userId) {
      return { result: { error: `Property ${propId} for ${field} not found or not owned by you` } };
    }
  }
  const updated = await updateSlideFactoryRun(id, {
    slide1PropertyId,
    slide2PropertyId,
    slide3PropertyId,
    slide5PropertyId,
    status: "drafting",
  });
  // W1.5: side-effect-fire moved out of this tool. Caller must follow up with
  // trigger_lucca_draft to start the background work.
  return {
    result: {
      id,
      status: updated?.status,
      message: "Properties assigned; status is 'drafting'. Call trigger_lucca_draft next to start the background job.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolUpdateSlideFactorySlot(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  const slotKey = String(args.slotKey ?? "");
  if (!Number.isFinite(id) || !slotKey) {
    return { result: { error: "id and slotKey are required" } };
  }
  const value = args.value === undefined ? undefined : String(args.value);
  let approved: boolean | undefined;
  if (args.approved !== undefined) {
    if (typeof args.approved !== "boolean") {
      return { result: { error: "approved must be a boolean" } };
    }
    approved = args.approved;
  }
  if (value === undefined && approved === undefined) {
    return { result: { error: "At least one of value or approved must be provided" } };
  }
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  const slotEditAllowed = run.status === "draft_review" || run.status === "complete";
  if (!slotEditAllowed) {
    return { result: { error: `Slot edits require status 'draft_review' or 'complete', current: '${run.status}'` } };
  }
  if (!run.luccaDraft) return { result: { error: "No Lucca draft present" } };
  const existing = run.luccaDraft[slotKey];
  if (!existing) return { result: { error: `Slot '${slotKey}' not found in draft` } };

  const valueChanged = value !== undefined && value !== existing.value;
  const nowApproving = approved === true && !existing.approved;
  const newSource = valueChanged
    ? run.status === "complete"
      ? ("admin-override" as const)
      : ("admin" as const)
    : undefined;
  const updatedSlot = {
    ...existing,
    ...(value !== undefined ? { value } : {}),
    ...(approved !== undefined ? { approved } : {}),
    ...(newSource !== undefined ? { source: newSource } : {}),
    ...(nowApproving ? { approvedAt: new Date().toISOString() } : {}),
    ...(approved === false ? { approvedAt: null } : {}),
  };
  const updatedDraft = { ...run.luccaDraft, [slotKey]: updatedSlot };
  await updateSlideFactoryRun(id, { luccaDraft: updatedDraft });
  return {
    result: { id, slotKey, slot: updatedSlot },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolApproveAllSlideFactorySlots(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "draft_review") {
    return {
      result: { error: `Approve-all requires status 'draft_review', current: '${run.status}'` },
    };
  }
  if (!run.luccaDraft) return { result: { error: "No Lucca draft present" } };

  const now = new Date().toISOString();
  const approvedDraft: Record<string, typeof run.luccaDraft[string]> = {};
  for (const [key, slot] of Object.entries(run.luccaDraft)) {
    approvedDraft[key] = {
      ...slot,
      approved: true,
      approvedAt: slot.approvedAt ?? now,
    };
  }
  await updateSlideFactoryRun(id, { luccaDraft: approvedDraft });
  return {
    result: { id, slotsApproved: Object.keys(approvedDraft).length },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolTriggerSlideFactoryBuild(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  const isRetrigger = run.status === "error";
  if (run.status !== "draft_review" && !isRetrigger) {
    return {
      result: { error: `Trigger-build requires status 'draft_review' or 'error', current: '${run.status}'` },
    };
  }
  if (!isRetrigger) {
    if (!run.luccaDraft) return { result: { error: "No Lucca draft present" } };
    const unapproved = Object.entries(run.luccaDraft)
      .filter(([, slot]) => !slot.approved)
      .map(([key]) => key);
    if (unapproved.length > 0) {
      return {
        result: {
          error: `${unapproved.length} slot(s) not yet approved`,
          unapprovedSlots: unapproved.slice(0, SLIDE_FACTORY_UNAPPROVED_SLOTS_PREVIEW),
        },
      };
    }
  }
  await updateSlideFactoryRun(id, { status: "building" });
  const { runMarco } = await import("../slides/marco");
  dispatchDetached(runMarco(id), `Marco render run ${id}`);
  return {
    result: {
      id,
      status: "building",
      message: isRetrigger
        ? "Re-trigger from error initiated. Marco dispatched. Poll get_slide_factory_run for agent results."
        : "Build triggered. Marco dispatched. Poll get_slide_factory_run for agent results.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolCancelSlideFactoryBuild(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "building") {
    return { result: { error: `Cancel requires status 'building', current: '${run.status}'` } };
  }
  await updateSlideFactoryRun(id, { status: "error", completedAt: new Date() });
  return {
    result: { id, status: "error", message: "Build cancelled." },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

/**
 * Manually trigger Franco to produce (or re-produce) the deck PDF for a
 * complete slide factory run. Mirror of Marco's automatic produce_deck
 * call (marco-tools.ts handleProduceDeck) — same deterministic core
 * (`runFranco`), exposed as an agent-native parity entry point.
 */
export async function toolProduceSlideFactoryDeck(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const runIdResult = requireNumericArg(args, "runId");
  if (!runIdResult.ok) return runIdResult.result;
  const runId = runIdResult.value;

  const { getSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await getSlideFactoryRun(runId, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${runId} not found` } };

  const { runFranco } = await import("../slides/minions/franco");
  try {
    const { deckR2Key } = await runFranco(runId, { caller: "rebecca" });
    return {
      result: { ok: true, deckR2Key },
      dataChanged: { entityType: "slide_factory_run", entityId: runId },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { ok: false, error: message },
      dataChanged: { entityType: "slide_factory_run", entityId: runId },
    };
  }
}

export async function toolRebuildSlideFactoryDeck(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };

  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };

  if (run.status === "rebuilding") {
    return { result: { error: "A rebuild is already in progress for this run" } };
  }
  if (run.status !== "complete") {
    return {
      result: { error: `Rebuild requires status 'complete', current: '${run.status}'` },
    };
  }

  const rebuilding = await updateSlideFactoryRun(id, { status: "rebuilding" });

  const { runFranco } = await import("../slides/minions/franco");
  void (async () => {
    try {
      const { deckR2Key } = await runFranco(id, {
        caller: "rebuild",
        skipDeckKeyWrite: true,
      });
      await updateSlideFactoryRun(id, {
        status: "complete",
        deckR2Key,
        completedAt: new Date(),
      });
    } catch (err) {
      logger.error(
        `[rebuild-tool] run ${id}: Franco failed — reverting to complete: ${String(err)}`,
        "slide-factory",
      );
      await updateSlideFactoryRun(id, { status: "complete" }).catch(() => {});
    }
  })();

  return {
    result: { id, status: rebuilding?.status ?? "rebuilding", message: "Rebuild started — poll get_slide_factory_run for completion" },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolDeleteSlideFactoryRun(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const { deleteSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const deleted = await deleteSlideFactoryRun(id, ctx.userId);
  if (!deleted) return { result: { error: "Not found" } };

  return {
    result: { success: true },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

// W1.5 — explicit background-job triggers. Separated from accept_slide_factory_brief
// and assign_slide_factory_properties so the agent decides when to fire the
// background work (the old tools auto-fired without surfacing a separate handle).

export async function toolTriggerLorenzoIngestion(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const { getSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "ingesting") {
    return {
      result: { error: `Lorenzo ingestion requires status 'ingesting', current: '${run.status}'` },
    };
  }

  const { runLorenzoIngestion } = await import("../slides/lorenzo-ingestion");
  dispatchDetached(runLorenzoIngestion(id), `Lorenzo ingestion run ${id}`);
  return {
    result: {
      id,
      status: run.status,
      message: "Lorenzo ingestion dispatched. Poll get_slide_factory_run for status.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

export async function toolTriggerLuccaDraft(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const { getSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "drafting") {
    return {
      result: { error: `Lucca drafting requires status 'drafting', current: '${run.status}'` },
    };
  }

  const { runLuccaDraft } = await import("../slides/lucca-draft");
  dispatchDetached(runLuccaDraft(id), `Lucca draft run ${id}`);
  return {
    result: {
      id,
      status: run.status,
      message: "Lucca drafting dispatched. Poll get_slide_factory_run for status.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}
