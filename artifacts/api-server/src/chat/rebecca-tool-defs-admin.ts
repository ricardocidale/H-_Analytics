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
    {
      name: "save_company_assumption_tab",
      description:
        "Save one Company Assumptions tab on the management-company singleton. Mirrors the per-tab Save button on the Company Assumptions page: marks the tab as saved (joining it into savedTabs), persists the patched fields, invalidates the compute cache, and reports any hard-required fields the user still hasn't filled in (for funding/revenue tabs). Does NOT dispatch The Analyst — that only fires on explicit Analyst-button press.",
      parameters: {
        type: "object",
        properties: {
          tabKey: {
            type: "string",
            enum: ["company", "funding", "revenue", "compensation", "overhead", "property-defaults"],
            description: "Which Company Assumptions tab to save.",
          },
          patch: {
            type: "object",
            description: "Field-level patch for this tab (e.g. { baseManagementFee: 0.04, incentiveManagementFee: 0.15 } for the company tab). Optional — pass when there are dirty fields.",
          },
          fundingInputs: {
            type: "object",
            description: "Funding-tab dispatch payload (runwayBufferMonths, sizingOvershootPct, trancheGapMonths, revenueRampDelayMonths, burnFlexDownPct). Pass only when saving the funding tab — drives the hard-required-field gate.",
            properties: {
              runwayBufferMonths: { type: ["number", "null"] },
              sizingOvershootPct: { type: ["number", "null"] },
              trancheGapMonths: { type: ["number", "null"] },
              revenueRampDelayMonths: { type: ["number", "null"] },
              burnFlexDownPct: { type: ["number", "null"] },
            },
          },
          unsave: {
            type: "boolean",
            description: "When true, removes tabKey from savedTabs instead of adding it. Used to roll back a tab save (e.g. an Analyst 'Adjust' flow).",
          },
        },
        required: ["tabKey"],
      },
    },
    // ───────── W2.1: Specialist read tools + recommendation telemetry ─────────
    // Note on scope: prompt/model/required-fields/toggles on specialist_configs
    // are dev-defined per `.claude/rules/specialists-are-dev-defined-only.md`
    // (all corresponding admin routes return 405). The only admin-mutable
    // specialist surface is the recommendation-event telemetry below.
    {
      name: "list_specialists",
      description:
        "List every Specialist in the catalog (id, letter, role, subject, model tier) plus a flag indicating which Specialists currently have an LLM-override config row. Read-only. Use to enumerate available Specialists before fetching a specific config.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_specialist_config",
      description:
        "Read the config row + catalog definition for a single Specialist. Returns the merged shape { definition, config } where `definition` is the static catalog entry (role, subject, candidateFields, prerequisites) and `config` is the per-Specialist override row (modelResourceId, promptTemplate, multiModel settings) or null if no overrides exist. Read-only — config writes are dev-defined, see specialists-are-dev-defined-only.md.",
      parameters: {
        type: "object",
        properties: {
          specialistId: { type: "string", description: "The catalog id of the Specialist (e.g. 'maya', 'lucca')." },
        },
        required: ["specialistId"],
      },
    },
    {
      name: "record_specialist_recommendation_event",
      description:
        "Record an append-only telemetry event for an observed-missing candidate field on a Specialist: 'promote-recommended' marks the field as recommended-required, 'promote-hard' marks it as hard-required (only allowed on catalog-locked candidates), 'ignore' marks it as noise. Admin only. Mirrors the Required Fields tab's Promote/Ignore actions. fieldKey must be a declared candidate of the Specialist; promote-hard on a non-locked candidate is rejected.",
      parameters: {
        type: "object",
        properties: {
          specialistId: { type: "string", description: "The catalog id of the Specialist." },
          fieldKey: { type: "string", description: "The candidate field key (must appear in def.candidateFields)." },
          action: {
            type: "string",
            enum: ["promote-recommended", "promote-hard", "ignore"],
            description: "Which telemetry action to record.",
          },
        },
        required: ["specialistId", "fieldKey", "action"],
      },
    },
    {
      name: "get_vendor_passthrough_costs",
      description:
        "Read the cached national vendor pass-through cost table (percent of revenue per service line). " +
        "Returns all rows from vendor_passthrough_costs ordered by fetched_at DESC. " +
        "Omit serviceLine to get all service lines; supply it to filter to one (e.g. 'marketing', 'it', 'housekeeping'). " +
        "Use to inspect current national benchmarks before triggering a regeneration.",
      parameters: {
        type: "object",
        properties: {
          serviceLine: {
            type: "string",
            description:
              "Optional service line filter, e.g. 'marketing', 'it', 'accounting', 'reservations', " +
              "'housekeeping', 'maintenance', 'revenue_management', 'food_beverage', 'branding', 'performance_bonus'.",
          },
        },
        required: [],
      },
    },
    {
      name: "get_mgmt_co_markup_factors",
      description:
        "Read the cached national Management Company markup factor table (percent of revenue per service line). " +
        "Returns all rows from mgmt_co_markup_factors ordered by fetched_at DESC. " +
        "Omit serviceLine to get all service lines; supply it to filter to one. " +
        "Use to inspect current national benchmarks before triggering a regeneration.",
      parameters: {
        type: "object",
        properties: {
          serviceLine: {
            type: "string",
            description:
              "Optional service line filter, e.g. 'marketing', 'it', 'accounting', 'reservations', " +
              "'housekeeping', 'maintenance', 'revenue_management', 'food_beverage', 'branding', 'performance_bonus'.",
          },
        },
        required: [],
      },
    },
    {
      name: "get_bracket_mix",
      description:
        "Return the Management Company's current ICP bracket mix and the full bracket catalog. " +
        "The bracket mix is a weighted distribution of customer-property archetypes (e.g., us-gateway-boutique, latam-luxury-str-single-key) stored in global_assumptions.bracket_mix. " +
        "Returns { mix: BracketMixData | null, catalog: CatalogBracket[] }. " +
        "mix is null when no bracket assignment has been run yet. " +
        "Use this to understand the company's current ICP positioning before recommending changes.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "update_bracket_mix",
      description:
        "Manually update the weight of one or more brackets in the Management Company's ICP bracket mix. " +
        "Weights are expressed as values in [0, 1]; the server normalises all entries to sum to 1.0 automatically. " +
        "You must call get_bracket_mix first to obtain valid bracket IDs. " +
        "Pass only the brackets whose weights you want to change — unchanged brackets are kept from the existing mix. " +
        "Returns the updated { mix, catalog }.",
      parameters: {
        type: "object",
        properties: {
          entries: {
            type: "array",
            description: "Array of bracket ID + weight pairs to update. Weight is a value in [0, 1].",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Bracket ID (e.g. 'us-gateway-boutique')." },
                weight: { type: "number", minimum: 0, maximum: 1, description: "New weight value in [0, 1]." },
              },
              required: ["id", "weight"],
            },
            minItems: 1,
          },
        },
        required: ["entries"],
      },
    },
    {
      name: "update_admin_resource",
      description:
        "Update an admin_resources row (any kind). Admin only. Mirrors the admin resource update endpoint: each call writes a new version row, applies the SSRF guard to config.healthProbe.url, and returns { resource, impact } where impact is the list of catalog/feature surfaces affected. Use to retune display names, descriptions, config payloads (e.g. swap a model reference, edit a healthProbe URL), or rotate secretRef pointers. Caller must change at least one of displayName, description, config, or secretRef — changeSummary alone is metadata and does not satisfy the change requirement. Create and delete are NOT exposed — admin_resources rows are added via migrations.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The admin_resources row id." },
          displayName: { type: "string", minLength: 1, description: "New display name." },
          description: { type: ["string", "null"], description: "New description. Pass null to clear." },
          config: {
            type: "object",
            description: "Replacement config payload (object). When config.healthProbe.url is present it is validated against the SSRF blocklist.",
          },
          secretRef: { type: ["string", "null"], description: "Secret reference name. Pass null to clear." },
          changeSummary: { type: "string", minLength: 1, description: "Short human summary stamped on the new version row. Defaults to \"updated\" if omitted." },
        },
        required: ["id"],
      },
    },
  ];
}
