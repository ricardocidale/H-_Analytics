/**
 * connectors.ts — Replit Connectors SDK wrapper (Task #402)
 *
 * Centralizes the `@replit/connectors-sdk` import inside the Replit-coupled
 * corner of the codebase so the independence guardrail's allow-list stays
 * tight. Callers (e.g. the Linear integration) talk to `replitProxyFetch`
 * instead of importing `ReplitConnectors` directly.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export interface ConnectorRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export function replitProxyFetch(
  connectorName: string,
  pathname: string,
  init: ConnectorRequestInit,
): Promise<Response> {
  return connectors.proxy(connectorName, pathname, init);
}
