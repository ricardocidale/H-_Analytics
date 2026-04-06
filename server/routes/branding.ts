import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin , getAuthUser } from "../auth";
import { insertLogoSchema, insertCompanySchema, insertUserGroupSchema, insertDesignThemeSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logger } from "../logger";
import { fullName, logAndSendError } from "./helpers";
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
  // LOGOS, ASSET DESCRIPTIONS, USER GROUPS, COMPANIES
  // CRUD for white-label branding entities. Each has standard REST endpoints.
  // GET /api/branding — composite endpoint returning the current user's
  // personalized logo, theme colors, and group branding.
  // ────────────────────────────────────────────────────────────

  // Public — no auth required. Returns the system default theme colors for pre-login pages.
  app.get("/api/public/theme", async (_req, res) => {
    try {
      const theme = await storage.getDefaultDesignTheme();
      res.json({
        themeName: theme?.name ?? null,
        themeColors: (theme?.colors as object[]) ?? [],
      });
    } catch (err) {
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

      if (u.companyId) {
        const comp = await storage.getCompany(u.companyId);
        if (comp) {
          companyName = comp.name;
          if (comp.logoId) {
            const logo = await storage.getLogo(comp.logoId);
            if (logo) {
              logoUrl = logo.url;
              if (logo.companyName) companyName = logo.companyName;
            }
          }
        }
      }

      if (!logoUrl) {
        const defaultLogo = await storage.getDefaultLogo();
        if (defaultLogo) logoUrl = defaultLogo.url;
      }

      const ga = await storage.getGlobalAssumptions(u.id);
      if (ga?.companyName) companyName = ga.companyName;

      res.json({ userName, companyName, logoUrl });
    } catch (error) {
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

      // 2. Company-level logo
      if (u.companyId) {
        const comp = await storage.getCompany(u.companyId);
        if (comp?.logoId) {
          const logo = await storage.getLogo(comp.logoId);
          if (logo) {
            logoUrl = logo.url;
            if (logo.companyName) groupCompanyName = logo.companyName;
          }
        }
      }

      // 3. Group-level theme
      if (!resolvedTheme && u.userGroupId) {
        const group = await storage.getUserGroup(u.userGroupId);
        if (group?.themeId) {
          resolvedTheme = await storage.getDesignTheme(group.themeId);
        }
      }

      // 4. System default theme
      if (!resolvedTheme) {
        resolvedTheme = await storage.getDefaultDesignTheme();
      }

      let iconSet: string = "lucide";
      if (resolvedTheme) {
        themeName = resolvedTheme.name;
        themeColors = resolvedTheme.colors as object[];
        iconSet = resolvedTheme.iconSet ?? "lucide";
      }

      if (!logoUrl) {
        const defaultLogo = await storage.getDefaultLogo();
        if (defaultLogo) logoUrl = defaultLogo.url;
      }

      const ga = await storage.getGlobalAssumptions(u.id);
      const companyName = ga?.companyName || null;

      res.json({ logoUrl, themeName, themeColors, groupCompanyName, companyName, selectedThemeId: u.selectedThemeId ?? null, iconSet });
    } catch (error) {
      logger.error(`Error fetching my-branding: ${error instanceof Error ? error.message : error}`, "branding");
      res.json({ logoUrl: null, themeName: null, themeColors: null, groupCompanyName: null, companyName: null, selectedThemeId: null, iconSet: "lucide" });
    }
  });

  // Logos CRUD
  app.get("/api/logos", requireAuth, async (req, res) => {
    try {
      const logos = await storage.getAllLogos();
      res.json(logos);
    } catch (error) {
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
    } catch (error) {
      logAndSendError(res, "Failed to create logo", error);
    }
  });

  app.delete("/api/logos/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteLogo(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete logo", error);
    }
  });

  // Property Descriptions CRUD
  app.get("/api/asset-descriptions", requireAuth, async (req, res) => {
    try {
      const descriptions = await storage.getAllAssetDescriptions();
      res.json(descriptions);
    } catch (error) {
      logAndSendError(res, "Failed to fetch asset descriptions", error);
    }
  });

  // User Groups CRUD
  app.get("/api/user-groups", requireAuth, async (req, res) => {
    try {
      const groups = await storage.getAllUserGroups();
      res.json(groups);
    } catch (error) {
      logAndSendError(res, "Failed to fetch user groups", error);
    }
  });

  app.post("/api/user-groups", requireAdmin, async (req, res) => {
    try {
      const validation = insertUserGroupSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const data = validation.data;
      if (!data.themeId) {
        const defaultTheme = await storage.getDefaultDesignTheme();
        if (defaultTheme) data.themeId = defaultTheme.id;
      }
      const group = await storage.createUserGroup(data);
      res.status(201).json(group);
    } catch (error) {
      logAndSendError(res, "Failed to create user group", error);
    }
  });

  const updateUserGroupSchema = z.object({
    name: z.string().min(1).optional(),
    logoId: z.number().nullable().optional(),
    themeId: z.number().nullable().optional(),
    assetDescriptionId: z.number().nullable().optional(),
  });

  app.patch("/api/user-groups/:id", requireAdmin, async (req, res) => {
    try {
      const parsed = updateUserGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const group = await storage.updateUserGroup(Number(req.params.id), parsed.data);
      res.json(group);
    } catch (error) {
      logAndSendError(res, "Failed to update user group", error);
    }
  });

  app.delete("/api/user-groups/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteUserGroup(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete user group", error);
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

  // Companies CRUD
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      logAndSendError(res, "Failed to fetch companies", error);
    }
  });

  app.post("/api/companies", requireAdmin, async (req, res) => {
    try {
      const validation = insertCompanySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const data = { ...validation.data };
      if (!data.themeId) {
        const defaultTheme = await storage.getDefaultDesignTheme();
        if (defaultTheme) data.themeId = defaultTheme.id;
      }
      const company = await storage.createCompany(data);
      if (!data.logoId) {
        const defaultLogo = await storage.getDefaultLogo();
        if (defaultLogo) {
          await storage.updateCompany(company.id, { logoId: defaultLogo.id });
          company.logoId = defaultLogo.id;
        }
      }
      res.status(201).json(company);
    } catch (error) {
      logAndSendError(res, "Failed to create company", error);
    }
  });

  const updateCompanySchema = z.object({
    name: z.string().min(1).optional(),
    type: z.enum(["management", "spv"]).optional(),
    description: z.string().nullable().optional(),
    logoId: z.number().nullable().optional(),
    themeId: z.number().nullable().optional(),
    isActive: z.boolean().optional(),
  });

  app.patch("/api/companies/:id", requireAdmin, async (req, res) => {
    try {
      const parsed = updateCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const existing = await storage.getCompany(Number(req.params.id));
      if (existing?.name === "General" && parsed.data.name && parsed.data.name !== "General") {
        return res.status(400).json({ error: "The General company cannot be renamed" });
      }
      const company = await storage.updateCompany(Number(req.params.id), parsed.data);
      res.json(company);
    } catch (error) {
      logAndSendError(res, "Failed to update company", error);
    }
  });

  app.delete("/api/companies/:id", requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getCompany(Number(req.params.id));
      if (existing?.name === "General") {
        return res.status(400).json({ error: "The General company cannot be deleted" });
      }
      await storage.deleteCompany(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete company", error);
    }
  });

  // Design Themes CRUD
  app.get("/api/available-themes", requireAuth, async (req, res) => {
    try {
      const themes = await storage.getAllDesignThemes();
      res.json(themes.map(t => ({ id: t.id, name: t.name, description: t.description, isDefault: t.isDefault, isSystem: t.isSystem, colors: t.colors, iconSet: t.iconSet })));
    } catch (error) {
      logAndSendError(res, "Failed to fetch themes", error);
    }
  });

  app.get("/api/admin/design-themes", requireAdmin, async (req, res) => {
    try {
      const themes = await storage.getAllDesignThemes();
      res.json(themes);
    } catch (error) {
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
    } catch (error) {
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
    iconSet: z.enum(["lucide", "phosphor", "material"]).optional(),
    isDefault: z.boolean().optional(),
  });

  app.patch("/api/admin/design-themes/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
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
    } catch (error) {
      logAndSendError(res, "Failed to update theme", error);
    }
  });

  app.delete("/api/admin/design-themes/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const theme = await storage.getDesignTheme(id);
      if (theme?.isDefault) {
        return res.status(400).json({ error: "Cannot delete the default theme" });
      }
      await storage.deleteDesignTheme(id);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to delete theme", error);
    }
  });
}
