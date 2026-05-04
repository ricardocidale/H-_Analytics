/**
 * slot-output-validator.ts
 *
 * Validates LLM-returned values against the character-limit and count
 * constants exported from @shared/deck-payload-v2. Any over-budget field is
 * rejected with a clear error — never silently truncated.
 *
 * Wire this into draftSlot() so over-budget LLM output surfaces as an
 * actionable error before it reaches the admin editor.
 */

import {
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
  SLIDE3_CONCEPT_PARAGRAPH_MAX,
  SLIDE3_MARKET_RATIONALE_MAX,
  SLIDE3_REASON_LABEL_MAX,
  SLIDE3_REASON_DETAIL_MAX,
  SLIDE3_REASONS_COUNT,
  SLIDE3_CLOSING_LINE_MAX,
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
} from "@shared/deck-payload-v2";
import type { DraftSlotKey } from "./slot-context-map";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

type SlotValue = {
  "slide1.headerSubtitle": { text: string };
  "slide1.visionBullets": { bullets: Array<{ text: string }> };
  "slide2.operationalModelText": { text: string };
  "slide2.revenueBullet": { text: string };
  "slide2.programmingBullet": { text: string };
  "slide3.conceptParagraph": { text: string };
  "slide3.marketRationale": { text: string };
  "slide3.reasons": { reasons: Array<{ label: string; detail: string }> };
  "slide3.closingLine": { text: string };
  "slide5.transformationDescription": { text: string };
  "slide5.transformationRows": {
    rows: Array<{ feature: string; existing: string; proposed: string }>;
  };
};

function checkString(label: string, value: unknown, max: number): string[] {
  const errors: string[] = [];
  if (typeof value !== "string") {
    errors.push(`${label}: expected string, got ${typeof value}`);
    return errors;
  }
  if (value.length > max) {
    errors.push(
      `${label}: ${value.length} chars exceeds budget of ${max} (over by ${value.length - max})`,
    );
  }
  return errors;
}

function checkArray<T>(
  label: string,
  value: unknown,
  maxCount: number,
  itemChecker: (item: unknown, idx: number) => string[],
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    errors.push(`${label}: expected array, got ${typeof value}`);
    return errors;
  }
  if (value.length > maxCount) {
    errors.push(`${label}: ${value.length} items exceeds max count of ${maxCount}`);
  }
  for (let i = 0; i < value.length; i++) {
    errors.push(...itemChecker(value[i], i));
  }
  return errors;
}

/**
 * Validate a slot's LLM output against the canonical character budgets.
 * Returns `{ ok: true, value }` when all constraints pass, or
 * `{ ok: false, errors }` with a descriptive error per violated constraint.
 */
export function validateSlotOutput<K extends DraftSlotKey>(
  slot: K,
  value: unknown,
): ValidationResult<SlotValue[K]> {
  const errors: string[] = [];

  switch (slot) {
    case "slide1.headerSubtitle": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE1_HEADER_SUBTITLE_MAX));
      break;
    }
    case "slide1.visionBullets": {
      const v = value as { bullets?: unknown };
      errors.push(
        ...checkArray("bullets", v?.bullets, SLIDE1_VISION_BULLETS_COUNT, (item, i) =>
          checkString(`bullets[${i}].text`, (item as { text?: unknown })?.text, SLIDE1_VISION_BULLET_MAX),
        ),
      );
      break;
    }
    case "slide2.operationalModelText": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE2_OPERATIONAL_MODEL_MAX));
      break;
    }
    case "slide2.revenueBullet": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE2_REVENUE_BULLET_MAX));
      break;
    }
    case "slide2.programmingBullet": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE2_PROGRAMMING_BULLET_MAX));
      break;
    }
    case "slide3.conceptParagraph": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE3_CONCEPT_PARAGRAPH_MAX));
      break;
    }
    case "slide3.marketRationale": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE3_MARKET_RATIONALE_MAX));
      break;
    }
    case "slide3.reasons": {
      const v = value as { reasons?: unknown };
      errors.push(
        ...checkArray("reasons", v?.reasons, SLIDE3_REASONS_COUNT, (item, i) => {
          const r = item as { label?: unknown; detail?: unknown };
          return [
            ...checkString(`reasons[${i}].label`, r?.label, SLIDE3_REASON_LABEL_MAX),
            ...checkString(`reasons[${i}].detail`, r?.detail, SLIDE3_REASON_DETAIL_MAX),
          ];
        }),
      );
      break;
    }
    case "slide3.closingLine": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE3_CLOSING_LINE_MAX));
      break;
    }
    case "slide5.transformationDescription": {
      const v = value as { text?: unknown };
      errors.push(...checkString("text", v?.text, SLIDE5_TRANSFORMATION_DESCRIPTION_MAX));
      break;
    }
    case "slide5.transformationRows": {
      const v = value as { rows?: unknown };
      errors.push(
        ...checkArray("rows", v?.rows, SLIDE5_TRANSFORMATION_ROWS_COUNT, (item, i) => {
          const r = item as { feature?: unknown; existing?: unknown; proposed?: unknown };
          return [
            ...checkString(`rows[${i}].feature`, r?.feature, SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX),
            ...checkString(`rows[${i}].existing`, r?.existing, SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX),
            ...checkString(`rows[${i}].proposed`, r?.proposed, SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX),
          ];
        }),
      );
      break;
    }
    default: {
      errors.push(`Unknown slot: ${slot}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: value as SlotValue[K] };
}
