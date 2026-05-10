import type { ToolParam } from "./tool-types";

export function getAdminTools(): ToolParam[] {
  return [
    {
      name: "get_data_source_status",
      description:
        "Get health and freshness status for all Pietro-managed data sources (source and mcp kinds). " +
        "Returns slug, kind, displayName, lastHealthStatus, lastCheckedAt, and dailyRequestBudget for each row. " +
        "Use to understand which data sources are healthy, stale, or failing.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "probe_data_source",
      description:
        "Run a live health probe of a specific admin_resource row by ID. " +
        "Verifies secret presence and connectivity. Returns { status, latencyMs, errorCode?, errorMessage? }. " +
        "Use to diagnose a failing data source before requesting a regeneration.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The admin_resource row ID to probe." },
        },
        required: ["id"],
      },
    },
    {
      name: "regenerate_data_source",
      description:
        "Dispatch Pietro's minion for a data source slug to refresh its cached DB table. " +
        "Only works for source/mcp kinds with a registered minion (not search_url, research_prompt, or context7). " +
        "Returns a MinionResult with rowsUpserted, rowsFailed, errors[], durationMs.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "The admin_resource slug, e.g. 'fmp-reit' or 'fred-extended'." },
        },
        required: ["slug"],
      },
    },
    {
      name: "get_market_rates",
      description:
        "Read current market rates (FRED, Frankfurter, OXR). Omit key to get all rates; supply a key to get a single rate. " +
        "Returns value, source, and staleness status.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Rate key, e.g. 'fed_funds_rate'. Omit to list all rates." },
        },
      },
    },
    {
      name: "get_tripadvisor_hotels",
      description:
        "Fetch live competitor hotel data from Tripadvisor for a given market. " +
        "Returns hotel names, Tripadvisor ratings (1–5 bubbles), review counts, city rankings, price tiers, and Travelers' Choice awards. " +
        "Use for comp-set analysis, market benchmarking, or answering questions about top-rated hotels in a city or region. " +
        "Requires TRIPADVISOR_API_KEY to be configured; returns a warning if unavailable.",
      parameters: {
        type: "object",
        properties: {
          market: {
            type: "string",
            description: "City or region to search (e.g. 'Hudson Valley NY', 'Cartagena Colombia', 'Tulum Mexico').",
          },
          query: {
            type: "string",
            description: "Optional search refinement appended to the market (e.g. 'boutique hotel', 'luxury resort'). Defaults to 'hotel'.",
          },
          limit: {
            type: "number",
            description: "Number of hotels to return (1–10). Defaults to 5.",
          },
        },
        required: ["market"],
      },
    },
    {
      name: "list_prospective_properties",
      description:
        "List all prospective (saved/favorited) properties for the current user. Returns id, address, city, state, country, notes, savedAt, and priceEvents count.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "save_prospective_property",
      description:
        "Save a property to the user's Property Finder favorites. Provide at minimum an address. Returns the new prospective property record.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "Full street address of the property." },
          city: { type: "string", description: "City." },
          state: { type: "string", description: "State or province." },
          zipCode: { type: "string", description: "ZIP or postal code." },
          notes: { type: "string", description: "Optional initial notes." },
        },
        required: ["address"],
      },
    },
    {
      name: "delete_prospective_property",
      description: "Remove a prospective (favorited) property from the user's list.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Prospective property ID." },
        },
        required: ["id"],
      },
    },
    {
      name: "update_prospective_property_notes",
      description: "Update the notes on a saved prospective property.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Prospective property ID." },
          notes: { type: "string", description: "New notes text." },
        },
        required: ["id", "notes"],
      },
    },
    {
      name: "list_price_events",
      description: "List the price event history for a prospective property (offers, accepted prices, etc.).",
      parameters: {
        type: "object",
        properties: {
          prospectivePropertyId: { type: "number", description: "Prospective property ID." },
        },
        required: ["prospectivePropertyId"],
      },
    },
    {
      name: "create_price_event",
      description: "Add a price event to a prospective property's acquisition history (e.g. list price, offer, accepted price).",
      parameters: {
        type: "object",
        properties: {
          prospectivePropertyId: { type: "number", description: "Prospective property ID." },
          kind: { type: "string", description: "Event kind: list, reduction, delist, relist, contract, or prior_sale." },
          price: { type: "number", description: "New listing price in USD after this event." },
          date: { type: "string", description: "ISO date string (YYYY-MM-DD). Defaults to today." },
          notes: { type: "string", description: "Optional note for this event." },
        },
        required: ["prospectivePropertyId", "kind", "price"],
      },
    },
    {
      name: "update_price_event",
      description: "Update a price event on a prospective property.",
      parameters: {
        type: "object",
        properties: {
          prospectivePropertyId: { type: "number", description: "Prospective property ID." },
          eventId: { type: "string", description: "Event ID from list_price_events." },
          type: { type: "string", description: "Updated event type." },
          price: { type: "number", description: "Updated price in USD." },
          date: { type: "string", description: "Updated ISO date." },
          notes: { type: "string", description: "Updated notes." },
        },
        required: ["prospectivePropertyId", "eventId"],
      },
    },
    {
      name: "delete_price_event",
      description: "Delete a price event from a prospective property's history.",
      parameters: {
        type: "object",
        properties: {
          prospectivePropertyId: { type: "number", description: "Prospective property ID." },
          eventId: { type: "string", description: "Event ID from list_price_events." },
        },
        required: ["prospectivePropertyId", "eventId"],
      },
    },
    {
      name: "list_service_templates",
      description:
        "List all company service templates (Marketing, IT, Accounting, Reservations, etc.) with their default rates and markup percentages. Admin-only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "update_service_template",
      description:
        "Update a service template's name, default rate, markup percentage, active status, or sort order. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Service template ID." },
          name: { type: "string", description: "Template name." },
          defaultRate: { type: "number", description: "Default rate value." },
          markupPercent: { type: "number", description: "Markup percentage (e.g. 15 for 15%)." },
          isActive: { type: "boolean", description: "Whether the template is active." },
          sortOrder: { type: "number", description: "Display sort order." },
        },
        required: ["id"],
      },
    },
    {
      name: "get_global_assumptions",
      description:
        "Read the current global assumptions for this organisation. Use before calling update_global_assumptions to see the current values.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "update_global_assumptions",
      description:
        "Update one or more global assumption fields (admin only). Accepts a partial patch object with the fields to update.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "object",
            description: "The fields to update on the global assumptions row (e.g. { rebeccaEnabled: true }).",
          },
        },
        required: ["patch"],
      },
    },
  ];
}
