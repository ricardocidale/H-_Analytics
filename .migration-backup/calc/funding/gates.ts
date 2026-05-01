import type {
  FundingEvent,
  FundingEntity,
  PropertyFundingRequirement,
  GateCheck,
} from "./types.js";
import { roundTo } from "../../domain/types/rounding.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

/**
 * Check all funding gates and return structured results.
 *
 * Gates enforced:
 * 1. OpCo cannot operate before receiving its first funding tranche.
 * 2. Each property must have its equity requirement met by acquisition date.
 */
export function checkGates(
  companyOpsStartDate: string,
  events: FundingEvent[],
  propertyRequirements: PropertyFundingRequirement[],
  rounding: RoundingPolicy,
): GateCheck[] {
  const checks: GateCheck[] = [];

  // ── OpCo gate ─────────────────────────────────────────────
  const opcoEvents = events.filter((e) => e.target_entity.type === "OPCO");
  const earliestOpco =
    opcoEvents.length > 0
      ? opcoEvents.reduce((min, e) => (e.date < min.date ? e : min)).date
      : null;

  const opcoEntity: FundingEntity = {
    type: "OPCO",
    id: "opco",
    name: "Management Company",
  };

  if (!earliestOpco) {
    checks.push({
      entity: opcoEntity,
      gate_type: "opco_ops_before_funding",
      passed: false,
      message:
        "No OPCO-targeted funding tranches found; " +
        "company cannot operate without funding",
      required_date: companyOpsStartDate,
      earliest_funding_date: null,
    });
  } else if (earliestOpco > companyOpsStartDate) {
    checks.push({
      entity: opcoEntity,
      gate_type: "opco_ops_before_funding",
      passed: false,
      message:
        `Company operations start ${companyOpsStartDate} but ` +
        `first funding tranche arrives ${earliestOpco}`,
      required_date: companyOpsStartDate,
      earliest_funding_date: earliestOpco,
    });
  } else {
    checks.push({
      entity: opcoEntity,
      gate_type: "opco_ops_before_funding",
      passed: true,
      message:
        `Company funded by ${earliestOpco}, ` +
        `operations start ${companyOpsStartDate}`,
      required_date: companyOpsStartDate,
      earliest_funding_date: earliestOpco,
    });
  }

  // ── Property gates ────────────────────────────────────────
  for (const prop of propertyRequirements) {
    const propEntity: FundingEntity = {
      type: "PROPERTY",
      id: prop.property_id,
      name: prop.property_name,
    };

    // Sum all property-targeted funding that arrives by acquisition date
    const propEvents = events.filter(
      (e) =>
        e.target_entity.type === "PROPERTY" &&
        e.target_entity.id === prop.property_id &&
        e.date <= prop.acquisition_date,
    );

    const totalFunded = roundTo(
      propEvents.reduce((sum, e) => sum + e.amount, 0),
      rounding,
    );

    const earliestProp =
      propEvents.length > 0
        ? propEvents.reduce((min, e) => (e.date < min.date ? e : min)).date
        : null;

    if (propEvents.length === 0) {
      checks.push({
        entity: propEntity,
        gate_type: "property_ops_before_equity",
        passed: false,
        message:
          `Property "${prop.property_name}" has no funding tranches ` +
          `by acquisition date ${prop.acquisition_date}`,
        required_date: prop.acquisition_date,
        earliest_funding_date: null,
        shortfall_amount: prop.equity_required,
      });
    } else if (totalFunded < prop.equity_required) {
      const shortfall = roundTo(prop.equity_required - totalFunded, rounding);
      checks.push({
        entity: propEntity,
        gate_type: "funding_shortfall",
        passed: false,
        message:
          `Property "${prop.property_name}" funded $${totalFunded.toLocaleString()} ` +
          `of $${prop.equity_required.toLocaleString()} required — ` +
          `shortfall $${shortfall.toLocaleString()}`,
        required_date: prop.acquisition_date,
        earliest_funding_date: earliestProp,
        shortfall_amount: shortfall,
      });
    } else {
      checks.push({
        entity: propEntity,
        gate_type: "property_ops_before_equity",
        passed: true,
        message:
          `Property "${prop.property_name}" fully funded ` +
          `($${totalFunded.toLocaleString()}) by ${prop.acquisition_date}`,
        required_date: prop.acquisition_date,
        earliest_funding_date: earliestProp,
      });
    }
  }

  return checks;
}
