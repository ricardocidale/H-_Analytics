import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { getCacheStatus } from "../finance/cache";
import { logger } from "../logger";

interface HealthCheck {
  status: "ok" | "error" | "degraded";
  [key: string]: unknown;
}

const router = Router();
const startedAt = Date.now();

router.get("/api/health/live", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: Math.floor((Date.now() - startedAt) / 1000) });
});

router.get("/api/health/ready", async (_req: Request, res: Response) => {
  try {
    const health = await storage.getDbHealth();
    if (!health.migrationsReady) {
      res.status(503).json({ status: "not_ready", db: "connected", migrations: "pending" });
      return;
    }
    res.json({ status: "ready", db: "connected", migrations: "complete" });
  } catch (err: unknown) {
    logger.error(`Readiness check failed: ${err instanceof Error ? err.message : err}`, "health");
    res.status(503).json({ status: "not_ready", db: "disconnected", migrations: "unknown" });
  }
});

router.get("/api/health/deep", async (_req: Request, res: Response) => {
  const checks: Record<string, HealthCheck> = {};

  try {
    const health = await storage.getDbHealth();
    checks.database = {
      status: "ok",
      serverTime: health.serverTime,
      pool: health.pool,
    };
  } catch (err: unknown) {
    checks.database = { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  const cacheInfo = getCacheStatus();
  checks.cache = {
    status: "ok",
    entries: cacheInfo.size,
    hitRate: cacheInfo.hitRate,
  };

  checks.process = {
    status: "ok",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    nodeVersion: process.version,
  };

  try {
    const extChecks: Record<string, string> = {};
    if (process.env.RESEND_API_KEY) extChecks.resend = "configured";
    if (process.env.GOOGLE_MAPS_API_KEY) extChecks.googleMaps = "configured";
    checks.externalServices = {
      status: Object.keys(extChecks).length > 0 ? "ok" : "degraded",
      services: extChecks,
    };
  } catch {
    checks.externalServices = { status: "degraded", services: {} };
  }

  const allOk = Object.values(checks).every((c: HealthCheck) => c.status === "ok");
  res.status(allOk ? 200 : 503).json({ status: allOk ? "healthy" : "degraded", checks });
});

export default router;
