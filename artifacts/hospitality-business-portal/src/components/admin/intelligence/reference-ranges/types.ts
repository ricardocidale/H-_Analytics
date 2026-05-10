/**
 * Shared types for the ReferenceRangesTab component split.
 *
 * Extracted from `../ReferenceRangesTab.tsx` (task-1360) without behavior
 * changes — these mirror the original local types byte-for-byte.
 */
import type {
  ReferenceRangeDomain,
  ReferenceRangeConfidence,
} from "@shared/schema/reference-range";

export type ReferenceRangeRow = {
  id: number;
  domain: string;
  metricKey: string;
  label: string;
  country: string;
  subdivision: string | null;
  market: string | null;
  segment: string | null;
  propertyType: string | null;
  year: number;
  low: number;
  mid: number;
  high: number;
  unit: string;
  sourceId: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  methodology: string | null;
  confidence: string;
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacetsResponse = {
  domains: { value: string; count: number }[];
  countries: { value: string; count: number }[];
  years: { value: number; count: number }[];
  totalActive: number;
  totalArchived: number;
};

// ── Form payload shared by create + edit dialogs ──────────────────────
// Strings on the form, converted to typed values at submit time. Optional
// text fields stay empty-string in the form and are converted to `null`
// (not `undefined`) when sent to the server, matching the storage layer's
// nullable contract.
export type FormState = {
  domain: ReferenceRangeDomain;
  metricKey: string;
  label: string;
  country: string;
  subdivision: string;
  market: string;
  segment: string;
  propertyType: string;
  year: string;
  low: string;
  mid: string;
  high: string;
  unit: string;
  confidence: ReferenceRangeConfidence;
  sourceName: string;
  sourceUrl: string;
  methodology: string;
};

export type DialogMode =
  | null
  | { kind: "create" }
  | { kind: "edit"; row: ReferenceRangeRow };
