import type { ToolParam } from "./tool-types";

export function getKbTools(): ToolParam[] {
  return [
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
  ];
}
