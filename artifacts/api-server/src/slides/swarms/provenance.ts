export function makeProvenance(source: "lucca" | "admin", approvedAt: string | null) {
  return {
    source: source === "admin" ? ("user" as const) : ("llm" as const),
    updatedAt: approvedAt ?? new Date().toISOString(),
  };
}
