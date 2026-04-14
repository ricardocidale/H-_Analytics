import type { Request, Response } from "express";
import { storage } from "../storage";
import { VALID_USER_ROLES } from "@shared/schema";
import { z } from "zod";
import { logger } from "../logger";

/** Send a JSON error response. */
export function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

/** Log an error to console and send a 500 JSON response. */
export function logAndSendError(res: Response, message: string, error: unknown, domain?: string) {
  const source = domain || "routes";
  const errMsg = error instanceof Error ? error.message : String(error);
  logger.error(`${message}: ${errMsg}`, source);
  return sendError(res, 500, message);
}

/** Combine first + last name into a display-friendly string. Returns null if both are empty. */
export function fullName(user: { firstName?: string | null; lastName?: string | null }): string | null {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Strip sensitive fields (password hash, etc.) from a user record before sending to the client. */
export function userResponse(u: any, extra?: Record<string, any>) {
  return { 
    id: u.id, 
    email: u.email, 
    firstName: u.firstName, 
    lastName: u.lastName, 
    name: fullName(u), 
    company: u.company, 
    title: u.title, 
    role: u.role,
    hideTourPrompt: u.hideTourPrompt ?? false,
    canManageScenarios: u.canManageScenarios ?? true,
    colorMode: u.colorMode ?? null,
    bgAnimation: u.bgAnimation ?? null,
    fontPreference: u.fontPreference ?? null,
    ...extra 
  };
}

/**
 * Log a user action to the activity_logs table. Non-blocking — errors are
 * caught and logged to console so they never break the primary request.
 */
export function logActivity(
  req: Request,
  action: string,
  entityType: string,
  entityId?: number | null,
  entityName?: string | null,
  metadata?: Record<string, unknown> | null,
): void {
  const userId = req.user?.id;
  if (!userId) return;
  const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
  storage.createActivityLog({
    userId,
    action,
    entityType,
    entityId: entityId ?? undefined,
    entityName: entityName ?? undefined,
    metadata: metadata ?? undefined,
    ipAddress,
  }).catch(err => logger.error(`Activity log error: ${err?.message || err}`, "activity"));
}

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal("")),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  company: z.string().max(100).optional(),
  title: z.string().max(100).optional(),
  role: z.enum(VALID_USER_ROLES).optional().default("user"),
});

export const createScenarioSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(1000).nullable().optional(),
});

export { MAX_SCENARIOS_PER_USER } from "../constants";

export const researchGenerateSchema = z.object({
  type: z.enum(["property", "company", "global"]),
  propertyId: z.number().optional(),
  propertyContext: z.record(z.any()).optional(),
  assetDefinition: z.record(z.any()).optional(),
  researchVariables: z.object({
    focusAreas: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    timeHorizon: z.string().optional(),
    customQuestions: z.string().optional(),
  }).optional(),
});

export const VALID_RESEARCH_TYPES = ["property", "company", "global"] as const;

export const researchQuestionCreateSchema = z.object({
  question: z.string().min(1, "Question is required").max(1000),
});

export const researchQuestionPatchSchema = z.object({
  question: z.string().min(1, "Question is required").max(1000),
});

export const geocodeSchema = z.object({
  address: z.string().min(1, "Address is required").max(500),
});

export const marketRatePatchSchema = z.object({
  value: z.coerce.number({ required_error: "value is required" }),
  manualNote: z.string().max(500).nullish(),
});

export const marketIntelligenceGatherSchema = z.object({
  location: z.string().min(1).max(300),
  state: z.string().max(50).optional(),
  propertyType: z.string().max(100).optional(),
  propertyClass: z.string().max(50).optional(),
  chainScale: z.string().max(100).optional(),
});

export const driveFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(255),
  parentId: z.string().max(200).optional(),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const prospectiveNotesSchema = z.object({
  notes: z.string().max(5000).nullable(),
});

export const driveUploadBodySchema = z.object({
  parentId: z.string().max(200).optional(),
});

export const bulkProcessPhotosSchema = z.object({
  propertyId: z.coerce.number().optional(),
});

export const icpGenerateSchema = z.object({
  promptBuilder: z.record(z.any()).optional(),
});

export const icpExportSchema = z.object({
  format: z.enum(["pdf", "docx"]),
  orientation: z.enum(["portrait", "landscape"]).optional(),
});

export const uploadRequestSchema = z.object({
  name: z.string().min(1, "name is required").max(500),
  size: z.number().optional(),
  contentType: z.string().max(200).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.number().optional(),
});

export const processImageSchema = z.object({
  propertyId: z.number({ required_error: "propertyId is required" }),
  photoId: z.number({ required_error: "photoId is required" }),
  imageUrl: z.string().min(1, "imageUrl is required"),
  crop: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    left: z.number().optional(),
    top: z.number().optional(),
    width: z.number(),
    height: z.number(),
  }).optional(),
});

// ────────────────────────────────────────────────────────────
// PARAMETER PARSING
// ────────────────────────────────────────────────────────────

/**
 * Parse a route parameter as a numeric ID.
 * Returns the number, or sends a 400 response and returns `null`.
 */
export function parseParamId(param: string | string[] | undefined, res: Response, label = "ID"): number | null {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number(raw);
  if (!raw || isNaN(id) || !Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: `Invalid ${label}` });
    return null;
  }
  return id;
}


export const cachePatternSchema = z.object({
  pattern: z.string().max(200).regex(/^[a-zA-Z0-9:*_-]+$/, "Pattern must contain only alphanumeric, colon, asterisk, underscore, hyphen").optional(),
}).strict();
