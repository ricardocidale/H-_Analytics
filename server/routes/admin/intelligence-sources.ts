import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerSourceRoutes(app: Express) {
  app.get("/api/admin/source-registry", requireAdmin, async (_req, res) => {
    try {
      const sources = await storage.getSourceRegistry();
      res.json(sources);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch source registry", error);
    }
  });

  app.post("/api/admin/source-registry", requireAdmin, async (req, res) => {
    try {
      const bodySchema = z.object({
        serviceKey: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i),
        name: z.string().min(1).max(200),
        sourceType: z.string().min(1).max(100),
        category: z.enum(["apis", "scrapers", "sources", "models"]),
        description: z.string().max(500).optional(),
        endpoint: z.string().url().optional().or(z.literal("")),
        apiKeyRef: z.string().max(200).optional(),
        rateLimitPerMin: z.number().int().min(0).max(10000).optional(),
        costPerCall: z.string().max(50).optional(),
        dataProvided: z.array(z.string().max(50)).max(20).optional(),
        cadence: z.string().max(50).optional(),
        trustScore: z.enum(["verified", "estimated", "unverified"]).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      const created = await storage.createSourceRegistryEntry(parsed.data);
      logActivity(req, "create-source", "source_registry", created.id, created.name);
      res.status(201).json(created);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create source registry entry", error);
    }
  });

  app.patch("/api/admin/source-registry/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const bodySchema = z.object({
        name: z.string().min(1).max(200).optional(),
        sourceType: z.string().min(1).max(100).optional(),
        category: z.enum(["apis", "scrapers", "sources", "models"]).optional(),
        description: z.string().max(500).optional(),
        endpoint: z.string().url().optional().or(z.literal("")),
        apiKeyRef: z.string().max(200).optional(),
        rateLimitPerMin: z.number().int().min(0).max(10000).optional(),
        costPerCall: z.string().max(50).optional(),
        dataProvided: z.array(z.string().max(50)).max(20).optional(),
        cadence: z.string().max(50).optional(),
        trustScore: z.enum(["verified", "estimated", "unverified"]).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const updated = await storage.updateSourceRegistryEntry(id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Source not found" });
      logActivity(req, "update-source", "source_registry", id, updated.name, { fields: Object.keys(parsed.data) });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update source registry entry", error);
    }
  });

  app.patch("/api/admin/source-registry/:id/toggle", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") return res.status(400).json({ error: "isActive must be a boolean" });
      const updated = await storage.updateSourceRegistryEntry(id, { isActive });
      if (!updated) return res.status(404).json({ error: "Source not found" });
      logActivity(req, "toggle-source", "source_registry", id, updated.name, { isActive });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to toggle source", error);
    }
  });

  app.delete("/api/admin/source-registry/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getSourceRegistryEntry(id);
      if (!existing) return res.status(404).json({ error: "Source not found" });
      await storage.deleteSourceRegistryEntry(id);
      logActivity(req, "delete-source", "source_registry", id, existing.name);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete source", error);
    }
  });

  app.get("/api/admin/source-registry/:id/logs", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const source = await storage.getSourceRegistryEntry(id);
      if (!source) return res.status(404).json({ error: "Source not found" });
      const logs = await storage.getSourceCallLogs(id, 50);
      res.json(logs);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch source call logs", error);
    }
  });

  app.post("/api/admin/source-registry/:id/test", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const source = await storage.getSourceRegistryEntry(id);
      if (!source) return res.status(404).json({ error: "Source not found" });

      const startTime = Date.now();
      let healthy = false;
      let errorMsg: string | undefined;
      let httpStatus: number | undefined;

      if (source.endpoint) {
        try {
          const url = new URL(source.endpoint);
          if (!["https:", "http:"].includes(url.protocol)) {
            return res.status(400).json({ error: "Only HTTP(S) endpoints are supported" });
          }
          const rawHostname = url.hostname.toLowerCase();
          const hostname = rawHostname.replace(/^\[|\]$/g, "");

          const isPrivateAddr = (addr: string): boolean => {
            const h = addr.replace(/^\[|\]$/g, "").toLowerCase();
            if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
            if (h.endsWith(".local") || h.endsWith(".internal")) return true;
            if (h.includes("metadata.google") || h.includes("metadata.aws")) return true;
            if (/^(127\.|10\.|0\.|192\.168\.|169\.254\.)/.test(h)) return true;
            if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
            if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(h) || /^fe80:/i.test(h)) return true;
            return false;
          };

          if (isPrivateAddr(hostname)) {
            return res.status(400).json({ error: "Internal/private endpoints are not allowed" });
          }

          const dns = await import("dns");
          const ipv4 = await dns.promises.resolve4(hostname).catch(() => [] as string[]);
          const ipv6 = await dns.promises.resolve6(hostname).catch(() => [] as string[]);
          const allResolved = [...ipv4, ...ipv6];
          if (allResolved.some(isPrivateAddr)) {
            return res.status(400).json({ error: "Endpoint resolves to a private IP address" });
          }

          if (allResolved.length === 0) {
            return res.status(400).json({ error: "Could not resolve endpoint hostname" });
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(source.endpoint, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "manual",
          }).catch(() => fetch(source.endpoint!, { method: "GET", signal: controller.signal, redirect: "manual" }));
          clearTimeout(timeout);
          httpStatus = response.status;
          healthy = response.ok || response.status < 500;
        } catch (err: unknown) {
          errorMsg = err instanceof Error ? err.message : "Connection failed";
        }
      } else {
        healthy = source.isActive;
        if (!healthy) errorMsg = "No endpoint configured and source is inactive";
      }

      const latencyMs = Date.now() - startTime;

      const now = new Date();
      await storage.updateSourceRegistryEntry(id, { lastHealthCheck: now });

      await storage.createSourceCallLog({
        sourceId: id,
        serviceKey: source.serviceKey,
        httpStatus: httpStatus ?? null,
        latencyMs,
        success: healthy,
        errorMessage: errorMsg ?? null,
      });

      logActivity(req, "test-source", "source_registry", id, source.name, { healthy, latencyMs });
      res.json({ healthy, latencyMs, error: errorMsg });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to test source connectivity", error);
    }
  });
}
