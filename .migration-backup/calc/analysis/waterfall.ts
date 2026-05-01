/**
 * calc/analysis/waterfall.ts — Equity waterfall distribution calculator.
 *
 * PURPOSE:
 * Computes how distributable cash flows are split between Limited Partners (LPs)
 * and the General Partner (GP) using a tiered promote structure. This is the
 * standard profit-sharing mechanism in real estate private equity.
 *
 * HOW A WATERFALL WORKS (in order of priority):
 *
 * 1. RETURN OF CAPITAL:
 *    LPs and GP first get their invested capital back, pro rata.
 *    Until this step is satisfied, no one earns a profit.
 *
 * 2. PREFERRED RETURN ("Pref"):
 *    LPs receive a priority return on their investment (e.g., 8% annually).
 *    The pref accrues and must be paid before the GP receives any promote.
 *    If total distributable cash is insufficient, the shortfall is tracked.
 *
 * 3. GP CATCH-UP:
 *    After the pref is paid, the GP receives a disproportionate share of the
 *    next dollars distributed until they've "caught up" to a target ownership
 *    percentage (typically 20%) of all distributions so far. The catch-up rate
 *    controls how aggressively the GP catches up (e.g., 100% = all to GP,
 *    80% = 80/20 split during catch-up).
 *
 * 4. PROMOTE TIERS:
 *    Remaining cash is split according to tiered LP/GP splits, usually getting
 *    more GP-favorable at higher IRR hurdles:
 *    - Tier 1 (e.g., up to 12% IRR): 80% LP / 20% GP
 *    - Tier 2 (e.g., 12–18% IRR): 70% LP / 30% GP
 *    - Tier 3 (e.g., above 18% IRR): 60% LP / 40% GP
 *
 * KEY OUTPUTS:
 *   - total_to_lp / total_to_gp: Final dollar amounts to each party.
 *   - lp_multiple / gp_multiple: Total received / equity invested for each party.
 *   - preferred_return_shortfall: Unpaid pref (if cash was insufficient).
 *   - tier_results: How much flowed through each tier.
 *
 * INDUSTRY CONTEXT:
 * The waterfall aligns GP incentives with LP returns: the GP earns a larger
 * share only when they deliver higher returns. This structure is standard
 * in hotel investment funds and joint ventures.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "waterfall" skill. The UI displays the
 * waterfall in the investor returns section, showing the LP/GP split at each tier.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { rounder, RATIO_ROUNDING, sumArray } from "../shared/utils.js";
import { DEFAULT_GP_CATCH_UP_TARGET_PCT } from "../../shared/constants.js";

export interface WaterfallTier {
  label: string;
  hurdle_irr: number;
  lp_split: number;
  gp_split: number;
}

export interface WaterfallInput {
  total_equity_invested: number;
  lp_equity: number;
  gp_equity: number;
  distributable_cash_flows: number[];
  preferred_return: number;
  tiers: WaterfallTier[];
  catch_up_rate?: number;
  catch_up_to_gp_pct?: number;
  rounding_policy: RoundingPolicy;
}

export interface WaterfallTierResult {
  label: string;
  hurdle_irr: number;
  lp_split: number;
  gp_split: number;
  amount_distributed: number;
  lp_amount: number;
  gp_amount: number;
}

export interface WaterfallOutput {
  total_distributable: number;
  return_of_capital: number;
  preferred_return_amount: number;
  preferred_return_shortfall: number;
  catch_up_amount: number;
  tier_results: WaterfallTierResult[];
  total_to_lp: number;
  total_to_gp: number;
  lp_multiple: number;
  gp_multiple: number;
  lp_irr_share: number;
  gp_irr_share: number;
  residual_undistributed: number;
}

export function computeWaterfall(input: WaterfallInput): WaterfallOutput {
  const r = rounder(input.rounding_policy);
  const ratio = (v: number) => roundTo(v, RATIO_ROUNDING);

  const totalEquity = input.total_equity_invested;
  const lpPct = totalEquity > 0 ? input.lp_equity / totalEquity : 0;
  const totalDistributable = r(sumArray(input.distributable_cash_flows));

  let remaining = Math.max(0, totalDistributable);
  let totalToLP = 0;
  let totalToGP = 0;

  const return_of_capital = r(Math.min(remaining, totalEquity));
  const rocLP = r(return_of_capital * lpPct);
  const rocGP = r(return_of_capital - rocLP);
  totalToLP += rocLP;
  totalToGP += rocGP;
  remaining = r(remaining - return_of_capital);

  const preferred_return_amount_target = r(totalEquity * input.preferred_return);
  const preferred_return_amount = r(Math.min(remaining, preferred_return_amount_target));
  totalToLP += preferred_return_amount;
  remaining = r(remaining - preferred_return_amount);

  const preferred_return_shortfall = r(Math.max(0, preferred_return_amount_target - preferred_return_amount));

  let catch_up_amount = 0;
  if (input.catch_up_rate !== undefined && input.catch_up_rate > 0 && remaining > 0) {
    const catchUpTarget = input.catch_up_to_gp_pct ?? DEFAULT_GP_CATCH_UP_TARGET_PCT;
    const totalDistributedSoFar = totalToLP + totalToGP;
    const gpTarget = catchUpTarget >= 1
      ? totalDistributedSoFar + remaining
      : r(totalDistributedSoFar * catchUpTarget / (1 - catchUpTarget));
    const gpShortfall = r(Math.max(0, gpTarget - totalToGP));
    catch_up_amount = r(Math.min(remaining, gpShortfall));
    const catchGP = r(catch_up_amount * input.catch_up_rate);
    const catchLP = r(catch_up_amount - catchGP);
    totalToGP += catchGP;
    totalToLP += catchLP;
    remaining = r(remaining - catch_up_amount);
  }

  const tier_results: WaterfallTierResult[] = [];
  for (const tier of input.tiers) {
    if (remaining <= 0) {
      tier_results.push({
        label: tier.label,
        hurdle_irr: tier.hurdle_irr,
        lp_split: tier.lp_split,
        gp_split: tier.gp_split,
        amount_distributed: 0,
        lp_amount: 0,
        gp_amount: 0,
      });
      continue;
    }

    const amount = r(remaining);
    const lpAmt = r(amount * tier.lp_split);
    const gpAmt = r(amount * tier.gp_split);
    totalToLP += lpAmt;
    totalToGP += gpAmt;
    remaining = r(remaining - amount);

    tier_results.push({
      label: tier.label,
      hurdle_irr: tier.hurdle_irr,
      lp_split: tier.lp_split,
      gp_split: tier.gp_split,
      amount_distributed: amount,
      lp_amount: lpAmt,
      gp_amount: gpAmt,
    });
  }

  const lp_multiple = input.lp_equity > 0 ? ratio(totalToLP / input.lp_equity) : 0;
  const gp_multiple = input.gp_equity > 0 ? ratio(totalToGP / input.gp_equity) : 0;

  const totalDist = totalToLP + totalToGP;
  const lp_irr_share = totalDist > 0 ? ratio(totalToLP / totalDist) : 0;
  const gp_irr_share = totalDist > 0 ? ratio(totalToGP / totalDist) : 0;

  return {
    total_distributable: totalDistributable,
    return_of_capital,
    preferred_return_amount,
    preferred_return_shortfall,
    catch_up_amount,
    tier_results,
    total_to_lp: r(totalToLP),
    total_to_gp: r(totalToGP),
    lp_multiple,
    gp_multiple,
    lp_irr_share,
    gp_irr_share,
    residual_undistributed: r(remaining),
  };
}
