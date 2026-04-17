/**
 * storage/index — IStorage interface + DatabaseStorage implementation
 *
 * IStorage is the single abstraction boundary between route handlers and the
 * database. All routes import `storage` (a DatabaseStorage instance) and call
 * methods on IStorage — they never import Drizzle ORM directly.
 *
 * Domain split: DatabaseStorage delegates to 12 focused sub-storage classes:
 *   UserStorage         — users, sessions, login logs
 *   PropertyStorage     — property CRUD, group property IDs
 *   FinancialStorage    — global assumptions, scenarios, fee categories
 *   AdminStorage        — design themes, logos, asset descriptions, user groups, companies
 *   ActivityStorage     — activity logs, verification runs
 *   ResearchStorage     — market research, research questions
 *   PhotoStorage        — property photos, hero sync
 *   DocumentStorage     — document extractions
 *   ServiceStorage      — company service templates, template-to-property sync
 *   NotificationStorage — alert rules, notification logs, preferences, settings
 *   IntelligenceV2Storage — assumption guidance, research runs, benchmarks, Rebecca
 *
 * Each sub-class lives in its own file (./users, ./properties, etc.) and is
 * composed here via method binding. The binding pattern keeps every public
 * method on `storage` at the top level so callers need only one import.
 *
 * The singleton `storage` instance is exported from this file and imported
 * by every route file in server/routes/.
 */
import { db, pool } from "../db";
import { users, sessions, marketResearch, prospectiveProperties, savedSearches, properties, globalAssumptions, loginLogs, activityLogs, verificationRuns, scenarios, scenarioShares, scenarioAccess, notificationPreferences, documentExtractions, conversations, calculationAuditLogs, userPageVisits } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { UserStorage } from "./users";
import { PropertyStorage } from "./properties";
import { FinancialStorage } from "./financial";
import { AdminStorage } from "./admin";
import { ActivityStorage } from "./activity";
import { ResearchStorage } from "./research";
import { PhotoStorage } from "./photos";
import { DocumentStorage } from "./documents";
import { ServiceStorage } from "./services";
import { NotificationStorage } from "./notifications";
import { IntegrationStorage } from "./integrations";
import { IntelligenceV2Storage, IntelligenceRebeccaStorage } from "./intelligence-v2";
import { PropertyUrlStorage } from "./property-urls";
import { CalcAuditStorage, type ICalcAuditStorage } from "./calc-audit";
import { RenderSettingsStorage } from "./render-settings";
import { PageVisitStorage } from "./page-visits";
import { ModelConstantsStorage } from "./model-constants";

export interface IStorage extends
  UserStorage,
  PropertyStorage,
  FinancialStorage,
  AdminStorage,
  ActivityStorage,
  ResearchStorage,
  PhotoStorage,
  DocumentStorage,
  ServiceStorage,
  NotificationStorage,
  IntegrationStorage,
  IntelligenceV2Storage,
  PropertyUrlStorage,
  ICalcAuditStorage,
  RenderSettingsStorage,
  PageVisitStorage,
  ModelConstantsStorage {
  deleteUser(id: number): Promise<void>;
  getDbHealth(): Promise<{ serverTime: string; pool: { total: number; idle: number; waiting: number }; migrationsReady: boolean }>;
}

export class DatabaseStorage implements IStorage {
  private users = new UserStorage();
  private properties = new PropertyStorage();
  private financial = new FinancialStorage();
  private admin = new AdminStorage();
  private activity = new ActivityStorage();
  private research = new ResearchStorage();
  private photos = new PhotoStorage();
  private documents = new DocumentStorage();
  private services = new ServiceStorage();
  private notifications = new NotificationStorage();
  private integrationStore = new IntegrationStorage();
  private intelligenceV2 = new IntelligenceV2Storage();
  private rebecca = new IntelligenceRebeccaStorage();
  private propertyUrlStore = new PropertyUrlStorage();
  private calcAudit = new CalcAuditStorage();
  private renderSettingsStore = new RenderSettingsStorage();
  private pageVisitStore = new PageVisitStorage();
  private modelConstantsStore = new ModelConstantsStorage();

  // Model Constants (governed values — TS factory + DB override layer)
  listModelConstantOverrides = this.modelConstantsStore.listModelConstantOverrides.bind(this.modelConstantsStore);
  findModelConstantOverride = this.modelConstantsStore.findModelConstantOverride.bind(this.modelConstantsStore);
  upsertModelConstantOverride = this.modelConstantsStore.upsertModelConstantOverride.bind(this.modelConstantsStore);
  deleteModelConstantOverride = this.modelConstantsStore.deleteModelConstantOverride.bind(this.modelConstantsStore);

  // Users
  getUserById = this.users.getUserById.bind(this.users);
  getUserByEmail = this.users.getUserByEmail.bind(this.users);
  getUserByPhoneNumber = this.users.getUserByPhoneNumber.bind(this.users);
  createUser = this.users.createUser.bind(this.users);
  getAllUsers = this.users.getAllUsers.bind(this.users);
  updateUserPassword = this.users.updateUserPassword.bind(this.users);
  updateUserProfile = this.users.updateUserProfile.bind(this.users);
  updateUserSelectedTheme = this.users.updateUserSelectedTheme.bind(this.users);
  updateUserAppearance = this.users.updateUserAppearance.bind(this.users);
  updateUserHideTourPrompt = this.users.updateUserHideTourPrompt.bind(this.users);
  updateUserRole = this.users.updateUserRole.bind(this.users);
  updateUserGoogleId = this.users.updateUserGoogleId.bind(this.users);
  updateUserGoogleTokens = this.users.updateUserGoogleTokens.bind(this.users);
  getDecryptedGoogleTokens = this.users.getDecryptedGoogleTokens.bind(this.users);
  getUserDefaultPropertyIds = this.users.getUserDefaultPropertyIds.bind(this.users);
  setUserDefaultPropertyIds = this.users.setUserDefaultPropertyIds.bind(this.users);

  // Sessions
  createSession = this.users.createSession.bind(this.users);
  getSession = this.users.getSession.bind(this.users);
  deleteSession = this.users.deleteSession.bind(this.users);
  deleteExpiredSessions = this.users.deleteExpiredSessions.bind(this.users);

  // Global Assumptions
  getGlobalAssumptions = this.financial.getGlobalAssumptions.bind(this.financial);
  upsertGlobalAssumptions = this.financial.upsertGlobalAssumptions.bind(this.financial);
  patchGlobalAssumptions = this.financial.patchGlobalAssumptions.bind(this.financial);

  // Properties
  getAllProperties = this.properties.getAllProperties.bind(this.properties);
  getAllPropertiesAdmin = this.properties.getAllPropertiesAdmin.bind(this.properties);
  getProperty = this.properties.getProperty.bind(this.properties);
  createProperty = this.properties.createProperty.bind(this.properties);
  updateProperty = this.properties.updateProperty.bind(this.properties);
  deleteProperty = this.properties.deleteProperty.bind(this.properties);
  restoreProperty = this.properties.restoreProperty.bind(this.properties);
  getDistinctPropertyLocations = this.properties.getDistinctPropertyLocations.bind(this.properties);

  // Scenarios
  getScenariosByUser = this.financial.getScenariosByUser.bind(this.financial);
  getScenario = this.financial.getScenario.bind(this.financial);
  createScenario = this.financial.createScenario.bind(this.financial);
  updateScenario = this.financial.updateScenario.bind(this.financial);
  updateScenarioComputedResults = this.financial.updateScenarioComputedResults.bind(this.financial);
  softDeleteScenario = this.financial.softDeleteScenario.bind(this.financial);
  hardDeleteScenario = this.financial.hardDeleteScenario.bind(this.financial);
  getScenarioIncludingDeleted = this.financial.getScenarioIncludingDeleted.bind(this.financial);
  getDeletedScenarios = this.financial.getDeletedScenarios.bind(this.financial);
  restoreScenario = this.financial.restoreScenario.bind(this.financial);
  purgeExpiredScenarios = this.financial.purgeExpiredScenarios.bind(this.financial);
  getDefaultScenario = this.financial.getDefaultScenario.bind(this.financial);
  getAutoSaveScenario = this.financial.getAutoSaveScenario.bind(this.financial);
  countManualScenarios = this.financial.countManualScenarios.bind(this.financial);
  updateScenarioSnapshot = this.financial.updateScenarioSnapshot.bind(this.financial);
  loadScenario = this.financial.loadScenario.bind(this.financial);
  cloneScenario = this.financial.cloneScenario.bind(this.financial);
  compareScenarios = this.financial.compareScenarios.bind(this.financial);
  getAllScenarios = this.financial.getAllScenarios.bind(this.financial);
  createScenarioForUser = this.financial.createScenarioForUser.bind(this.financial);
  getScenarioSharesForScenario = this.financial.getScenarioSharesForScenario.bind(this.financial);
  getAllScenarioShares = this.financial.getAllScenarioShares.bind(this.financial);
  addScenarioAccess = this.financial.addScenarioAccess.bind(this.financial);
  removeScenarioAccess = this.financial.removeScenarioAccess.bind(this.financial);
  getScenarioCountByUser = this.financial.getScenarioCountByUser.bind(this.financial);
  removeAllSharesForScenario = this.financial.removeAllSharesForScenario.bind(this.financial);
  removeScenarioSharesByTarget = this.financial.removeScenarioSharesByTarget.bind(this.financial);
  writePropertyOverrides = this.financial.writePropertyOverrides.bind(this.financial);
  getPropertyOverrides = this.financial.getPropertyOverrides.bind(this.financial);
  getPropertyOverridesForField = this.financial.getPropertyOverridesForField.bind(this.financial);
  getScenariosSharedWithUser = this.financial.getScenariosSharedWithUser.bind(this.financial);
  shareScenarioWithUser = this.financial.shareScenarioWithUser.bind(this.financial);
  shareAllScenariosWithUser = this.financial.shareAllScenariosWithUser.bind(this.financial);
  getSharesForScenario = this.financial.getSharesForScenario.bind(this.financial);

  // Scenario Access (fine-grained grants)
  grantScenarioAccess = this.financial.grantScenarioAccess.bind(this.financial);
  revokeScenarioAccess = this.financial.revokeScenarioAccess.bind(this.financial);
  getScenarioAccessByOwner = this.financial.getScenarioAccessByOwner.bind(this.financial);
  getScenariosSharedViaAccess = this.financial.getScenariosSharedViaAccess.bind(this.financial);

  // Scenario Results
  saveScenarioResult = this.financial.saveScenarioResult.bind(this.financial);
  getLatestScenarioResult = this.financial.getLatestScenarioResult.bind(this.financial);

  // Fee Categories
  getFeeCategoriesByProperty = this.financial.getFeeCategoriesByProperty.bind(this.financial);
  getFeeCategoriesByProperties = this.financial.getFeeCategoriesByProperties.bind(this.financial);
  getAllFeeCategories = this.financial.getAllFeeCategories.bind(this.financial);
  createFeeCategory = this.financial.createFeeCategory.bind(this.financial);
  updateFeeCategory = this.financial.updateFeeCategory.bind(this.financial);
  deleteFeeCategory = this.financial.deleteFeeCategory.bind(this.financial);
  seedDefaultFeeCategories = this.financial.seedDefaultFeeCategories.bind(this.financial);

  // Admin / Branding
  getAllDesignThemes = this.admin.getAllDesignThemes.bind(this.admin);
  getDesignTheme = this.admin.getDesignTheme.bind(this.admin);
  getDefaultDesignTheme = this.admin.getDefaultDesignTheme.bind(this.admin);
  createDesignTheme = this.admin.createDesignTheme.bind(this.admin);
  updateDesignTheme = this.admin.updateDesignTheme.bind(this.admin);
  deleteDesignTheme = this.admin.deleteDesignTheme.bind(this.admin);
  
  getAllLogos = this.admin.getAllLogos.bind(this.admin);
  getLogo = this.admin.getLogo.bind(this.admin);
  getDefaultLogo = this.admin.getDefaultLogo.bind(this.admin);
  createLogo = this.admin.createLogo.bind(this.admin);
  deleteLogo = this.admin.deleteLogo.bind(this.admin);
  setDefaultLogo = this.admin.setDefaultLogo.bind(this.admin);
  getAppLogo = this.admin.getAppLogo.bind(this.admin);
  setAppLogo = this.admin.setAppLogo.bind(this.admin);

  getAllAssetDescriptions = this.admin.getAllAssetDescriptions.bind(this.admin);

  getAllResearchQuestions = this.admin.getAllResearchQuestions.bind(this.admin);
  createResearchQuestion = this.admin.createResearchQuestion.bind(this.admin);
  updateResearchQuestion = this.admin.updateResearchQuestion.bind(this.admin);
  deleteResearchQuestion = this.admin.deleteResearchQuestion.bind(this.admin);

  // Activity / Logs
  createActivityLog = this.activity.createActivityLog.bind(this.activity);
  getActivityLogs = this.activity.getActivityLogs.bind(this.activity);
  createVerificationRun = this.activity.createVerificationRun.bind(this.activity);
  getVerificationRuns = this.activity.getVerificationRuns.bind(this.activity);
  getVerificationRun = this.activity.getVerificationRun.bind(this.activity);
  createLoginLog = this.activity.createLoginLog.bind(this.activity);
  updateLogoutTime = this.activity.updateLogoutTime.bind(this.activity);
  getLoginLogs = this.activity.getLoginLogs.bind(this.activity);
  deleteOldLoginLogs = this.activity.deleteOldLoginLogs.bind(this.activity);
  getActiveSessions = this.activity.getActiveSessions.bind(this.activity);
  forceDeleteSession = this.activity.forceDeleteSession.bind(this.activity);

  // Research
  getMarketResearch = this.research.getMarketResearch.bind(this.research);
  getAllMarketResearch = this.research.getAllMarketResearch.bind(this.research);
  upsertMarketResearch = this.research.upsertMarketResearch.bind(this.research);
  getLastFullResearchRefresh = this.research.getLastFullResearchRefresh.bind(this.research);
  markFullResearchRefresh = this.research.markFullResearchRefresh.bind(this.research);
  getProspectiveProperties = this.research.getProspectiveProperties.bind(this.research);
  addProspectiveProperty = this.research.addProspectiveProperty.bind(this.research);
  deleteProspectiveProperty = this.research.deleteProspectiveProperty.bind(this.research);
  updateProspectivePropertyNotes = this.research.updateProspectivePropertyNotes.bind(this.research);
  getSavedSearches = this.research.getSavedSearches.bind(this.research);
  addSavedSearch = this.research.addSavedSearch.bind(this.research);
  deleteSavedSearch = this.research.deleteSavedSearch.bind(this.research);

  // Property Photos
  getPropertyPhotos = this.photos.getPropertyPhotos.bind(this.photos);
  getPhotosByProperties = this.photos.getPhotosByProperties.bind(this.photos);
  getPhotoById = this.photos.getPhotoById.bind(this.photos);
  getHeroPhoto = this.photos.getHeroPhoto.bind(this.photos);
  addPropertyPhoto = this.photos.addPropertyPhoto.bind(this.photos);
  updatePropertyPhoto = this.photos.updatePropertyPhoto.bind(this.photos);
  deletePropertyPhoto = this.photos.deletePropertyPhoto.bind(this.photos);
  setHeroPhoto = this.photos.setHeroPhoto.bind(this.photos);
  reorderPhotos = this.photos.reorderPhotos.bind(this.photos);

  // Document Intelligence
  createDocumentExtraction = this.documents.createDocumentExtraction.bind(this.documents);
  getDocumentExtraction = this.documents.getDocumentExtraction.bind(this.documents);
  getPropertyExtractions = this.documents.getPropertyExtractions.bind(this.documents);
  updateDocumentExtraction = this.documents.updateDocumentExtraction.bind(this.documents);
  createExtractionField = this.documents.createExtractionField.bind(this.documents);
  createExtractionFields = this.documents.createExtractionFields.bind(this.documents);
  getExtractionField = this.documents.getExtractionField.bind(this.documents);
  getExtractionFields = this.documents.getExtractionFields.bind(this.documents);
  updateExtractionFieldStatus = this.documents.updateExtractionFieldStatus.bind(this.documents);
  bulkUpdateExtractionFieldStatus = this.documents.bulkUpdateExtractionFieldStatus.bind(this.documents);
  // Service Templates
  getAllServiceTemplates = this.services.getAllServiceTemplates.bind(this.services);
  getServiceTemplate = this.services.getServiceTemplate.bind(this.services);
  createServiceTemplate = this.services.createServiceTemplate.bind(this.services);
  updateServiceTemplate = this.services.updateServiceTemplate.bind(this.services);
  deleteServiceTemplate = this.services.deleteServiceTemplate.bind(this.services);
  syncTemplatesToProperties = this.services.syncTemplatesToProperties.bind(this.services);

  // Render Settings
  getAllRenderSettings = this.renderSettingsStore.getAllRenderSettings.bind(this.renderSettingsStore);
  getRenderSetting = this.renderSettingsStore.getRenderSetting.bind(this.renderSettingsStore);
  upsertRenderSetting = this.renderSettingsStore.upsertRenderSetting.bind(this.renderSettingsStore);
  updateRenderSetting = this.renderSettingsStore.updateRenderSetting.bind(this.renderSettingsStore);
  seedFromJson = this.renderSettingsStore.seedFromJson.bind(this.renderSettingsStore);

  // Notifications
  getAllAlertRules = this.notifications.getAllAlertRules.bind(this.notifications);
  createAlertRule = this.notifications.createAlertRule.bind(this.notifications);
  updateAlertRule = this.notifications.updateAlertRule.bind(this.notifications);
  deleteAlertRule = this.notifications.deleteAlertRule.bind(this.notifications);
  getNotificationLogs = this.notifications.getNotificationLogs.bind(this.notifications);
  createNotificationLog = this.notifications.createNotificationLog.bind(this.notifications);
  getNotificationPreferences = this.notifications.getNotificationPreferences.bind(this.notifications);
  upsertNotificationPreference = this.notifications.upsertNotificationPreference.bind(this.notifications);
  getNotificationSetting = this.notifications.getNotificationSetting.bind(this.notifications);
  setNotificationSetting = this.notifications.setNotificationSetting.bind(this.notifications);
  getAllNotificationSettings = this.notifications.getAllNotificationSettings.bind(this.notifications);
  getActiveAlertRulesForProperty = this.notifications.getActiveAlertRulesForProperty.bind(this.notifications);

  // External Integrations
  getExternalIntegrations = this.integrationStore.getExternalIntegrations.bind(this.integrationStore);
  getExternalIntegration = this.integrationStore.getExternalIntegration.bind(this.integrationStore);
  createExternalIntegration = this.integrationStore.createExternalIntegration.bind(this.integrationStore);
  updateExternalIntegration = this.integrationStore.updateExternalIntegration.bind(this.integrationStore);
  deleteExternalIntegration = this.integrationStore.deleteExternalIntegration.bind(this.integrationStore);
  toggleExternalIntegration = this.integrationStore.toggleExternalIntegration.bind(this.integrationStore);
  getIntegrationEnabledMap = this.integrationStore.getIntegrationEnabledMap.bind(this.integrationStore);

  // Intelligence V2
  getAssumptionGuidance = this.intelligenceV2.getAssumptionGuidance.bind(this.intelligenceV2);
  getAllAssumptionGuidanceForScenario = this.intelligenceV2.getAllAssumptionGuidanceForScenario.bind(this.intelligenceV2);
  getAllAssumptionGuidance = this.intelligenceV2.getAllAssumptionGuidance.bind(this.intelligenceV2);
  getAssumptionGuidanceById = this.intelligenceV2.getAssumptionGuidanceById.bind(this.intelligenceV2);
  upsertAssumptionGuidance = this.intelligenceV2.upsertAssumptionGuidance.bind(this.intelligenceV2);
  createResearchRun = this.intelligenceV2.createResearchRun.bind(this.intelligenceV2);
  updateResearchRun = this.intelligenceV2.updateResearchRun.bind(this.intelligenceV2);
  getResearchRuns = this.intelligenceV2.getResearchRuns.bind(this.intelligenceV2);
  getRunningResearchEntityIds = this.intelligenceV2.getRunningResearchEntityIds.bind(this.intelligenceV2);
  getLatestCompletedRunsPerEntity = this.intelligenceV2.getLatestCompletedRunsPerEntity.bind(this.intelligenceV2);
  getBenchmarkSnapshots = this.intelligenceV2.getBenchmarkSnapshots.bind(this.intelligenceV2);
  upsertBenchmarkSnapshot = this.intelligenceV2.upsertBenchmarkSnapshot.bind(this.intelligenceV2);
  createRelaxationTrace = this.intelligenceV2.createRelaxationTrace.bind(this.intelligenceV2);
  getRelaxationTraces = this.intelligenceV2.getRelaxationTraces.bind(this.intelligenceV2);
  createGuidanceDecision = this.intelligenceV2.createGuidanceDecision.bind(this.intelligenceV2);
  getGuidanceDecisions = this.intelligenceV2.getGuidanceDecisions.bind(this.intelligenceV2);
  createRebeccaConversation = this.rebecca.createRebeccaConversation.bind(this.rebecca);
  getRebeccaConversation = this.rebecca.getRebeccaConversation.bind(this.rebecca);
  getOrCreateConversation = this.rebecca.getOrCreateConversation.bind(this.rebecca);
  getRebeccaConversations = this.rebecca.getRebeccaConversations.bind(this.rebecca);
  updateRebeccaConversationModel = this.rebecca.updateRebeccaConversationModel.bind(this.rebecca);
  updateRebeccaConversationLanguage = this.rebecca.updateRebeccaConversationLanguage.bind(this.rebecca);
  addRebeccaMessage = this.rebecca.addRebeccaMessage.bind(this.rebecca);
  getRebeccaMessages = this.rebecca.getRebeccaMessages.bind(this.rebecca);
  getAllRebeccaMessageStats = this.rebecca.getAllRebeccaMessageStats.bind(this.rebecca);
  createRebeccaEmail = this.rebecca.createRebeccaEmail.bind(this.rebecca);
  createRebeccaFeedback = this.rebecca.createRebeccaFeedback.bind(this.rebecca);
  getRebeccaFeedback = this.rebecca.getRebeccaFeedback.bind(this.rebecca);
  updateRebeccaFeedbackStatus = this.rebecca.updateRebeccaFeedbackStatus.bind(this.rebecca);
  createCoverageSnapshot = this.intelligenceV2.createCoverageSnapshot.bind(this.intelligenceV2);
  getCoverageSnapshots = this.intelligenceV2.getCoverageSnapshots.bind(this.intelligenceV2);
  getSourceRegistry = this.intelligenceV2.getSourceRegistry.bind(this.intelligenceV2);
  getSourceRegistryEntry = this.intelligenceV2.getSourceRegistryEntry.bind(this.intelligenceV2);
  upsertSourceRegistry = this.intelligenceV2.upsertSourceRegistry.bind(this.intelligenceV2);
  createSourceRegistryEntry = this.intelligenceV2.createSourceRegistryEntry.bind(this.intelligenceV2);
  updateSourceRegistryEntry = this.intelligenceV2.updateSourceRegistryEntry.bind(this.intelligenceV2);
  deleteSourceRegistryEntry = this.intelligenceV2.deleteSourceRegistryEntry.bind(this.intelligenceV2);
  updateSourceHealthCheck = this.intelligenceV2.updateSourceHealthCheck.bind(this.intelligenceV2);
  getHealthySourceKeys = this.intelligenceV2.getHealthySourceKeys.bind(this.intelligenceV2);
  logAssumptionChange = this.intelligenceV2.logAssumptionChange.bind(this.intelligenceV2);
  logAssumptionChanges = this.intelligenceV2.logAssumptionChanges.bind(this.intelligenceV2);
  getAssumptionHistory = this.intelligenceV2.getAssumptionHistory.bind(this.intelligenceV2);
  getUnvalidatedAssumptions = this.intelligenceV2.getUnvalidatedAssumptions.bind(this.intelligenceV2);
  getAcknowledgment = this.intelligenceV2.getAcknowledgment.bind(this.intelligenceV2);
  listAcknowledgments = this.intelligenceV2.listAcknowledgments.bind(this.intelligenceV2);
  upsertAcknowledgment = this.intelligenceV2.upsertAcknowledgment.bind(this.intelligenceV2);
  deleteAcknowledgment = this.intelligenceV2.deleteAcknowledgment.bind(this.intelligenceV2);
  createSourceCallLog = this.intelligenceV2.createSourceCallLog.bind(this.intelligenceV2);
  getSourceCallLogs = this.intelligenceV2.getSourceCallLogs.bind(this.intelligenceV2);
  getEngineSuggestedLines = this.intelligenceV2.getEngineSuggestedLines.bind(this.intelligenceV2);
  getEngineSuggestedLineById = this.intelligenceV2.getEngineSuggestedLineById.bind(this.intelligenceV2);
  createEngineSuggestedLine = this.intelligenceV2.createEngineSuggestedLine.bind(this.intelligenceV2);
  approveEngineSuggestedLine = this.intelligenceV2.approveEngineSuggestedLine.bind(this.intelligenceV2);
  rejectEngineSuggestedLine = this.intelligenceV2.rejectEngineSuggestedLine.bind(this.intelligenceV2);
  getEngineSuggestedLineCounts = this.intelligenceV2.getEngineSuggestedLineCounts.bind(this.intelligenceV2);
  createKeyRotation = this.intelligenceV2.createKeyRotation.bind(this.intelligenceV2);
  getKeyRotationsByService = this.intelligenceV2.getKeyRotationsByService.bind(this.intelligenceV2);
  getPipelinePolicies = this.intelligenceV2.getPipelinePolicies.bind(this.intelligenceV2);
  upsertPipelinePolicy = this.intelligenceV2.upsertPipelinePolicy.bind(this.intelligenceV2);
  getScheduledResearchWorkflows = this.intelligenceV2.getScheduledResearchWorkflows.bind(this.intelligenceV2);
  getScheduledResearchWorkflowById = this.intelligenceV2.getScheduledResearchWorkflowById.bind(this.intelligenceV2);
  getStaleScheduledWorkflows = this.intelligenceV2.getStaleScheduledWorkflows.bind(this.intelligenceV2);
  getDueScheduledWorkflows = this.intelligenceV2.getDueScheduledWorkflows.bind(this.intelligenceV2);
  upsertScheduledResearchWorkflow = this.intelligenceV2.upsertScheduledResearchWorkflow.bind(this.intelligenceV2);
  updateScheduledWorkflowRun = this.intelligenceV2.updateScheduledWorkflowRun.bind(this.intelligenceV2);
  deleteScheduledResearchWorkflow = this.intelligenceV2.deleteScheduledResearchWorkflow.bind(this.intelligenceV2);

  // Hospitality Benchmarks
  getHospitalityBenchmarks = this.intelligenceV2.getHospitalityBenchmarks.bind(this.intelligenceV2);
  getHospitalityBenchmarksByCategory = this.intelligenceV2.getHospitalityBenchmarksByCategory.bind(this.intelligenceV2);
  upsertHospitalityBenchmark = this.intelligenceV2.upsertHospitalityBenchmark.bind(this.intelligenceV2);
  getHospitalityBenchmarkById = this.intelligenceV2.getHospitalityBenchmarkById.bind(this.intelligenceV2);
  updateHospitalityBenchmark = this.intelligenceV2.updateHospitalityBenchmark.bind(this.intelligenceV2);

  // Market Data Tables (pre-collected)
  getMarketAdrIndex = this.intelligenceV2.getMarketAdrIndex.bind(this.intelligenceV2);
  upsertMarketAdrIndex = this.intelligenceV2.upsertMarketAdrIndex.bind(this.intelligenceV2);
  getSeasonalCalendar = this.intelligenceV2.getSeasonalCalendar.bind(this.intelligenceV2);
  upsertSeasonalCalendar = this.intelligenceV2.upsertSeasonalCalendar.bind(this.intelligenceV2);
  getEventCalendar = this.intelligenceV2.getEventCalendar.bind(this.intelligenceV2);
  upsertEventCalendar = this.intelligenceV2.upsertEventCalendar.bind(this.intelligenceV2);
  getAirportDistances = this.intelligenceV2.getAirportDistances.bind(this.intelligenceV2);
  upsertAirportDistance = this.intelligenceV2.upsertAirportDistance.bind(this.intelligenceV2);
  getLaborRates = this.intelligenceV2.getLaborRates.bind(this.intelligenceV2);
  upsertLaborRate = this.intelligenceV2.upsertLaborRate.bind(this.intelligenceV2);
  getFbBenchmarks = this.intelligenceV2.getFbBenchmarks.bind(this.intelligenceV2);
  upsertFbBenchmark = this.intelligenceV2.upsertFbBenchmark.bind(this.intelligenceV2);
  getAnalystWatchdogBenchmarks = this.intelligenceV2.getAnalystWatchdogBenchmarks.bind(this.intelligenceV2);
  upsertAnalystWatchdogBenchmarks = this.intelligenceV2.upsertAnalystWatchdogBenchmarks.bind(this.intelligenceV2);

  // Capital Raise Benchmarks + Analyst Refresh module
  getCapitalRaiseBenchmarks = this.intelligenceV2.getCapitalRaiseBenchmarks.bind(this.intelligenceV2);
  getCapitalRaiseBenchmarkSummary = this.intelligenceV2.getCapitalRaiseBenchmarkSummary.bind(this.intelligenceV2);
  upsertCapitalRaiseBenchmark = this.intelligenceV2.upsertCapitalRaiseBenchmark.bind(this.intelligenceV2);
  createAnalystRefreshAuditLog = this.intelligenceV2.createAnalystRefreshAuditLog.bind(this.intelligenceV2);
  finalizeAnalystRefreshAuditLog = this.intelligenceV2.finalizeAnalystRefreshAuditLog.bind(this.intelligenceV2);
  getRecentAnalystRefreshAuditLogs = this.intelligenceV2.getRecentAnalystRefreshAuditLogs.bind(this.intelligenceV2);
  countAnalystRefreshAttempts = this.intelligenceV2.countAnalystRefreshAttempts.bind(this.intelligenceV2);
  getAnalystRefreshSettings = this.intelligenceV2.getAnalystRefreshSettings.bind(this.intelligenceV2);
  updateAnalystRefreshSettings = this.intelligenceV2.updateAnalystRefreshSettings.bind(this.intelligenceV2);

  // Rebecca Guardrails
  getRebeccaGuardrails = this.rebecca.getRebeccaGuardrails.bind(this.rebecca);
  getActiveRebeccaGuardrails = this.rebecca.getActiveRebeccaGuardrails.bind(this.rebecca);
  createRebeccaGuardrail = this.rebecca.createRebeccaGuardrail.bind(this.rebecca);
  updateRebeccaGuardrail = this.rebecca.updateRebeccaGuardrail.bind(this.rebecca);
  deleteRebeccaGuardrail = this.rebecca.deleteRebeccaGuardrail.bind(this.rebecca);

  // Rebecca Knowledge Base
  getRebeccaKBEntries = this.rebecca.getRebeccaKBEntries.bind(this.rebecca);
  getActiveRebeccaKBEntries = this.rebecca.getActiveRebeccaKBEntries.bind(this.rebecca);
  getRebeccaKBEntry = this.rebecca.getRebeccaKBEntry.bind(this.rebecca);
  createRebeccaKBEntry = this.rebecca.createRebeccaKBEntry.bind(this.rebecca);
  updateRebeccaKBEntry = this.rebecca.updateRebeccaKBEntry.bind(this.rebecca);
  deleteRebeccaKBEntry = this.rebecca.deleteRebeccaKBEntry.bind(this.rebecca);
  getRebeccaKBHistory = this.rebecca.getRebeccaKBHistory.bind(this.rebecca);
  rollbackRebeccaKBEntry = this.rebecca.rollbackRebeccaKBEntry.bind(this.rebecca);
  getRebeccaKBStats = this.rebecca.getRebeccaKBStats.bind(this.rebecca);

  // Property URLs
  getAllPropertyUrls = this.propertyUrlStore.getAllPropertyUrls.bind(this.propertyUrlStore);
  getPropertyUrls = this.propertyUrlStore.getPropertyUrls.bind(this.propertyUrlStore);
  getPropertyUrlById = this.propertyUrlStore.getPropertyUrlById.bind(this.propertyUrlStore);
  addPropertyUrl = this.propertyUrlStore.addPropertyUrl.bind(this.propertyUrlStore);
  updatePropertyUrl = this.propertyUrlStore.updatePropertyUrl.bind(this.propertyUrlStore);
  deletePropertyUrl = this.propertyUrlStore.deletePropertyUrl.bind(this.propertyUrlStore);

  // Calculation Audit Logs
  saveCalcAuditLog = this.calcAudit.saveCalcAuditLog.bind(this.calcAudit);
  getCalcAuditLogs = this.calcAudit.getCalcAuditLogs.bind(this.calcAudit);
  getCalcAuditLog = this.calcAudit.getCalcAuditLog.bind(this.calcAudit);
  updateCalcAuditLogNote = this.calcAudit.updateCalcAuditLogNote.bind(this.calcAudit);

  // Page Visits
  getPageVisit = this.pageVisitStore.getPageVisit.bind(this.pageVisitStore);
  recordVisit = this.pageVisitStore.recordVisit.bind(this.pageVisitStore);
  recordSave = this.pageVisitStore.recordSave.bind(this.pageVisitStore);
  recordAnalystRun = this.pageVisitStore.recordAnalystRun.bind(this.pageVisitStore);
  cleanupOldVisits = this.pageVisitStore.cleanupOldVisits.bind(this.pageVisitStore);

  /**
   * Delete a user and ALL related data in a single transaction.
   * Cascading deletes remove sessions, scenarios, research, properties,
   * assumptions, login logs, activity logs, and verification runs.
   */
  async deleteUser(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.delete(scenarioShares).where(eq(scenarioShares.grantedBy, id));
      await tx.delete(scenarioShares).where(and(eq(scenarioShares.targetType, "user"), eq(scenarioShares.targetId, id)));
      await tx.delete(scenarioAccess).where(eq(scenarioAccess.ownerId, id));
      await tx.delete(scenarioAccess).where(eq(scenarioAccess.granteeId, id));
      await tx.delete(scenarios).where(eq(scenarios.userId, id));
      await tx.delete(marketResearch).where(eq(marketResearch.userId, id));
      await tx.delete(prospectiveProperties).where(eq(prospectiveProperties.userId, id));
      await tx.delete(savedSearches).where(eq(savedSearches.userId, id));
      await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, id));
      await tx.delete(documentExtractions).where(eq(documentExtractions.userId, id));
      await tx.delete(conversations).where(eq(conversations.userId, id));
      await tx.delete(properties).where(eq(properties.userId, id));
      await tx.delete(globalAssumptions).where(eq(globalAssumptions.userId, id));
      await tx.delete(loginLogs).where(eq(loginLogs.userId, id));
      await tx.delete(activityLogs).where(eq(activityLogs.userId, id));
      await tx.delete(verificationRuns).where(eq(verificationRuns.userId, id));
      await tx.delete(calculationAuditLogs).where(eq(calculationAuditLogs.userId, id));
      await tx.delete(userPageVisits).where(eq(userPageVisits.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });
  }

  async getDbHealth(): Promise<{ serverTime: string; pool: { total: number; idle: number; waiting: number }; migrationsReady: boolean }> {
    const result = await pool.query("SELECT NOW() AS server_time");
    const migResult = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'properties') AS ready"
    );
    return {
      serverTime: result.rows[0]?.server_time,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      migrationsReady: migResult.rows[0]?.ready === true,
    };
  }
}
