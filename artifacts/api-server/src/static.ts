import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

/**
 * Serve the bundled frontend SPAs.
 *
 * In production we ship three SPAs inside the same container, each at its own
 * sub-path (matching the artifact.toml `previewPath` used in development):
 *
 *   - hospitality-business-portal -> "/"                 (./public)
 *   - mockup-sandbox              -> "/__mockup/"        (./mockup-sandbox)
 *
 * Each SPA gets its own static asset mount and its own catch-all index.html
 * fallback so client-side routing works inside the sub-app.
 */
export function serveStatic(app: Express) {
  const subApps = [
    { mount: "/__mockup",        dir: path.resolve(__dirname, "mockup-sandbox") },
  ];

  for (const { mount, dir } of subApps) {
    if (!fs.existsSync(dir)) {
      logger.warn(
        `Sub-app build not found at ${dir} — skipping mount at ${mount}.`,
        "static",
      );
      continue;
    }

    app.use(mount, express.static(dir, { maxAge: 0 }));

    app.use(`${mount}/{*path}`, (_req: Request, res: Response) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.resolve(dir, "index.html"));
    });
  }

  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    logger.warn(
      `Frontend build not found at ${distPath} — static asset serving disabled. API routes remain active.`,
      "static",
    );
    return;
  }

  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
    }),
  );

  app.use(express.static(distPath, { maxAge: 0 }));

  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
