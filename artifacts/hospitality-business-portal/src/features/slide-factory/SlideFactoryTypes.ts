// ── Types ───────────────────────────────────────────────────────────────────

// Mirrors SlideAgentResult from lib/db/src/schema/slide-factory-runs.ts
export interface SlideAgentResultFE {
  status: "pending" | "running" | "approved" | "rejected";
  pixelDiffPct: number | null;
  mayaVerdict: "ok" | "advisory" | "warning" | "block" | null;
  mayaNotes: string | null;
  approvedAt: string | null;
  errorMessage: string | null;
}

export type FactoryStatus =
  | "new"
  | "brief_ready"
  | "ingesting"
  | "ingested"
  | "drafting"
  | "draft_review"
  | "building"
  | "complete"
  | "rebuilding"
  | "error";

export type FactoryTab =
  | "f-brief"
  | "f-lorenzo"
  | "f-properties"
  | "f-lucca"
  | "f-agents"
  | "f-download";

export interface VerificationFinding {
  slideNumber: number;
  severity: "ok" | "advisory" | "warning" | "block";
  category: "text_cutoff" | "placeholder" | "readability" | "layout" | "consistency" | "data_quality";
  description: string;
}

export interface SlideFactoryRun {
  id: number;
  userId: number;
  status: FactoryStatus;
  briefR2Key: string | null;
  briefFilename: string | null;
  briefAccepted: boolean;
  canonicalSpec: unknown | null;
  canonicalPngKeys: string[] | null;
  slide1PropertyId: number | null;
  slide2PropertyId: number | null;
  slide3PropertyId: number | null;
  slide5PropertyId: number | null;
  luccaDraft: Record<string, LuccaSlotDraft> | null;
  agentResults: Record<string, SlideAgentResultFE> | null;
  deckR2Key: string | null;
  pptxR2Key: string | null;
  pdfR2Key: string | null;
  wishListLog: unknown[] | null;
  slotContentHashes: unknown | null;
  verificationStatus: "running" | "passed" | "failed" | "error" | null;
  verificationLog: VerificationFinding[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LuccaSlotDraft {
  value: string;
  approved: boolean;
  approvedAt: string | null;
  source: "lucca" | "admin" | "admin-override";
}

// Front-end view of LorenzoCanonicalSpec stored in canonicalSpec JSONB.
// Only the fields Tab 2 needs to display — not the full spec shape.
export interface LorenzoFrontendSpec {
  schemaVersion: string;
  documentType: string;
  slideCount: number;
  blocksBySlide: Array<Array<{ variableBinding: string | null }>>;
  inspectorApproved: boolean;
  inspectorNotes: string | null;
}

export interface Property {
  id: number;
  name: string;
  city?: string;
  stateProvince?: string;
}

export type DinoVerdict = "pass" | "warn" | "fail";

export type StepStatus = "complete" | "running" | "waiting";

// ── Upload state ─────────────────────────────────────────────────────────────

export type UploadStage = "idle" | "uploading" | "done" | "error";
export interface UploadState {
  stage: UploadStage;
  file: File | null;
  error: string | null;
}

// ── Tab 4 — Lucca slot row props ────────────────────────────────────────────

export interface SlotRowProps {
  slotKey: string;
  draft: LuccaSlotDraft;
  onApprove: (key: string, approved: boolean) => Promise<void>;
  onSaveValue: (key: string, value: string) => Promise<void>;
  disabled: boolean;
}

// ── Tab 6 — Override slot config ────────────────────────────────────────────

export interface SlotConfig {
  key: string;
  label: string;
  hint: string;
  multiline?: boolean;
  type?: "text" | "photo";
}
