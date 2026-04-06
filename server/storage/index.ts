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
import { users, sessions, marketResearch, prospectiveProperties, savedSearches, properties, globalAssumptions, loginLogs, activityLogs, verificationRuns, scenarios, scenarioShares, scenarioAccess, scenarioResults, notificationPreferences, documentExtractions, conversations, type User, type Session, type GlobalAssumptions, type Property, type Scenario, type ScenarioResult, type InsertScenarioResult, type Logo, type AssetDescription, type UserGroup, type Company, type FeeCategory, type ResearchQuestion, type DesignTheme } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { UserStorage } from "./users";
import { PropertyStorage } from "./properties";
import { FinancialStorage } from "./financial";
import { AdminStorage } from "./admin";
import { ActivityStorage, type ActivityLogFilters } from "./activity";
import { ResearchStorage } from "./research";
import { PhotoStorage } from "./photos";
import { DocumentStorage } from "./documents";
import { ServiceStorage } from "./services";
import { NotificationStorage } from "./notifications";
import { IntegrationStorage } from "./integrations";
import { IntelligenceV2Storage } from "./intelligence-v2";

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
  IntelligenceV2Storage {
  deleteUser(id: number): Promise<void>;
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
  clearUserGoogleDriveTokens = this.users.clearUserGoogleDriveTokens.bind(this.users);

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
  getProperty = this.properties.getProperty.bind(this.properties);
  createProperty = this.properties.createProperty.bind(this.properties);
  updateProperty = this.properties.updateProperty.bind(this.properties);
  deleteProperty = this.properties.deleteProperty.bind(this.properties);
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
  getScenarioResultByHash = this.financial.getScenarioResultByHash.bind(this.financial);

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

  getAllAssetDescriptions = this.admin.getAllAssetDescriptions.bind(this.admin);

  getAllUserGroups = this.admin.getAllUserGroups.bind(this.admin);
  getUserGroup = this.admin.getUserGroup.bind(this.admin);
  createUserGroup = this.admin.createUserGroup.bind(this.admin);
  updateUserGroup = this.admin.updateUserGroup.bind(this.admin);
  deleteUserGroup = this.admin.deleteUserGroup.bind(this.admin);
  assignUserToGroup = this.admin.assignUserToGroup.bind(this.admin);
  getDefaultUserGroup = this.admin.getDefaultUserGroup.bind(this.admin);
  getGroupPropertyIds = this.admin.getGroupPropertyIds.bind(this.admin);
  setGroupProperties = this.admin.setGroupProperties.bind(this.admin);

  getAllCompanies = this.admin.getAllCompanies.bind(this.admin);
  getCompany = this.admin.getCompany.bind(this.admin);
  createCompany = this.admin.createCompany.bind(this.admin);
  updateCompany = this.admin.updateCompany.bind(this.admin);
  deleteCompany = this.admin.deleteCompany.bind(this.admin);

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
  getAssumptionGuidanceById = this.intelligenceV2.getAssumptionGuidanceById.bind(this.intelligenceV2);
  upsertAssumptionGuidance = this.intelligenceV2.upsertAssumptionGuidance.bind(this.intelligenceV2);
  createResearchRun = this.intelligenceV2.createResearchRun.bind(this.intelligenceV2);
  updateResearchRun = this.intelligenceV2.updateResearchRun.bind(this.intelligenceV2);
  getResearchRuns = this.intelligenceV2.getResearchRuns.bind(this.intelligenceV2);
  getBenchmarkSnapshots = this.intelligenceV2.getBenchmarkSnapshots.bind(this.intelligenceV2);
  upsertBenchmarkSnapshot = this.intelligenceV2.upsertBenchmarkSnapshot.bind(this.intelligenceV2);
  createRelaxationTrace = this.intelligenceV2.createRelaxationTrace.bind(this.intelligenceV2);
  getRelaxationTraces = this.intelligenceV2.getRelaxationTraces.bind(this.intelligenceV2);
  createGuidanceDecision = this.intelligenceV2.createGuidanceDecision.bind(this.intelligenceV2);
  getGuidanceDecisions = this.intelligenceV2.getGuidanceDecisions.bind(this.intelligenceV2);
  createRebeccaConversation = this.intelligenceV2.createRebeccaConversation.bind(this.intelligenceV2);
  getRebeccaConversation = this.intelligenceV2.getRebeccaConversation.bind(this.intelligenceV2);
  getOrCreateConversation = this.intelligenceV2.getOrCreateConversation.bind(this.intelligenceV2);
  getRebeccaConversations = this.intelligenceV2.getRebeccaConversations.bind(this.intelligenceV2);
  addRebeccaMessage = this.intelligenceV2.addRebeccaMessage.bind(this.intelligenceV2);
  getRebeccaMessages = this.intelligenceV2.getRebeccaMessages.bind(this.intelligenceV2);
  createRebeccaEmail = this.intelligenceV2.createRebeccaEmail.bind(this.intelligenceV2);
  createRebeccaFeedback = this.intelligenceV2.createRebeccaFeedback.bind(this.intelligenceV2);
  getRebeccaFeedback = this.intelligenceV2.getRebeccaFeedback.bind(this.intelligenceV2);
  updateRebeccaFeedbackStatus = this.intelligenceV2.updateRebeccaFeedbackStatus.bind(this.intelligenceV2);
  createCoverageSnapshot = this.intelligenceV2.createCoverageSnapshot.bind(this.intelligenceV2);
  getCoverageSnapshots = this.intelligenceV2.getCoverageSnapshots.bind(this.intelligenceV2);
  getSourceRegistry = this.intelligenceV2.getSourceRegistry.bind(this.intelligenceV2);
  upsertSourceRegistry = this.intelligenceV2.upsertSourceRegistry.bind(this.intelligenceV2);
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
