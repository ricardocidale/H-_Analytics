import type { ToolParam } from "./tool-types";

export function getRebeccaTools(): ToolParam[] {
  return [
    {
      name: "list_properties",
      description: "List all properties in the user's portfolio. Returns id, name, country, and type for each property.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_property",
      description: "Get detailed information about a specific property including financial assumptions.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
        },
        required: ["id"],
      },
    },
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
      name: "update_property",
      description: "Update a single field on a property. Returns the old and new values.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
          field: { type: "string", description: "Field name to update (must be a valid updatePropertySchema field)" },
          value: { description: "New value for the field" },
        },
        required: ["id", "field", "value"],
      },
    },
    {
      name: "patch_property",
      description: "Update multiple property fields in a single call. Validates each field against its schema. Returns updated (fields written) and skipped (fields that failed validation). Always check the skipped array and inform the user if any fields were not written.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
          fields: {
            type: "object",
            description: "Map of field names to new values (e.g. { startAdr: 250, maxOccupancy: 20 })",
          },
        },
        required: ["id", "fields"],
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
      description: "Partially update a scenario's fields (name, description, or tags).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
          fields: {
            type: "object",
            description: "Partial scenario fields to update (name, description, tags)",
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
    // ─────────────────────────────────────────────────────────────────────────
    // Slide Factory Pipeline (Tabs 1–6 wizard) — see
    // docs/discipline/agent-native-parity-map.md § "Slide Factory Pipeline"
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: "create_slide_factory_run",
      description:
        "Create a new slide factory run (Tab 1). Returns the new run's ID and initial status ('new'). Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "list_slide_factory_runs",
      description:
        "List slide factory runs for the current admin (newest first). Returns each run's id, status, brief filename, and timestamps.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_slide_factory_run",
      description:
        "Read a single slide factory run with full state — status, brief, property assignments, Lucca draft, agent results, and deck R2 key when complete.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "record_slide_factory_brief",
      description:
        "Record an uploaded brief on a slide factory run (Tab 1). The browser uploads the PDF/PPTX to R2 via a presigned URL; this tool records the resulting R2 key + filename on the run. Requires status 'new'.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
          r2Key: { type: "string", description: "R2 object key from the presigned upload" },
          filename: { type: "string", description: "Original filename (e.g., 'q1-2026-brief.pdf')" },
        },
        required: ["id", "r2Key", "filename"],
      },
    },
    {
      name: "accept_slide_factory_brief",
      description:
        "Accept the brief on a slide factory run and auto-fire Lorenzo ingestion (Tab 1 → Tab 2). Status advances to 'ingesting' immediately; Lorenzo runs in the background. Poll get_slide_factory_run for status. Requires status 'new' and a recorded brief.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "assign_slide_factory_properties",
      description:
        "Assign properties to slides 1, 2, 3, and 5 on a slide factory run and auto-fire Lucca drafting (Tab 3 → Tab 4). Slides 4 and 6 are auto-generated from portfolio data. Each property must be owned by the current admin. Requires status 'ingested'.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
          slide1PropertyId: { type: ["number", "null"], description: "Property ID for slide 1" },
          slide2PropertyId: { type: ["number", "null"], description: "Property ID for slide 2" },
          slide3PropertyId: { type: ["number", "null"], description: "Property ID for slide 3" },
          slide5PropertyId: { type: ["number", "null"], description: "Property ID for slide 5" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_slide_factory_slot",
      description:
        "Edit a single Lucca narrative slot on a slide factory run. Works on 'draft_review' (Tab 4) and 'complete' (Tab 6 override panel). On draft_review runs source stamps as 'admin'; on complete runs it stamps as 'admin-override' for provenance tracking. Use to update the slot's value, mark it approved, or both.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
          slotKey: { type: "string", description: "Slot key within luccaDraft (e.g., 'slide1.headline')" },
          value: { type: "string", description: "New text value (optional)" },
          approved: { type: "boolean", description: "Approval state (optional)" },
        },
        required: ["id", "slotKey"],
      },
    },
    {
      name: "approve_all_slide_factory_slots",
      description:
        "Mark every Lucca narrative slot on a slide factory run as approved (Tab 4). Useful when the admin has reviewed and accepts the full draft. Requires status 'draft_review'.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "trigger_slide_factory_build",
      description:
        "Trigger Marco to build the deck (Tab 4 → Tab 5), or re-trigger after a failed build (status 'error'). On a normal trigger, every Lucca slot must be approved first. On an error re-trigger, prior slot approval stands and the check is skipped. Status advances to 'building'. Marco dispatches per-slide swarm teams in the background; poll get_slide_factory_run for agent results.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_slide_factory_build",
      description:
        "Cancel an in-progress Marco build. Only works when status is 'building'. Transitions the run to status 'error' and sets completedAt so the panel stops polling. Use when a build is stuck or must be stopped before it completes.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "produce_slide_factory_deck",
      description:
        "Manually produce (or re-produce) the deck PDF for a complete slide factory run. Use this when a run reached 'complete' status but its deckR2Key is null (Tab 6 stuck on 'Deck not yet rendered'), or when an operator wants to refresh the rendered PDF. Calls Franco directly — bypasses Marco's automatic post-completion call. Idempotent: re-running on a successful run overwrites the same R2 key.",
      parameters: {
        type: "object",
        properties: {
          runId: { type: "number", description: "Slide factory run ID" },
        },
        required: ["runId"],
      },
    },
    {
      name: "rebuild_slide_factory_deck",
      description:
        "Trigger a lightweight PDF re-render after overriding one or more slots on a completed run (Tab 6 override panel). Transitions the run to 'rebuilding', fires Franco asynchronously, and atomically writes status + deckR2Key + completedAt on success. Returns error if a rebuild is already in progress (single-flight guard) or if the run is not 'complete'. Poll get_slide_factory_run to detect completion (status returns to 'complete').",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
        },
        required: ["id"],
      },
    },
    // ── Pietro data infrastructure tools ──────────────────────────────────
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
    // ── Market rate tools (U7) ─────────────────────────────────────────────
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
      name: "update_market_rate",
      description:
        "Override a market rate with a manual admin value. Use to correct stale or incorrect rates. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Rate key to update, e.g. 'fed_funds_rate'." },
          value: { type: "number", description: "New rate value." },
          note: { type: "string", description: "Optional note explaining the override." },
        },
        required: ["key", "value"],
      },
    },
    // ── Tripadvisor live research tool ─────────────────────────────────────
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
    {
      name: "create_property",
      description:
        "Create a new property (hotel) in the portfolio. Mirrors the UI's 'New Property' action: applies global assumption defaults, " +
        "smart defaults from quality tier / business model / country / room count, suggests a star rating, seeds default fee categories, " +
        "and creates a hero photo if an imageUrl is provided. Returns the new property id and name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Property name (required)." },
          country: { type: "string", description: "Country, e.g. 'United States'." },
          stateProvince: { type: "string", description: "State or province." },
          city: { type: "string", description: "City." },
          location: { type: "string", description: "Free-form location string." },
          propertyType: { type: "string", description: "Property type, e.g. 'hotel', 'resort', 'inn'." },
          businessModel: { type: "string", description: "Business model classification, e.g. 'hotel', 'resort'." },
          qualityTier: { type: "string", description: "Quality tier, e.g. 'Luxury', 'Upscale', 'Midscale'." },
          roomCount: { type: "number", description: "Total number of guest rooms." },
          imageUrl: { type: "string", description: "Optional hero image URL." },
        },
        required: ["name"],
      },
    },
    {
      name: "delete_property",
      description:
        "Soft-delete (archive) a property. This is reversible by an admin via the restore endpoint, but it removes the property from " +
        "all standard list/detail views and clears its vector index. Confirm with the user before calling. Caller must be the property " +
        "owner or an admin.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property id to archive." },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_property_photo",
      description:
        "Delete a photo from a property's gallery. Cannot delete the last photo unless you are an admin. Returns an error if the photo does not belong to the specified property.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID the photo belongs to." },
          photoId: { type: "number", description: "ID of the photo to delete." },
        },
        required: ["propertyId", "photoId"],
      },
    },
    {
      name: "set_hero_photo",
      description:
        "Set a photo as the hero (primary) image for a property. The photo must belong to the specified property.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID." },
          photoId: { type: "number", description: "ID of the photo to set as hero." },
        },
        required: ["propertyId", "photoId"],
      },
    },
    {
      name: "update_photo",
      description:
        "Update a property photo's caption or sort order. The photo must belong to the specified property.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID the photo belongs to." },
          photoId: { type: "number", description: "ID of the photo to update." },
          caption: { type: "string", description: "New caption text. Pass null to clear." },
          sortOrder: { type: "number", description: "New sort position (0-based)." },
        },
        required: ["propertyId", "photoId"],
      },
    },
    {
      name: "list_property_photos",
      description:
        "List all photos in a property's gallery, ordered by sort order. Returns id, imageUrl, caption, isHero, and sortOrder for each photo.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID." },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "create_photo",
      description:
        "Add a photo to a property's gallery by URL. The first photo added becomes the hero automatically. Optionally set a caption.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID to add the photo to." },
          imageUrl: { type: "string", description: "Publicly accessible URL of the image." },
          caption: { type: "string", description: "Optional caption for the photo." },
        },
        required: ["propertyId", "imageUrl"],
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
      name: "delete_slide_factory_run",
      description:
        "Permanently delete a slide factory run record. Only the owner of the run can delete it. This cannot be undone.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID." },
        },
        required: ["id"],
      },
    },
    // ── Prospective Properties / Property Finder tools ─────────────────────
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
    // ── Price Events tools ─────────────────────────────────────────────────
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
    // ── Photo reorder tool ─────────────────────────────────────────────────
    {
      name: "reorder_photos",
      description:
        "Reorder a property's photo gallery by providing the full ordered list of photo IDs. The first ID becomes sort_order 0.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID." },
          orderedPhotoIds: {
            type: "array",
            items: { type: "number" },
            description: "Photo IDs in the desired display order.",
          },
        },
        required: ["propertyId", "orderedPhotoIds"],
      },
    },
    // ── Service Templates tools ────────────────────────────────────────────
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
      name: "list_companies",
      description:
        "List all active companies (legal entities) in the system — both management companies and SPVs (Special Purpose Vehicles). " +
        "Admin-only. Returns id, name, type, and isActive for each.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_company",
      description:
        "Get the full record for a single company by id. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Company id." },
        },
        required: ["id"],
      },
    },
    {
      name: "update_company",
      description:
        "Update a company's name, type, description, or active status. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Company id." },
          name: { type: "string", description: "New company name (must be unique)." },
          type: { type: "string", description: "Company type: 'management' or 'spv'." },
          description: { type: "string", description: "Company description." },
          isActive: { type: "boolean", description: "Whether the company is active." },
        },
        required: ["id"],
      },
    },
    {
      name: "create_company",
      description:
        "Create a new company (management company or SPV). Admin-only. Name must be unique.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Company name (must be unique)." },
          type: { type: "string", description: "Company type: 'management' or 'spv'." },
          description: { type: "string", description: "Optional description." },
        },
        required: ["name", "type"],
      },
    },
    {
      name: "delete_company",
      description:
        "Deactivate a company by setting isActive to false. Admin-only. This is a soft delete — the record is preserved.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Company id to deactivate." },
        },
        required: ["id"],
      },
    },
    // ── KB management tools (U4) ───────────────────────────────────────────
    {
      name: "create_kb_entry",
      description:
        "Create a new Knowledge Base entry. The entry is immediately indexed in the vector store for retrieval. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Entry title (required)." },
          content: { type: "string", description: "Entry body / main text (required)." },
          category: { type: "string", description: "Category tag, e.g. 'custom', 'hospitality', 'operations'. Defaults to 'custom'." },
          source: { type: "string", description: "Provenance label, e.g. 'manual'. Defaults to 'manual'." },
          tags: { type: "array", items: { type: "string" }, description: "Optional list of keyword tags." },
          priority: { type: "number", description: "Display / retrieval priority 0–100. Defaults to 50." },
          isActive: { type: "boolean", description: "Whether the entry is active and searchable. Defaults to true." },
        },
        required: ["title", "content"],
      },
    },
    {
      name: "update_kb_entry",
      description:
        "Update one or more fields on an existing Knowledge Base entry. Only the fields you supply are changed; omitted fields keep their current values. Updates history and re-syncs the vector store. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "KB entry ID." },
          title: { type: "string", description: "New title." },
          content: { type: "string", description: "New content body." },
          category: { type: "string", description: "New category tag." },
          source: { type: "string", description: "New provenance label." },
          tags: { type: "array", items: { type: "string" }, description: "New list of keyword tags." },
          priority: { type: "number", description: "New priority 0–100." },
          isActive: { type: "boolean", description: "Active/inactive toggle. Set false to exclude the entry from search without deleting it." },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_kb_entry",
      description:
        "Permanently delete a Knowledge Base entry and remove it from the vector store. This action is irreversible — prefer setting isActive=false to soft-hide it instead. Admin-only.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "KB entry ID to delete." },
        },
        required: ["id"],
      },
    },
    {
      name: "list_kb_entries",
      description:
        "List Knowledge Base entries, optionally filtered by category. Admin-only. Use before deleting or updating entries to verify they exist.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category tag (e.g. 'hospitality'). Omit to list all entries." },
        },
      },
    },
    {
      name: "get_kb_entry",
      description:
        "Retrieve a single Knowledge Base entry by ID. Returns title, content, category, and source.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "KB entry ID." },
        },
        required: ["id"],
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
