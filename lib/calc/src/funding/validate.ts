import type { FundingInput } from "./types.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  const [y, m, day] = s.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

export function validateFundingInput(input: FundingInput): string[] {
  const errors: string[] = [];

  if (!input.model_start_date || !isValidDate(input.model_start_date)) {
    errors.push("model_start_date must be a valid YYYY-MM-DD date");
  }

  if (
    !input.company_ops_start_date ||
    !isValidDate(input.company_ops_start_date)
  ) {
    errors.push("company_ops_start_date must be a valid YYYY-MM-DD date");
  }

  if (!input.tranches || input.tranches.length === 0) {
    errors.push("At least one funding tranche is required");
  }

  for (const t of input.tranches) {
    if (!t.tranche_id) {
      errors.push("Each tranche must have a tranche_id");
    }
    if (t.amount <= 0) {
      errors.push(`Tranche "${t.label}": amount must be > 0`);
    }
    if (t.trigger.type === "scheduled" && !isValidDate(t.trigger.date)) {
      errors.push(
        `Tranche "${t.label}": scheduled trigger must have a valid YYYY-MM-DD date`,
      );
    }
    if (t.trigger.type === "on_acquisition" && !t.trigger.property_id) {
      errors.push(
        `Tranche "${t.label}": on_acquisition trigger must specify property_id`,
      );
    }
    if (
      t.trigger.type === "conditional" &&
      !isValidDate(t.trigger.fallback_date)
    ) {
      errors.push(
        `Tranche "${t.label}": conditional trigger must have a valid fallback_date`,
      );
    }
  }

  for (const p of input.property_requirements) {
    if (!p.property_id) {
      errors.push("Each property requirement must have a property_id");
    }
    if (!isValidDate(p.acquisition_date)) {
      errors.push(
        `Property "${p.property_name}": acquisition_date must be YYYY-MM-DD`,
      );
    }
    if (!isValidDate(p.operations_start_date)) {
      errors.push(
        `Property "${p.property_name}": operations_start_date must be YYYY-MM-DD`,
      );
    }
    if (p.total_cost <= 0) {
      errors.push(`Property "${p.property_name}": total_cost must be > 0`);
    }
    if (p.equity_required < 0) {
      errors.push(
        `Property "${p.property_name}": equity_required must be >= 0`,
      );
    }
  }

  return errors;
}
