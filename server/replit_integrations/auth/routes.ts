import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { logger } from "../../logger";

/**
 * Registers authentication-related API routes on the Express application, including the GET /api/auth/user endpoint that returns the current authenticated user.
 * @param {Express} app - The Express application instance to register routes on
 * @returns {void}
 */
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error: unknown) {
      logger.error(`Error fetching user: ${error instanceof Error ? error.message : error}`, "auth");
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
