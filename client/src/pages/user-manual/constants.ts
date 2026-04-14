import { IconActivity, IconDashboard, IconProperties, IconBriefcase, IconSettings, IconScenarios, IconAnalysis, IconPropertyFinder, IconExport, IconProfile, IconSwatchBook, IconShield, IconVerify, IconImage, IconInvestment, IconPanelLeft, IconBookOpen } from "@/components/icons";import type { ComponentType, SVGAttributes } from "react";

export type AccessLevel = "all" | "management" | "admin";

export interface UserManualSection {
  id: string;
  title: string;
  icon: ComponentType<SVGAttributes<SVGSVGElement>>;
  access: AccessLevel;
}

export const USER_MANUAL_SECTIONS: UserManualSection[] = [
  { id: "getting-started", title: "1. Getting Started", icon: IconActivity, access: "all" },
  { id: "navigation", title: "2. Navigating the Portal", icon: IconPanelLeft, access: "all" },
  { id: "dashboard", title: "3. Dashboard", icon: IconDashboard, access: "all" },
  { id: "properties", title: "4. Properties", icon: IconProperties, access: "all" },
  { id: "property-details", title: "5. Property Details & Financials", icon: IconInvestment, access: "all" },
  { id: "property-images", title: "6. Property Images", icon: IconImage, access: "all" },
  { id: "management-company", title: "7. Management Company", icon: IconBriefcase, access: "management" },
  { id: "assumptions", title: "8. Systemwide Assumptions", icon: IconSettings, access: "management" },
  { id: "scenarios", title: "9. Scenarios", icon: IconScenarios, access: "management" },
  { id: "analysis", title: "10. Analysis Tools", icon: IconAnalysis, access: "management" },
  { id: "property-finder", title: "11. Property Finder", icon: IconPropertyFinder, access: "management" },
  { id: "exports", title: "12. Exports & Reports", icon: IconExport, access: "all" },
  { id: "profile", title: "14. My Profile", icon: IconProfile, access: "all" },
  { id: "branding", title: "15. Branding & Themes", icon: IconSwatchBook, access: "admin" },
  { id: "admin", title: "16. Admin Settings", icon: IconShield, access: "admin" },
  { id: "business-constraints", title: "17. Business Rules & Constraints", icon: IconVerify, access: "all" },
  { id: "research-intelligence", title: "18. Research & Intelligence", icon: IconBookOpen, access: "all" },
];
