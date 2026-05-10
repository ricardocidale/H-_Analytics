import type { ToolParam } from "./tool-types";

export function getIrisTools(): ToolParam[] {
  return [
    {
      name: "trigger_research",
      description: "Trigger research value generation for a property using location-aware seed data.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID" },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "write_retrieval_gap",
      description: "Signal a retrieval gap — called when knowledge base search returns no confident results for a topic.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The topic or query that returned no results" },
        },
        required: ["query"],
      },
    },
    {
      name: "trigger_iris_health_check",
      description: "Run a quick Iris health check across configured data sources. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "run_compliance_audit",
      description: "Triggers the Vito compliance audit agent to scan the codebase for rule violations. Admin only. Returns a run ID.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "trigger_iris_reindex",
      description: "Run a full Iris reindex of the knowledge base. Slower than a health check. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "clear_iris_gaps",
      description: "Clear the queue of pending retrieval gaps Iris is scheduled to ingest. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_iris_status",
      description: "Read Iris's most recent run summary and current pending gaps count. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ];
}
