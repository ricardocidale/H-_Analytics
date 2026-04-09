import type { Express } from "express";
import type { Server } from "http";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import * as authRoutes from "./routes/auth";
import * as propertyRoutes from "./routes/properties";
import * as adminRoutes from "./routes/admin";
import * as assumptionRoutes from "./routes/global-assumptions";
import * as brandingRoutes from "./routes/branding";
import * as scenarioRoutes from "./routes/scenarios";
import * as researchRoutes from "./routes/research";
import * as finderRoutes from "./routes/property-finder";
import * as calculationRoutes from "./routes/calculations";
import * as uploadRoutes from "./routes/uploads";
import * as marketRateRoutes from "./routes/market-rates";
import * as countryRiskPremiumRoutes from "./routes/country-risk-premium";
import * as countryDefaultsRoutes from "./routes/country-defaults";
import * as tileRoutes from "./routes/tiles";
import * as photoRoutes from "./routes/property-photos";
import * as chatRoutes from "./routes/chat";
import * as aiRoutes from "./routes/ai";
import * as premiumExportRoutes from "./routes/premium-exports";
import * as exportGenerateRoutes from "./routes/export-generate";
import * as adminIntegrationRoutes from "./routes/admin-integrations";
import * as geospatialRoutes from "./routes/geospatial";
import * as notificationRoutes from "./routes/notifications";
import * as documentRoutes from "./routes/documents";
import * as geoRoutes from "./routes/geo";
import * as icpResearchRoutes from "./routes/icp-research";
import * as financingRoutes from "./routes/financing";
import * as hotelRateRoutes from "./routes/hotel-rates";
import { registerFinanceRoutes } from "./routes/finance";
import healthRouter from "./routes/health";
import * as guidanceRoutes from "./routes/guidance";
import * as rebeccaRoutes from "./routes/rebecca";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerObjectStorageRoutes(app);

  app.use(healthRouter);

  authRoutes.register(app);
  propertyRoutes.register(app);
  adminRoutes.register(app);
  assumptionRoutes.register(app);
  brandingRoutes.register(app);
  scenarioRoutes.register(app);
  researchRoutes.register(app);
  finderRoutes.register(app);
  calculationRoutes.register(app);
  uploadRoutes.register(app);
  marketRateRoutes.register(app);
  countryRiskPremiumRoutes.register(app);
  countryDefaultsRoutes.register(app);
  tileRoutes.register(app);
  photoRoutes.register(app);
  chatRoutes.register(app);
  aiRoutes.register(app);
  premiumExportRoutes.register(app);
  exportGenerateRoutes.register(app);
  adminIntegrationRoutes.register(app);
  geospatialRoutes.register(app);
  notificationRoutes.register(app);
  documentRoutes.register(app);
  geoRoutes.register(app);
  icpResearchRoutes.register(app);
  financingRoutes.register(app);
  hotelRateRoutes.register(app);
  registerFinanceRoutes(app);
  guidanceRoutes.register(app);
  rebeccaRoutes.register(app);

  return httpServer;
}
