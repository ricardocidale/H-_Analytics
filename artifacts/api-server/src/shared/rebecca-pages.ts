export const PAGE_LABELS = {
  "dashboard": "Dashboard (portfolio overview)",
  "property-edit": "Editing property assumptions",
  "property-detail": "Viewing property details",
  "property-research": "Property research & intelligence",
  "property-photos": "Property photos",
  "scenario-comparison": "Scenario comparison & management",
  "company-settings": "Company-level assumptions",
  "admin": "Admin panel",
  "icp-studio": "Investment Criteria Profile (ICP) studio",
  "profile": "User profile",
} as const;

export type PageKey = keyof typeof PAGE_LABELS;

export const VALID_PAGE_KEYS = Object.keys(PAGE_LABELS) as PageKey[];

export const OBSERVATION_DELIMITER = " | ";
