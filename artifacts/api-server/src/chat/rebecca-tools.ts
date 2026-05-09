import { storage } from "../storage";
import { logger } from "../logger";
import { isAdminRole } from "@shared/constants";
import type { ToolParam } from "./tool-types";
import type { Property, UpdateProperty, Scenario, UpdateScenario } from "@workspace/db";
import { updatePropertySchema, insertPropertySchema, type InsertProperty } from "@workspace/db";
import { createPropertyForUser, archivePropertyForUser } from "../routes/properties";
import { SLIDE_FACTORY_UNAPPROVED_SLOTS_PREVIEW } from "../constants";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
  researchReferenceBrands,
} from "../ai/analyst-table-refresh";
import {
  triggerLbDeckRenderService,
  getLbDeckRenderStatusService,
} from "../routes/lb-deck-pdf";
import { appendIrisGap, clearIrisGaps, readIrisGaps } from "../ai/iris/workspace";
import { runIrisAgent, type IrisTrigger } from "../ai/iris/agent";
import { capErrors, IRIS_HEALTH_SUMMARY_MAX_ERRORS } from "../ai/iris/format";
import { insertIrisRun, updateIrisRun, getLatestIrisRun } from "../storage/iris-runs";
import { upsertChunks, deleteVectors } from "../ai/vector-store-service";
import { insertRebeccaKBSchema } from "@workspace/db";

// Named constant: estimated minutes for background research job (Category 2 — DEFAULT VARIABLE)
const RESEARCH_ESTIMATED_MINUTES = 2;

export type ToolContext = { userId: number };

/** Max chars of KB entry content stored in the vector store metadata preview. */
export const KB_CONTENT_VECTOR_PREVIEW_CHARS = 3_000;

export type DataChangedEntry = {
  entityType: "property" | "scenario" | "slide_factory_run" | "analyst_table" | "lb_deck_config"
            | "kb_entry" | "global_assumptions" | "research_job" | "iris_run" | "iris_gap" | "data_source" | "compliance_run";
  entityId: number;
};

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema for LLM tool-calling)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

export async function dispatchRebeccaTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  try {
    switch (name) {
      case "list_properties":
        return await toolListProperties(ctx);
      case "get_property":
        return await toolGetProperty(args, ctx);
      case "list_scenarios":
        return await toolListScenarios(args, ctx);
      case "get_scenario":
        return await toolGetScenario(args, ctx);
      case "update_property":
        return await toolUpdateProperty(args, ctx);
      case "patch_property":
        return await toolPatchProperty(args, ctx);
      case "create_scenario":
        return await toolCreateScenario(args, ctx);
      case "update_scenario":
        return await toolUpdateScenario(args, ctx);
      case "update_scenario_assumptions":
        return await toolUpdateScenarioAssumptions(args, ctx);
      case "configure_lb_deck":
        return await toolConfigureLbDeck(args, ctx);
      case "get_lb_deck_config":
        return await toolGetLbDeckConfig(ctx);
      case "trigger_lb_deck_render":
        return await toolTriggerLbDeckRender(ctx);
      case "get_lb_deck_render_status":
        return await toolGetLbDeckRenderStatus(ctx);
      case "refresh_analyst_table":
        return await toolRefreshAnalystTable(args, ctx);
      case "lock_scenario":
        return await toolLockScenario(args, ctx);
      case "delete_scenario":
        return await toolDeleteScenario(args, ctx);
      case "trigger_research":
        return await toolTriggerResearch(args, ctx);
      case "write_retrieval_gap":
        return await toolWriteRetrievalGap(args, ctx);
      case "trigger_iris_health_check":
        return await toolTriggerIrisHealthCheck(ctx);
      case "trigger_iris_reindex":
        return await toolTriggerIrisReindex(ctx);
      case "run_compliance_audit":
        return await toolRunComplianceAudit(ctx);
      case "clear_iris_gaps":
        return await toolClearIrisGaps(ctx);
      case "get_iris_status":
        return await toolGetIrisStatus(ctx);
      case "create_slide_factory_run":
        return await toolCreateSlideFactoryRun(ctx);
      case "list_slide_factory_runs":
        return await toolListSlideFactoryRuns(ctx);
      case "get_slide_factory_run":
        return await toolGetSlideFactoryRun(args, ctx);
      case "record_slide_factory_brief":
        return await toolRecordSlideFactoryBrief(args, ctx);
      case "accept_slide_factory_brief":
        return await toolAcceptSlideFactoryBrief(args, ctx);
      case "assign_slide_factory_properties":
        return await toolAssignSlideFactoryProperties(args, ctx);
      case "update_slide_factory_slot":
        return await toolUpdateSlideFactorySlot(args, ctx);
      case "approve_all_slide_factory_slots":
        return await toolApproveAllSlideFactorySlots(args, ctx);
      case "trigger_slide_factory_build":
        return await toolTriggerSlideFactoryBuild(args, ctx);
      case "cancel_slide_factory_build":
        return await toolCancelSlideFactoryBuild(args, ctx);
      case "produce_slide_factory_deck":
        return await toolProduceSlideFactoryDeck(args, ctx);
      case "rebuild_slide_factory_deck":
        return await toolRebuildSlideFactoryDeck(args, ctx);
      case "get_data_source_status":
        return await toolGetDataSourceStatus(ctx);
      case "probe_data_source":
        return await toolProbeDataSource(args, ctx);
      case "regenerate_data_source":
        return await toolRegenerateDataSource(args, ctx);
      case "get_analyst_table":
        return await toolGetAnalystTable(args, ctx);
      case "create_property":
        return await toolCreateProperty(args, ctx);
      case "delete_property":
        return await toolDeleteProperty(args, ctx);
      case "list_companies":
        return await toolListCompanies(ctx);
      case "get_company":
        return await toolGetCompany(args, ctx);
      case "get_tripadvisor_hotels":
        return await toolGetTripadvisorHotels(args);
      case "create_kb_entry":
        return await toolCreateKbEntry(args, ctx);
      case "update_kb_entry":
        return await toolUpdateKbEntry(args, ctx);
      case "delete_kb_entry":
        return await toolDeleteKbEntry(args, ctx);
      case "compare_scenarios":
        return await toolCompareScenarios(args, ctx);
      case "update_global_assumptions":
        return await toolUpdateGlobalAssumptions(args, ctx);
      default:
        return { result: { error: "Unknown tool" } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as Record<string, unknown>)?.code;
    return { result: { error: message, ...(code !== undefined ? { code } : {}) } };
  }
}

// ---------------------------------------------------------------------------
// Args validation helpers
// ---------------------------------------------------------------------------

/** Extracts a required numeric ID from LLM-supplied args, returning an error
 *  result if the value is absent or not a finite number. LLMs sometimes return
 *  string IDs ("123") rather than numbers — catching that here prevents silent
 *  type confusion reaching the storage layer. */
function requireNumericArg(
  args: Record<string, unknown>,
  key: string,
): { ok: true; value: number } | { ok: false; result: { result: { error: string } } } {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return { ok: false, result: { result: { error: `${key} must be a number` } } };
  }
  return { ok: true, value: v };
}

/** Extracts a required object from LLM-supplied args. */
function requireObjectArg(
  args: Record<string, unknown>,
  key: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; result: { result: { error: string } } } {
  const v = args[key];
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return { ok: false, result: { result: { error: `${key} must be an object` } } };
  }
  return { ok: true, value: v as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Individual tool implementations
// ---------------------------------------------------------------------------

async function toolListProperties(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const props = await storage.getAllProperties(ctx.userId);
  return {
    result: {
      properties: props.map((p: Property) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        type: p.type,
      })),
    },
  };
}

async function toolGetProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  return {
    result: {
      property: {
        id: prop.id,
        name: prop.name,
        country: prop.country,
        type: prop.type,
        startAdr: prop.startAdr,
        maxOccupancy: prop.maxOccupancy,
        costRateMarketing: prop.costRateMarketing,
        exitCapRate: prop.exitCapRate,
        location: prop.location,
        city: prop.city,
        stateProvince: prop.stateProvince,
        purchasePrice: prop.purchasePrice,
        roomCount: prop.roomCount,
        startOccupancy: prop.startOccupancy,
        adrGrowthRate: prop.adrGrowthRate,
        taxRate: prop.taxRate,
        status: prop.status,
        market: prop.market,
      },
    },
  };
}

async function toolListScenarios(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const allScenarios = await storage.getScenariosByUser(ctx.userId);
  const propertyId = args.propertyId as number | undefined;

  const filtered = propertyId != null
    ? allScenarios.filter((s: Scenario) =>
        Array.isArray(s.properties) &&
        (s.properties as Array<{ id?: number }>).some((p) => p.id === propertyId)
      )
    : allScenarios;

  return {
    result: {
      scenarios: filtered.map((s: Scenario) => ({
        id: s.id,
        name: s.name,
        isLocked: s.isLocked,
        kind: s.kind,
      })),
    },
  };
}

async function toolGetScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  return {
    result: {
      scenario: {
        id: sc.id,
        name: sc.name,
        isLocked: sc.isLocked,
        kind: sc.kind,
        globalAssumptions: sc.globalAssumptions,
      },
    },
  };
}

async function toolUpdateProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const field = args.field as string;
  const value = args.value;

  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  if (!Object.keys(updatePropertySchema.shape).includes(field)) {
    return { result: { error: `Unknown field: ${field}` } };
  }

  // Validate the value against the field's schema before writing to the DB
  const fieldSchema = (updatePropertySchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }>)[field];
  const parsed = fieldSchema.safeParse(value);
  if (!parsed.success) {
    return { result: { error: `Invalid value for field "${field}": ${String(parsed.error)}` } };
  }

  const before = (prop as unknown as Record<string, unknown>)[field];
  await storage.updateProperty(id, { [field]: value } as UpdateProperty);

  return {
    result: { success: true, field, before, after: value, displayName: prop.name },
    dataChanged: { entityType: "property", entityId: id },
  };
}

async function toolPatchProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;
  const fieldsResult = requireObjectArg(args, "fields");
  if (!fieldsResult.ok) return fieldsResult.result;
  const rawFields = fieldsResult.value;

  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const schemaShape = updatePropertySchema.shape;
  const validated: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [field, value] of Object.entries(rawFields)) {
    const fieldValidator = schemaShape[field as keyof typeof schemaShape];
    if (!fieldValidator) {
      errors.push(`Unknown field: ${field}`);
      continue;
    }
    const parsed = fieldValidator.safeParse(value);
    if (!parsed.success) {
      errors.push(`Invalid value for "${field}": ${String(parsed.error)}`);
    } else {
      validated[field] = value;
    }
  }

  if (errors.length > 0 && Object.keys(validated).length === 0) {
    return { result: { error: errors.join("; ") } };
  }

  await storage.updateProperty(id, validated as UpdateProperty);

  return {
    result: {
      success: true,
      updated: Object.keys(validated),
      ...(errors.length > 0 ? { skipped: errors } : {}),
      displayName: prop.name,
    },
    dataChanged: { entityType: "property", entityId: id },
  };
}

async function toolCreateScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyId = args.propertyId as number;
  const name = args.name as string;
  const cloneFromId = args.cloneFromId as number | undefined;

  let sourceId: number;

  if (cloneFromId != null) {
    // Verify ownership before cloning
    const sourceSc = await storage.getScenario(cloneFromId);
    if (!sourceSc || sourceSc.userId !== ctx.userId) {
      return { result: { error: "Not found" } };
    }
    sourceId = cloneFromId;
  } else {
    // Find a source scenario that already covers the requested property.
    // Prefer the user's default scenario for that property, then any scenario
    // for that property. Surface an error if none exists rather than silently
    // cloning an unrelated property's scenario.
    const allScenarios = await storage.getScenariosByUser(ctx.userId);
    const matchesProperty = (s: Scenario): boolean =>
      Array.isArray(s.properties)
      && (s.properties as Array<{ id?: number }>).some((p) => p.id === propertyId);
    const sourceSc =
      allScenarios.find((s: Scenario) => s.kind === "default" && matchesProperty(s))
      ?? allScenarios.find(matchesProperty);
    if (!sourceSc) {
      return {
        result: {
          error: `Cannot create scenario — no existing scenario covers property ${propertyId}`,
        },
      };
    }
    sourceId = sourceSc.id;
  }

  const clone = await storage.cloneScenario(sourceId, ctx.userId);

  // Rename to requested name if the auto-generated clone name differs
  let finalScenario = clone;
  if (clone.name !== name) {
    // UpdateScenario officially covers name/description/tags; cast is safe here
    const updated = await storage.updateScenario(clone.id, { name } as UpdateScenario);
    if (updated) finalScenario = updated;
  }

  return {
    result: { scenario: { id: finalScenario.id, name: finalScenario.name } },
    dataChanged: { entityType: "scenario", entityId: finalScenario.id },
  };
}

// Whitelist of UpdateScenario keys Rebecca is allowed to mutate.
// Hard gate against LLM-supplied keys outside the documented contract
// (e.g. userId, kind, globalAssumptions) — stripToColumns at the storage
// layer would still let real DB columns through.
const REBECCA_SCENARIO_UPDATE_KEYS = ["name", "description", "tags"] as const;

async function toolUpdateScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const rawFields = args.fields as Record<string, unknown>;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const allowed = new Set<string>(REBECCA_SCENARIO_UPDATE_KEYS);
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (allowed.has(k)) fields[k] = v;
  }

  await storage.updateScenario(id, fields as UpdateScenario);

  return {
    result: { success: true, updated: Object.keys(fields) },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

// Allowlist of globalAssumptions keys Rebecca may write, with per-key type guards.
// Derived from the three explicitly-typed fields in ScenarioGlobalAssumptionsSnapshot.
// The engine reads many more keys from this blob (see company-engine.ts:93-147),
// but those are internally managed; LLM-controlled writes are intentionally limited
// to the three admin-facing fields below.
const PROJECTION_YEARS_MAX = 50; // Category 1 — domain cap; sourced from ScenarioGlobalAssumptionsSnapshot
const SCENARIO_ASSUMPTION_VALIDATORS: Record<string, (v: unknown) => boolean> = {
  modelStartDate: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime()),
  baseManagementFeePercent: (v) => typeof v === "number" && v >= 0 && v <= 1,
  projectionYears: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= PROJECTION_YEARS_MAX,
};

async function toolUpdateScenarioAssumptions(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;
  const patchesResult = requireObjectArg(args, "patches");
  if (!patchesResult.ok) return patchesResult.result;
  const rawPatches = patchesResult.value;

  // Note: this is a read-modify-write without a DB-level lock. Two concurrent
  // calls on the same scenario (possible when the LLM emits multiple tool_use
  // blocks in one response) will race and the last writer wins. The correct
  // fix is optimistic locking on updateScenarioSnapshot using updatedAt or a
  // version column — tracked as a known limitation.
  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  if (sc.isLocked) {
    return { result: { error: "Scenario is locked and cannot be edited" } };
  }

  // Validate and filter patches through the allowlist.
  const validated: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(rawPatches)) {
    const validate = SCENARIO_ASSUMPTION_VALIDATORS[key];
    if (!validate) {
      rejected.push(`unknown key: ${key}`);
      continue;
    }
    if (!validate(value)) {
      rejected.push(`invalid value for ${key}`);
      continue;
    }
    validated[key] = value;
  }

  if (Object.keys(validated).length === 0) {
    return { result: { error: `No valid patches supplied. ${rejected.join("; ")}` } };
  }

  const mergedGA = {
    ...(sc.globalAssumptions as Record<string, unknown>),
    ...validated,
  };

  // Null out computedResults and computeHash so cached projections are not
  // served against stale assumptions. The engine recomputes on the next
  // scenario load. The auto-save route calls tryComputeResults before writing,
  // but importing that here would violate ADR-007 DI discipline.
  await storage.updateScenarioSnapshot(id, {
    globalAssumptions: mergedGA,
    properties: sc.properties,
    feeCategories: sc.feeCategories ?? undefined,
    propertyPhotos: sc.propertyPhotos ?? undefined,
    serviceTemplates: sc.serviceTemplates ?? undefined,
    computedResults: null,
    computeHash: null,
  });

  return {
    result: {
      success: true,
      updated: Object.keys(validated),
      ...(rejected.length > 0 ? { rejected } : {}),
    },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

async function toolGetLbDeckConfig(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const config = await storage.getLbSlidesConfig();
  // Normalize to { config: ... } so callers use the same path as configure_lb_deck's response.
  // Include id and updatedAt so the null-config shape is structurally identical to the row shape.
  return {
    result: {
      config: config ?? {
        id: null, updatedAt: null,
        slide1PropertyId: null, slide2PropertyId: null,
        slide3PropertyId: null, slide5PropertyId: null,
        slide4SectionSubtitle: null, slide6Disclaimer: null,
      },
    },
  };
}

async function toolConfigureLbDeck(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  // Read-merge-write: only supplied fields change; omitted fields keep current values.
  const current = await storage.getLbSlidesConfig();

  const SLIDE_PROP_FIELDS = [
    "slide1PropertyId", "slide2PropertyId", "slide3PropertyId", "slide5PropertyId",
  ] as const;

  // Verify ownership of any supplied property IDs before writing.
  for (const field of SLIDE_PROP_FIELDS) {
    const rawId = args[field];
    if (rawId === undefined || rawId === null) continue;
    if (typeof rawId !== "number" || !Number.isFinite(rawId)) {
      return { result: { error: `${field} must be a number` } };
    }
    const prop = await storage.getProperty(rawId);
    if (!prop || prop.userId !== ctx.userId) {
      return { result: { error: `Property ID ${rawId} for ${field} not found or not owned by you` } };
    }
  }

  const mergeNumericOrNull = (key: string, fallback: number | null): number | null =>
    args[key] !== undefined ? (args[key] as number | null) : fallback;

  const mergeStringOrNull = (key: string, fallback: string | null): string | null => {
    const v = args[key];
    if (v === undefined) return fallback;
    if (v !== null && typeof v !== "string") return fallback;
    return v as string | null;
  };

  const updated = await storage.upsertLbSlidesConfig({
    slide1PropertyId: mergeNumericOrNull("slide1PropertyId", current?.slide1PropertyId ?? null),
    slide2PropertyId: mergeNumericOrNull("slide2PropertyId", current?.slide2PropertyId ?? null),
    slide3PropertyId: mergeNumericOrNull("slide3PropertyId", current?.slide3PropertyId ?? null),
    slide5PropertyId: mergeNumericOrNull("slide5PropertyId", current?.slide5PropertyId ?? null),
    slide4SectionSubtitle: mergeStringOrNull("slide4SectionSubtitle", current?.slide4SectionSubtitle ?? null),
    slide6Disclaimer: mergeStringOrNull("slide6Disclaimer", current?.slide6Disclaimer ?? null),
  });
  return {
    result: { success: true, config: updated },
    dataChanged: { entityType: "lb_deck_config" as const, entityId: 0 },
  };
}

async function toolTriggerLbDeckRender(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  return { result: triggerLbDeckRenderService() };
}

async function toolGetLbDeckRenderStatus(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  return { result: getLbDeckRenderStatusService() };
}

async function toolRefreshAnalystTable(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const VALID_TABLE_IDS = ["capital_raise_benchmarks", "exit_multiples", "reference_brands"] as const;
  const tableId = args.tableId;
  if (typeof tableId !== "string" || !VALID_TABLE_IDS.includes(tableId as typeof VALID_TABLE_IDS[number])) {
    return { result: { error: `tableId must be one of: ${VALID_TABLE_IDS.join(", ")}` } };
  }
  const now = new Date();

  if (tableId === "capital_raise_benchmarks") {
    const current = await storage.getCapitalRaiseBenchmarks();
    const result = await researchCapitalRaiseBenchmarks(current);
    for (const r of result.proposedRanges) {
      await storage.upsertCapitalRaiseBenchmark({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "usd",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount: result.sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: {
        tableId,
        rangesCommitted: result.proposedRanges.length,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  if (tableId === "exit_multiples") {
    const current = await storage.getExitMultiples();
    const result = await researchExitMultiples(current);
    for (const r of result.proposedRanges) {
      await storage.upsertExitMultiple({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "x_revenue",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount: result.sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: {
        tableId,
        rangesCommitted: result.proposedRanges.length,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  if (tableId === "reference_brands") {
    const current = await storage.getReferenceBrands();
    const result = await researchReferenceBrands(current);
    return {
      result: {
        tableId,
        autoCommitted: result.autoCommitted,
        brandCount: result.brandCount,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  return { result: { error: `Unknown tableId: ${tableId}. Use capital_raise_benchmarks, exit_multiples, or reference_brands.` } };
}

async function toolLockScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  // UpdateScenario type covers name/description/tags only; isLocked is applied via cast.
  // The storage layer accepts isLocked through its set() call on the scenarios table.
  await storage.updateScenario(id, { isLocked: true } as unknown as UpdateScenario);

  return {
    result: { success: true },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

async function toolDeleteScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  await storage.softDeleteScenario(id, ctx.userId);

  return {
    result: { success: true },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

async function toolTriggerResearch(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyId = args.propertyId as number;

  const prop = await storage.getProperty(propertyId);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const seededValues = generateLocationAwareResearchValues({
    location: prop.location,
    streetAddress: prop.streetAddress,
    city: prop.city,
    stateProvince: prop.stateProvince,
    zipPostalCode: prop.zipPostalCode,
    country: prop.country,
    market: prop.market,
  });

  await storage.updateProperty(propertyId, { researchValues: seededValues } as UpdateProperty);

  return {
    result: { queued: true, estimatedMinutes: RESEARCH_ESTIMATED_MINUTES },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}

// ---------------------------------------------------------------------------
// Admin auth helper
// ---------------------------------------------------------------------------

/**
 * Trigger a Vito compliance audit run (fire-and-forget).
 * Admin only. Pre-creates the vito_runs row synchronously so the caller gets
 * a real runId back immediately; then runs the agent async.
 */
async function toolRunComplianceAudit(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const { runVitoAgent } = await import("../ai/vito/agent");
  const { createVitoRun } = await import("../ai/vito/workspace");

  const runId = await createVitoRun("manual", "runtime");

  void runVitoAgent("manual", runId)
    .catch((err: unknown) => {
      logger.error(`[compliance-audit] agent error: ${err instanceof Error ? err.message : String(err)}`, "rebecca");
    });

  return {
    result: { message: "Compliance audit started", runId },
    dataChanged: { entityType: "compliance_run", entityId: runId },
  };
}

/**
 * Returns an error result if the caller is not an admin, null otherwise.
 * Mirrors the `requireAdmin` middleware used in routes/admin/iris.ts.
 */
async function requireAdminCtx(ctx: ToolContext): Promise<{ result: { error: string } } | null> {
  const user = await storage.getUserById(ctx.userId);
  if (!user || !isAdminRole(user.role)) {
    return { result: { error: "This action requires admin access" } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Iris tool helpers
// ---------------------------------------------------------------------------

/**
 * Shared implementation for the two Iris run-trigger tools.
 * Creates a DB run record, fires runIrisAgent async (fire-and-forget), and
 * returns immediately — mirroring POST /api/admin/iris/run behaviour.
 */
async function toolTriggerIrisRun(
  trigger: IrisTrigger,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  // Best-effort concurrency guard — no in-process lock available here, but the
  // DB check catches the common case of a run already tracked as "running".
  const latest = await getLatestIrisRun();
  if (latest?.status === "running") {
    return { result: { error: "An Iris run is already in progress" } };
  }

  const run = await insertIrisRun({ trigger, status: "running" });
  const runId = run.id;
  const startTs = Date.now();

  void runIrisAgent(trigger)
    .then((result) =>
      updateIrisRun(runId, {
        status: "completed",
        modelUsed: result.model,
        chunksIndexed: result.chunksIndexed,
        errorsEncountered: result.errorsEncountered,
        durationMs: result.durationMs,
        healthSummary: {
          summary: result.summary,
          toolsInvoked: result.toolsInvoked,
          runId: result.runId,
          errors: capErrors(result.errors, IRIS_HEALTH_SUMMARY_MAX_ERRORS),
        },
      }),
    )
    .catch((err: unknown) => {
      const durationMs = Date.now() - startTs;
      return updateIrisRun(runId, {
        status: "error",
        durationMs,
        healthSummary: { error: String(err) },
      });
    });

  return { result: { runId, status: "started" }, dataChanged: { entityType: "iris_run", entityId: runId } };
}

async function toolTriggerIrisHealthCheck(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  return toolTriggerIrisRun("scheduled-health", ctx);
}

async function toolTriggerIrisReindex(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  return toolTriggerIrisRun("scheduled-reindex", ctx);
}

async function toolClearIrisGaps(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  await clearIrisGaps();
  return { result: { success: true }, dataChanged: { entityType: "iris_gap", entityId: 0 } };
}

async function toolGetIrisStatus(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const [lastRun, gaps] = await Promise.all([
    getLatestIrisRun(),
    readIrisGaps(),
  ]);

  // Extract individual error messages from healthSummary so Rebecca can
  // surface them directly rather than just reporting the count.
  const healthSummary = lastRun?.healthSummary as
    | { summary?: string; toolsInvoked?: string[]; runId?: string; errors?: string[]; error?: string }
    | null
    | undefined;
  const errorMessages: string[] = [];
  if (healthSummary?.errors && Array.isArray(healthSummary.errors) && healthSummary.errors.length > 0) {
    errorMessages.push(...healthSummary.errors);
  } else if (healthSummary?.error) {
    errorMessages.push(healthSummary.error);
  }

  return {
    result: {
      lastRun,
      gapsCount: gaps.length,
      ...(errorMessages.length > 0 && { errorMessages }),
    },
  };
}

/** Max characters accepted for a retrieval-gap query before truncation. */
const IRIS_GAP_MAX_QUERY_CHARS = 500;

async function toolWriteRetrievalGap(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  void ctx; // no user-scoped DB operation needed for gap logging
  // Normalize: collapse whitespace, trim, and cap — the query is model/user
  // input that writes into the shared Iris workspace markdown file.
  const rawQuery = ((args.query as string) ?? "").replace(/\s+/g, " ").trim();
  const query = rawQuery.slice(0, IRIS_GAP_MAX_QUERY_CHARS);
  if (!query) return { result: { recorded: false } };
  await appendIrisGap(query);
  return { result: { recorded: true }, dataChanged: { entityType: "iris_gap", entityId: 0 } };
}

// ───────────────────────────────────────────────────────────────────────────
// Slide Factory Pipeline tool handlers
// Every UI action in SlideFactoryPanel maps to one tool here. Mutations emit
// dataChanged: { entityType: "slide_factory_run", entityId } so the frontend
// invalidates its run query on SSE done. See parity map.
// ───────────────────────────────────────────────────────────────────────────

async function toolCreateSlideFactoryRun(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const { createSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await createSlideFactoryRun(ctx.userId);
  return {
    result: { id: run.id, status: run.status, createdAt: run.createdAt },
    dataChanged: { entityType: "slide_factory_run", entityId: run.id },
  };
}

async function toolListSlideFactoryRuns(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const { listSlideFactoryRuns } = await import("../storage/slide-factory-runs");
  const runs = await listSlideFactoryRuns(ctx.userId);
  return {
    result: runs.map((r) => ({
      id: r.id,
      status: r.status,
      briefFilename: r.briefFilename,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      completedAt: r.completedAt,
    })),
  };
}

async function toolGetSlideFactoryRun(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  return { result: run };
}

async function toolRecordSlideFactoryBrief(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  const r2Key = String(args.r2Key ?? "");
  const filename = String(args.filename ?? "");
  if (!Number.isFinite(id) || !r2Key || !filename) {
    return { result: { error: "id, r2Key, and filename are required" } };
  }
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "new") {
    return {
      result: { error: `Brief can only be recorded when status is 'new', current: '${run.status}'` },
    };
  }
  const updated = await updateSlideFactoryRun(id, { briefR2Key: r2Key, briefFilename: filename });
  return {
    result: { id, status: updated?.status, briefFilename: updated?.briefFilename },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

async function toolAcceptSlideFactoryBrief(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (!run.briefR2Key) return { result: { error: "No brief recorded yet" } };
  if (run.status !== "new") {
    return {
      result: { error: `Brief can only be accepted when status is 'new', current: '${run.status}'` },
    };
  }
  const updated = await updateSlideFactoryRun(id, {
    briefAccepted: true,
    status: "ingesting",
    startedAt: new Date(),
  });
  // Fire-and-forget Lorenzo ingestion — matches the route's auto-fire pattern.
  const { runLorenzoIngestion } = await import("../slides/lorenzo-ingestion");
  void runLorenzoIngestion(id);
  return {
    result: {
      id,
      status: updated?.status,
      message: "Brief accepted; Lorenzo ingestion dispatched. Poll get_slide_factory_run for status.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

async function toolAssignSlideFactoryProperties(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const slide1PropertyId = args.slide1PropertyId == null ? null : Number(args.slide1PropertyId);
  const slide2PropertyId = args.slide2PropertyId == null ? null : Number(args.slide2PropertyId);
  const slide3PropertyId = args.slide3PropertyId == null ? null : Number(args.slide3PropertyId);
  const slide5PropertyId = args.slide5PropertyId == null ? null : Number(args.slide5PropertyId);

  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "ingested") {
    return {
      result: {
        error: `Property assignment requires status 'ingested', current: '${run.status}'`,
      },
    };
  }
  // Verify ownership of each non-null property ID.
  const slidePropertyIds: Array<[string, number | null]> = [
    ["slide1PropertyId", slide1PropertyId],
    ["slide2PropertyId", slide2PropertyId],
    ["slide3PropertyId", slide3PropertyId],
    ["slide5PropertyId", slide5PropertyId],
  ];
  for (const [field, propId] of slidePropertyIds) {
    if (propId == null) continue;
    const prop = await storage.getProperty(propId);
    if (!prop || prop.userId !== ctx.userId) {
      return { result: { error: `Property ${propId} for ${field} not found or not owned by you` } };
    }
  }
  const updated = await updateSlideFactoryRun(id, {
    slide1PropertyId,
    slide2PropertyId,
    slide3PropertyId,
    slide5PropertyId,
    status: "drafting",
  });
  // Fire-and-forget Lucca drafting — matches the route's auto-fire pattern.
  const { runLuccaDraft } = await import("../slides/lucca-draft");
  void runLuccaDraft(id);
  return {
    result: {
      id,
      status: updated?.status,
      message: "Properties assigned; Lucca drafting dispatched. Poll get_slide_factory_run for status.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

async function toolUpdateSlideFactorySlot(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  const slotKey = String(args.slotKey ?? "");
  if (!Number.isFinite(id) || !slotKey) {
    return { result: { error: "id and slotKey are required" } };
  }
  const value = args.value === undefined ? undefined : String(args.value);
  const approved = args.approved === undefined ? undefined : Boolean(args.approved);
  if (value === undefined && approved === undefined) {
    return { result: { error: "At least one of value or approved must be provided" } };
  }
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  const slotEditAllowed = run.status === "draft_review" || run.status === "complete";
  if (!slotEditAllowed) {
    return { result: { error: `Slot edits require status 'draft_review' or 'complete', current: '${run.status}'` } };
  }
  if (!run.luccaDraft) return { result: { error: "No Lucca draft present" } };
  const existing = run.luccaDraft[slotKey];
  if (!existing) return { result: { error: `Slot '${slotKey}' not found in draft` } };

  const valueChanged = value !== undefined && value !== existing.value;
  const nowApproving = approved === true && !existing.approved;
  const newSource = valueChanged
    ? run.status === "complete"
      ? ("admin-override" as const)
      : ("admin" as const)
    : undefined;
  const updatedSlot = {
    ...existing,
    ...(value !== undefined ? { value } : {}),
    ...(approved !== undefined ? { approved } : {}),
    ...(newSource !== undefined ? { source: newSource } : {}),
    ...(nowApproving ? { approvedAt: new Date().toISOString() } : {}),
    ...(approved === false ? { approvedAt: null } : {}),
  };
  const updatedDraft = { ...run.luccaDraft, [slotKey]: updatedSlot };
  await updateSlideFactoryRun(id, { luccaDraft: updatedDraft });
  return {
    result: { id, slotKey, slot: updatedSlot },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

async function toolApproveAllSlideFactorySlots(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "draft_review") {
    return {
      result: { error: `Approve-all requires status 'draft_review', current: '${run.status}'` },
    };
  }
  if (!run.luccaDraft) return { result: { error: "No Lucca draft present" } };

  const now = new Date().toISOString();
  const approvedDraft: Record<string, typeof run.luccaDraft[string]> = {};
  for (const [key, slot] of Object.entries(run.luccaDraft)) {
    approvedDraft[key] = {
      ...slot,
      approved: true,
      approvedAt: slot.approvedAt ?? now,
    };
  }
  await updateSlideFactoryRun(id, { luccaDraft: approvedDraft });
  return {
    result: { id, slotsApproved: Object.keys(approvedDraft).length },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

async function toolTriggerSlideFactoryBuild(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  const isRetrigger = run.status === "error";
  if (run.status !== "draft_review" && !isRetrigger) {
    return {
      result: { error: `Trigger-build requires status 'draft_review' or 'error', current: '${run.status}'` },
    };
  }
  // Slot-approval check only applies to fresh builds; error re-triggers keep prior approval.
  if (!isRetrigger) {
    if (!run.luccaDraft) return { result: { error: "No Lucca draft present" } };
    const unapproved = Object.entries(run.luccaDraft)
      .filter(([, slot]) => !slot.approved)
      .map(([key]) => key);
    if (unapproved.length > 0) {
      return {
        result: {
          error: `${unapproved.length} slot(s) not yet approved`,
          unapprovedSlots: unapproved.slice(0, SLIDE_FACTORY_UNAPPROVED_SLOTS_PREVIEW),
        },
      };
    }
  }
  await updateSlideFactoryRun(id, { status: "building" });
  const { runMarco } = await import("../slides/marco");
  void runMarco(id);
  return {
    result: {
      id,
      status: "building",
      message: isRetrigger
        ? "Re-trigger from error initiated. Marco dispatched. Poll get_slide_factory_run for agent results."
        : "Build triggered. Marco dispatched. Poll get_slide_factory_run for agent results.",
    },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

async function toolCancelSlideFactoryBuild(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };
  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };
  if (run.status !== "building") {
    return { result: { error: `Cancel requires status 'building', current: '${run.status}'` } };
  }
  await updateSlideFactoryRun(id, { status: "error", completedAt: new Date() });
  return {
    result: { id, status: "error", message: "Build cancelled." },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

/**
 * Manually trigger Franco to produce (or re-produce) the deck PDF for a
 * complete slide factory run. Mirror of Marco's automatic produce_deck
 * call (marco-tools.ts handleProduceDeck) — same deterministic core
 * (`runFranco`), exposed as an agent-native parity entry point.
 *
 * Ownership-gated: loads the run via the userId-scoped getter so an admin
 * cannot render another admin's run by guessing a runId. Per CLAUDE.md §7,
 * the Rebecca tool maps 1:1 onto the Tab 6 "stuck on Deck not yet rendered"
 * recovery path.
 */
async function toolProduceSlideFactoryDeck(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const runIdResult = requireNumericArg(args, "runId");
  if (!runIdResult.ok) return runIdResult.result;
  const runId = runIdResult.value;

  const { getSlideFactoryRun } = await import("../storage/slide-factory-runs");
  const run = await getSlideFactoryRun(runId, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${runId} not found` } };

  const { runFranco } = await import("../slides/minions/franco");
  try {
    const { deckR2Key } = await runFranco(runId, { caller: "rebecca" });
    return {
      result: { ok: true, deckR2Key },
      dataChanged: { entityType: "slide_factory_run", entityId: runId },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { ok: false, error: message },
      dataChanged: { entityType: "slide_factory_run", entityId: runId },
    };
  }
}

async function toolRebuildSlideFactoryDeck(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = Number(args.id);
  if (!Number.isFinite(id)) return { result: { error: "Invalid slide factory run id" } };

  const { getSlideFactoryRun, updateSlideFactoryRun } = await import(
    "../storage/slide-factory-runs"
  );
  const run = await getSlideFactoryRun(id, ctx.userId);
  if (!run) return { result: { error: `Slide factory run ${id} not found` } };

  if (run.status === "rebuilding") {
    return { result: { error: "A rebuild is already in progress for this run" } };
  }
  if (run.status !== "complete") {
    return {
      result: { error: `Rebuild requires status 'complete', current: '${run.status}'` },
    };
  }

  const rebuilding = await updateSlideFactoryRun(id, { status: "rebuilding" });

  const { runFranco } = await import("../slides/minions/franco");
  void (async () => {
    try {
      const { deckR2Key } = await runFranco(id, {
        caller: "rebuild",
        skipDeckKeyWrite: true,
      });
      await updateSlideFactoryRun(id, {
        status: "complete",
        deckR2Key,
        completedAt: new Date(),
      });
    } catch (err) {
      logger.error(
        `[rebuild-tool] run ${id}: Franco failed — reverting to complete: ${String(err)}`,
        "slide-factory",
      );
      await updateSlideFactoryRun(id, { status: "complete" }).catch(() => {});
    }
  })();

  return {
    result: { id, status: rebuilding?.status ?? "rebuilding", message: "Rebuild started — poll get_slide_factory_run for completion" },
    dataChanged: { entityType: "slide_factory_run", entityId: id },
  };
}

// ---------------------------------------------------------------------------
// Pietro data infrastructure tools
// ---------------------------------------------------------------------------

async function toolGetDataSourceStatus(ctx: ToolContext): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const { db } = await import("../db");
  const { adminResources } = await import("@workspace/db");
  const { or, eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: adminResources.id,
      slug: adminResources.slug,
      kind: adminResources.kind,
      displayName: adminResources.displayName,
      lastHealthStatus: adminResources.lastHealthStatus,
      lastCheckedAt: adminResources.lastCheckedAt,
      dailyRequestBudget: adminResources.dailyRequestBudget,
    })
    .from(adminResources)
    .where(or(eq(adminResources.kind, "source"), eq(adminResources.kind, "mcp")));

  return {
    result: rows.map(r => ({
      ...r,
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
    })),
  };
}

async function toolProbeDataSource(args: Record<string, unknown>, ctx: ToolContext): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const { db } = await import("../db");
  const { adminResources } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { runProbe } = await import("../jobs/probes");

  const [row] = await db.select().from(adminResources).where(eq(adminResources.id, id)).limit(1);
  if (!row) return { result: { error: `Resource not found: id=${id}` } };

  const outcome = await runProbe(row);
  return { result: outcome, dataChanged: { entityType: "data_source", entityId: 0 } };
}

async function toolRegenerateDataSource(args: Record<string, unknown>, ctx: ToolContext): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const slug = typeof args.slug === "string" ? args.slug : "";
  if (!slug) return { result: { error: "slug is required" } };

  const { MINION_REGISTRY } = await import("../ai/ambient/pietro-scheduler");
  const minion = MINION_REGISTRY[slug];
  if (!minion) return { result: { error: `No minion registered for slug: ${slug}` } };

  const result = await minion();
  return { result, dataChanged: { entityType: "data_source", entityId: 0 } };
}

// ---------------------------------------------------------------------------
// Tripadvisor live hotel research
// ---------------------------------------------------------------------------

async function toolGetTripadvisorHotels(
  args: Record<string, unknown>,
): Promise<{ result: unknown }> {
  const market = typeof args.market === "string" ? args.market.trim() : "";
  if (!market) return { result: { error: "market is required" } };

  const query =
    typeof args.query === "string" && args.query.trim()
      ? args.query.trim()
      : "hotel";

  const { TRIPADVISOR_DEFAULT_HOTEL_LIMIT, searchTripadvisorHotels } =
    await import("../data/tripadvisor.js");

  const rawLimit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? args.limit
      : TRIPADVISOR_DEFAULT_HOTEL_LIMIT;

  const result = await searchTripadvisorHotels(market, query, rawLimit);
  return { result };
}

// ---------------------------------------------------------------------------
// Analyst-table read tool (U2)
// ---------------------------------------------------------------------------

async function toolGetAnalystTable(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const VALID_TABLE_IDS = ["capital_raise_benchmarks", "exit_multiples", "reference_brands"] as const;
  const tableId = args.tableId;
  if (typeof tableId !== "string" || !VALID_TABLE_IDS.includes(tableId as typeof VALID_TABLE_IDS[number])) {
    return { result: { error: `tableId must be one of: ${VALID_TABLE_IDS.join(", ")}` } };
  }

  if (tableId === "capital_raise_benchmarks") {
    const rows = await storage.getCapitalRaiseBenchmarks();
    return { result: { tableId, rowCount: rows.length, rows } };
  }
  if (tableId === "exit_multiples") {
    const rows = await storage.getExitMultiples();
    return { result: { tableId, rowCount: rows.length, rows } };
  }
  // reference_brands
  const rows = await storage.getReferenceBrands();
  return { result: { tableId, rowCount: rows.length, rows } };
}

// ---------------------------------------------------------------------------
// Property create / delete tools (U3)
//
// These delegate to shared helpers in routes/properties.ts so Rebecca stays
// at full parity with POST /api/properties and DELETE /api/properties/:id.
// ---------------------------------------------------------------------------

async function toolCreateProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const validation = insertPropertySchema.safeParse(args);
  if (!validation.success) {
    const message = validation.error.issues
      .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { result: { error: `Invalid property data: ${message}` } };
  }

  try {
    const property = await createPropertyForUser(
      user as unknown as Express.User,
      validation.data as InsertProperty,
    );
    return {
      result: { id: property.id, name: property.name },
      dataChanged: { entityType: "property", entityId: property.id },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: { error: `Failed to create property: ${message}` } };
  }
}

async function toolDeleteProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  // Ownership check inline — mirrors checkPropertyAccess in auth.ts.
  // Admin → any property; owner → own property; shared (userId=null) → any user.
  const property = await storage.getProperty(id);
  if (!property) return { result: { error: "Property not found" } };
  const canAccess =
    isAdminRole(user.role) ||
    property.userId === ctx.userId ||
    property.userId === null;
  if (!canAccess) return { result: { error: "Access denied" } };

  await archivePropertyForUser(id, ctx.userId);
  return {
    result: { success: true, displayName: property.name },
    dataChanged: { entityType: "property", entityId: id },
  };
}

// ---------------------------------------------------------------------------
// Company read tools (U4)
// ---------------------------------------------------------------------------

async function toolListCompanies(ctx: ToolContext): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const { db } = await import("../db");
  const { companies } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      type: companies.type,
      isActive: companies.isActive,
    })
    .from(companies)
    .where(eq(companies.isActive, true));

  return { result: { rowCount: rows.length, companies: rows } };
}

async function toolGetCompany(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const { db } = await import("../db");
  const { companies } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!row) return { result: { error: `Company not found: id=${id}` } };

  return {
    result: {
      ...row,
      createdAt: row.createdAt?.toISOString() ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// KB management tools (U4)
// ---------------------------------------------------------------------------

async function toolCreateKbEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const validation = insertRebeccaKBSchema.safeParse(args);
  if (!validation.success) {
    const message = validation.error.issues
      .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { result: { error: `Invalid KB entry data: ${message}` } };
  }

  const entry = await storage.createRebeccaKBEntry(validation.data);

  // Mirror the route: only index active entries (isActive defaults to true).
  if (entry.isActive !== false) {
    upsertChunks("knowledge-base", [{
      id: `admin-kb:${entry.id}`,
      text: `${entry.title}\n\n${entry.content}`,
      metadata: { title: entry.title, content: entry.content.slice(0, KB_CONTENT_VECTOR_PREVIEW_CHARS), source: "admin-kb", category: entry.category },
    }]).catch(e =>
      logger.warn(`Vector store sync failed for KB ${entry.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
    );
  }

  return {
    result: { id: entry.id, title: entry.title, category: entry.category },
    dataChanged: { entityType: "kb_entry", entityId: entry.id },
  };
}

async function toolUpdateKbEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const { id: _id, ...rest } = args;
  void _id; // consumed above
  const validation = insertRebeccaKBSchema.partial().safeParse(rest);
  if (!validation.success) {
    const message = validation.error.issues
      .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { result: { error: `Invalid update data: ${message}` } };
  }

  const user = await storage.getUserById(ctx.userId);
  const updated = await storage.updateRebeccaKBEntry(id, validation.data, user?.email ?? undefined);
  if (!updated) return { result: { error: "KB entry not found" } };

  // Mirror the route: sync or delete from vector store based on isActive flag.
  if (updated.isActive) {
    upsertChunks("knowledge-base", [{
      id: `admin-kb:${updated.id}`,
      text: `${updated.title}\n\n${updated.content}`,
      metadata: { title: updated.title, content: updated.content.slice(0, KB_CONTENT_VECTOR_PREVIEW_CHARS), source: "admin-kb", category: updated.category },
    }]).catch(e =>
      logger.warn(`Vector store sync failed for KB ${updated.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
    );
  } else {
    deleteVectors("knowledge-base", [`admin-kb:${updated.id}`]).catch(e =>
      logger.warn(`Vector store delete failed for KB ${updated.id}: ${e instanceof Error ? e.message : e}`, "rebecca")
    );
  }

  return {
    result: { id: updated.id, title: updated.title, category: updated.category, isActive: updated.isActive },
    dataChanged: { entityType: "kb_entry", entityId: id },
  };
}

async function toolDeleteKbEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const deleted = await storage.deleteRebeccaKBEntry(id);
  if (!deleted) return { result: { error: "KB entry not found" } };

  // Mirror the route: remove from vector store asynchronously (fire-and-forget).
  deleteVectors("knowledge-base", [`admin-kb:${id}`]).catch(e =>
    logger.warn(`Vector store delete failed for KB ${id}: ${e instanceof Error ? e.message : e}`, "rebecca")
  );

  return {
    result: { success: true },
    dataChanged: { entityType: "kb_entry", entityId: id },
  };
}

// ---------------------------------------------------------------------------
// compare_scenarios (U5) — read-only scenario comparison
// ---------------------------------------------------------------------------

async function toolCompareScenarios(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const id1Result = requireNumericArg(args, "scenarioId1");
  if (!id1Result.ok) return id1Result.result;
  const id2Result = requireNumericArg(args, "scenarioId2");
  if (!id2Result.ok) return id2Result.result;

  const [s1, s2] = await Promise.all([
    storage.getScenario(id1Result.value),
    storage.getScenario(id2Result.value),
  ]);

  if (!s1 || s1.userId !== ctx.userId) {
    return { result: { error: `Scenario ${id1Result.value} not found` } };
  }
  if (!s2 || s2.userId !== ctx.userId) {
    return { result: { error: `Scenario ${id2Result.value} not found` } };
  }

  const comparison = storage.compareScenarios(s1, s2);
  return { result: comparison };
}

// ---------------------------------------------------------------------------
// update_global_assumptions (U5) — admin-only partial patch
// ---------------------------------------------------------------------------

async function toolUpdateGlobalAssumptions(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const patchResult = requireObjectArg(args, "patch");
  if (!patchResult.ok) return patchResult.result;

  const ga = await storage.getGlobalAssumptions(ctx.userId);
  if (!ga) {
    return { result: { error: "Global assumptions not found" } };
  }

  const patch: Record<string, unknown> = { ...patchResult.value, updatedAt: new Date() };
  const updated = await storage.patchGlobalAssumptions(ga.id, patch);

  return {
    result: { success: true, id: updated.id },
    dataChanged: { entityType: "global_assumptions", entityId: 0 },
  };
}
