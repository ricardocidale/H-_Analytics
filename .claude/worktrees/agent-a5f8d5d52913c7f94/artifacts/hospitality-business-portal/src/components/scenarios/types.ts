export interface ScenarioCompareResult {
  scenario1: { id: number; name: string };
  scenario2: { id: number; name: string };
  assumptionDiffs: Array<{ field: string; scenario1: unknown; scenario2: unknown }>;
  propertyDiffs: Array<{
    name: string;
    status: "added" | "removed" | "changed";
    changes?: Array<{ field: string; scenario1: unknown; scenario2: unknown }>;
  }>;
}
