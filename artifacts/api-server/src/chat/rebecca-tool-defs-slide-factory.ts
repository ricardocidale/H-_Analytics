import type { ToolParam } from "./tool-types";

export function getSlideFactoryTools(): ToolParam[] {
  return [
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
        "Accept the brief on a slide factory run (Tab 1 → Tab 2). Status advances to 'ingesting'. This tool is now state-only — to start the background ingestion job, follow up with trigger_lorenzo_ingestion(id). Requires status 'new' and a recorded brief.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "trigger_lorenzo_ingestion",
      description:
        "Start the Lorenzo ingestion background job for a slide factory run. Returns immediately; Lorenzo runs in the background — poll get_slide_factory_run for status. Typically called right after accept_slide_factory_brief. Requires status 'ingesting'.",
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
        "Assign properties to slides 1, 2, 3, and 5 on a slide factory run (Tab 3 → Tab 4). Slides 4 and 6 are auto-generated from portfolio data. Each property must be owned by the current admin. Status advances to 'drafting'. This tool is now state-only — to start the Lucca drafting background job, follow up with trigger_lucca_draft(id). Requires status 'ingested'.",
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
      name: "trigger_lucca_draft",
      description:
        "Start the Lucca drafting background job for a slide factory run. Returns immediately; Lucca runs in the background — poll get_slide_factory_run for status. Typically called right after assign_slide_factory_properties. Requires status 'drafting'.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Slide factory run ID" },
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
    {
      name: "download_factory_v2_deck",
      description:
        "Return download URLs for the completed factory v2 deck. Supports format='pptx' (editable PowerPoint), 'pdf' (print-ready PDF), or 'both' (returns both). Only valid when the run status is 'complete'. Returns signed R2 URLs the admin can open directly — use 'both' when the admin wants to download and hand-edit the PPTX.",
      parameters: {
        type: "object",
        properties: {
          runId: { type: "number", description: "Slide factory run ID" },
          format: {
            type: "string",
            enum: ["pptx", "pdf", "both"],
            description: "Which format(s) to return. 'both' returns PPTX and PDF URLs.",
          },
        },
        required: ["runId", "format"],
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
    {
      name: "verify_factory_deck",
      description:
        "Run Bianca (visual quality verification) on a completed slide factory deck. " +
        "Bianca renders each PPTX slide to PNG via LibreOffice, then checks all slides " +
        "against a rubric (cut-off text, placeholders, readability, layout, consistency, " +
        "data quality) using Claude vision. Returns per-slide findings and an overall verdict. " +
        "Use when the user asks to verify, inspect, or quality-check a deck before delivery. " +
        "Run only on completed runs with a PPTX (status: complete).",
      parameters: {
        type: "object",
        properties: {
          runId: { type: "number", description: "Slide factory run ID." },
        },
        required: ["runId"],
      },
    },
  ];
}
