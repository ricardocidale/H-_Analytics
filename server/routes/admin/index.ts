import { type Express } from "express";
import { registerUserRoutes } from "./users";
import { registerToolRoutes } from "./tools";
import { registerServiceRoutes } from "./services";
import { registerResearchConfigRoutes } from "./research";
import { registerExportConfigRoutes } from "./exports";
import { registerAdminScenarioRoutes } from "./scenarios";
import { registerIntelligenceRoutes } from "./intelligence";
import { registerUserDefaultRoutes } from "./user-defaults";
import { registerHospitalityBenchmarkRoutes } from "./hospitality-benchmarks";
import { registerSourceHealthRoutes } from "./source-health";
import { registerTestBatteryRoutes } from "./test-batteries";
import { registerModelConstantsRoutes } from "./model-constants";
import { registerAdminAnalystTableRoutes } from "./analyst-tables";
import { registerAdminResourceRoutes } from "./resources";
import { registerResourceTransparencyRoutes } from "./resources-transparency";
import { registerSourcesTabRoutes } from "./sources-tab";
import { registerAdminSpecialistRoutes } from "./specialists";
import { registerAdminSpecialistToolRoutes } from "./specialist-tools";
import { registerRequiredFieldsRoutes } from "./required-fields";
import { registerObservabilityRoutes } from "./observability";

export function register(app: Express) {
  registerUserRoutes(app);
  registerToolRoutes(app);
  registerServiceRoutes(app);
  registerResearchConfigRoutes(app);
  registerExportConfigRoutes(app);
  registerAdminScenarioRoutes(app);
  registerIntelligenceRoutes(app);
  registerUserDefaultRoutes(app);
  registerHospitalityBenchmarkRoutes(app);
  registerSourceHealthRoutes(app);
  registerTestBatteryRoutes(app);
  registerModelConstantsRoutes(app);
  registerAdminAnalystTableRoutes(app);
  // Order matters: transparency uses static path segments
  // (`/transparency`, `/gaps`) that must register BEFORE the
  // `/api/admin/resources/:id` numeric-id catch-all.
  registerResourceTransparencyRoutes(app);
  registerAdminResourceRoutes(app);
  registerSourcesTabRoutes(app);
  registerAdminSpecialistRoutes(app);
  registerAdminSpecialistToolRoutes(app);
  registerRequiredFieldsRoutes(app);
  registerObservabilityRoutes(app);
}
