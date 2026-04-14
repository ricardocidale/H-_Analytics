import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin , getAuthUser } from "../auth";
import { insertLogoSchema, insertDesignThemeSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logger } from "../logger";
import { fullName, logAndSendError, parseRouteId } from "./helpers";
import { z } from "zod";

function generateLetterLogoSvg(letter: string, companyName: string): string {
  const ch = (letter || "?").charAt(0).toUpperCase();
  let hash = 0;
  for (let i = 0; i < companyName.length; i++) hash = (hash * 31 + companyName.charCodeAt(i)) & 0x7fffffff;
  const hue = hash % 360;
  const bg = `hsl(${hue}, 35%, 45%)`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">`,
    `<rect width="200" height="200" rx="32" fill="${bg}"/>`,
    `<text x="100" y="100" dy=".35em" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="96" font-weight="600">${ch}</text>`,
    `</svg>`,
  ].join("");
}

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // LOGOS, ASSET DESCRIPTIONS, COMPANIES
  // CRUD for white-label branding entities. Each has standard REST endpoints.
  // GET /api/branding — composite endpoint returning the current user's
  // personalized logo, theme colors, and branding.
  // ────────────────────────────────────────────────────────────

  // Public — no auth required. Returns the system default theme colors for pre-login pages.
  app.get("/api/public/theme", async (_req, res) => {
    try {
      const theme = await storage.getDefaultDesignTheme();
      res.json({
        themeName: theme?.name ?? null,
        themeColors: (theme?.colors as object[]) ?? [],
      });
    } catch (err: unknown) {
      logger.warn(`Failed to load default theme: ${err instanceof Error ? err.message : err}`, "branding");
      res.json({ themeName: null, themeColors: [] });
    }
  });

  app.get("/api/branding", requireAuth, async (req, res) => {
    try {
      const u = getAuthUser(req);
      let companyName = "Hospitality Business Group";
      let logoUrl: string | null = null;
      let userName = fullName(u) || u.email;

      if (!logoUrl) {
        const defaultLogo = await storage.getDefaultLogo();
        if (defaultLogo) logoUrl = defaultLogo.url;
      }

      const ga = await storage.getGlobalAssumptions(u.id);
      if (ga?.companyName) companyName = ga.companyName;

      res.json({ userName, companyName, logoUrl });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch branding", error);
    }
  });

  app.get("/api/my-branding", requireAuth, async (req, res) => {
    try {
      const u = getAuthUser(req);
      let logoUrl: string | null = null;
      let themeName: string | null = null;
      let themeColors: object[] | null = null;
      let groupCompanyName: string | null = null;

      // Resolution chain: user-level override → group-level → system default
      let resolvedTheme = null;

      // 1. User-level theme override
      if (u.selectedThemeId) {
        resolvedTheme = await storage.getDesignTheme(u.selectedThemeId);
      }

      // 2. System default theme
      if (!resolvedTheme) {
        resolvedTheme = await storage.getDefaultDesignTheme();
      }

      if (resolvedTheme) {
        themeName = resolvedTheme.name;
        themeColors = resolvedTheme.colors as object[];
      }

      const ga = await storage.getGlobalAssumptions(u.id);
      const companyName = ga?.companyName || null;

      if (!logoUrl && ga?.companyLogoId) {
        const companyLogo = await storage.getLogo(ga.companyLogoId);
        if (companyLogo) logoUrl = companyLogo.url;
      }

      if (!logoUrl) {
        const defaultLogo = await storage.getDefaultLogo();
        if (defaultLogo) logoUrl = defaultLogo.url;
      }

      res.json({ logoUrl, themeName, themeColors, groupCompanyName, companyName, selectedThemeId: u.selectedThemeId ?? null });
    } catch (error: unknown) {
      logger.error(`Error fetching my-branding: ${error instanceof Error ? error.message : error}`, "branding");
      res.json({ logoUrl: null, themeName: null, themeColors: null, groupCompanyName: null, companyName: null, selectedThemeId: null });
    }
  });

  // Logos CRUD
  app.get("/api/logos", requireAuth, async (req, res) => {
    try {
      const logos = await storage.getAllLogos();
      res.json(logos);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch logos", error);
    }
  });

  app.post("/api/logos", requireAdmin, async (req, res) => {
    try {
      const validation = insertLogoSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const logo = await storage.createLogo(validation.data);
      res.status(201).json(logo);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create logo", error);
    }
  });

  app.delete("/api/logos/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid logo ID" });
      const logo = await storage.getLogo(id);
      if (logo?.isDefault) {
        return res.status(400).json({ error: "Cannot delete the management company default logo" });
      }
      if (logo?.isAppLogo) {
        return res.status(400).json({ error: "Cannot delete the app logo — assign a different app logo first" });
      }
      await storage.deleteLogo(id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete logo", error);
    }
  });

  app.patch("/api/logos/:id/default", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid logo ID" });
      await storage.setDefaultLogo(id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to set default logo", error);
    }
  });

  app.get("/api/app-branding", requireAuth, async (req, res) => {
    try {
      const appLogo = await storage.getAppLogo();
      res.json({
        appName: appLogo?.companyName ?? "H+ Analytics",
        appLogoUrl: appLogo?.url ?? "/logos/h-logo-glass.png",
        appLogoId: appLogo?.id ?? null,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch app branding", error);
    }
  });

  app.patch("/api/app-branding", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        appLogoId: z.number(),
        appName: z.string().min(1).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      await storage.setAppLogo(parsed.data.appLogoId);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update app branding", error);
    }
  });

  // Property Descriptions CRUD
  app.get("/api/asset-descriptions", requireAuth, async (req, res) => {
    try {
      const descriptions = await storage.getAllAssetDescriptions();
      res.json(descriptions);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch asset descriptions", error);
    }
  });

  app.get("/api/letter-logo/:name", requireAuth, (req, res) => {
    const raw = decodeURIComponent(req.params.name as string);
    const name = raw.replace(/[<>&"'/\\]/g, "").substring(0, 100);
    const letter = name.charAt(0) || "?";
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(generateLetterLogoSvg(letter, name));
  });

  // Design Themes CRUD
  app.get("/api/available-themes", requireAuth, async (req, res) => {
    try {
      const themes = await storage.getAllDesignThemes();
      res.json(themes.map(t => ({ id: t.id, name: t.name, description: t.description, isDefault: t.isDefault, isSystem: t.isSystem, colors: t.colors })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch themes", error);
    }
  });

  app.get("/api/admin/design-themes", requireAdmin, async (req, res) => {
    try {
      const themes = await storage.getAllDesignThemes();
      res.json(themes);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch themes", error);
    }
  });

  app.post("/api/admin/design-themes", requireAdmin, async (req, res) => {
    try {
      const validation = insertDesignThemeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const theme = await storage.createDesignTheme(validation.data);
      res.status(201).json(theme);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create theme", error);
    }
  });

  const updateDesignThemeSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    colors: z.array(z.object({
      rank: z.number(),
      name: z.string(),
      hexCode: z.string(),
      description: z.string(),
    })).optional(),
    isDefault: z.boolean().optional(),
  });

  app.patch("/api/admin/design-themes/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid theme ID" });
      const existing = await storage.getDesignTheme(id);
      const parsed = updateDesignThemeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const isSettingDefault = parsed.data.isDefault === true;
      if (existing?.isSystem && !isSettingDefault) {
        return res.status(403).json({ error: "System themes cannot be edited" });
      }
      const theme = await storage.updateDesignTheme(id, parsed.data);
      res.json(theme);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update theme", error);
    }
  });

  app.delete("/api/admin/design-themes/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid theme ID" });
      const theme = await storage.getDesignTheme(id);
      if (theme?.isDefault) {
        return res.status(400).json({ error: "Cannot delete the default theme" });
      }
      await storage.deleteDesignTheme(id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete theme", error);
    }
  });
}
