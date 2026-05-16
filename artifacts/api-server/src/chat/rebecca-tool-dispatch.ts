import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { toolGenerateFinancialReportExportLink } from "./rebecca-tool-impls-report";
import {
  toolGenerateExecutiveSummary,
  toolRewritePropertyDescription,
} from "./rebecca-tool-impls-content";
import {
  toolListProperties,
  toolGetProperty,
  toolUpdateProperty,
  toolPatchProperty,
  toolCreateProperty,
  toolCreatePropertyRecord,
  toolSeedPropertyFees,
  toolDeleteProperty,
  toolDeletePropertyPhoto,
  toolSetHeroPhoto,
  toolUpdatePhoto,
  toolListPropertyPhotos,
  toolCreatePhoto,
  toolReorderPhotos,
  toolUpdatePropertyCoordinates,
} from "./rebecca-tool-impls-property";
import {
  toolListScenarios,
  toolGetScenario,
  toolCreateScenario,
  toolUpdateScenario,
  toolUpdateScenarioAssumptions,
  toolLockScenario,
  toolDeleteScenario,
  toolShareScenario,
  toolCompareScenarios,
  toolListScenarioShares,
  toolRevokeShare,
} from "./rebecca-tool-impls-scenario";
import {
  toolGetLbDeckConfig,
  toolConfigureLbDeck,
  toolResetLbDeckConfig,
  toolTriggerLbDeckRender,
  toolGetLbDeckRenderStatus,
  toolRefreshAnalystTable,
  toolResearchAnalystTable,
  toolCommitAnalystTableResearch,
  toolGetAnalystTable,
} from "./rebecca-tool-impls-deck";
import {
  toolCreateSlideFactoryRun,
  toolListSlideFactoryRuns,
  toolGetSlideFactoryRun,
  toolRecordSlideFactoryBrief,
  toolAcceptSlideFactoryBrief,
  toolAssignSlideFactoryProperties,
  toolUpdateSlideFactorySlot,
  toolApproveAllSlideFactorySlots,
  toolTriggerSlideFactoryBuild,
  toolCancelSlideFactoryBuild,
  toolProduceSlideFactoryDeck,
  toolRebuildSlideFactoryDeck,
  toolDownloadFactoryV2Deck,
  toolDeleteSlideFactoryRun,
  toolTriggerLorenzoIngestion,
  toolTriggerLuccaDraft,
  toolVerifyFactoryDeck,
} from "./rebecca-tool-impls-slide-factory";
import {
  toolTriggerIrisHealthCheck,
  toolTriggerIrisReindex,
  toolRunComplianceAudit,
  toolClearIrisGaps,
  toolGetIrisStatus,
  toolWriteRetrievalGap,
} from "./rebecca-tool-impls-iris";
import {
  toolCreateKbEntry,
  toolUpdateKbEntry,
  toolDeleteKbEntry,
  toolListKbEntries,
  toolGetKbEntry,
  toolListCompanies,
  toolGetCompany,
  toolCreateCompany,
  toolDeleteCompany,
  toolUpdateCompany,
} from "./rebecca-tool-impls-kb";
import {
  toolGetDataSourceStatus,
  toolProbeDataSource,
  toolRegenerateDataSource,
  toolGetTripadvisorHotels,
  toolGetMarketRates,
  toolTriggerResearch,
  toolGetPropertyResearchSeeds,
  toolApplyPropertyResearchValues,
  toolGetGlobalAssumptions,
  toolUpdateGlobalAssumptions,
  toolSaveCompanyAssumptionTab,
  toolListProspectiveProperties,
  toolSaveProspectiveProperty,
  toolDeleteProspectiveProperty,
  toolUpdateProspectivePropertyNotes,
  toolListPriceEvents,
  toolCreatePriceEvent,
  toolUpdatePriceEvent,
  toolDeletePriceEvent,
  toolListServiceTemplates,
  toolUpdateServiceTemplate,
  toolListSpecialists,
  toolGetSpecialistConfig,
  toolRecordSpecialistRecommendationEvent,
  toolUpdateAdminResource,
  toolGetVendorPassthroughCosts,
  toolGetMgmtCoMarkupFactors,
  toolGetBracketMix,
  toolUpdateBracketMix,
} from "./rebecca-tool-impls-admin";
import {
  toolListPortfolios,
  toolCreatePortfolio,
  toolUpdatePortfolio,
  toolDeletePortfolio,
  toolListPortfolioProperties,
  toolAssignPropertyPortfolio,
} from "./rebecca-tool-impls-portfolio";

export async function dispatchRebeccaTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  try {
    switch (name) {
      case "list_properties":
        return await toolListProperties(ctx);
      case "get_property":
        return await toolGetProperty(args, ctx);
      case "list_scenarios":
        return await toolListScenarios(args, ctx);
      case "get_scenario":
        return await toolGetScenario(args, ctx);
      case "update_property":
        return await toolUpdateProperty(args, ctx);
      case "patch_property":
        return await toolPatchProperty(args, ctx);
      case "create_scenario":
        return await toolCreateScenario(args, ctx);
      case "update_scenario":
        return await toolUpdateScenario(args, ctx);
      case "update_scenario_assumptions":
        return await toolUpdateScenarioAssumptions(args, ctx);
      case "configure_lb_deck":
        return await toolConfigureLbDeck(args, ctx);
      case "reset_lb_deck_config":
        return await toolResetLbDeckConfig(ctx);
      case "get_lb_deck_config":
        return await toolGetLbDeckConfig(ctx);
      case "trigger_lb_deck_render":
        return await toolTriggerLbDeckRender(ctx);
      case "get_lb_deck_render_status":
        return await toolGetLbDeckRenderStatus(ctx);
      case "refresh_analyst_table":
        return await toolRefreshAnalystTable(args, ctx);
      case "research_analyst_table":
        return await toolResearchAnalystTable(args, ctx);
      case "commit_analyst_table_research":
        return await toolCommitAnalystTableResearch(args, ctx);
      case "lock_scenario":
        return await toolLockScenario(args, ctx);
      case "delete_scenario":
        return await toolDeleteScenario(args, ctx);
      case "share_scenario":
        return await toolShareScenario(args, ctx);
      case "trigger_research":
        return await toolTriggerResearch(args, ctx);
      case "get_property_research_seeds":
        return await toolGetPropertyResearchSeeds(args, ctx);
      case "apply_property_research_values":
        return await toolApplyPropertyResearchValues(args, ctx);
      case "write_retrieval_gap":
        return await toolWriteRetrievalGap(args, ctx);
      case "trigger_iris_health_check":
        return await toolTriggerIrisHealthCheck(ctx);
      case "trigger_iris_reindex":
        return await toolTriggerIrisReindex(ctx);
      case "run_compliance_audit":
        return await toolRunComplianceAudit(ctx);
      case "clear_iris_gaps":
        return await toolClearIrisGaps(ctx);
      case "get_iris_status":
        return await toolGetIrisStatus(ctx);
      case "create_slide_factory_run":
        return await toolCreateSlideFactoryRun(ctx);
      case "list_slide_factory_runs":
        return await toolListSlideFactoryRuns(ctx);
      case "get_slide_factory_run":
        return await toolGetSlideFactoryRun(args, ctx);
      case "record_slide_factory_brief":
        return await toolRecordSlideFactoryBrief(args, ctx);
      case "accept_slide_factory_brief":
        return await toolAcceptSlideFactoryBrief(args, ctx);
      case "trigger_lorenzo_ingestion":
        return await toolTriggerLorenzoIngestion(args, ctx);
      case "assign_slide_factory_properties":
        return await toolAssignSlideFactoryProperties(args, ctx);
      case "trigger_lucca_draft":
        return await toolTriggerLuccaDraft(args, ctx);
      case "update_slide_factory_slot":
        return await toolUpdateSlideFactorySlot(args, ctx);
      case "approve_all_slide_factory_slots":
        return await toolApproveAllSlideFactorySlots(args, ctx);
      case "trigger_slide_factory_build":
        return await toolTriggerSlideFactoryBuild(args, ctx);
      case "cancel_slide_factory_build":
        return await toolCancelSlideFactoryBuild(args, ctx);
      case "produce_slide_factory_deck":
        return await toolProduceSlideFactoryDeck(args, ctx);
      case "rebuild_slide_factory_deck":
        return await toolRebuildSlideFactoryDeck(args, ctx);
      case "download_factory_v2_deck":
        return await toolDownloadFactoryV2Deck(args, ctx);
      case "get_data_source_status":
        return await toolGetDataSourceStatus(ctx);
      case "probe_data_source":
        return await toolProbeDataSource(args, ctx);
      case "regenerate_data_source":
        return await toolRegenerateDataSource(args, ctx);
      case "get_market_rates":
        return await toolGetMarketRates(args, ctx);
      case "get_analyst_table":
        return await toolGetAnalystTable(args, ctx);
      case "create_property":
        return await toolCreateProperty(args, ctx);
      case "create_property_record":
        return await toolCreatePropertyRecord(args, ctx);
      case "seed_property_fees":
        return await toolSeedPropertyFees(args, ctx);
      case "delete_property":
        return await toolDeleteProperty(args, ctx);
      case "delete_property_photo":
        return await toolDeletePropertyPhoto(args, ctx);
      case "set_hero_photo":
        return await toolSetHeroPhoto(args, ctx);
      case "list_companies":
        return await toolListCompanies(ctx);
      case "get_company":
        return await toolGetCompany(args, ctx);
      case "update_company":
        return await toolUpdateCompany(args, ctx);
      case "create_company":
        return await toolCreateCompany(args, ctx);
      case "delete_company":
        return await toolDeleteCompany(args, ctx);
      case "get_tripadvisor_hotels":
        return await toolGetTripadvisorHotels(args);
      case "get_vendor_passthrough_costs":
        return await toolGetVendorPassthroughCosts(args);
      case "get_mgmt_co_markup_factors":
        return await toolGetMgmtCoMarkupFactors(args);
      case "create_kb_entry":
        return await toolCreateKbEntry(args, ctx);
      case "update_kb_entry":
        return await toolUpdateKbEntry(args, ctx);
      case "delete_kb_entry":
        return await toolDeleteKbEntry(args, ctx);
      case "list_kb_entries":
        return await toolListKbEntries(args, ctx);
      case "get_kb_entry":
        return await toolGetKbEntry(args, ctx);
      case "compare_scenarios":
        return await toolCompareScenarios(args, ctx);
      case "get_global_assumptions":
        return await toolGetGlobalAssumptions(ctx);
      case "update_global_assumptions":
        return await toolUpdateGlobalAssumptions(args, ctx);
      case "save_company_assumption_tab":
        return await toolSaveCompanyAssumptionTab(args, ctx);
      case "update_property_coordinates":
        return await toolUpdatePropertyCoordinates(args, ctx);
      case "update_photo":
        return await toolUpdatePhoto(args, ctx);
      case "list_property_photos":
        return await toolListPropertyPhotos(args, ctx);
      case "create_photo":
        return await toolCreatePhoto(args, ctx);
      case "list_scenario_shares":
        return await toolListScenarioShares(args, ctx);
      case "revoke_share":
        return await toolRevokeShare(args, ctx);
      case "delete_slide_factory_run":
        return await toolDeleteSlideFactoryRun(args, ctx);
      case "verify_factory_deck":
        return await toolVerifyFactoryDeck(args, ctx);
      case "list_prospective_properties":
        return await toolListProspectiveProperties(ctx);
      case "save_prospective_property":
        return await toolSaveProspectiveProperty(args, ctx);
      case "delete_prospective_property":
        return await toolDeleteProspectiveProperty(args, ctx);
      case "update_prospective_property_notes":
        return await toolUpdateProspectivePropertyNotes(args, ctx);
      case "list_price_events":
        return await toolListPriceEvents(args, ctx);
      case "create_price_event":
        return await toolCreatePriceEvent(args, ctx);
      case "update_price_event":
        return await toolUpdatePriceEvent(args, ctx);
      case "delete_price_event":
        return await toolDeletePriceEvent(args, ctx);
      case "reorder_photos":
        return await toolReorderPhotos(args, ctx);
      case "list_service_templates":
        return await toolListServiceTemplates(ctx);
      case "update_service_template":
        return await toolUpdateServiceTemplate(args, ctx);
      case "list_specialists":
        return await toolListSpecialists(ctx);
      case "get_specialist_config":
        return await toolGetSpecialistConfig(args, ctx);
      case "record_specialist_recommendation_event":
        return await toolRecordSpecialistRecommendationEvent(args, ctx);
      case "update_admin_resource":
        return await toolUpdateAdminResource(args, ctx);
      case "get_bracket_mix":
        return await toolGetBracketMix(ctx);
      case "update_bracket_mix":
        return await toolUpdateBracketMix(args, ctx);
      case "generate_financial_report_export_link":
        return toolGenerateFinancialReportExportLink(args);
      case "generate_executive_summary":
        return await toolGenerateExecutiveSummary(args, ctx);
      case "rewrite_property_description":
        return await toolRewritePropertyDescription(args, ctx);
      case "list_portfolios":
        return await toolListPortfolios(ctx);
      case "create_portfolio":
        return await toolCreatePortfolio(args, ctx);
      case "update_portfolio":
        return await toolUpdatePortfolio(args, ctx);
      case "delete_portfolio":
        return await toolDeletePortfolio(args, ctx);
      case "list_portfolio_properties":
        return await toolListPortfolioProperties(args, ctx);
      case "assign_property_portfolio":
        return await toolAssignPropertyPortfolio(args, ctx);
      default:
        return { result: { error: "Unknown tool" } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as Record<string, unknown>)?.code;
    return { result: { error: message, ...(code !== undefined ? { code } : {}) } };
  }
}
