import type {
  DinoVerdict,
  FactoryStatus,
  FactoryTab,
  SlideAgentResultFE,
  SlotConfig,
  UploadState,
} from "./SlideFactoryTypes";

// ── Constants ───────────────────────────────────────────────────────────────

export const FACTORY_POLL_MS = 5_000;
/** Milliseconds per second — used to convert Date arithmetic to seconds */
export const MS_PER_SECOND = 1000;

// ── Lorenzo ingestion step timing estimates ──────────────────────────────────
// Cumulative elapsed seconds at which each pipeline step is expected to finish.
// Used to derive simulated step progress during ingestion (no server-sent events).
export const EST_ALDO_COMPLETE_S = 10;
export const EST_VISION_COMPLETE_S = 150;
export const EST_CARLO_COMPLETE_S = 152;
export const EST_INSPECTOR_COMPLETE_S = 185;
export const ACCEPTED_FILE_ACCEPT =
  ".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
export const ACCEPTED_EXTENSIONS = new Set([".pdf", ".pptx"]);
export const NONE_VALUE = "__none__";

/** Total number of slides in one LB deck (matches TOTAL_SLIDES in deck-render-constants.ts) */
export const TOTAL_DECK_SLIDES = 6;

/** Pixel-diff percentage at which Dino's verdict downgrades from pass → warn */
export const DINO_WARN_THRESHOLD_PCT = 5;
/** Pixel-diff percentage at which Dino's verdict downgrades from warn → fail */
export const DINO_FAIL_THRESHOLD_PCT = 15;

/** Decimal places shown in the compact pixel-diff badge ("4.2%"). */
export const PIXEL_DIFF_DECIMALS_BADGE = 1;
/** Decimal places shown in the tooltip hover ("4.18% pixel diff") — finer
 *  precision because the tooltip is the deliberate-inspection surface. */
export const PIXEL_DIFF_DECIMALS_TOOLTIP = 2;

export const DINO_VERDICT_CLASS: Record<DinoVerdict, string> = {
  pass: "text-emerald-700 bg-emerald-50",
  warn: "text-amber-700 bg-amber-50",
  fail: "text-red-700 bg-red-50",
};

export const DINO_VERDICT_LABEL: Record<DinoVerdict, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
};

export const MAYA_VERDICT_LABEL: Record<NonNullable<SlideAgentResultFE["mayaVerdict"]>, string> = {
  ok: "OK",
  advisory: "Advisory",
  warning: "Warning",
  block: "Block",
};

// Palette mirrors the canonical analyst severity chip colors used by
// AnalystVerdictDisplay / AnalystRangeIndicator (CLAUDE.md Intelligence Display).
// Exported so test fixtures consume the same source-of-truth as the Panel.
export const MAYA_VERDICT_CLASS: Record<NonNullable<SlideAgentResultFE["mayaVerdict"]>, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  advisory: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  block: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export const TRANSITIONING_STATUSES: ReadonlySet<FactoryStatus> = new Set([
  "ingesting",
  "drafting",
  "building",
  "rebuilding",
]);

/**
 * Visible pipeline steps — shown in the Lorenzo ingestion card.
 * These are the "named" team steps. Minions (Aldo, Carlo) run as sub-steps
 * and are surfaced only in the Technical Details collapsible.
 */
export const LORENZO_PIPELINE_STEPS = [
  {
    id: "l03",
    label: "Lorenzo-03",
    tag: "Vision",
    description: "Opus 4.7 vision enrichment — 6 slide passes",
    completeSecs: EST_VISION_COMPLETE_S,
  },
  {
    id: "l05",
    label: "Lorenzo-05",
    tag: "Inspect",
    description: "Holistic rebuild feasibility check — Opus 4.7",
    completeSecs: EST_INSPECTOR_COMPLETE_S,
  },
] as const;

/**
 * Minion steps — deterministic utilities hidden by default.
 * Shown in the Technical Details collapsible (agent-taxonomy: Minion tier).
 */
export const LORENZO_MINION_STEPS = [
  {
    id: "aldo",
    label: "Aldo",
    tag: "Extract",
    description: "PDF text extraction — word-level bounding boxes",
    completeSecs: EST_ALDO_COMPLETE_S,
  },
  {
    id: "carlo",
    label: "Carlo",
    tag: "Validate",
    description: "Zod schema validation — font metrics and types",
    completeSecs: EST_CARLO_COMPLETE_S,
  },
] as const;

export const SLOT_LABELS: Record<string, string> = {
  "slide1.headerSubtitle":          "Slide 1 — Header subtitle",
  "slide1.visionBullets":           "Slide 1 — Vision bullets",
  "slide2.operationalModelText":    "Slide 2 — Operational model",
  "slide2.revenueBullet":           "Slide 2 — Revenue bullet",
  "slide2.programmingBullet":       "Slide 2 — Programming bullet",
  "slide3.conceptParagraph":        "Slide 3 — Concept paragraph",
  "slide3.marketRationale":         "Slide 3 — Market rationale",
  "slide3.reasons":                 "Slide 3 — Investment reasons",
  "slide3.closingLine":             "Slide 3 — Closing line",
  "slide5.transformationDescription": "Slide 5 — Transformation description",
  "slide5.transformationRows":      "Slide 5 — Transformation rows",
  "slide5.transformationRows[0]":   "Slide 5 — Transformation row 1",
  "slide5.transformationRows[1]":   "Slide 5 — Transformation row 2",
  "slide5.transformationRows[2]":   "Slide 5 — Transformation row 3",
  "slide5.transformationRows[3]":   "Slide 5 — Transformation row 4",
};

export const OVERRIDE_SLOT_GROUPS: Array<{ slideLabel: string; slots: SlotConfig[] }> = [
  {
    slideLabel: "Slide 1 — Vision",
    slots: [
      { key: "slide1.headerSubtitle", label: "Tagline", hint: "", multiline: false },
      {
        key: "slide1.visionBullets",
        label: "Vision Bullets",
        hint: "One bullet per line — start each with •",
        multiline: true,
      },
    ],
  },
  {
    slideLabel: "Slide 2 — Operational Model",
    slots: [
      { key: "slide2.operationalModelText", label: "Operational Model", hint: "", multiline: true },
      { key: "slide2.revenueBullet", label: "Revenue Mix", hint: "", multiline: false },
      { key: "slide2.programmingBullet", label: "Programming", hint: "", multiline: false },
    ],
  },
  {
    slideLabel: "Slide 3 — Concept",
    slots: [
      { key: "slide3.conceptParagraph", label: "Concept Paragraph", hint: "", multiline: true },
      { key: "slide3.marketRationale", label: "Market Rationale", hint: "", multiline: true },
      {
        key: "slide3.reasons",
        label: "Investment Reasons",
        hint: "Format: Label: detail — one reason per blank line",
        multiline: true,
      },
      { key: "slide3.closingLine", label: "Closing Line", hint: "", multiline: false },
      {
        key: "slide3.interiorPhotoUrl",
        label: "Interior Photo",
        hint: "Paste an R2 photo URL to override the auto-selected interior photo",
        type: "photo" as const,
      },
    ],
  },
  {
    slideLabel: "Slide 4 — Portfolio",
    slots: [
      { key: "slide4.sectionSubtitle", label: "Section Subtitle", hint: "", multiline: false },
    ],
  },
  {
    slideLabel: "Slide 5 — Transformation",
    slots: [
      {
        key: "slide5.transformationDescription",
        label: "Transformation Description",
        hint: "",
        multiline: true,
      },
      {
        key: "slide5.transformationRows",
        label: "Transformation Table",
        hint: "Format: Feature | Existing | Proposed — one row per line",
        multiline: true,
      },
    ],
  },
  {
    slideLabel: "Slide 6 — Disclaimer",
    slots: [
      { key: "slide6.disclaimer", label: "Disclaimer", hint: "", multiline: true },
    ],
  },
];

export const FACTORY_TABS: Array<{ value: FactoryTab; label: string }> = [
  { value: "f-brief",      label: "1 · Brief" },
  { value: "f-lorenzo",    label: "2 · Lorenzo" },
  { value: "f-properties", label: "3 · Properties" },
  { value: "f-lucca",      label: "4 · Lucca" },
  { value: "f-agents",     label: "5 · Agents" },
  { value: "f-download",   label: "6 · Download" },
];

export const UPLOAD_IDLE: UploadState = { stage: "idle", file: null, error: null };
