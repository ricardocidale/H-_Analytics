/**
 * Shared types for per-service dispatcher modules.
 *
 * Each category module exports a `handlers` map keyed by `serviceKey`. The
 * barrel in `../dispatchers.ts` merges them into a single lookup used by
 * `callServiceForField`.
 */
import type { DispatchResult, RelaxedContext, RoutingContext } from "../types";

export interface DispatcherService {
  instance: any;
  isAvailable: () => boolean;
}

export type DispatchHandler = (
  serviceKey: string,
  field: string,
  rCtx: RelaxedContext,
  ctx: RoutingContext,
  svc: DispatcherService,
) => Promise<DispatchResult | null>;

export type { DispatchResult, RelaxedContext, RoutingContext };
