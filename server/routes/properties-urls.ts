import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, requireManagementAccess, checkPropertyAccess, getAuthUser } from "../auth";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { logActivity, logAndSendError, parseRouteId } from "./helpers";
import { logger } from "../logger";

const httpUrlSchema = z.string().url().max(2048).refine(
  (val) => { try { const u = new URL(val); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } },
  { message: "Only http and https URLs are allowed" },
);

const addPropertyUrlSchema = z.object({
  url: httpUrlSchema,
  label: z.string().max(200).optional(),
});

const updatePropertyUrlSchema = z.object({
  url: httpUrlSchema.optional(),
  label: z.string().max(200).optional(),
  isValid: z.boolean().optional(),
  isRelevant: z.boolean().optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
});

const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "metadata.google.internal", "169.254.169.254"];

function isSafeUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(host)) return false;
    if (host.endsWith(".internal") || host.endsWith(".local")) return false;
    if (/^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(host)) return false;
    return true;
  } catch { return false; }
}

function extractMeta(html: string): { title: string; description: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']description["']/i);
  return {
    title: (titleMatch?.[1] || "").trim().slice(0, 200),
    description: (descMatch?.[1] || "").trim().slice(0, 500),
  };
}

async function scoreRelevanceAI(
  urlEntries: Array<{ id: number; url: string; title: string; description: string; hostname: string }>,
  propName: string, propLocation: string, propType: string
): Promise<Map<number, { isRelevant: boolean; relevanceScore: number }>> {
  const results = new Map<number, { isRelevant: boolean; relevanceScore: number }>();
  if (urlEntries.length === 0) return results;
  try {
    const { getGeminiClient } = await import("../ai/clients");
    const gemini = getGeminiClient();
    const urlList = urlEntries.map((e, i) =>
      `${i + 1}. [ID:${e.id}] ${e.hostname} — Title: "${e.title || "N/A"}" — Description: "${e.description || "N/A"}" — URL: ${e.url}`
    ).join("\n");
    const prompt = `You are a hospitality property research assistant. Score each URL for relevance to this property:
Property: ${propName}
Location: ${propLocation}
Type: ${propType}

URLs to score:
${urlList}

For each URL, return a JSON array of objects: [{"id": <ID>, "score": <0.0-1.0>, "relevant": <true/false>}]
Score > 0.6 means relevant. Consider: Is this URL about this specific property? Is it a listing, review, map, or reference for this property or its local market? Hospitality platform links (Airbnb, VRBO, Booking, etc.) for this property score high.
Return ONLY the JSON array, no other text.`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 512 },
    });

    const text = response.text?.trim() || "[]";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ id: number; score: number; relevant: boolean }>;
    for (const item of parsed) {
      if (typeof item.id === "number" && typeof item.score === "number") {
        results.set(item.id, {
          isRelevant: item.relevant === true || item.score >= 0.6,
          relevanceScore: Math.min(Math.max(item.score, 0), 1),
        });
      }
    }
  } catch (err: unknown) {
    logger.warn(`AI relevance scoring failed, using heuristic fallback: ${err instanceof Error ? err.message : "unknown"}`, "property-urls");
    const RELEVANT_DOMAINS = ["airbnb", "vrbo", "booking", "expedia", "tripadvisor", "hotels", "zillow", "realtor", "loopnet", "costar"];
    for (const entry of urlEntries) {
      const isDomainRelevant = RELEVANT_DOMAINS.some(d => entry.hostname.includes(d));
      results.set(entry.id, {
        isRelevant: isDomainRelevant,
        relevanceScore: isDomainRelevant ? 0.8 : 0.3,
      });
    }
  }
  return results;
}

export function registerPropertyUrlRoutes(app: Express) {
  app.get("/api/property-urls/all", requireAdmin, async (_req, res) => {
    try {
      const urls = await storage.getAllPropertyUrls();
      res.json(urls);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch all property URLs", error);
    }
  });

  app.get("/api/properties/:id/urls", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const urls = await storage.getPropertyUrls(propertyId);
      res.json(urls);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch property URLs", error);
    }
  });

  app.post("/api/properties/:id/urls", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const parsed = addPropertyUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const existing = await storage.getPropertyUrls(propertyId);
      if (existing.some(u => u.url === parsed.data.url)) {
        return res.status(409).json({ error: "URL already exists for this property" });
      }
      const row = await storage.addPropertyUrl({
        propertyId,
        url: parsed.data.url,
        label: parsed.data.label ?? null,
      });
      logActivity(req, "add-url", "property", propertyId, parsed.data.url);
      res.status(201).json(row);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to add property URL", error);
    }
  });

  app.patch("/api/properties/:id/urls/:urlId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const urlId = parseRouteId(req.params.urlId);
      if (!propertyId || !urlId) return res.status(400).json({ error: "Invalid ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const existing = await storage.getPropertyUrlById(urlId);
      if (!existing || existing.propertyId !== propertyId) {
        return res.status(404).json({ error: "URL not found" });
      }
      const parsed = updatePropertyUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const updateData = { ...parsed.data };
      if (updateData.url && updateData.url !== existing.url) {
        (updateData as Record<string, unknown>).isValid = null;
        (updateData as Record<string, unknown>).isRelevant = null;
        (updateData as Record<string, unknown>).relevanceScore = null;
      }
      const updated = await storage.updatePropertyUrl(urlId, updateData);
      logActivity(req, "update-url", "property", propertyId, parsed.data.url ?? existing.url);
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update property URL", error);
    }
  });

  app.delete("/api/properties/:id/urls/:urlId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const urlId = parseRouteId(req.params.urlId);
      if (!propertyId || !urlId) return res.status(400).json({ error: "Invalid ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const existing = await storage.getPropertyUrlById(urlId);
      if (!existing || existing.propertyId !== propertyId) {
        return res.status(404).json({ error: "URL not found" });
      }
      await storage.deletePropertyUrl(urlId);
      try {
        const { deleteVectors, isVectorStoreAvailable } = await import("../ai/vector-store-service");
        if (isVectorStoreAvailable()) {
          await deleteVectors("properties", [`prop-url:${propertyId}:${urlId}`]);
        }
      } catch (e: unknown) {
        logger.warn(`Failed to remove URL vector: ${(e instanceof Error ? e.message : String(e))}`, "property-urls");
      }
      logActivity(req, "delete-url", "property", propertyId, existing.url);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete property URL", error);
    }
  });

  app.post("/api/properties/:id/urls/validate-all", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) {
        return res.status(403).json({ error: "Access denied" });
      }
      const urls = await storage.getPropertyUrls(propertyId);
      if (urls.length === 0) {
        return res.json({ validated: 0, results: [] });
      }

      interface FetchResult {
        id: number; url: string; isValid: boolean; status: number;
        title: string; description: string; hostname: string;
        error?: string;
      }
      const fetchResults: FetchResult[] = await Promise.all(
        urls.map(async (u): Promise<FetchResult> => {
          if (!(await isSafeUrl(u.url))) {
            await storage.updatePropertyUrl(u.id, { isValid: false, lastCheckedAt: new Date() });
            return { id: u.id, url: u.url, isValid: false, status: 0, title: "", description: "", hostname: "", error: "Blocked: internal or private URL" };
          }
          try {
            const parsed = new URL(u.url);
            const hostname = parsed.hostname;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            const response = await fetch(u.url, {
              method: "GET",
              signal: controller.signal,
              headers: { "User-Agent": "HBG-URLValidator/1.0" },
              redirect: "follow",
            });
            clearTimeout(timeout);
            const html = await response.text();
            const meta = extractMeta(html);
            const isValid = response.ok;
            await storage.updatePropertyUrl(u.id, { isValid, lastCheckedAt: new Date() });
            return { id: u.id, url: u.url, isValid, status: response.status, title: meta.title, description: meta.description, hostname };
          } catch (err: unknown) {
            await storage.updatePropertyUrl(u.id, { isValid: false, lastCheckedAt: new Date() });
            return { id: u.id, url: u.url, isValid: false, status: 0, title: "", description: "", hostname: "", error: err instanceof Error ? err.message : "Unknown error" };
          }
        })
      );

      const validFetches = fetchResults.filter(r => r.isValid && !r.error);
      const aiScores = await scoreRelevanceAI(
        validFetches,
        property!.name,
        property!.location,
        property!.hospitalityType || "hotel"
      );

      const results = await Promise.all(
        fetchResults.map(async (r) => {
          const scores = aiScores.get(r.id) || { isRelevant: false, relevanceScore: 0 };
          const isRelevant = r.isValid ? scores.isRelevant : false;
          const relevanceScore = r.isValid ? scores.relevanceScore : 0;

          const metadata: Record<string, unknown> = {};
          if (r.title) metadata.title = r.title;
          if (r.description) metadata.description = r.description;
          if (r.hostname) metadata.hostname = r.hostname;
          metadata.validatedAt = new Date().toISOString();
          metadata.scoredByAI = true;

          if (!r.error) {
            await storage.updatePropertyUrl(r.id, {
              isValid: r.isValid,
              isRelevant,
              relevanceScore,
              lastCheckedAt: new Date(),
              metadata,
            });
          }

          return { id: r.id, url: r.url, isValid: r.isValid, isRelevant, relevanceScore, status: r.status, title: r.title, ...(r.error ? { error: r.error } : {}) };
        })
      );

      const relevantUrls = results.filter(r => r.isValid && r.isRelevant);
      const staleUrls = results.filter(r => !r.isValid || !r.isRelevant);
      try {
        const { upsertChunks, deleteVectors, isVectorStoreAvailable } = await import("../ai/vector-store-service");
        if (isVectorStoreAvailable()) {
          if (staleUrls.length > 0) {
            const staleIds = staleUrls.map(r => `prop-url:${propertyId}:${r.id}`);
            await deleteVectors("properties", staleIds);
            logger.info(`Removed ${staleIds.length} stale URL vectors for property ${propertyId}`, "property-urls");
          }
          if (relevantUrls.length > 0) {
            const chunks = relevantUrls.map(r => ({
              id: `prop-url:${propertyId}:${r.id}`,
              text: `Property ${property!.name} (${property!.location}) reference link: ${r.url} ${r.title || ""}`,
              metadata: {
                propertyId,
                propertyName: property!.name,
                location: property!.location,
                url: r.url,
                title: r.title || "",
                relevanceScore: r.relevanceScore ?? 0,
                type: "property-url",
              },
            }));
            await upsertChunks("properties", chunks);
            logger.info(`Indexed ${chunks.length} relevant URLs for property ${propertyId}`, "property-urls");
          }
        }
      } catch (e: unknown) {
        logger.warn(`Failed to manage property URL vectors in Vector store: ${(e instanceof Error ? e.message : String(e))}`, "property-urls");
      }

      res.json({ validated: results.length, results });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to validate property URLs", error);
    }
  });
}
