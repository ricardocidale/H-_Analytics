/**
 * Service-call dispatchers — given a (service, field, relaxedContext, context)
 * tuple, perform the actual outbound call and shape the result into a
 * `DispatchResult`. Returns null when the service has no usable data for the
 * requested field at the given relaxation level.
 *
 * This file is a thin barrel: per-service-category handler maps live under
 * `./dispatchers/` (market, macro, comp-set, location, regulatory,
 * pre-collected tables, research). The public functions
 * (`callServiceForField`, `buildFieldSpecificQuery`) are preserved so
 * callers and tests do not need any path changes.
 */
import { logger } from "../../logger";
import { getServiceRegistry } from "./service-registry";
import type { DispatchResult, RelaxedContext, RoutingContext } from "./types";

import type { DispatchHandler } from "./dispatchers/_shared";
import { handlers as marketHandlers } from "./dispatchers/market-services";
import { handlers as macroHandlers } from "./dispatchers/macro-services";
import { handlers as compSetHandlers } from "./dispatchers/comp-set-services";
import { handlers as locationHandlers } from "./dispatchers/location-services";
import { handlers as regulatoryHandlers } from "./dispatchers/regulatory-services";
import { handlers as preCollectedHandlers } from "./dispatchers/precollected-tables";
import { handlers as researchHandlers } from "./dispatchers/research-services";

export { buildFieldSpecificQuery } from "./dispatchers/research-services";

const DISPATCH_HANDLERS: Record<string, DispatchHandler> = {
  ...marketHandlers,
  ...macroHandlers,
  ...compSetHandlers,
  ...locationHandlers,
  ...regulatoryHandlers,
  ...preCollectedHandlers,
  ...researchHandlers,
};

export async function callServiceForField(
  serviceKey: string,
  _method: string,
  field: string,
  rCtx: RelaxedContext,
  ctx: RoutingContext,
): Promise<DispatchResult | null> {
  const registry = getServiceRegistry();
  const svc = registry[serviceKey];
  if (!svc || !svc.isAvailable()) return null;

  const handler = DISPATCH_HANDLERS[serviceKey];
  if (!handler) return null;

  try {
    return await handler(serviceKey, field, rCtx, ctx, svc);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Data router: ${serviceKey}.${_method} failed for ${field}: ${msg}`, "data-router");
    return null;
  }
}
