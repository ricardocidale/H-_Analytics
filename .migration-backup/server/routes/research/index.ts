import type { Express } from "express";
import { registerResearchStatusRoutes } from "./status";
import { registerResearchFetchRoutes } from "./fetch";
import { registerResearchGenerateRoutes } from "./generate";
import { registerResearchWebSearchRoutes } from "./web-search";
import { registerResearchMetaRoutes } from "./meta";

/**
 * Mounts every research-route family at the original `/api/research/*`,
 * `/api/market-research`, and `/api/admin/intelligence/*` paths. No public
 * URL or request/response shape changes from the pre-split single file.
 */
export function register(app: Express) {
  registerResearchStatusRoutes(app);
  registerResearchFetchRoutes(app);
  registerResearchGenerateRoutes(app);
  registerResearchWebSearchRoutes(app);
  registerResearchMetaRoutes(app);
}
