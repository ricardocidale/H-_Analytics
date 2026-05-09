export function makeProvenance(source: "lucca" | "admin" | "admin-override", approvedAt: string | null) {
  return {
    source: source !== "lucca" ? ("user" as const) : ("llm" as const),
    updatedAt: approvedAt ?? new Date().toISOString(),
  };
}
