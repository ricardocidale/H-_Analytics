/**
 * Admin routes for management_company_fees and brand_fees tables.
 *
 * GET   /api/admin/management-company-fees          — all Tier A fee rows
 * PATCH /api/admin/management-company-fees/:id      — update a single fee rate
 * GET   /api/admin/brands                           — all business_brands rows
 * POST  /api/admin/brands                           — create a new brand
 * PATCH /api/admin/brands/:slug                     — update brand metadata
 * GET   /api/admin/brand-fees/:brandSlug            — all brand_fees for a slug
 * PATCH /api/admin/brand-fees/:brandSlug/:feeType   — update a single brand fee rate
 */

import { type Express } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { managementCompanyFees, brandFees, businessBrands } from "@workspace/db";
import { requireAdmin, requireAuth } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import {
  HTTP_201_CREATED,
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_409_CONFLICT,
  VARCHAR_SHORT_MAX,
} from "../../constants";

const rateUpdateSchema = z.object({
  rate: z.number().min(0).max(1),
});

const createBrandSchema = z.object({
  slug: z.string().min(1).max(VARCHAR_SHORT_MAX),
  name: z.string().min(1).max(VARCHAR_SHORT_MAX),
  description: z.string().max(VARCHAR_SHORT_MAX).nullable().optional(),
  businessModel: z.enum(["hotel", "str"]).optional(),
  segment: z.string().max(VARCHAR_SHORT_MAX).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateBrandSchema = createBrandSchema.omit({ slug: true }).partial();

/**
 * Non-admin authenticated routes — read-only access to fee tables for
 * the Company Assumptions → Mgmt Co Assumptions tab.
 */
export function registerPublicFeesRoutes(app: Express) {
  app.get("/api/management-company-fees", requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(managementCompanyFees).orderBy(managementCompanyFees.sortOrder);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch management company fees", error, "PFEE-001");
    }
  });

  app.get("/api/brands", requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(businessBrands).orderBy(businessBrands.sortOrder);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch brands", error, "PFEE-002");
    }
  });

  app.get("/api/brand-fees/:brandSlug", requireAuth, async (req, res) => {
    try {
      const brandSlug = String(req.params.brandSlug);
      const rows = await db
        .select()
        .from(brandFees)
        .where(eq(brandFees.brandSlug, brandSlug))
        .orderBy(brandFees.sortOrder);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch brand fees", error, "PFEE-003");
    }
  });
}

export function registerAdminFeesRoutes(app: Express) {
  // ── Management company fees ─────────────────────────────────────────────────

  app.get("/api/admin/management-company-fees", requireAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(managementCompanyFees).orderBy(managementCompanyFees.sortOrder);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch management company fees", error, "AFEE-001");
    }
  });

  app.patch("/api/admin/management-company-fees/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid id", code: "AFEE-002" });
      }

      const validation = rateUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: validation.error.message });
      }

      const [updated] = await db
        .update(managementCompanyFees)
        .set({ rate: validation.data.rate, updatedAt: new Date() })
        .where(eq(managementCompanyFees.id, id))
        .returning();

      if (!updated) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Fee row not found", code: "AFEE-003" });
      }

      logActivity(req, "update-management-company-fee", "management-company-fee", id, updated.label, { rate: validation.data.rate });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update management company fee", error, "AFEE-004");
    }
  });

  // ── Brands ─────────────────────────────────────────────────────────────────

  app.get("/api/admin/brands", requireAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(businessBrands).orderBy(businessBrands.sortOrder);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch brands", error, "AFEE-005");
    }
  });

  app.post("/api/admin/brands", requireAdmin, async (req, res) => {
    try {
      const validation = createBrandSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: validation.error.message });
      }

      const existing = await db.select({ id: businessBrands.id }).from(businessBrands)
        .where(eq(businessBrands.slug, validation.data.slug))
        .limit(1);
      if (existing.length > 0) {
        return res.status(HTTP_409_CONFLICT).json({ error: `Brand slug '${validation.data.slug}' already exists`, code: "AFEE-009" });
      }

      const [created] = await db.insert(businessBrands).values({
        ...validation.data,
        isDefault: false,
      }).returning();

      logActivity(req, "create-brand", "brand", created.id, created.name, { slug: created.slug });
      res.status(HTTP_201_CREATED).json(created);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create brand", error, "AFEE-010");
    }
  });

  app.patch("/api/admin/brands/:slug", requireAdmin, async (req, res) => {
    try {
      const slug = String(req.params.slug);

      const validation = updateBrandSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: validation.error.message });
      }

      if (Object.keys(validation.data).length === 0) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "No fields to update" });
      }

      const [updated] = await db.update(businessBrands)
        .set({ ...validation.data, updatedAt: new Date() })
        .where(eq(businessBrands.slug, slug))
        .returning();

      if (!updated) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Brand not found", code: "AFEE-011" });
      }

      logActivity(req, "update-brand", "brand", updated.id, updated.name, { slug });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update brand", error, "AFEE-012");
    }
  });

  // ── Brand fees ──────────────────────────────────────────────────────────────

  app.get("/api/admin/brand-fees/:brandSlug", requireAdmin, async (req, res) => {
    try {
      const brandSlug = String(req.params.brandSlug);
      const rows = await db
        .select()
        .from(brandFees)
        .where(eq(brandFees.brandSlug, brandSlug))
        .orderBy(brandFees.sortOrder);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch brand fees", error, "AFEE-006");
    }
  });

  app.patch("/api/admin/brand-fees/:brandSlug/:feeType", requireAdmin, async (req, res) => {
    try {
      const brandSlug = String(req.params.brandSlug);
      const feeType = String(req.params.feeType);

      const validation = rateUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: validation.error.message });
      }

      const [updated] = await db
        .update(brandFees)
        .set({ rate: validation.data.rate, updatedAt: new Date() })
        .where(and(eq(brandFees.brandSlug, brandSlug), eq(brandFees.feeType, feeType)))
        .returning();

      if (!updated) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Brand fee row not found", code: "AFEE-007" });
      }

      logActivity(req, "update-brand-fee", "brand-fee", updated.id, `${brandSlug}/${feeType}`, { rate: validation.data.rate });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update brand fee", error, "AFEE-008");
    }
  });
}
