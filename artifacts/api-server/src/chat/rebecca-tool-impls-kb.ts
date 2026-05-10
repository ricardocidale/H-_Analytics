import { storage } from "../storage";
import { logger } from "../logger";
import { upsertChunks, deleteVectors } from "../ai/vector-store-service";
import { insertRebeccaKBSchema } from "@workspace/db";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { KB_CONTENT_VECTOR_PREVIEW_CHARS, requireAdminCtx, requireNumericArg } from "./rebecca-tool-types";

// ---------------------------------------------------------------------------
// KB management tools (U4)
// ---------------------------------------------------------------------------

export async function toolCreateKbEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const validation = insertRebeccaKBSchema.safeParse(args);
  if (!validation.success) {
    const message = validation.error.issues
      .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { result: { error: `Invalid KB entry data: ${message}` } };
  }

  const entry = await storage.createRebeccaKBEntry(validation.data);

  if (entry.isActive !== false) {
    upsertChunks("knowledge-base", [{
      id: `admin-kb:${entry.id}`,
      text: `${entry.title}\n\n${entry.content}`,
      metadata: { title: entry.title, content: entry.content.slice(0, KB_CONTENT_VECTOR_PREVIEW_CHARS), source: "admin-kb", category: entry.category },
    }]).catch(e =>
      logger.warn(`Vector store sync failed for KB ${entry.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
    );
  }

  return {
    result: { id: entry.id, title: entry.title, category: entry.category },
    dataChanged: { entityType: "kb_entry", entityId: entry.id },
  };
}

export async function toolUpdateKbEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const { id: _id, ...rest } = args;
  void _id;
  const validation = insertRebeccaKBSchema.partial().safeParse(rest);
  if (!validation.success) {
    const message = validation.error.issues
      .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { result: { error: `Invalid update data: ${message}` } };
  }

  const user = await storage.getUserById(ctx.userId);
  const updated = await storage.updateRebeccaKBEntry(id, validation.data, user?.email ?? undefined);
  if (!updated) return { result: { error: "KB entry not found" } };

  if (updated.isActive) {
    upsertChunks("knowledge-base", [{
      id: `admin-kb:${updated.id}`,
      text: `${updated.title}\n\n${updated.content}`,
      metadata: { title: updated.title, content: updated.content.slice(0, KB_CONTENT_VECTOR_PREVIEW_CHARS), source: "admin-kb", category: updated.category },
    }]).catch(e =>
      logger.warn(`Vector store sync failed for KB ${updated.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
    );
  } else {
    deleteVectors("knowledge-base", [`admin-kb:${updated.id}`]).catch(e =>
      logger.warn(`Vector store delete failed for KB ${updated.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
    );
  }

  return {
    result: { id: updated.id, title: updated.title, category: updated.category, isActive: updated.isActive },
    dataChanged: { entityType: "kb_entry", entityId: id },
  };
}

export async function toolDeleteKbEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const deleted = await storage.deleteRebeccaKBEntry(id);
  if (!deleted) return { result: { error: "KB entry not found" } };

  deleteVectors("knowledge-base", [`admin-kb:${id}`]).catch(e =>
    logger.warn(`Vector store delete failed for KB ${id}: ${e instanceof Error ? e.message : e}`, "rebecca")
  );

  return {
    result: { success: true },
    dataChanged: { entityType: "kb_entry", entityId: id },
  };
}

export async function toolListKbEntries(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const category = typeof args.category === "string" ? args.category : undefined;
  const entries = await storage.getRebeccaKBEntries(category);
  return { result: entries };
}

export async function toolGetKbEntry(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<{ result: unknown }> {
  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const entry = await storage.getRebeccaKBEntry(id);
  if (!entry || !entry.isActive) return { result: { error: "Not found" } };

  return {
    result: {
      id: entry.id,
      title: entry.title,
      content: entry.content,
      category: entry.category,
      source: entry.source,
    },
  };
}

// ---------------------------------------------------------------------------
// Company tools (U4)
// ---------------------------------------------------------------------------

export async function toolListCompanies(ctx: ToolContext): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const { db } = await import("../db");
  const { companies } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      type: companies.type,
      isActive: companies.isActive,
    })
    .from(companies)
    .where(eq(companies.isActive, true));

  return { result: { rowCount: rows.length, companies: rows } };
}

export async function toolGetCompany(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const { db } = await import("../db");
  const { companies } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!row) return { result: { error: `Company not found: id=${id}` } };

  return {
    result: {
      ...row,
      createdAt: row.createdAt?.toISOString() ?? null,
    },
  };
}

export async function toolCreateCompany(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const name = typeof args.name === "string" ? args.name.trim() : "";
  const type = typeof args.type === "string" ? args.type.trim() : "";
  if (!name) return { result: { error: "name is required" } };
  if (!type) return { result: { error: "type is required" } };
  if (type !== "management" && type !== "spv") {
    return { result: { error: "type must be 'management' or 'spv'" } };
  }

  const { db } = await import("../db");
  const { companies } = await import("@workspace/db");

  const [created] = await db
    .insert(companies)
    .values({
      name,
      type,
      description: typeof args.description === "string" ? args.description : undefined,
      isActive: true,
    } as typeof companies.$inferInsert)
    .returning({ id: companies.id, name: companies.name, type: companies.type });

  return {
    result: { success: true, id: created.id, name: created.name, type: created.type },
    dataChanged: { entityType: "company" as const, entityId: created.id },
  };
}

export async function toolDeleteCompany(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;

  const { db } = await import("../db");
  const { companies } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1);
  if (!existing) return { result: { error: `Company not found: id=${id}` } };

  await db.update(companies).set({ isActive: false }).where(eq(companies.id, id));

  return {
    result: { success: true },
    dataChanged: { entityType: "company" as const, entityId: id },
  };
}

export async function toolUpdateCompany(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const { db } = await import("../db");
  const { companies } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const [existing] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!existing) return { result: { error: `Company not found: id=${id}` } };

  const patch: Record<string, unknown> = {};
  if (typeof args.name === "string") patch.name = args.name;
  if (typeof args.type === "string") patch.type = args.type;
  if (typeof args.description === "string") patch.description = args.description;
  if (typeof args.isActive === "boolean") patch.isActive = args.isActive;

  if (Object.keys(patch).length === 0) {
    return { result: { message: "No changes applied" } };
  }

  const [updated] = await db
    .update(companies)
    .set(patch)
    .where(eq(companies.id, id))
    .returning({ id: companies.id, name: companies.name });

  return {
    result: { success: true, id: updated.id, name: updated.name },
    dataChanged: { entityType: "company" as const, entityId: id },
  };
}
