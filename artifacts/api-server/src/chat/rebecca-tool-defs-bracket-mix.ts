/**
 * Rebecca tool definitions — Phase B bracket-mix (R17)
 *
 * Four tools mirror the four mutation UI actions added in U6:
 *
 *   regenerate_global_bracket_mix     → POST /api/admin/icp/bracket-mix/global/regenerate
 *   refresh_peer_bracket_mix          → POST /api/admin/icp/peers/:id/refresh
 *   set_company_bracket_mix_override  → POST /api/companies/:id/bracket-mix/override
 *   clear_company_bracket_mix_override → DELETE /api/companies/:id/bracket-mix/override
 *
 * Every entry must have a matching row in
 * docs/discipline/agent-native-parity-map.md or the
 * `parity-map-coverage.test.ts` CI guard will fail the build (R17 build gate).
 */
import type { ToolParam } from "./tool-types";

export function getBracketMixTools(): ToolParam[] {
  return [
    {
      name: "regenerate_global_bracket_mix",
      description:
        "Fire the Phase B global bracket-mix recompute. Runs Hugo (peer aggregator) " +
        "and the legacy property-level classifier in parallel; persists one " +
        "bracket_mix_runs row and one bracket_mix_dual_run_diffs row per call. " +
        "When the feature flag is on and no Mgmt-Co has an active override, " +
        "the Phase B mix is written to globalAssumptions.bracket_mix; rows with " +
        "an active override are skipped (override wins, per R9). Returns the " +
        "Phase B run id, the diff-log row id, flag state, and update counters.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "refresh_peer_bracket_mix",
      description:
        "Re-run Tiago (Bracket-Mix Specialist) for one peer brand in the " +
        "icp_peer_companies registry. Persists a bracket_mix_runs row tagged " +
        "target_kind='peer', updates the peer's brand_archetype_split, " +
        "roster_size_estimate, split_evidence, and last_research_run_id atomically. " +
        "Use when a peer's last_researched_at is stale or you want fresh evidence " +
        "before the next global regenerate.",
      parameters: {
        type: "object",
        properties: {
          peerId: {
            type: "integer",
            minimum: 1,
            description: "The icp_peer_companies.id of the peer to refresh.",
          },
        },
        required: ["peerId"],
      },
    },
    {
      name: "set_company_bracket_mix_override",
      description:
        "Install a per-Mgmt-Co override on globalAssumptions.bracket_mix. Runs " +
        "Tiago against the supplied comp set (peer slugs the Mgmt-Co wants to " +
        "track), persists a bracket_mix_runs row tagged target_kind='company', " +
        "and links it via globalAssumptions.bracket_mix_override_run_id. While " +
        "the override is active, the global recompute skips this company's " +
        "bracket_mix row (R9). Use when the Mgmt-Co wants a bracket mix derived " +
        "from a custom comp set rather than the global default.",
      parameters: {
        type: "object",
        properties: {
          companyId: {
            type: "integer",
            minimum: 1,
            description: "The global_assumptions.id of the Mgmt-Co row to override.",
          },
          compSetSlugs: {
            type: "array",
            minItems: 1,
            description:
              "Peer slugs to research for this override (e.g. ['auberge-resorts','kimpton']). " +
              "Must contain at least one slug.",
            items: { type: "string", minLength: 1 },
          },
        },
        required: ["companyId", "compSetSlugs"],
      },
    },
    {
      name: "clear_company_bracket_mix_override",
      description:
        "Clear an active per-Mgmt-Co bracket-mix override. Sets " +
        "bracket_mix_override_run_id to NULL and re-mirrors the latest global " +
        "default mix (target_kind='global_default') back onto " +
        "globalAssumptions.bracket_mix so the engine read stays consistent (R8). " +
        "Idempotent — calling on a row without an active override returns " +
        "cleared=false rather than erroring.",
      parameters: {
        type: "object",
        properties: {
          companyId: {
            type: "integer",
            minimum: 1,
            description: "The global_assumptions.id of the Mgmt-Co row to clear.",
          },
        },
        required: ["companyId"],
      },
    },
  ];
}
