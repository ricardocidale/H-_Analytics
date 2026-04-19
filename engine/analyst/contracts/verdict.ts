/**
 * AnalystVerdict — the frozen unified contract every Surface Specialist returns.
 *
 * Spec: docs/architecture/analyst/verdict-contract.md
 * Rule: .claude/rules/analyst-verdict-contract.md (binding post-Phase-3)
 * ADR:  docs/architecture/decisions/ADR-003-analyst-verdict-contract.md
 *
 * Invariants (all Zod-enforced at builder time):
 *   - A non-"ok" dimension carrying a range must have qualityScore >= CONVICTION_FLOOR.
 *   - A non-"ok" dimension on a numeric field must carry a range.
 *   - Every dimension has at least MIN_SOURCES_FOR_ADVICE evidence entries.
 *   - overallSeverity is the max across dimensions.
 *   - overallQualityScore is computed, not declared.
 *   - Tier-1 verdicts require cognitiveRunId and >= 3 evidence across all dimensions.
 *
 * This file is the only place that types `voice.headline` / `voice.detail` as
 * `VoiceRenderedString`. Specialists construct RawVerdictDimension; the Router
 * pairs with Voice Renderer to promote them to rendered VerdictDimension.
 */

import { z } from "zod";
import {
  CONVICTION_FLOOR,
  MIN_SOURCES_FOR_ADVICE,
  TIER_1_MIN_TOTAL_EVIDENCE,
} from "@shared/analyst-conviction";

// ────────────────────────────────────────────────────────────────────────────
// Severity
// ────────────────────────────────────────────────────────────────────────────

export const SEVERITY_VALUES = ["ok", "advisory", "warning", "block"] as const;
export type Severity = typeof SEVERITY_VALUES[number];
export const SeveritySchema = z.enum(SEVERITY_VALUES);

const SEVERITY_RANK: Record<Severity, number> = {
  ok: 0,
  advisory: 1,
  warning: 2,
  block: 3,
};

export function severityMax(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function severityMaxOf(severities: readonly Severity[]): Severity {
  return severities.reduce<Severity>((acc, s) => severityMax(acc, s), "ok");
}

/**
 * Mapping from the legacy engine/watchdog WatchdogSeverity 3-tier to the new
 * 4-tier Severity. Used by Phase 3b backfill. "block" is new and reserved for
 * hard-stop verdicts that land in Phase 4.
 *
 *   "ok"    → "ok"
 *   "warn"  → "advisory"
 *   "alert" → "warning"
 */
export type LegacyWatchdogSeverity = "ok" | "warn" | "alert";
export function fromLegacySeverity(s: LegacyWatchdogSeverity): Severity {
  if (s === "alert") return "warning";
  if (s === "warn") return "advisory";
  return "ok";
}

// ────────────────────────────────────────────────────────────────────────────
// Evidence
// ────────────────────────────────────────────────────────────────────────────

export const EVIDENCE_TIERS = ["db_table", "api", "web", "estimated"] as const;
export type EvidenceTier = typeof EVIDENCE_TIERS[number];

export const EvidenceSchema = z.object({
  source: z.string().min(1),
  tier: z.enum(EVIDENCE_TIERS),
  asOf: z.string().min(1),
  url: z.string().optional(),
  personaFit: z.number().min(0).max(1),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Range
// ────────────────────────────────────────────────────────────────────────────

export const VerdictRangeSchema = z
  .object({
    low: z.number().finite(),
    mid: z.number().finite(),
    high: z.number().finite(),
    unit: z.string().min(1),
  })
  .refine((r) => r.low <= r.mid && r.mid <= r.high, {
    message: "VerdictRange requires low <= mid <= high",
  })
  .refine((r) => r.low <= r.high, {
    message: "VerdictRange requires low <= high",
  });
export type VerdictRange = z.infer<typeof VerdictRangeSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Actions (discriminated union by kind)
// ────────────────────────────────────────────────────────────────────────────

export const ACTION_KINDS = [
  "consult-cognitive",
  "accept-range",
  "set-value",
  "open-admin",
  "view-source",
  "dismiss",
] as const;
export type VerdictActionKind = typeof ACTION_KINDS[number];

export const VerdictActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("consult-cognitive"),
    label: z.string().min(1),
    payload: z.object({ field: z.string().min(1), reason: z.string().min(1) }),
  }),
  z.object({
    kind: z.literal("accept-range"),
    label: z.string().min(1),
    payload: z.object({ field: z.string().min(1), range: VerdictRangeSchema }),
  }),
  z.object({
    kind: z.literal("set-value"),
    label: z.string().min(1),
    payload: z.object({ field: z.string().min(1), value: z.number().finite() }),
  }),
  z.object({
    kind: z.literal("open-admin"),
    label: z.string().min(1),
    payload: z.object({
      tableName: z.string().min(1),
      rowId: z.union([z.string(), z.number()]).optional(),
    }),
  }),
  z.object({
    kind: z.literal("view-source"),
    label: z.string().min(1),
    payload: z.object({ url: z.string().min(1), sourceName: z.string().min(1) }),
  }),
  z.object({
    kind: z.literal("dismiss"),
    label: z.string().min(1),
    payload: z.undefined().optional(),
  }),
]);
export type VerdictAction = z.infer<typeof VerdictActionSchema>;

/**
 * Legacy WatchdogActionKind mapping guidance (reference only; actual
 * conversion is implemented by Phase 3b in the funding/revenue specialist
 * backfill, not here):
 *   "adjust"       → "set-value" (with field + suggested value)
 *   "save_anyway"  → "accept-range" (with synthetic accept of current value)
 *   "ack"          → "dismiss"
 */

// ────────────────────────────────────────────────────────────────────────────
// Voice (branded output — only Voice Renderer may construct these)
// ────────────────────────────────────────────────────────────────────────────

declare const VoiceRendered: unique symbol;
export type VoiceRenderedString = string & { readonly [VoiceRendered]: true };

/**
 * Internal helper. Only voice-renderer.ts should import this. The brand
 * prevents Specialists from casting raw strings into VoiceRenderedString by
 * accident — they would need to import this explicit function and the naming
 * makes the intent obvious in review.
 */
export function __castVoiceRendered(s: string): VoiceRenderedString {
  return s as VoiceRenderedString;
}

export const VoiceBlockSchema = z.object({
  headline: z.string().min(1),
  detail: z.string().min(1).optional(),
});

export interface VoiceBlock {
  headline: VoiceRenderedString;
  detail?: VoiceRenderedString;
}

// ────────────────────────────────────────────────────────────────────────────
// Voice intent (Specialist-authored, drives renderer tone)
// ────────────────────────────────────────────────────────────────────────────

export const VOICE_INTENTS = [
  "above-range",
  "below-range",
  "within-range",
  "missing-data",
  "block",
] as const;
export type VoiceIntent = typeof VOICE_INTENTS[number];
export const VoiceIntentSchema = z.enum(VOICE_INTENTS);

// ────────────────────────────────────────────────────────────────────────────
// Persona context
// ────────────────────────────────────────────────────────────────────────────

export const PersonaContextSchema = z.object({
  segment: z.string().min(1),
  tier: z.string().min(1),
  market: z.string().min(1),
});
export type PersonaContext = z.infer<typeof PersonaContextSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Cross-surface signal
// ────────────────────────────────────────────────────────────────────────────

export const CrossSurfaceSignalSchema = z.object({
  needsCrossPortfolio: z.boolean().optional(),
  needsAdminDefaults: z.boolean().optional(),
  reason: z.string().min(1),
});
export type CrossSurfaceSignal = z.infer<typeof CrossSurfaceSignalSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Raw dimension (Specialist-authored; pre-voice)
// ────────────────────────────────────────────────────────────────────────────

export const RawVerdictDimensionSchema = z.object({
  field: z.string().min(1),
  isNumericField: z.boolean(),
  severity: SeveritySchema,
  range: VerdictRangeSchema.nullable(),
  qualityScore: z.number().min(0).max(100),
  evidence: z.array(EvidenceSchema),
  intent: VoiceIntentSchema,
  actions: z.array(VerdictActionSchema),
  crossSurface: CrossSurfaceSignalSchema.optional(),
});
export type RawVerdictDimension = z.infer<typeof RawVerdictDimensionSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Rendered dimension (Voice Renderer populates voice)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Runtime schema for VerdictDimension. Note: we validate voice as a plain
 * string schema (VoiceBlockSchema) since Zod cannot enforce branded types at
 * runtime — the brand is a compile-time guarantee that only the renderer
 * can construct VoiceRenderedString values.
 */
export const VerdictDimensionSchema = z
  .object({
    field: z.string().min(1),
    isNumericField: z.boolean(),
    severity: SeveritySchema,
    range: VerdictRangeSchema.nullable(),
    qualityScore: z.number().min(0).max(100),
    evidence: z.array(EvidenceSchema).min(MIN_SOURCES_FOR_ADVICE),
    voice: VoiceBlockSchema,
    actions: z.array(VerdictActionSchema),
    crossSurface: CrossSurfaceSignalSchema.optional(),
  })
  .refine(
    (d) => d.severity === "ok" || !d.isNumericField || d.range !== null,
    { message: "Non-ok verdicts on numeric fields must carry a range" },
  )
  .refine(
    (d) => d.severity === "ok" || d.range === null || d.qualityScore >= CONVICTION_FLOOR,
    {
      message: `Non-ok verdicts with a range must have qualityScore >= CONVICTION_FLOOR (${CONVICTION_FLOOR})`,
    },
  );
export type VerdictDimension = Omit<
  z.infer<typeof VerdictDimensionSchema>,
  "voice"
> & { voice: VoiceBlock };

// ────────────────────────────────────────────────────────────────────────────
// AnalystVerdict (top-level)
// ────────────────────────────────────────────────────────────────────────────

export const VERDICT_TIERS = [0, 1] as const;
export type VerdictTier = typeof VERDICT_TIERS[number];

export const AnalystVerdictMetaSchema = z.object({
  tier: z.union([z.literal(0), z.literal(1)]),
  durationMs: z.number().min(0).finite(),
  cognitiveRunId: z.string().optional(),
});
export type AnalystVerdictMeta = z.infer<typeof AnalystVerdictMetaSchema>;

export const AnalystVerdictSchema = z
  .object({
    specialistId: z.string().min(1),
    generatedAt: z.string().min(1),
    overallSeverity: SeveritySchema,
    overallQualityScore: z.number().min(0).max(100),
    dimensions: z.array(VerdictDimensionSchema).min(1),
    voice: VoiceBlockSchema,
    meta: AnalystVerdictMetaSchema,
  })
  .refine(
    (v) => v.overallSeverity === severityMaxOf(v.dimensions.map((d) => d.severity)),
    { message: "overallSeverity must equal max(dimensions.severity)" },
  )
  .refine(
    (v) => v.meta.tier !== 1 || (v.meta.cognitiveRunId !== undefined && v.meta.cognitiveRunId.length > 0),
    { message: "Tier-1 verdicts require meta.cognitiveRunId" },
  )
  .refine(
    (v) =>
      v.meta.tier !== 1 ||
      v.dimensions.reduce((acc, d) => acc + d.evidence.length, 0) >= TIER_1_MIN_TOTAL_EVIDENCE,
    {
      message: `Tier-1 verdicts require >= ${TIER_1_MIN_TOTAL_EVIDENCE} total evidence entries across dimensions (N+1 rule)`,
    },
  );
export type AnalystVerdict = Omit<
  z.infer<typeof AnalystVerdictSchema>,
  "dimensions" | "voice"
> & {
  dimensions: VerdictDimension[];
  voice: VoiceBlock;
};

// ────────────────────────────────────────────────────────────────────────────
// Overall quality computation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-severity weights used by computeOverallQuality. A worse severity pulls
 * the surface-level score harder than an "ok" one — the overall score should
 * reflect worst-case dimensions more heavily. Calibrated against persona-keyed
 * test bench (see ADR-003).
 */
export const SEVERITY_QUALITY_WEIGHTS: Record<Severity, number> = {
  ok: 1,
  advisory: 1.25,
  warning: 1.5,
  block: 2,
};

/**
 * Weighted average of dimension qualityScores using SEVERITY_QUALITY_WEIGHTS.
 */
export function computeOverallQuality(dimensions: readonly VerdictDimension[]): number {
  if (dimensions.length === 0) return 0;
  let weightSum = 0;
  let scoreSum = 0;
  for (const d of dimensions) {
    const w = SEVERITY_QUALITY_WEIGHTS[d.severity];
    weightSum += w;
    scoreSum += d.qualityScore * w;
  }
  return weightSum === 0 ? 0 : Math.round(scoreSum / weightSum);
}

// ────────────────────────────────────────────────────────────────────────────
// Builder
// ────────────────────────────────────────────────────────────────────────────

export interface AnalystVerdictBuilderInputs {
  specialistId: string;
  dimensions: VerdictDimension[];
  surfaceVoice: VoiceBlock;
  meta: AnalystVerdictMeta;
  /** Override the generatedAt timestamp (tests use a fixed ISO string for determinism). */
  generatedAt?: string;
}

export class InvalidVerdictError extends Error {
  readonly cause: z.ZodError;
  constructor(zodErr: z.ZodError) {
    super(`AnalystVerdict validation failed:\n${zodErr.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")}`);
    this.name = "InvalidVerdictError";
    this.cause = zodErr;
  }
}

/**
 * Constructs and validates an AnalystVerdict. Throws InvalidVerdictError if
 * any invariant fails. Specialists, the Router, and any test fixture should
 * use this instead of constructing the object directly.
 */
export function buildAnalystVerdict(inputs: AnalystVerdictBuilderInputs): AnalystVerdict {
  const overallSeverity = severityMaxOf(inputs.dimensions.map((d) => d.severity));
  const overallQualityScore = computeOverallQuality(inputs.dimensions);
  const generatedAt = inputs.generatedAt ?? new Date().toISOString();

  const candidate = {
    specialistId: inputs.specialistId,
    generatedAt,
    overallSeverity,
    overallQualityScore,
    dimensions: inputs.dimensions,
    voice: inputs.surfaceVoice,
    meta: inputs.meta,
  };

  const parsed = AnalystVerdictSchema.safeParse(candidate);
  if (!parsed.success) throw new InvalidVerdictError(parsed.error);
  return candidate as AnalystVerdict;
}
