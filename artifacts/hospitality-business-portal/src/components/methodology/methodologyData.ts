import { IconLayers, IconShieldCheck, IconBanknote, IconRefreshCw, IconArrowRightLeft, IconInfo, IconTrendingUp, IconWallet, IconBarChart3, IconBuilding2, IconDollarSign, IconBookOpen, IconPieChart, IconCalculator } from "@/components/icons";

export const sections = [
  { id: "business-model", title: "Business Model Overview", subtitle: "Two-entity structure: Management Company + Property Portfolio", icon: IconLayers },
  { id: "business-rules", title: "Business Rules & Constraints", subtitle: "Mandatory financial gates and safety checks", icon: IconShieldCheck, className: "border-destructive/20 bg-destructive/5" },
  { id: "capital-lifecycle", title: "Capital Structure & Investor Returns", subtitle: "How capital flows in and how investors get paid back", icon: IconBanknote },
  { id: "dynamic-behavior", title: "Dynamic Behavior & System Goals", subtitle: "Real-time recalculation and multi-level analysis", icon: IconRefreshCw },
  { id: "property-lifecycle", title: "Property Lifecycle", subtitle: "Acquisition → Operations → Refinancing → Exit", icon: IconArrowRightLeft },
  { id: "defaults", title: "Default Values & Assumptions", subtitle: "Where the default numbers come from", icon: IconInfo },
  { id: "revenue", title: "Revenue Calculations", subtitle: "How we project rooms, F&B, and events revenue", icon: IconTrendingUp },
  { id: "expenses", title: "Operating Expenses", subtitle: "How we calculate property operating costs", icon: IconWallet },
  { id: "noi-gop", title: "GOP, NOI, and ANOI", subtitle: "Gross Operating Profit, Net Operating Income, and Adjusted NOI", icon: IconBarChart3 },
  { id: "debt", title: "Debt & Financing", subtitle: "Loan calculations and refinancing", icon: IconBuilding2 },
  { id: "cash-flow", title: "Free Cash Flow (GAAP Method)", subtitle: "How we calculate cash available to investors", icon: IconDollarSign },
  { id: "balance-sheet", title: "Balance Sheet", subtitle: "Assets, liabilities, and equity per GAAP standards", icon: IconBookOpen },
  { id: "returns", title: "Investment Returns", subtitle: "IRR, equity multiple, and exit value calculations", icon: IconPieChart },
  { id: "management-company", title: "Management Company Financials", subtitle: "Hospitality Business Co. revenue and expenses", icon: IconBuilding2 },
  { id: "fixed-assumptions", title: "Fixed Assumptions (Not Configurable)", subtitle: "Hardcoded values built into the calculation engine", icon: IconInfo, className: "border-accent-pop/20 bg-accent-pop/5" },
  { id: "verification", title: "Financial Verification & Audit", subtitle: "How we verify calculations for GAAP compliance", icon: IconCalculator },
];
