import { useProcessingCardStore } from "@/lib/processing-card";
import type { ProcessingCardJob } from "@/lib/processing-card";

export type { ProcessingCardJob };

export const ANALYST_CAPTIONS: string[] = [
  "Studying market trends and comparable properties…",
  "Cross-referencing industry benchmarks…",
  "Analyzing revenue comparables in your market…",
  "Computing occupancy rate adjustments…",
  "Synthesizing operational cost assumptions…",
  "Validating GOP margin projections…",
  "Pulling current macro rates from FRED…",
  "Forming a view on your assumptions…",
];

export function useProcessingCard() {
  const { spawn, update, dismiss } = useProcessingCardStore();
  return { spawn, update, dismiss, ANALYST_CAPTIONS };
}
