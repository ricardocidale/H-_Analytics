/**
 * admin/index.ts
 *
 * Barrel export for the Admin Settings panel tabs.
 * The admin area is only accessible to users with the "admin" role and
 * provides platform-wide configuration:
 *
 *   • UsersTab        – CRUD for user accounts, role assignment, password resets
 *   • CompaniesTab    – manage the management company entity and companies
 *                       of interest (investors, partners, stakeholders)
 *   • ActivityTab     – login audit log, activity feed, and checker usage analytics
 *   • VerificationTab – independent GAAP financial verification with PDF export
 *   • DatabaseTab     – view database entity counts and populate production with seed data
 */
export { default as UsersTab } from "./UsersTab";
export { default as CompaniesTab } from "./CompaniesTab";
export { default as ActivityTab } from "./activity";
export { default as VerificationTab } from "./verification";
export { default as DatabaseTab } from "./DatabaseTab";
export { default as AIAgentsTab } from "./AIAgentsTab";
export { default as ResearchCenterTab } from "./ResearchCenterTab";
export { default as ModelDefaultsTab } from "./ModelDefaultsTab";
export { default as DesignTab } from "./DesignTab";
