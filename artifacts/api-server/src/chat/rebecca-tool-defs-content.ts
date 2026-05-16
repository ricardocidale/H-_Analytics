import type { ToolParam } from "./tool-types";
import { MAX_REWRITE_DESCRIPTION_CHARS } from "@shared/constants";

export function getContentTools(): ToolParam[] {
  return [
    {
      name: "generate_executive_summary",
      description:
        "Generate (or regenerate) the executive summary for a property. " +
        "Produces an investor-grade 1-page summary: investment thesis, key metrics, " +
        "market position, revenue strategy, risk factors, mitigants, and exit strategy. " +
        "Use when the user asks to generate, refresh, or view the executive summary for a property.",
      parameters: {
        type: "object",
        properties: {
          propertyId: {
            type: "number",
            description: "ID of the property to summarise.",
          },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "rewrite_property_description",
      description:
        "Rewrite a property description to be polished, compelling, and professional. " +
        "Preserves all factual content — only improves clarity, flow, and appeal. " +
        "Returns the rewritten text; does NOT save it automatically. " +
        "Use patch_property with field descriptionPurchased or descriptionImproved to save. " +
        "Use when the user asks to improve, rewrite, or generate a property description.",
      parameters: {
        type: "object",
        properties: {
          propertyId: {
            type: "number",
            description: "ID of the property (used for context: name, location, room count).",
          },
          text: {
            type: "string",
            description:
              `The existing description to rewrite (1–${MAX_REWRITE_DESCRIPTION_CHARS} characters). ` +
              "Pass the current descriptionPurchased or descriptionImproved value.",
          },
        },
        required: ["propertyId", "text"],
      },
    },
  ];
}
