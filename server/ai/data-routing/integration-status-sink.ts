/**
 * Integration-status sink — the injectable telemetry/cache surface that
 * isolates the previously-private `_enabledMap` cache out of the data-router
 * orchestrator. Decoupling this cache is the precursor that lets us split the
 * data-routing helpers (registry, dispatchers) into their own modules without
 * sharing module-level mutable state.
 *
 * Tests and adjacent code can override the default sink via
 * `setIntegrationStatusSink` (e.g. with an `InMemoryIntegrationStatusSink`
 * constructed at a custom TTL, or any custom stub implementing the
 * interface), and reset back to the default with
 * `resetDefaultIntegrationStatusSink`.
 */
import { storage } from "../../storage";

export interface IntegrationStatusSink {
  /**
   * Returns the latest known integration-enabled map.
   * Implementations are expected to handle their own caching and refresh policy.
   * Service keys not present in the returned map are assumed enabled.
   */
  getEnabledMap(): Promise<Record<string, boolean>>;
  /** Drop any cached snapshot — primarily a test affordance. */
  reset(): void;
}

export class InMemoryIntegrationStatusSink implements IntegrationStatusSink {
  private cache: Record<string, boolean> | null = null;
  private fetchedAt = 0;

  constructor(private readonly ttlMs: number) {}

  async getEnabledMap(): Promise<Record<string, boolean>> {
    if (this.cache && Date.now() - this.fetchedAt < this.ttlMs) {
      return this.cache;
    }
    try {
      this.cache = await storage.getIntegrationEnabledMap();
      this.fetchedAt = Date.now();
    } catch {
      if (!this.cache) this.cache = {};
    }
    return this.cache;
  }

  reset(): void {
    this.cache = null;
    this.fetchedAt = 0;
  }
}

const ENABLED_MAP_TTL_MS = 60_000;

let activeSink: IntegrationStatusSink = new InMemoryIntegrationStatusSink(ENABLED_MAP_TTL_MS);

export function getIntegrationStatusSink(): IntegrationStatusSink {
  return activeSink;
}

export function setIntegrationStatusSink(sink: IntegrationStatusSink): void {
  activeSink = sink;
}

export function resetDefaultIntegrationStatusSink(): void {
  activeSink = new InMemoryIntegrationStatusSink(ENABLED_MAP_TTL_MS);
}
