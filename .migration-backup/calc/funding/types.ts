import type { AccountingPolicy } from "../../domain/types/accounting-policy.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import type { JournalDelta } from "../../domain/types/journal-delta.js";

// ── Entity model ──────────────────────────────────────────────

export type FundingEntityType = "OPCO" | "PROPERTY";

export interface FundingEntity {
  type: FundingEntityType;
  id: string;
  name: string;
}

// ── Tranche trigger types ─────────────────────────────────────

export type TrancheTrigger =
  | { type: "scheduled"; date: string }
  | { type: "on_acquisition"; property_id: string }
  | { type: "conditional"; condition: string; fallback_date: string };

export interface FundingTranche {
  tranche_id: string;
  label: string;
  amount: number;
  trigger: TrancheTrigger;
  target_entity: FundingEntity;
  source: string;
}

// ── Property funding requirement ──────────────────────────────

export interface PropertyFundingRequirement {
  property_id: string;
  property_name: string;
  acquisition_date: string;
  operations_start_date: string;
  total_cost: number;
  loan_amount: number;
  equity_required: number;
}

// ── Input ─────────────────────────────────────────────────────

export interface FundingInput {
  model_start_date: string;
  company_ops_start_date: string;
  tranches: FundingTranche[];
  property_requirements: PropertyFundingRequirement[];
  accounting_policy_ref: AccountingPolicy;
  rounding_policy: RoundingPolicy;
}

// ── Output types ──────────────────────────────────────────────

export interface FundingEvent {
  date: string;
  tranche_id: string;
  label: string;
  amount: number;
  target_entity: FundingEntity;
  source: string;
}

export type GateType =
  | "opco_ops_before_funding"
  | "property_ops_before_equity"
  | "funding_shortfall";

export interface GateCheck {
  entity: FundingEntity;
  gate_type: GateType;
  passed: boolean;
  message: string;
  required_date: string;
  earliest_funding_date: string | null;
  shortfall_amount?: number;
}

export interface EquityRollForwardEntry {
  period: string;
  entity_id: string;
  beginning_balance: number;
  contributions: number;
  distributions: number;
  ending_balance: number;
}

export interface FundingFlags {
  all_gates_passed: boolean;
  has_shortfalls: boolean;
  invalid_inputs: string[];
}

export interface FundingOutput {
  funding_timeline: FundingEvent[];
  gate_checks: GateCheck[];
  equity_rollforward: EquityRollForwardEntry[];
  total_equity_committed: number;
  total_funded_opco: number;
  total_funded_properties: number;
  journal_hooks: JournalDelta[];
  flags: FundingFlags;
  warnings: string[];
}
