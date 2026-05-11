import type { ToolParam } from "./tool-types";

export function getIrisTools(): ToolParam[] {
  return [
    {
      name: "trigger_research",
      description: "DEPRECATED — use get_property_research_seeds + apply_property_research_values instead. Generates location-aware seed values for a property AND writes them in one step (no inspect-before-commit). Owner-only.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID" },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "get_property_research_seeds",
      description: "Compute location-aware research seed values for a property WITHOUT writing them. Returns the seed map so the agent can inspect, adjust, or skip fields before persisting via apply_property_research_values. Owner-only.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID" },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "apply_property_research_values",
      description: "Persist a research-values map onto a property's researchValues column. Typically called with the output of get_property_research_seeds (optionally edited by the agent). Owner-only.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID" },
          researchValues: {
            type: "object",
            description: "Research values map (a record keyed by research-field id). Usually the seeds object returned by get_property_research_seeds, optionally with fields edited or removed.",
          },
        },
        required: ["propertyId", "researchValues"],
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
