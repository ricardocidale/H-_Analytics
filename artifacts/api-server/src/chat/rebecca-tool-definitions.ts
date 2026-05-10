import type { ToolParam } from "./tool-types";
import { getPropertyTools } from "./rebecca-tool-defs-property";
import { getScenarioTools } from "./rebecca-tool-defs-scenario";
import { getDeckTools } from "./rebecca-tool-defs-deck";
import { getSlideFactoryTools } from "./rebecca-tool-defs-slide-factory";
import { getIrisTools } from "./rebecca-tool-defs-iris";
import { getKbTools } from "./rebecca-tool-defs-kb";
import { getAdminTools } from "./rebecca-tool-defs-admin";

export function getRebeccaTools(): ToolParam[] {
  return [
    ...getPropertyTools(),
    ...getScenarioTools(),
    ...getDeckTools(),
    ...getSlideFactoryTools(),
    ...getIrisTools(),
    ...getKbTools(),
    ...getAdminTools(),
  ];
}
