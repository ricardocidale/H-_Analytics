import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userLimits = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  userLimits.forEach((entry, key) => {
    if (entry.resetAt <= now) userLimits.delete(key);
  });
}, 60_000);

export function aiRateLimit(maxRequests = 20, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as Request & { user?: { id?: number | string } }).user?.id ?? req.ip ?? "anonymous";
    const key = `${req.path}:${userId}`;
    const now = Date.now();

    const entry = userLimits.get(key);
    if (!entry || entry.resetAt <= now) {
      userLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfterSeconds: retryAfter,
      });
    }

    entry.count++;
    return next();
  };
}
