import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, getAuthUser } from "../auth";
import { storage } from "../storage";
import { sendNotificationEmail } from "../integrations/resend";
import { logger } from "../logger";
import { logActivity, parseRouteId } from "./helpers";
import { insertRebeccaKBSchema } from "@workspace/db";
import { upsertChunks, deleteVectors, vectorCount } from "../ai/vector-store-service";
import { rebeccaSettingsSchema, tryParseRebeccaSettings } from "@shared/rebecca-settings";

const previewTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(50_000),
  ts: z.number().int().nonnegative(),
});

const createFixtureSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  // Accept either a strict schema or a stored partial — we re-parse server-
  // side via rebeccaSettingsSchema so older snapshots are forward-compatible.
  settings: z.record(z.unknown()),
  // At least one user turn is required — replay needs something to send.
  turns: z.array(previewTurnSchema).min(1).max(200)
    .refine((arr) => arr.some((t) => t.role === "user"), {
      message: "Fixture must contain at least one user turn",
    }),
});

const updateFixtureSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
});

// Task #560 — portable export envelope. The `$kind` + `version` discriminator
// lets the import endpoint recognise our own files (and reject random JSON
// blobs) and gives us a forward-compat lever if the export shape ever
// changes. The fixture body is intentionally a subset of the DB row — no
// ids, timestamps, or scheduled-replay tracking, since those are environment-
// specific and would be misleading after a cross-environment import.
const FIXTURE_EXPORT_KIND = "rebecca-preview-fixture" as const;
const FIXTURE_EXPORT_VERSION = 1 as const;

const fixtureExportPayloadSchema = z.object({
  $kind: z.literal(FIXTURE_EXPORT_KIND),
  version: z.literal(FIXTURE_EXPORT_VERSION),
  // exportedAt is informational only — accept any string for forward-compat.
  exportedAt: z.string().optional(),
  fixture: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    settings: z.record(z.unknown()),
    turns: z.array(previewTurnSchema).min(1).max(200)
      .refine((arr) => arr.some((t) => t.role === "user"), {
        message: "Fixture must contain at least one user turn",
      }),
  }),
});

const fixtureImportSchema = z.object({
  payload: fixtureExportPayloadSchema,
  // Default behaviour: fail with 409 on duplicate name. Admin then re-calls
  // this endpoint with one of the resolutions below.
  conflictResolution: z
    .union([
      z.literal("overwrite"),
      z.object({ renameTo: z.string().trim().min(1).max(120) }),
    ])
    .optional(),
});

// Task #699 — Bulk export/import envelope.
// A bundle wraps N individual fixture export payloads so admins can
// snapshot all fixtures at once, move them across environments, or
// check them into source control as a regression baseline.
const FIXTURE_BUNDLE_KIND = "rebecca-preview-fixture-bundle" as const;
const FIXTURE_BUNDLE_VERSION = 1 as const;

export const fixtureBundleExportSchema = z.object({
  $kind: z.literal(FIXTURE_BUNDLE_KIND),
  version: z.literal(FIXTURE_BUNDLE_VERSION),
  exportedAt: z.string().optional(),
  count: z.number().int().nonnegative(),
  fixtures: z.array(fixtureExportPayloadSchema).min(1).max(500),
});

export type FixtureBundleExport = z.infer<typeof fixtureBundleExportSchema>;

const bulkImportSchema = z.object({
  bundle: fixtureBundleExportSchema,
  // Applied to every fixture in the bundle whose name conflicts.
  // Individual fixture resolution is intentionally coarse — this is a
  // bulk operation and per-fixture 409 renegotiation would be unusable.
  defaultConflictResolution: z.enum(["skip", "overwrite"]).default("skip"),
});

const emailRequestSchema = z.object({
  conversationId: z.number().int().positive(),
  recipientEmail: z.string().email().max(320),
});

const feedbackRequestSchema = z.object({
  conversationId: z.number().int().positive(),
  category: z.enum(["incorrect", "unhelpful", "missing_data", "other"]),
  notes: z.string().max(2000).optional(),
  conversationContext: z.record(z.unknown()).optional(),
});

export function register(app: Express) {
  app.post("/api/rebecca/email", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = emailRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }

      const userId = getAuthUser(req).id;
      const { conversationId, recipientEmail } = parsed.data;

      const conv = await storage.getRebeccaConversation(conversationId);
      if (!conv || conv.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const dbMessages = await storage.getRebeccaMessages(conversationId);
      if (dbMessages.length === 0) {
        return res.status(400).json({ error: "No messages in conversation" });
      }

      const summary = dbMessages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n\n");

      const subject = `Rebecca AI Summary — ${conv.contextType} ${conv.contextKey ?? ""}`.trim();
      const htmlContent = buildEmailHtml(subject, summary);

      await sendNotificationEmail({
        to: recipientEmail,
        subject,
        title: subject,
        body: summary,
      });

      const email = await storage.createRebeccaEmail({
        conversationId,
        userId,
        recipientEmail,
        subject,
        htmlContent,
        status: "sent",
        sentAt: new Date(),
      });

      logActivity(req, "send-rebecca-email", "rebecca_conversation", conversationId, recipientEmail, { subject });
      logger.info(`Rebecca email sent to ${recipientEmail} for conversation ${conversationId}`, "rebecca");
      return res.json({ success: true, emailId: email.id });
    } catch (err: unknown) {
      logger.error(`Failed to send Rebecca email: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to send email" });
    }
  });

  app.post("/api/rebecca/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = feedbackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }

      const userId = getAuthUser(req).id;
      const { conversationId, category, notes, conversationContext } = parsed.data;

      const conv = await storage.getRebeccaConversation(conversationId);
      if (!conv || conv.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const feedback = await storage.createRebeccaFeedback({
        conversationId,
        userId,
        category,
        notes: notes ?? null,
        conversationContext: conversationContext ?? null,
      });

      logActivity(req, "submit-rebecca-feedback", "rebecca_conversation", conversationId, category, { category, notes: notes?.slice(0, 100) });
      logger.info(`Rebecca feedback submitted: ${category} for conversation ${conversationId}`, "rebecca");
      return res.json({ success: true, feedbackId: feedback.id });
    } catch (err: unknown) {
      logger.error(`Failed to store Rebecca feedback: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/rebecca/conversations", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const conversations = await storage.getRebeccaConversations();
      return res.json(conversations);
    } catch (err: unknown) {
      logger.error(`Failed to list Rebecca conversations: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list conversations" });
    }
  });

  app.get("/api/rebecca/conversations/:id/messages", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const conversationId = parseRouteId(req.params.id);
      if (!conversationId) {
        return res.status(400).json({ error: "Invalid conversation ID" });
      }
      const messages = await storage.getRebeccaMessages(conversationId);
      return res.json(messages);
    } catch (err: unknown) {
      logger.error(`Failed to list Rebecca messages: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list messages" });
    }
  });

  app.get("/api/rebecca/feedback", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const feedback = await storage.getRebeccaFeedback(status);
      return res.json(feedback);
    } catch (err: unknown) {
      logger.error(`Failed to list Rebecca feedback: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list feedback" });
    }
  });

  app.patch("/api/rebecca/feedback/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const feedbackId = parseRouteId(req.params.id);
      if (!feedbackId) {
        return res.status(400).json({ error: "Invalid feedback ID" });
      }
      const statusSchema = z.object({
        status: z.enum(["new", "reviewed", "resolved"]),
      });
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid status: " + parsed.error.issues[0]?.message });
      }
      const updated = await storage.updateRebeccaFeedbackStatus(feedbackId, parsed.data.status);
      if (!updated) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      logActivity(req, "update-rebecca-feedback", "rebecca_feedback", feedbackId, parsed.data.status);
      logger.info(`Rebecca feedback ${feedbackId} status updated to ${parsed.data.status}`, "rebecca");
      return res.json(updated);
    } catch (err: unknown) {
      logger.error(`Failed to update Rebecca feedback: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to update feedback" });
    }
  });

  app.get("/api/rebecca/guardrails", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const guardrails = await storage.getRebeccaGuardrails();
      return res.json(guardrails);
    } catch (err: unknown) {
      logger.error(`Failed to list guardrails: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list guardrails" });
    }
  });

  // Disabled: GuardrailEditor is read-only per specialists-are-dev-defined-only.md.
  // Rebecca guardrails are dev-defined. GET (display) stays live; writes return 405.
  app.post("/api/rebecca/guardrails", requireAuth, requireAdmin, (_req: Request, res: Response) => {
    res.status(405).json({ error: "Rebecca guardrails are dev-defined. Edit source code and redeploy. See .claude/rules/specialists-are-dev-defined-only.md" });
  });

  app.patch("/api/rebecca/guardrails/:id", requireAuth, requireAdmin, (_req: Request, res: Response) => {
    res.status(405).json({ error: "Rebecca guardrails are dev-defined. Edit source code and redeploy. See .claude/rules/specialists-are-dev-defined-only.md" });
  });

  app.delete("/api/rebecca/guardrails/:id", requireAuth, requireAdmin, (_req: Request, res: Response) => {
    res.status(405).json({ error: "Rebecca guardrails are dev-defined. Edit source code and redeploy. See .claude/rules/specialists-are-dev-defined-only.md" });
  });

  app.get("/api/rebecca/kb", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const entries = await storage.getRebeccaKBEntries(category);
      return res.json(entries);
    } catch (err: unknown) {
      logger.error(`Failed to list KB entries: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list KB entries" });
    }
  });

  app.get("/api/rebecca/kb/stats", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getRebeccaKBStats();
      let vectorCt = 0;
      try { vectorCt = await vectorCount("knowledge-base"); } catch (err: unknown) { logger.warn(`Failed to get Vector store vector count: ${err instanceof Error ? err.message : String(err)}`, "rebecca"); }
      return res.json({ ...stats, vectorCount: vectorCt });
    } catch (err: unknown) {
      logger.error(`Failed to get KB stats: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to get KB stats" });
    }
  });

  app.post("/api/rebecca/kb", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = insertRebeccaKBSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const entry = await storage.createRebeccaKBEntry(parsed.data);
      syncKBEntryToVectorStore(entry.id, entry.title, entry.content, entry.category);
      logActivity(req, "create-kb-entry", "rebecca_kb", entry.id, entry.title, { category: entry.category });
      logger.info(`KB entry created: ${entry.title}`, "rebecca");
      return res.json(entry);
    } catch (err: unknown) {
      logger.error(`Failed to create KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to create KB entry" });
    }
  });

  app.patch("/api/rebecca/kb/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid KB entry ID" });

      const updateSchema = insertRebeccaKBSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const user = getAuthUser(req);
      const updated = await storage.updateRebeccaKBEntry(id, parsed.data, user.email);
      if (!updated) return res.status(404).json({ error: "KB entry not found" });

      if (updated.isActive) {
        syncKBEntryToVectorStore(updated.id, updated.title, updated.content, updated.category);
      } else {
        deleteVectors("knowledge-base", [`admin-kb:${updated.id}`]).catch(e =>
          logger.warn(`Vector store delete failed for KB ${updated.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
        );
      }
      logActivity(req, "update-kb-entry", "rebecca_kb", id, updated.title, { category: updated.category });
      logger.info(`KB entry ${id} updated by ${user.email}`, "rebecca");
      return res.json(updated);
    } catch (err: unknown) {
      logger.error(`Failed to update KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to update KB entry" });
    }
  });

  app.delete("/api/rebecca/kb/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid KB entry ID" });

      const deleted = await storage.deleteRebeccaKBEntry(id);
      if (!deleted) return res.status(404).json({ error: "KB entry not found" });

      deleteVectors("knowledge-base", [`admin-kb:${id}`]).catch(e =>
        logger.warn(`Vector store delete failed for KB ${id}: ${e instanceof Error ? e.message : e}`, "rebecca")
      );
      logActivity(req, "delete-kb-entry", "rebecca_kb", id);
      logger.info(`KB entry ${id} deleted`, "rebecca");
      return res.json({ success: true });
    } catch (err: unknown) {
      logger.error(`Failed to delete KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to delete KB entry" });
    }
  });

  app.get("/api/rebecca/kb/:id/history", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const entryId = parseRouteId(req.params.id);
      if (!entryId) return res.status(400).json({ error: "Invalid KB entry ID" });

      const history = await storage.getRebeccaKBHistory(entryId);
      return res.json(history);
    } catch (err: unknown) {
      logger.error(`Failed to get KB history: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to get KB history" });
    }
  });

  app.post("/api/rebecca/kb/:id/rollback/:historyId", requireAuth, requireAdmin, async (req: Request<{ id: string; historyId: string }>, res: Response) => {
    try {
      const entryId = parseRouteId(req.params.id);
      const historyId = parseRouteId(req.params.historyId);
      if (!entryId || !historyId) return res.status(400).json({ error: "Invalid IDs" });

      const user = getAuthUser(req);
      const restored = await storage.rollbackRebeccaKBEntry(entryId, historyId, user.email);
      if (!restored) return res.status(404).json({ error: "History entry not found" });

      if (restored.isActive) {
        syncKBEntryToVectorStore(restored.id, restored.title, restored.content, restored.category);
      } else {
        deleteVectors("knowledge-base", [`admin-kb:${restored.id}`]).catch(e =>
          logger.warn(`Vector store delete failed for KB ${restored.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
        );
      }
      logActivity(req, "rollback-kb-entry", "rebecca_kb", entryId, restored.title, { historyId });
      logger.info(`KB entry ${entryId} rolled back to history ${historyId} by ${user.email}`, "rebecca");
      return res.json(restored);
    } catch (err: unknown) {
      logger.error(`Failed to rollback KB entry: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to rollback KB entry" });
    }
  });

  // ── Preview fixtures (Task #538) ─────────────────────────────────────
  // Admins can save the current preview transcript (settings + turns) under
  // a name and replay it later. Replay itself happens client-side (the
  // Test Chat UI walks the saved user turns through /api/chat with the
  // current unsaved settings) so this route surface is just CRUD.

  app.get("/api/rebecca/fixtures", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const fixtures = await storage.listRebeccaPreviewFixtures();
      return res.json(fixtures);
    } catch (err: unknown) {
      logger.error(`Failed to list Rebecca fixtures: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to list fixtures" });
    }
  });

  app.post("/api/rebecca/fixtures", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = createFixtureSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      // Re-parse the settings through the canonical schema so we never
      // persist a junk shape that would crash the replay UI later.
      const settingsParse = rebeccaSettingsSchema.safeParse(parsed.data.settings);
      if (!settingsParse.success) {
        return res.status(400).json({
          error: "Invalid settings snapshot: " + settingsParse.error.issues[0]?.message,
        });
      }
      const user = getAuthUser(req);
      const fixture = await storage.createRebeccaPreviewFixture({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        settings: settingsParse.data,
        turns: parsed.data.turns,
        createdById: user.id,
      });
      logActivity(req, "create-rebecca-fixture", "rebecca_preview_fixture", fixture.id, fixture.name, {
        turnCount: parsed.data.turns.length,
      });
      logger.info(`Rebecca preview fixture created: ${fixture.name} (${parsed.data.turns.length} turns)`, "rebecca");
      return res.json(fixture);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Postgres unique-violation surfaces as a duplicate-key error — translate
      // it to a friendly 409 instead of leaking the internal SQLSTATE.
      if (/duplicate key/i.test(msg) || /rebecca_preview_fixtures_name_uq/i.test(msg)) {
        return res.status(409).json({ error: "A fixture with that name already exists" });
      }
      logger.error(`Failed to create Rebecca fixture: ${msg}`, "rebecca");
      return res.status(500).json({ error: "Failed to save fixture" });
    }
  });

  app.patch("/api/rebecca/fixtures/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid fixture ID" });
      const parsed = updateFixtureSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request: " + parsed.error.issues[0]?.message });
      }
      const updated = await storage.updateRebeccaPreviewFixture(id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Fixture not found" });
      logActivity(req, "update-rebecca-fixture", "rebecca_preview_fixture", id, updated.name);
      return res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key/i.test(msg) || /rebecca_preview_fixtures_name_uq/i.test(msg)) {
        return res.status(409).json({ error: "A fixture with that name already exists" });
      }
      logger.error(`Failed to update Rebecca fixture: ${msg}`, "rebecca");
      return res.status(500).json({ error: "Failed to update fixture" });
    }
  });

  // Task #560 — export a saved fixture as a portable JSON file. The
  // response is sent as a downloadable attachment so admins can stash the
  // file or hand it off to another environment for import.
  app.get("/api/rebecca/fixtures/:id/export", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid fixture ID" });
      const fixture = await storage.getRebeccaPreviewFixture(id);
      if (!fixture) return res.status(404).json({ error: "Fixture not found" });

      const payload = {
        $kind: FIXTURE_EXPORT_KIND,
        version: FIXTURE_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        fixture: {
          name: fixture.name,
          description: fixture.description,
          settings: fixture.settings,
          turns: fixture.turns,
        },
      };
      const safeName = fixture.name
        .replace(/[^a-z0-9_\-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || `fixture-${fixture.id}`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="rebecca-fixture-${safeName}.json"`,
      );
      logActivity(req, "export-rebecca-fixture", "rebecca_preview_fixture", id, fixture.name);
      return res.send(JSON.stringify(payload, null, 2));
    } catch (err: unknown) {
      logger.error(`Failed to export Rebecca fixture: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to export fixture" });
    }
  });

  // Task #560 — import a fixture export envelope. Validates the snapshot
  // against the current `rebeccaSettingsSchema` after running it through
  // `mergeRebeccaSettings`, so older exports (missing fields the schema has
  // since added) are forward-compat hydrated rather than rejected outright.
  // Duplicate-name imports return 409 with `code: "duplicate_name"` so the
  // UI can prompt the admin for rename or overwrite, then re-call this
  // endpoint with `conflictResolution`.
  app.post("/api/rebecca/fixtures/import", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = fixtureImportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid import payload: " + parsed.error.issues[0]?.message,
        });
      }
      const { payload, conflictResolution } = parsed.data;
      const incoming = payload.fixture;

      // Forward-compat hydrate (older exports may be missing fields the
      // schema has since added) followed by STRICT validation. We use the
      // strict sibling `tryParseRebeccaSettings` rather than
      // `mergeRebeccaSettings` because the latter is the "load-from-DB"
      // helper that silently falls back to DEFAULT_REBECCA_SETTINGS on any
      // parse failure — appropriate for self-healing the chat session,
      // wrong for accepting user-supplied snapshots where we must reject
      // malformed input with a precise 400.
      const settingsParse = tryParseRebeccaSettings(incoming.settings);
      if (!settingsParse.success) {
        const issue = settingsParse.error.issues[0];
        const path = issue?.path?.length ? issue.path.join(".") : "settings";
        return res.status(400).json({
          error: `Imported settings snapshot is incompatible (${path}): ${issue?.message ?? "validation failed"}`,
        });
      }

      const targetName =
        conflictResolution && typeof conflictResolution === "object"
          ? conflictResolution.renameTo
          : incoming.name;
      const description = incoming.description ?? null;
      const user = getAuthUser(req);

      // Look up by name to detect a conflict. We do this in a single round
      // trip — there's still a tiny race against a concurrent create, but
      // the unique constraint on `name` is the authoritative tiebreaker
      // (caught below as a 409).
      const existing = await storage.getRebeccaPreviewFixtureByName(targetName);
      if (existing) {
        if (conflictResolution === "overwrite") {
          // Pass `expectedName` so the UPDATE's WHERE clause guards against
          // a rename race: if the row was renamed between the by-name lookup
          // above and this update, the WHERE matches zero rows and we return
          // a 409 instead of mutating the (now wrong) target.
          const replaced = await storage.replaceRebeccaPreviewFixtureContent(existing.id, {
            description,
            settings: settingsParse.data,
            turns: incoming.turns,
            createdById: user.id,
            expectedName: existing.name,
          });
          if (!replaced) {
            return res.status(409).json({
              error: `Fixture "${existing.name}" was renamed or deleted by another admin — please retry the import`,
              code: "overwrite_target_changed",
            });
          }
          logActivity(req, "import-rebecca-fixture-overwrite", "rebecca_preview_fixture", replaced.id, replaced.name, {
            turnCount: incoming.turns.length,
          });
          logger.info(`Rebecca fixture imported (overwrite): ${replaced.name} (${incoming.turns.length} turns)`, "rebecca");
          return res.json({ fixture: replaced, mode: "overwrite" });
        }
        // Either no resolution at all, or a renameTo that still collides.
        return res.status(409).json({
          error: `A fixture named "${targetName}" already exists`,
          code: "duplicate_name",
          conflictName: targetName,
        });
      }

      // No conflict — create fresh.
      try {
        const created = await storage.createRebeccaPreviewFixture({
          name: targetName,
          description,
          settings: settingsParse.data,
          turns: incoming.turns,
          createdById: user.id,
        });
        logActivity(req, "import-rebecca-fixture-create", "rebecca_preview_fixture", created.id, created.name, {
          turnCount: incoming.turns.length,
          renamedFrom: targetName !== incoming.name ? incoming.name : undefined,
        });
        logger.info(`Rebecca fixture imported (create): ${created.name} (${incoming.turns.length} turns)`, "rebecca");
        return res.json({ fixture: created, mode: "create" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/duplicate key/i.test(msg) || /rebecca_preview_fixtures_name_uq/i.test(msg)) {
          return res.status(409).json({
            error: `A fixture named "${targetName}" already exists`,
            code: "duplicate_name",
            conflictName: targetName,
          });
        }
        throw err;
      }
    } catch (err: unknown) {
      logger.error(`Failed to import Rebecca fixture: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to import fixture" });
    }
  });

  // Task #699 — bulk export: download ALL saved fixtures as a single bundle
  // JSON file. Registered BEFORE the /:id/export route so Express never tries
  // to parse the literal "export" segment as an integer fixture id.
  app.get("/api/rebecca/fixtures/export", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const fixtures = await storage.listRebeccaPreviewFixtures();
      if (fixtures.length === 0) {
        return res.status(404).json({ error: "No fixtures to export" });
      }

      const bundle: FixtureBundleExport = {
        $kind: FIXTURE_BUNDLE_KIND,
        version: FIXTURE_BUNDLE_VERSION,
        exportedAt: new Date().toISOString(),
        count: fixtures.length,
        fixtures: fixtures.map((f) => ({
          $kind: FIXTURE_EXPORT_KIND,
          version: FIXTURE_EXPORT_VERSION,
          exportedAt: new Date().toISOString(),
          fixture: {
            name: f.name,
            description: f.description,
            settings: f.settings as Record<string, unknown>,
            turns: f.turns as Array<{ role: "user" | "assistant"; content: string }>,
          },
        })),
      };

      const dateStamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="rebecca-fixtures-bundle-${dateStamp}.json"`,
      );
      logActivity(req, "export-rebecca-fixtures-bulk", "rebecca_preview_fixture", null, `${fixtures.length} fixtures`);
      logger.info(`Rebecca fixtures bulk export: ${fixtures.length} fixtures`, "rebecca");
      return res.send(JSON.stringify(bundle, null, 2));
    } catch (err: unknown) {
      logger.error(`Failed to bulk-export Rebecca fixtures: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to export fixtures" });
    }
  });

  // Task #699 — bulk import: accepts a bundle (from the bulk export above)
  // and applies a single conflict resolution policy across all fixtures.
  // Returns a summary rather than aborting on first conflict so admins can
  // see the full picture after a single call.
  app.post("/api/rebecca/fixtures/import/bulk", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = bulkImportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid bundle: " + parsed.error.issues[0]?.message,
        });
      }
      const { bundle, defaultConflictResolution } = parsed.data;
      const user = getAuthUser(req);

      const summary = {
        created: 0,
        overwritten: 0,
        skipped: 0,
        errors: [] as Array<{ name: string; error: string }>,
      };

      for (const payload of bundle.fixtures) {
        const incoming = payload.fixture;
        const settingsParse = tryParseRebeccaSettings(incoming.settings);
        if (!settingsParse.success) {
          const issue = settingsParse.error.issues[0];
          summary.errors.push({
            name: incoming.name,
            error: `Settings incompatible (${issue?.path?.join(".") ?? "settings"}): ${issue?.message ?? "validation failed"}`,
          });
          continue;
        }

        try {
          const existing = await storage.getRebeccaPreviewFixtureByName(incoming.name);
          if (existing) {
            if (defaultConflictResolution === "overwrite") {
              const replaced = await storage.replaceRebeccaPreviewFixtureContent(existing.id, {
                description: incoming.description ?? null,
                settings: settingsParse.data,
                turns: incoming.turns,
                createdById: user.id,
                expectedName: existing.name,
              });
              if (replaced) {
                summary.overwritten++;
                logActivity(req, "import-rebecca-fixture-bulk-overwrite", "rebecca_preview_fixture", replaced.id, replaced.name);
              } else {
                summary.errors.push({ name: incoming.name, error: "Overwrite race — row renamed or deleted by another admin" });
              }
            } else {
              summary.skipped++;
            }
          } else {
            const created = await storage.createRebeccaPreviewFixture({
              name: incoming.name,
              description: incoming.description ?? null,
              settings: settingsParse.data,
              turns: incoming.turns,
              createdById: user.id,
            });
            summary.created++;
            logActivity(req, "import-rebecca-fixture-bulk-create", "rebecca_preview_fixture", created.id, created.name);
          }
        } catch (fixtureErr: unknown) {
          const msg = fixtureErr instanceof Error ? fixtureErr.message : String(fixtureErr);
          summary.errors.push({ name: incoming.name, error: msg });
        }
      }

      const total = summary.created + summary.overwritten + summary.skipped + summary.errors.length;
      logger.info(
        `Rebecca fixtures bulk import: ${total} processed — ${summary.created} created, ${summary.overwritten} overwritten, ${summary.skipped} skipped, ${summary.errors.length} errors`,
        "rebecca",
      );
      return res.status(summary.errors.length > 0 && summary.created + summary.overwritten === 0 ? 422 : 200).json(summary);
    } catch (err: unknown) {
      logger.error(`Failed to bulk-import Rebecca fixtures: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to import fixtures" });
    }
  });

  app.delete("/api/rebecca/fixtures/:id", requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid fixture ID" });
      const deleted = await storage.deleteRebeccaPreviewFixture(id);
      if (!deleted) return res.status(404).json({ error: "Fixture not found" });
      logActivity(req, "delete-rebecca-fixture", "rebecca_preview_fixture", id);
      return res.json({ success: true });
    } catch (err: unknown) {
      logger.error(`Failed to delete Rebecca fixture: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      return res.status(500).json({ error: "Failed to delete fixture" });
    }
  });

  app.get("/api/rebecca/analytics", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [conversations, allMessages] = await Promise.all([
        storage.getRebeccaConversations(),
        storage.getAllRebeccaMessageStats(),
      ]);

      const totalConversations = conversations.length;
      const totalMessages = allMessages.length;
      const uniqueUsers = new Set(conversations.map(c => c.userId)).size;

      const turnsPerConv: Record<number, number> = {};
      for (const m of allMessages) {
        turnsPerConv[m.conversationId] = (turnsPerConv[m.conversationId] ?? 0) + 1;
      }
      const turnCounts = Object.values(turnsPerConv).sort((a, b) => a - b);
      const avgTurnsPerConversation = turnCounts.length > 0
        ? Math.round((turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length) * 10) / 10
        : 0;
      const medianTurns = turnCounts.length > 0
        ? turnCounts.length % 2 === 0
          ? (turnCounts[turnCounts.length / 2 - 1] + turnCounts[turnCounts.length / 2]) / 2
          : turnCounts[Math.floor(turnCounts.length / 2)]
        : 0;

      const singleTurnCount = turnCounts.filter(t => t <= 2).length;
      const deepCount = turnCounts.filter(t => t >= 5).length;
      const singleTurnRate = totalConversations > 0 ? Math.round((singleTurnCount / totalConversations) * 100) : 0;
      const deepConversationRate = totalConversations > 0 ? Math.round((deepCount / totalConversations) * 100) : 0;

      const contextBreakdown: Record<string, number> = {};
      for (const c of conversations) {
        const ct = c.contextType ?? "general";
        contextBreakdown[ct] = (contextBreakdown[ct] ?? 0) + 1;
      }

      const modelBreakdown: Record<string, number> = {};
      for (const c of conversations) {
        const m = c.model ?? "unknown";
        modelBreakdown[m] = (modelBreakdown[m] ?? 0) + 1;
      }

      const responseModeBreakdown: Record<string, number> = {};
      for (const m of allMessages) {
        if (m.role === "assistant" && m.metadata) {
          const mode = String((m.metadata as Record<string, unknown>).responseMode ?? "standard");
          responseModeBreakdown[mode] = (responseModeBreakdown[mode] ?? 0) + 1;
        }
      }

      const topicBreakdown: Record<string, number> = {};
      for (const c of conversations) {
        const topic = c.contextType ?? "general";
        topicBreakdown[topic] = (topicBreakdown[topic] ?? 0) + 1;
      }

      const languageBreakdown: Record<string, number> = {};
      for (const m of allMessages) {
        if (m.role === "user" && m.metadata) {
          const lang = String((m.metadata as Record<string, unknown>).language ?? "en");
          languageBreakdown[lang] = (languageBreakdown[lang] ?? 0) + 1;
        } else if (m.role === "user") {
          languageBreakdown["en"] = (languageBreakdown["en"] ?? 0) + 1;
        }
      }

      const dailyVolumes: Record<string, { conversations: number; messages: number }> = {};
      for (const c of conversations) {
        const day = new Date(c.startedAt).toISOString().slice(0, 10);
        if (!dailyVolumes[day]) dailyVolumes[day] = { conversations: 0, messages: 0 };
        dailyVolumes[day].conversations++;
      }
      for (const m of allMessages) {
        const day = new Date(m.createdAt).toISOString().slice(0, 10);
        if (!dailyVolumes[day]) dailyVolumes[day] = { conversations: 0, messages: 0 };
        dailyVolumes[day].messages++;
      }

      const sortedDays = Object.entries(dailyVolumes)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, data]) => ({ date, ...data }));

      const feedback = await storage.getRebeccaFeedback();
      const feedbackByCategory: Record<string, number> = {};
      for (const f of feedback) {
        feedbackByCategory[f.category] = (feedbackByCategory[f.category] ?? 0) + 1;
      }

      res.json({
        totalConversations,
        totalMessages,
        uniqueUsers,
        avgTurnsPerConversation,
        medianTurns,
        singleTurnRate,
        deepConversationRate,
        contextBreakdown,
        topicBreakdown,
        languageBreakdown,
        modelBreakdown,
        responseModeBreakdown,
        dailyVolumes: sortedDays,
        feedbackBreakdown: feedbackByCategory,
        totalFeedback: feedback.length,
      });
    } catch (err: unknown) {
      logger.error(`Failed to compute analytics: ${(err instanceof Error ? err.message : String(err))}`, "rebecca");
      res.status(500).json({ error: "Failed to compute analytics" });
    }
  });
}

function syncKBEntryToVectorStore(entryId: number, title: string, content: string, category: string) {
  upsertChunks("knowledge-base", [{
    id: `admin-kb:${entryId}`,
    text: `${title}\n\n${content}`,
    metadata: { title, content: content.slice(0, 3_000), source: "admin-kb", category },
  }]).catch(e =>
    logger.warn(`Vector store sync failed for KB ${entryId}: ${e instanceof Error ? e.message : e}`, "rebecca")
  );
}

function buildEmailHtml(subject: string, summary: string): string {
  const paragraphs = summary.split("\n").filter(Boolean).map(p => `<p>${p}</p>`).join("");
  return `<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a1a2e; margin-bottom: 16px;">${subject}</h2>
    <div style="color: #333; line-height: 1.6;">${paragraphs}</div>
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e5e5;" />
    <p style="color: #888; font-size: 12px;">Generated by Rebecca AI Analytics</p>
  </div>`;
}
