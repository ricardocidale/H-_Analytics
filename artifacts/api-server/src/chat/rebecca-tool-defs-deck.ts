import type { ToolParam } from "./tool-types";

export function getDeckTools(): ToolParam[] {
  return [
    {
      name: "get_lb_deck_config",
      description: "Read the current LB investor deck configuration — which properties are assigned to slides 1/2/3/5 and any slide 4/6 text. Admin only. Call before configure_lb_deck to see current state.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "configure_lb_deck",
      description: "Assign properties to LB investor deck slides 1/2/3/5 and set optional slide 4 subtitle and slide 6 disclaimer. Only the fields you supply are changed; omitted fields keep their current values. Admin only.",
      parameters: {
        type: "object",
        properties: {
          slide1PropertyId: { type: "number", description: "Property ID for Slide 1 (Pipeline Spotlight). Must belong to the current user." },
          slide2PropertyId: { type: "number", description: "Property ID for Slide 2 (Photo Gallery). Must belong to the current user." },
          slide3PropertyId: { type: "number", description: "Property ID for Slide 3 (Investment Model). Must belong to the current user." },
          slide5PropertyId: { type: "number", description: "Property ID for Slide 5 (Financial Snapshot). Must belong to the current user." },
          slide4SectionSubtitle: { type: "string", description: "Optional subtitle for Slide 4 portfolio grid section" },
          slide6Disclaimer: { type: "string", description: "Optional disclaimer text for Slide 6 income statement" },
        },
        required: [],
      },
    },
    {
      name: "trigger_lb_deck_render",
      description: "Trigger a background render of the LB investor deck PDF. Returns immediately — use get_lb_deck_render_status to poll progress. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_lb_deck_render_status",
      description: "Return the current LB deck render status (idle | rendering | ready | error), last rendered timestamp, and any error message. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "refresh_analyst_table",
      description: "Trigger an LLM-driven refresh of an analyst benchmark table and commit the results. Admin only. tableId must be one of: capital_raise_benchmarks, exit_multiples, reference_brands.",
      parameters: {
        type: "object",
        properties: {
          tableId: {
            type: "string",
            enum: ["capital_raise_benchmarks", "exit_multiples", "reference_brands"],
            description: "Table to refresh",
          },
        },
        required: ["tableId"],
      },
    },
    {
      name: "get_analyst_table",
      description:
        "Read the current rows of an analyst-managed benchmark table (Capital Raise benchmarks, Exit Multiples, or Reference Brands). " +
        "Use this to inspect what the table currently contains before deciding whether to refresh it. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          tableId: {
            type: "string",
            enum: ["capital_raise_benchmarks", "exit_multiples", "reference_brands"],
            description: "Which analyst table to read.",
          },
        },
        required: ["tableId"],
      },
    },
  ];
}
