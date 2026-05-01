/**
 * admin/types.ts
 *
 * TypeScript interfaces for the Admin Settings panel.
 * These types model the data returned by /api/admin/* endpoints and are
 * consumed by the various admin tab components.
 *
 * Verification types (CheckResult, PropertyCheckResults) live in
 * shared/verification-types.ts and are re-exported from
 * admin/verification/types.ts.
 */

export interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  company: string | null;
  title: string | null;
  role: string;
  canManageScenarios: boolean;
  createdAt: string;
}

export interface Logo {
  id: number;
  name: string;
  companyName: string;
  url: string;
  isDefault: boolean;
  isAppLogo: boolean;
  visibility: "all" | "super_admin_only";
  createdAt: string;
}

export interface LoginLog {
  id: number;
  userId: number;
  sessionId: string;
  loginAt: string;
  logoutAt: string | null;
  ipAddress: string | null;
  userEmail: string;
  userName: string | null;
}

export type AdminView = "users" | "activity" | "verification" | "themes" | "branding" | "sidebar" | "database";
export type ActivitySubView = "login" | "feed" | "sharing" | "checker";

export interface ActivityLogEntry {
  id: number;
  userId: number;
  userEmail: string;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  entityName: string | null;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface CheckerSummary {
  id: number;
  email: string;
  name: string | null;
  totalActions: number;
  lastActive: string | null;
  verificationRuns: number;
  manualViews: number;
  exports: number;
}

export interface CheckerActivityData {
  checkers: CheckerSummary[];
  summary: {
    totalActions: number;
    verificationRuns: number;
    manualViews: number;
    exports: number;
    pageVisits: number;
    roleChanges: number;
  };
  recentActivity: ActivityLogEntry[];
}

export interface VerificationHistoryEntry {
  id: number;
  userId: number;
  totalChecks: number;
  passed: number;
  failed: number;
  auditOpinion: string;
  overallStatus: string;
  createdAt: string;
}

export interface ActiveSession {
  id: string;
  userId: number;
  userEmail: string;
  userName: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface AssetDesc {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: string;
}
