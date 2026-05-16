import type { ToolParam } from "./tool-types";

export function getPortfolioTools(): ToolParam[] {
  return [
    {
      name: "list_portfolios",
      description: "List all portfolios belonging to the authenticated user. Returns id, name, and description for each.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "create_portfolio",
      description: "Create a new portfolio with a name and optional description.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Portfolio name (required, max 255 chars)" },
          description: { type: "string", description: "Optional description" },
        },
        required: ["name"],
      },
    },
    {
      name: "update_portfolio",
      description: "Rename a portfolio or update its description.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Portfolio ID" },
          name: { type: "string", description: "New name" },
          description: { type: "string", description: "New description (pass null to clear)" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_portfolio",
      description: "Delete a portfolio. Properties assigned to it become unassigned (portfolio_id set to null).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Portfolio ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_portfolio_properties",
      description: "List all properties assigned to a specific portfolio.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Portfolio ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "assign_property_portfolio",
      description: "Assign a property to a portfolio, or unassign it (pass null for portfolioId). Validates that the portfolio belongs to the same user.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID to assign" },
          portfolioId: { type: ["number", "null"], description: "Portfolio ID to assign to, or null to unassign" },
        },
        required: ["propertyId", "portfolioId"],
      },
    },
  ];
}
