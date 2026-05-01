import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { computeDSCR } from "../../calc/financing/dscr-calculator";
import { computeSensitivity } from "../../calc/financing/sensitivity";
import { computeDebtYield } from "../../calc/financing/debt-yield";
import { computePrepayment } from "../../calc/financing/prepayment";
import { DEFAULT_ROUNDING } from "../../calc/shared/utils";
import { getMarketIntelligenceAggregator } from "../services/MarketIntelligenceAggregator";
import { logger } from "../logger";

const dscrSchema = z.object({
  noi_annual: z.number(),
  interest_rate_annual: z.number().min(0),
  term_months: z.number().int().min(1),
  amortization_months: z.number().int().min(1),
  io_months: z.number().int().min(0).optional(),
  min_dscr: z.number().gt(0),
  purchase_price: z.number().gt(0).optional(),
  ltv_max: z.number().gt(0).lte(1).optional(),
  location: z.string().optional(),
});

const sensitivitySchema = z.object({
  noi_annual: z.number(),
  loan_amount: z.number().gt(0),
  interest_rate_annual: z.number().min(0),
  amortization_months: z.number().int().min(1),
  term_months: z.number().int().min(1),
  io_months: z.number().int().min(0).optional(),
  rate_shocks_bps: z.array(z.number()).optional(),
  noi_shocks_pct: z.array(z.number()).optional(),
  min_dscr: z.number().gt(0),
  location: z.string().optional(),
});

const debtYieldSchema = z.object({
  noi_annual: z.number(),
  loan_amount: z.number().optional(),
  min_debt_yield: z.number().gt(0).optional(),
  purchase_price: z.number().gt(0).optional(),
  ltv_max: z.number().gt(0).lte(1).optional(),
}).passthrough();

const prepaymentSchema = z.object({
  outstanding_balance: z.number().gt(0).optional(),
  prepayment_month: z.number().int().min(0).optional(),
  loan_rate_annual: z.number().min(0),
  term_months: z.number().int().min(1),
  prepayment_type: z.enum(["yield_maintenance", "defeasance", "step_down"]),
  treasury_rate_annual: z.number().min(0).optional(),
  step_down_schedule: z.array(z.number()).optional(),
  defeasance_fee_pct: z.number().min(0).optional(),
}).passthrough();

export function register(app: Express) {
  const aggregator = getMarketIntelligenceAggregator();

  app.post("/api/financing/dscr", requireAuth, async (req: Request, res: Response) => {
    const parsed = dscrSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const { noi_annual, interest_rate_annual, term_months, amortization_months, io_months, min_dscr, purchase_price, ltv_max, location } = parsed.data;

      let effectiveRate = interest_rate_annual;
      let riskPremiumApplied: number | null = null;

      if (location && aggregator.getServiceStatus().moodys) {
        try {
          const intel = await aggregator.gather({ location });
          const premiumBps = intel.moodys?.riskPremiumBps?.value;
          if (premiumBps && premiumBps > 0) {
            riskPremiumApplied = premiumBps;
            effectiveRate = interest_rate_annual + premiumBps / 10000;
          }
        } catch (err: unknown) { logger.warn(`Moody's risk premium lookup failed: ${err instanceof Error ? err.message : err}`, "financing"); }
      }

      const result = computeDSCR({
        noi_annual,
        interest_rate_annual: effectiveRate,
        term_months,
        amortization_months,
        io_months: io_months ?? 0,
        min_dscr,
        purchase_price,
        ltv_max,
        rounding_policy: DEFAULT_ROUNDING,
      });

      res.json({
        ...result,
        risk_premium_bps: riskPremiumApplied,
        effective_rate: effectiveRate,
        base_rate: interest_rate_annual,
      });
    } catch (err: unknown) {
      logger.error(`DSCR calculation failed: ${err instanceof Error ? err.message : err}`, "financing");
      res.status(500).json({ error: "DSCR calculation failed" });
    }
  });

  app.post("/api/financing/sensitivity", requireAuth, async (req: Request, res: Response) => {
    const parsed = sensitivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const { noi_annual, loan_amount, interest_rate_annual, amortization_months, term_months, io_months, rate_shocks_bps, noi_shocks_pct, min_dscr, location } = parsed.data;

      let effectiveRate = interest_rate_annual;
      let riskPremiumApplied: number | null = null;

      if (location && aggregator.getServiceStatus().moodys) {
        try {
          const intel = await aggregator.gather({ location });
          const premiumBps = intel.moodys?.riskPremiumBps?.value;
          if (premiumBps && premiumBps > 0) {
            riskPremiumApplied = premiumBps;
            effectiveRate = interest_rate_annual + premiumBps / 10000;
          }
        } catch (err: unknown) { logger.warn(`Moody's risk premium lookup failed: ${err instanceof Error ? err.message : err}`, "financing"); }
      }

      const result = computeSensitivity({
        noi_annual,
        loan_amount,
        interest_rate_annual: effectiveRate,
        amortization_months,
        term_months,
        io_months: io_months ?? 0,
        rate_shocks_bps: rate_shocks_bps || [-200, -100, 0, 100, 200],
        noi_shocks_pct: noi_shocks_pct || [-20, -10, 0, 10, 20],
        min_dscr,
        rounding_policy: DEFAULT_ROUNDING,
      });

      res.json({
        ...result,
        risk_premium_bps: riskPremiumApplied,
        effective_rate: effectiveRate,
        base_rate: interest_rate_annual,
      });
    } catch (err: unknown) {
      logger.error(`Sensitivity analysis failed: ${err instanceof Error ? err.message : err}`, "financing");
      res.status(500).json({ error: "Sensitivity analysis failed" });
    }
  });

  app.post("/api/financing/debt-yield", requireAuth, async (req: Request, res: Response) => {
    const parsed = debtYieldSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = computeDebtYield({
        ...parsed.data,
        rounding_policy: DEFAULT_ROUNDING,
      });
      res.json(result);
    } catch (err: unknown) {
      logger.error(`Debt yield calculation failed: ${err instanceof Error ? err.message : err}`, "financing");
      res.status(500).json({ error: "Debt yield calculation failed" });
    }
  });

  app.post("/api/financing/prepayment", requireAuth, async (req: Request, res: Response) => {
    const parsed = prepaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = computePrepayment({
        ...parsed.data,
        rounding_policy: DEFAULT_ROUNDING,
      });
      res.json(result);
    } catch (err: unknown) {
      logger.error(`Prepayment calculation failed: ${err instanceof Error ? err.message : err}`, "financing");
      res.status(500).json({ error: "Prepayment calculation failed" });
    }
  });
}
