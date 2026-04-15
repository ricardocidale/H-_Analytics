export const PropertyStatus = {
  PIPELINE: "Pipeline",
  OPERATING: "Operating",
  IMPROVEMENTS: "Improvements",
  ACQUIRED: "Acquired",
  IN_NEGOTIATION: "In Negotiation",
  PLANNED: "Planned",
} as const;

export type PropertyStatusValue = (typeof PropertyStatus)[keyof typeof PropertyStatus];

export const PROPERTY_STATUS_VALUES = Object.values(PropertyStatus);

export const UserRole = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  USER: "user",
  CHECKER: "checker",
  INVESTOR: "investor",
} as const;

export function isAdminRole(role: string): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLE_VALUES = Object.values(UserRole);

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

export const APP_BRAND_NAME = "H+ Analytics";
export const APP_FULL_BRAND = "H+ Analytics by Norfolk AI";
export const BRAND_ACCENT_PREFIX = "H+";
export const BRAND_ACCENT_HEX = "#00A9B8";

export const USE_SERVER_COMPUTE = true;

export const USE_SERVER_EXPORTS = true;
