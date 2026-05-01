/**
 * CompanySpecialistOutputSchema — Zod schema for Opus's structured response
 * to the Company Specialist synthesis prompt (Phase 2 of P7-B).
 *
 * Four dimensions, all fraction values (0.04–0.22). Enforces low ≤ mid ≤ high
 * and basic sanity bounds (values must be positive fractions ≤ 2 to catch
 * accidental percentage-vs-fraction emission from the model).
 */

import { z } from "zod";
import { COMPANY_DIMENSION_KEYS } from "./mgmt-co-company-prompt-input-builder";

export const CompanyDimensionOutputSchema = z
  .object({
    key: z.enum(COMPANY_DIMENSION_KEYS),
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    conviction: z.enum(["high", "moderate", "developing"]),
    reasoning: z
      .string()
      .min(20, "reasoning too thin — must reference user's specific inputs (>=20 chars)")
      .max(500, "reasoning too verbose — keep to one tight paragraph (<=500 chars)"),
    evidenceRefs: z.array(z.number().int()),
  })
  .refine((d) => d.low <= d.mid && d.mid <= d.high, {
    message: "range must satisfy low <= mid <= high",
    path: ["low"],
  })
  .refine((d) => d.low >= 0 && d.high <= 2, {
    message: "values must be fractions (0–2 range); do not emit percentages",
    path: ["high"],
  });

export type CompanyDimensionOutput = z.infer<typeof CompanyDimensionOutputSchema>;

export const CompanySpecialistOutputSchema = z
  .object({
    dimensions: z.array(CompanyDimensionOutputSchema),
    overallNarrative: z
      .string()
      .min(50)
      .max(800)
      .optional(),
  })
  .refine(
    (output) => {
      const seen = new Set<string>();
      for (const d of output.dimensions) {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
      }
      return seen.size === COMPANY_DIMENSION_KEYS.length;
    },
    {
      message:
        "dimensions must cover all 4 company keys exactly once (no duplicates, no omissions)",
      path: ["dimensions"],
    },
  );

export type CompanySpecialistOutput = z.infer<typeof CompanySpecialistOutputSchema>;
