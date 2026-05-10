/**
 * rebecca-tools.ts — thin re-export barrel.
 *
 * All implementation has been split across domain modules:
 *   rebecca-tool-types.ts          — shared types + arg validators
 *   rebecca-tool-definitions.ts    — getRebeccaTools() JSON-schema array
 *   rebecca-tool-dispatch.ts       — dispatchRebeccaTool() switch
 *   rebecca-tool-impls-property.ts — property + photo tools
 *   rebecca-tool-impls-scenario.ts — scenario tools
 *   rebecca-tool-impls-deck.ts     — LB deck + analyst table tools
 *   rebecca-tool-impls-slide-factory.ts — slide factory pipeline tools
 *   rebecca-tool-impls-iris.ts     — Iris + compliance tools
 *   rebecca-tool-impls-kb.ts       — KB + company tools
 *   rebecca-tool-impls-admin.ts    — data sources, market rates, global assumptions,
 *                                     tripadvisor, prospective properties, price events,
 *                                     service templates, research
 *
 * Import sites (chat.ts, rebecca.ts, test fixtures) continue to resolve
 * identically — only the names they already used are re-exported here.
 */

export type { ToolContext, DataChangedEntry } from "./rebecca-tool-types";
export { KB_CONTENT_VECTOR_PREVIEW_CHARS } from "./rebecca-tool-types";
export { getRebeccaTools } from "./rebecca-tool-definitions";
export { dispatchRebeccaTool } from "./rebecca-tool-dispatch";
