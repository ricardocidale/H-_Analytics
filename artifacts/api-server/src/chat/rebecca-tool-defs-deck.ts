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
      description: "DEPRECATED — use research_analyst_table + commit_analyst_table_research instead. Trigger an LLM-driven refresh of an analyst benchmark table and commit the results in one step (no inspect-before-commit). Admin only. tableId must be one of: capital_raise_benchmarks, exit_multiples, reference_brands.",
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
      name: "research_analyst_table",
      description: "Run the LLM research step for an analyst benchmark table and return the proposed rows WITHOUT writing to the DB. For reference_brands the response also includes a coverage verdict (min-count + founding-brand check + dedupe). Pair with commit_analyst_table_research to persist. Admin only.",
      parameters: {
        type: "object",
        properties: {
          tableId: {
            type: "string",
            enum: ["capital_raise_benchmarks", "exit_multiples", "reference_brands"],
            description: "Which analyst table to research.",
          },
        },
        required: ["tableId"],
      },
    },
    {
      name: "commit_analyst_table_research",
      description: "Persist a research payload produced by research_analyst_table. For capital_raise_benchmarks and exit_multiples, pass `ranges`. For reference_brands, pass `brands` and the coverage guard is re-run on the server (a payload that doesn't meet min-count + founding-brand coverage is rejected). Admin only.",
      parameters: {
        type: "object",
        properties: {
          tableId: {
            type: "string",
            enum: ["capital_raise_benchmarks", "exit_multiples", "reference_brands"],
            description: "Which analyst table to commit to.",
          },
          ranges: {
            type: "array",
            description: "For capital_raise_benchmarks / exit_multiples: array of { dimensionKey, label, unit, valueLow, valueMid, valueHigh } as returned by research_analyst_table.",
            items: { type: "object" },
          },
          brands: {
            type: "array",
            description: "For reference_brands: array of brand objects as returned by research_analyst_table (proposedBrands).",
            items: { type: "object" },
          },
          sourceCount: {
            type: "number",
            description: "Sources cited by the research step (carried over from research_analyst_table).",
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
