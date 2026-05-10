import { type Express, type Request, type Response } from "express";
import { storage } from "../../storage";
import { requireAdmin, validatePassword , getAuthUser, sanitizeEmail } from "../../auth";
import { userResponse, createUserSchema, logAndSendError, logActivity, parseParamId, zodErrorMessage } from "../helpers";
import { hashPassword } from "../../auth";
import { VALID_USER_ROLES } from "@workspace/db";
import { UserRole } from "@shared/constants";
import { z } from "zod";
import { sendInvitationEmail } from "../../integrations/resend";
import {
  HTTP_201_CREATED,
  HTTP_400_BAD_REQUEST,
  HTTP_403_FORBIDDEN,
  HTTP_404_NOT_FOUND,
} from "../../constants";
import { logger } from "../../logger";
import crypto from "crypto";

const roleSchema = z.enum(VALID_USER_ROLES);

async function guardSuperAdmin(targetId: number, _req: Request, res: Response): Promise<boolean> {
  const target = await storage.getUserById(targetId);
  if (target && target.role === UserRole.SUPER_ADMIN) {
    res.status(HTTP_403_FORBIDDEN).json({ error: "Super admin accounts cannot be modified", code: "AUSR-009" });
    return true;
  }
  return false;
}

export function registerUserRoutes(app: Express) {
  // ────────────────────────────────────────────────────────────
  // ADMIN: USER MANAGEMENT
  // Full CRUD for user accounts. Only admins can access these endpoints.
  // ────────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map((u: any) => ({ ...userResponse(u), createdAt: u.createdAt, canManageScenarios: u.canManageScenarios ?? true })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch users", error, "AUSR-001");
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const validation = createUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }

      const existingUser = await storage.getUserByEmail(validation.data.email);
      if (existingUser) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "User already exists", code: "AUSR-010" });
      }

      const { email, password, role, firstName, lastName, company, title } = validation.data;

      if (role === UserRole.SUPER_ADMIN) {
        const caller = req.user as { role?: string };
        if (caller.role !== UserRole.SUPER_ADMIN) {
          return res.status(HTTP_403_FORBIDDEN).json({ error: "Only super admins can create super admin accounts", code: "AUSR-011" });
        }
      }

      const passwordHash = password ? await hashPassword(password) : null;

      const user = await storage.createUser({
        email,
        passwordHash,
        role,
        firstName,
        lastName,
        company,
        title,
      });

      logActivity(req, "create-user", "user", user.id, email, { role });
      res.status(HTTP_201_CREATED).json(userResponse(user));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create user", error, "AUSR-002");
    }
  });

  const updateUserSchema = z.object({
    email: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    role: roleSchema.optional(),
    canManageScenarios: z.boolean().optional(),
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      if (await guardSuperAdmin(id, req, res)) return;
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const { email, firstName, lastName, company, title, role, canManageScenarios } = parsed.data;

      if (role !== undefined) {
        const roleResult = roleSchema.safeParse(role);
        if (!roleResult.success) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(", ")}`, code: "AUSR-012" });
        }
        if (role === UserRole.SUPER_ADMIN && getAuthUser(req).role !== UserRole.SUPER_ADMIN) {
          return res.status(HTTP_403_FORBIDDEN).json({ error: "Only a super admin can assign the super admin role", code: "AUSR-013" });
        }
        if (id === getAuthUser(req).id) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: "You cannot change your own role", code: "AUSR-014" });
        }
      }

      if (email !== undefined) {
        const cleanEmail = sanitizeEmail(email);
        const existing = await storage.getUserByEmail(cleanEmail);
        if (existing && existing.id !== id) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: "Email already in use by another user", code: "AUSR-015" });
        }
      }

      const profileData: Record<string, unknown> = {};
      if (email !== undefined) profileData.email = sanitizeEmail(email);
      if (firstName !== undefined) profileData.firstName = firstName;
      if (lastName !== undefined) profileData.lastName = lastName;
      if (company !== undefined) profileData.company = company;
      if (title !== undefined) profileData.title = title;
      if (canManageScenarios !== undefined) profileData.canManageScenarios = canManageScenarios;

      if (Object.keys(profileData).length > 0) {
        await storage.updateUserProfile(id, profileData as Parameters<typeof storage.updateUserProfile>[1]);
      }

      if (role) {
        await storage.updateUserRole(id, role);
      }

      logActivity(req, "update-user", "user", id, email, { fields: Object.keys(req.body) });
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update user", error, "AUSR-003");
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      const roleResult = roleSchema.safeParse(role);
      if (!roleResult.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(", ")}`, code: "AUSR-016" });
      }

      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      if (await guardSuperAdmin(id, req, res)) return;
      if (roleResult.data === UserRole.SUPER_ADMIN && getAuthUser(req).role !== UserRole.SUPER_ADMIN) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Only a super admin can assign the super admin role", code: "AUSR-017" });
      }

      if (id === getAuthUser(req).id) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "You cannot change your own role", code: "AUSR-018" });
      }

      await storage.updateUserRole(id, roleResult.data);
      logActivity(req, "change-role", "user", id, null, { newRole: roleResult.data });
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update user role", error, "AUSR-004");
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      if (await guardSuperAdmin(id, req, res)) return;
      if (id === getAuthUser(req).id) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "You cannot delete yourself", code: "AUSR-019" });
      }

      await storage.deleteUser(id);
      logActivity(req, "delete-user", "user", id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete user", error, "AUSR-005");
    }
  });

  app.patch("/api/admin/users/:id/password", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      if (await guardSuperAdmin(id, req, res)) return;
      const parsed = z.object({ password: z.string().min(6) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const { password } = parsed.data;
      const pwValidationResult = validatePassword(password);
      if (!pwValidationResult.valid) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: pwValidationResult.message });
      }
      const passwordHash = await hashPassword(password);
      await storage.updateUserPassword(id, passwordHash);
      logActivity(req, "reset-password", "user", id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update password", error, "AUSR-006");
    }
  });

  app.patch("/api/admin/users/:id/theme", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      const parsed = z.object({ themeId: z.number().nullable() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const { themeId } = parsed.data;
      await storage.updateUserSelectedTheme(id, themeId ?? null);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to assign theme", error, "AUSR-007");
    }
  });


  const invitationSchema = z.object({
    emails: z.array(z.string().email()).min(1).max(50),
    role: roleSchema.optional().default("user"),
    message: z.string().max(500).optional(),
  });

  app.post("/api/admin/invitations", requireAdmin, async (req, res) => {
    try {
      const validation = invitationSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }

      const { emails, role, message } = validation.data;
      const adminUser = getAuthUser(req);
      const adminProfile = await storage.getUserById(adminUser.id);
      const inviterName = adminProfile
        ? [adminProfile.firstName, adminProfile.lastName].filter(Boolean).join(" ") || adminProfile.email
        : "An administrator";

      const loginUrl = `${req.protocol}://${req.get("host")}/login`;

      const results: { email: string; status: "created" | "existing" | "failed"; error?: string }[] = [];

      for (const email of emails) {
        try {
          const existing = await storage.getUserByEmail(email);
          if (existing) {
            results.push({ email, status: "existing" });
            continue;
          }

          const tempPassword = crypto.randomBytes(6).toString("base64url") + crypto.randomBytes(2).toString("hex").toUpperCase() + "!";
          const passwordHash = await hashPassword(tempPassword);

          await storage.createUser({
            email,
            passwordHash,
            role: role || "user",
            firstName: null,
            lastName: null,
            company: null,
            title: null,
          });

          sendInvitationEmail({
            to: email,
            inviterName,
            tempPassword,
            personalMessage: message,
            loginUrl,
          }).catch(err => {
            logger.warn(`Failed to send invitation email to ${email}: ${err instanceof Error ? err.message : err}`, "invitations");
          });

          results.push({ email, status: "created" });
        } catch (err: unknown) {
          results.push({ email, status: "failed", error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      const created = results.filter(r => r.status === "created").length;
      const existing = results.filter(r => r.status === "existing").length;
      const failed = results.filter(r => r.status === "failed").length;

      logActivity(req, "admin-send-invitations", "user", null, null, {
        emailCount: emails.length, created, existing, failed,
      });

      res.json({ results, summary: { created, existing, failed } });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to send invitations", error, "AUSR-008");
    }
  });
}
