export const DOCUMENT_TYPES = [
  "general",
  "p-and-l",
  "appraisal",
  "str-report",
  "operating-budget",
  "insurance-quote",
  "tax-bill",
  "loi",
  "management-agreement",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  general: "General",
  "p-and-l": "P&L",
  appraisal: "Appraisal",
  "str-report": "STR Report",
  "operating-budget": "Operating Budget",
  "insurance-quote": "Insurance Quote",
  "tax-bill": "Tax Bill",
  loi: "LOI",
  "management-agreement": "Management Agreement",
  other: "Other",
};

export function classifyDocumentType(fileName: string): DocumentType {
  const lower = fileName.toLowerCase();
  if (/p[\s&_-]*l\b|profit[\s_-]*loss|income[\s_-]*statement|\bpnl\b/.test(lower)) return "p-and-l";
  if (/\bapprais|\bvaluation/.test(lower)) return "appraisal";
  if (/\bstr[\s_-]report|\bairdna|\brevpar/.test(lower)) return "str-report";
  if (/\bbudget|\boperating/.test(lower)) return "operating-budget";
  if (/\binsur/.test(lower)) return "insurance-quote";
  if (/\btax/.test(lower)) return "tax-bill";
  if (/\bloi\b|letter[\s_-]*of[\s_-]*intent/.test(lower)) return "loi";
  if (/\bmgmt|\bmanagement[\s_-]*agree/.test(lower)) return "management-agreement";
  return "general";
}
