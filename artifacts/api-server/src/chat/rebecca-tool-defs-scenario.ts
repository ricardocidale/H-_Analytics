import type { ToolParam } from "./tool-types";

export function getScenarioTools(): ToolParam[] {
  return [
    {
      name: "list_scenarios",
      description: "List the user's scenarios. Optionally filter by a property ID (matched against properties snapshotted in the scenario).",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Optional property ID to filter scenarios by" },
        },
        required: [],
      },
    },
    {
      name: "get_scenario",
      description: "Get details of a specific scenario including global assumptions.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_scenario",
      description: "Create a new scenario. If cloneFromId is provided, clones that scenario; otherwise clones the user's default scenario. The new scenario is renamed to the provided name.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID (informational; used to find a relevant source scenario)" },
          name: { type: "string", description: "Name for the new scenario" },
          cloneFromId: { type: "number", description: "Optional scenario ID to clone from" },
        },
        required: ["propertyId", "name"],
      },
    },
    {
      name: "update_scenario",
      description:
        "Partially update a scenario's fields (name, description, tags, or perspectiveRole). " +
        "Use perspectiveRole='investor' to switch the scenario to investor perspective — this hides " +
        "management company P&L from the finance output. Use 'operator' to restore full visibility.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
          fields: {
            type: "object",
            description: "Partial scenario fields to update. Allowed keys: name, description, tags, perspectiveRole ('operator' | 'investor').",
            properties: {
              perspectiveRole: {
                type: "string",
                enum: ["operator", "investor"],
                description: "Perspective role: 'operator' shows full management company financials; 'investor' shows only property-level cash flows.",
              },
            },
          },
        },
        required: ["id", "fields"],
      },
    },
    {
      name: "update_scenario_assumptions",
      description: "Patch a scenario's global financial assumptions (e.g. projectionYears, baseManagementFeePercent, modelStartDate). Merges the supplied key-value pairs into the existing snapshot. Fails if the scenario is locked.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
          patches: {
            type: "object",
            description: "Partial globalAssumptions fields to update (e.g. { projectionYears: 20, baseManagementFeePercent: 0.05 })",
          },
        },
        required: ["id", "patches"],
      },
    },
    {
      name: "lock_scenario",
      description: "Lock a scenario so it cannot be edited.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_scenario",
      description: "Soft-delete a scenario (it can be recovered within 30 days).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "share_scenario",
      description:
        "Share a specific scenario with another user by email. Sends an email notification to the recipient. Returns empty shares array (not an error) if the email is not a registered user — this is intentional to avoid leaking email existence.",
      parameters: {
        type: "object",
        properties: {
          scenarioId: { type: "number", description: "ID of the scenario to share." },
          recipientEmail: { type: "string", description: "Email address of the recipient." },
        },
        required: ["scenarioId", "recipientEmail"],
      },
    },
    {
      name: "list_scenario_shares",
      description:
        "List all users a scenario has been shared with. Returns granteeId, grantType, and createdAt for each share. The scenario must be owned by the authenticated user or the user must be an admin.",
      parameters: {
        type: "object",
        properties: {
          scenarioId: { type: "number", description: "Scenario ID." },
        },
        required: ["scenarioId"],
      },
    },
    {
      name: "revoke_share",
      description:
        "Revoke a previously-granted scenario share for a specific grantee. The scenario must be owned by the authenticated user. Use granteeId from list_scenario_shares.",
      parameters: {
        type: "object",
        properties: {
          scenarioId: { type: "number", description: "Scenario ID." },
          granteeId: { type: "number", description: "User ID of the person to remove access for." },
        },
        required: ["scenarioId", "granteeId"],
      },
    },
    {
      name: "compare_scenarios",
      description:
        "Compare two financial scenarios side-by-side. Returns a comparison of their assumptions, projections, and key financial metrics. Read-only.",
      parameters: {
        type: "object",
        properties: {
          scenarioId1: { type: "number", description: "ID of the first scenario." },
          scenarioId2: { type: "number", description: "ID of the second scenario." },
        },
        required: ["scenarioId1", "scenarioId2"],
      },
    },
  ];
}
