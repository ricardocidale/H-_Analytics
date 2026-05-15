import { jsonOk } from "@/lib/http/api-response";

export async function GET(): Promise<Response> {
  return jsonOk({ status: "ok", timestamp: new Date().toISOString() });
}
