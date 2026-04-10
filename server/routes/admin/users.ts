import { type Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, validatePassword , getAuthUser, sanitizeEmail } from "../../auth";
import { userResponse, createUserSchema, logAndSendError, logActivity, parseParamId } from "../helpers";
import { fromZodError } from "zod-validation-error";
import { hashPassword } from "../../auth";
import { VALID_USER_ROLES } from "../../../shared/schema/index.js";
import { z } from "zod";
import { sendInvitationEmail } from "../../integrations/resend";
import { logger } from "../../logger";
import crypto from "crypto";

const roleSchema = z.enum(VALID_USER_ROLES);

export function registerUserRoutes(app: Express) {
  // ────────────────────────────────────────────────────────────
  // ADMIN: USER MANAGEMENT
  // Full CRUD for user accounts. Only admins can access these endpoints.
  // ────────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map((u: any) => ({ ...userResponse(u), createdAt: u.createdAt, userGroupId: u.userGroupId, canManageScenarios: u.canManageScenarios ?? true })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch users", error);
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const validation = createUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const existingUser = await storage.getUserByEmail(validation.data.email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const { email, password, role, firstName, lastName, company, companyId, title, userGroupId } = validation.data;
      const passwordHash = password ? await hashPassword(password) : null;

      const defaultGroup = await storage.getDefaultUserGroup();

      const user = await storage.createUser({
        email,
        passwordHash,
        role,
        firstName,
        lastName,
        company,
        companyId,
        title,
        userGroupId: userGroupId !== undefined ? userGroupId : (defaultGroup?.id ?? null),
      });

      logActivity(req, "create-user", "user", user.id, email, { role });
      res.status(201).json(userResponse(user));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create user", error);
    }
  });

  const updateUserSchema = z.object({
    email: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().nullable().optional(),
    companyId: z.number().nullable().optional(),
    title: z.string().nullable().optional(),
    role: roleSchema.optional(),
    userGroupId: z.number().nullable().optional(),
    canManageScenarios: z.boolean().optional(),
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { email, firstName, lastName, company, companyId, title, role, userGroupId, canManageScenarios } = parsed.data;

      if (role !== undefined) {
        const roleResult = roleSchema.safeParse(role);
        if (!roleResult.success) {
          return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(", ")}` });
        }
        if (id === getAuthUser(req).id) {
          return res.status(400).json({ error: "You cannot change your own role" });
        }
      }

      if (email !== undefined) {
        const cleanEmail = sanitizeEmail(email);
        const existing = await storage.getUserByEmail(cleanEmail);
        if (existing && existing.id !== id) {
          return res.status(400).json({ error: "Email already in use by another user" });
        }
      }

      const profileData: Record<string, unknown> = {};
      if (email !== undefined) profileData.email = sanitizeEmail(email);
      if (firstName !== undefined) profileData.firstName = firstName;
      if (lastName !== undefined) profileData.lastName = lastName;
      if (company !== undefined) profileData.company = company;
      if (companyId !== undefined) profileData.companyId = companyId;
      if (title !== undefined) profileData.title = title;
      if (userGroupId !== undefined) profileData.userGroupId = userGroupId;
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
      logAndSendError(res, "Failed to update user", error);
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      const roleResult = roleSchema.safeParse(role);
      if (!roleResult.success) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(", ")}` });
      }

      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;

      if (id === getAuthUser(req).id) {
        return res.status(400).json({ error: "You cannot change your own role" });
      }

      await storage.updateUserRole(id, roleResult.data);
      logActivity(req, "change-role", "user", id, null, { newRole: roleResult.data });
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update user role", error);
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      if (id === getAuthUser(req).id) {
        return res.status(400).json({ error: "You cannot delete yourself" });
      }

      await storage.deleteUser(id);
      logActivity(req, "delete-user", "user", id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete user", error);
    }
  });

  app.patch("/api/admin/users/:id/password", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      const parsed = z.object({ password: z.string().min(6) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { password } = parsed.data;
      const pwValidationResult = validatePassword(password);
      if (!pwValidationResult.valid) {
        return res.status(400).json({ error: pwValidationResult.message });
      }
      const passwordHash = await hashPassword(password);
      await storage.updateUserPassword(id, passwordHash);
      logActivity(req, "reset-password", "user", id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update password", error);
    }
  });

  app.patch("/api/admin/users/:id/group", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      const parsed = z.object({ groupId: z.number().nullable() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { groupId } = parsed.data;
      const user = await storage.assignUserToGroup(id, groupId ?? null);
      res.json(user);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to assign user to group", error);
    }
  });

  app.patch("/api/admin/users/:id/theme", requireAdmin, async (req, res) => {
    try {
      const id = parseParamId(req.params.id, res, "user ID");
      if (id === null) return;
      const parsed = z.object({ themeId: z.number().nullable() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { themeId } = parsed.data;
      await storage.updateUserSelectedTheme(id, themeId ?? null);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to assign theme", error);
    }
  });

  app.post("/api/admin/reset-all-passwords", requireAdmin, async (req, res) => {
    try {
      const parsed = z.object({
        password: z.string().min(6),
        confirm: z.string(),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { password, confirm } = parsed.data;
      if (confirm.trim() !== "RESET ALL PASSWORDS") {
        return res.status(400).json({ error: "Confirmation phrase required" });
      }
      const pwValidation = validatePassword(password);
      if (!pwValidation.valid) {
        return res.status(400).json({ error: pwValidation.message });
      }
      const allUsers = await storage.getAllUsers();
      const newHash = await hashPassword(password);
      // Update all passwords — if any fails, partial state is acceptable since
      // all passwords are being set to the same value. The admin can retry.
      let count = 0;
      for (const user of allUsers) {
        await storage.updateUserPassword(user.id, newHash);
        count++;
      }
      logActivity(req, "reset-all-passwords", "user", null, null, { usersAffected: count });
      res.json({ success: true, message: `Reset passwords for ${count} users` });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reset passwords", error);
    }
  });

  const invitationSchema = z.object({
    emails: z.array(z.string().email()).min(1).max(50),
    role: roleSchema.optional().default("user"),
    message: z.string().max(500).optional(),
    companyId: z.number().nullable().optional(),
    userGroupId: z.number().nullable().optional(),
  });

  app.post("/api/admin/invitations", requireAdmin, async (req, res) => {
    try {
      const validation = invitationSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const { emails, role, message, companyId, userGroupId } = validation.data;
      const adminUser = getAuthUser(req);
      const adminProfile = await storage.getUserById(adminUser.id);
      const inviterName = adminProfile
        ? [adminProfile.firstName, adminProfile.lastName].filter(Boolean).join(" ") || adminProfile.email
        : "An administrator";

      const defaultGroup = await storage.getDefaultUserGroup();
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
            companyId: companyId ?? null,
            title: null,
            userGroupId: userGroupId ?? (defaultGroup?.id ?? null),
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
      logAndSendError(res, "Failed to send invitations", error);
    }
  });
}
