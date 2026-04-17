import { type Express } from "express";
import { registerUserRoutes } from "./users";
import { registerToolRoutes } from "./tools";
import { registerServiceRoutes } from "./services";
import { registerResearchConfigRoutes } from "./research";
import { registerExportConfigRoutes } from "./exports";
import { registerAdminScenarioRoutes } from "./scenarios";
import { registerIntelligenceRoutes } from "./intelligence";
import { registerUserDefaultRoutes } from "./user-defaults";
import { registerRequiredFieldsRoutes } from "./required-fields";
import { registerHospitalityBenchmarkRoutes } from "./hospitality-benchmarks";
import { registerSourceHealthRoutes } from "./source-health";
import { registerTestBatteryRoutes } from "./test-batteries";
import { registerModelConstantsRoutes } from "./model-constants";
import { registerAdminAnalystTableRoutes } from "./analyst-tables";

export function register(app: Express) {
  registerUserRoutes(app);
  registerToolRoutes(app);
  registerServiceRoutes(app);
  registerResearchConfigRoutes(app);
  registerExportConfigRoutes(app);
  registerAdminScenarioRoutes(app);
  registerIntelligenceRoutes(app);
  registerUserDefaultRoutes(app);
  registerRequiredFieldsRoutes(app);
  registerHospitalityBenchmarkRoutes(app);
  registerSourceHealthRoutes(app);
  registerTestBatteryRoutes(app);
  registerModelConstantsRoutes(app);
  registerAdminAnalystTableRoutes(app);
}
