/**
 * Lorenzo-03 — Vision Reconciler.
 *
 * Receives the word-level AldoResult and the per-slide canonical PNG buffers.
 * For each slide, it groups Aldo words into line-level text runs, then calls
 * Opus 4.7 with vision to enrich each run with font metrics and semantic
 * metadata (fontName, fontSize, fontWeight, color, semanticRole, variableBinding).
 *
 * Returns blocksBySlide: LorenzoTextBlock[][] — one array per slide, each entry
 * a semantically meaningful text block ready for Carlo validation.
 *
 * No caching (user requested always-fresh LLM calls). See lorenzo-inspector.ts
 * for Lorenzo-05.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../ai/clients";
import { logger } from "../logger";
import type { AldoResult, AldoElement } from "./minions/aldo";
import type { LorenzoTextBlock } from "./canonical-spec-types";
import { CANONICAL_ASSETS } from "./canonical-assets";
import {
  LORENZO_03_MAX_TOKENS,
  ALDO_LINE_GROUP_Y_THRESHOLD_PX,
  ALDO_CANVAS_WIDTH,
  ALDO_CANVAS_HEIGHT,
  TOTAL_SLIDES,
} from "./deck-render-constants";
import { resolveLorenzoVisionModelId } from "./factory-v2-llm-resolver";
import { getStorageProviderAsync } from "../providers/storage";

// ── Type for the tool's input_schema ────────────────────────────────────────

interface ReportBlocksInput {
  blocks: Array<{
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    fontName: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    semanticRole: string;
    variableBinding: string | null;
    overflowBehavior: {
      mode: string;
      maxFontSizeDeltaPct: number;
      maxLineHeightDeltaPct: number;
      truncateAllowed: boolean;
    } | null;
  }>;
}

// ── Tool schema for structured output ───────────────────────────────────────

const REPORT_BLOCKS_TOOL: Anthropic.Tool = {
  name: "report_text_blocks",
  description:
    "Report all semantic text blocks found on this slide. Group adjacent words " +
    "that share the same visual style into a single block.",
  input_schema: {
    type: "object",
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object",
          required: [
            "text", "x", "y", "w", "h",
            "fontName", "fontSize", "fontWeight", "color",
            "semanticRole", "variableBinding",
          ],
          properties: {
            text: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
            fontName: { type: "string" },
            fontSize: { type: "number" },
            fontWeight: { type: "number" },
            color: { type: "string" },
            semanticRole: { type: "string" },
            variableBinding: { type: "string", nullable: true },
            overflowBehavior: {
              type: "object",
              nullable: true,
              properties: {
                mode: { type: "string" },
                maxFontSizeDeltaPct: { type: "number" },
                maxLineHeightDeltaPct: { type: "number" },
                truncateAllowed: { type: "boolean" },
              },
            },
          },
        },
      },
    },
    required: ["blocks"],
  },
};

// ── Line grouping helper ─────────────────────────────────────────────────────

interface WordGroup {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Group word-level Aldo elements into approximate line runs by proximity.
 * Words within ALDO_LINE_GROUP_Y_THRESHOLD_PX vertical distance of each other
 * and appearing on the same horizontal band are merged into one group.
 */
function groupWordsIntoLines(words: AldoElement[]): WordGroup[] {
  if (words.length === 0) return [];

  // Sort by y then x for stable grouping
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: AldoElement[][] = [];
  let currentLine: AldoElement[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentLine[currentLine.length - 1];
    const curr = sorted[i];
    if (Math.abs(curr.y - prev.y) <= ALDO_LINE_GROUP_Y_THRESHOLD_PX) {
      currentLine.push(curr);
    } else {
      lines.push(currentLine);
      currentLine = [curr];
    }
  }
  lines.push(currentLine);

  return lines.map((line) => {
    const minX = Math.min(...line.map((w) => w.x));
    const minY = Math.min(...line.map((w) => w.y));
    const maxX = Math.max(...line.map((w) => w.x + w.w));
    const maxH = Math.max(...line.map((w) => w.h));
    const text = line
      .sort((a, b) => a.x - b.x)
      .map((w) => w.text ?? "")
      .join(" ")
      .trim();
    return { text, x: minX, y: minY, w: maxX - minX, h: maxH };
  });
}

// ── Lorenzo-03 per-slide LLM call ────────────────────────────────────────────

const KNOWN_VARIABLE_BINDINGS = [
  "slide1.headerSubtitle",
  "slide1.visionBullets",
  "slide2.operationalModelText",
  "slide2.revenueBullet",
  "slide2.programmingBullet",
  "slide3.conceptParagraph",
  "slide3.marketRationale",
  "slide3.reasons",
  "slide3.closingLine",
  "slide5.transformationDescription",
  "slide5.transformationRows",
  "slide5.transformationRows[0]",
  "slide5.transformationRows[1]",
  "slide5.transformationRows[2]",
  "slide5.transformationRows[3]",
];

async function enrichSlide(
  slideNumber: number,
  slideIndex: number,
  pngBuffer: Buffer,
  words: AldoElement[],
  anthropic: Anthropic,
  modelId: string,
): Promise<LorenzoTextBlock[]> {
  const lines = groupWordsIntoLines(words);

  const wordSummary = lines
    .map((g, i) => `${i}: "${g.text}" x=${g.x} y=${g.y} w=${g.w} h=${g.h}`)
    .join("\n");

  const userMessage: Anthropic.MessageParam = {
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: pngBuffer.toString("base64"),
        },
      },
      {
        type: "text",
        text:
          `Slide ${slideNumber} of 6. Canvas: ${ALDO_CANVAS_WIDTH}×${ALDO_CANVAS_HEIGHT}px.\n\n` +
          `Line groups extracted from PDF (index: text x y w h):\n${wordSummary}\n\n` +
          `Known dynamic variable bindings (use exact key or null for static):\n` +
          KNOWN_VARIABLE_BINDINGS.join(", ") + "\n\n" +
          "For each line group visible on the slide, call report_text_blocks with:\n" +
          "- text: exact string\n" +
          "- x/y/w/h: bounding box in canvas pixels (match the provided line group values)\n" +
          "- fontName: CSS font-family (e.g. 'Georgia, serif' or 'Poppins, sans-serif')\n" +
          "- fontSize: pt/px size as rendered\n" +
          "- fontWeight: integer (400 regular, 700 bold)\n" +
          "- color: hex #RRGGBB\n" +
          "- semanticRole: e.g. slide_title, section_header, body_text, bullet_point, label, caption\n" +
          "- variableBinding: matching key from the list above, or null\n" +
          "- overflowBehavior: for variable slots, include mode/deltas; null for static text",
      },
    ],
  };

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: LORENZO_03_MAX_TOKENS,
    system: "You are Lorenzo-03, a visual spec reconciler. Analyse slide images and produce structured canonical specs for an investor deck pipeline. Be precise with font metrics and bounding boxes.",
    messages: [userMessage],
    tools: [REPORT_BLOCKS_TOOL],
    tool_choice: { type: "any" },
  });

  // Extract tool use block
  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (!toolBlock) {
    throw new Error(`Lorenzo-03: no tool call returned for slide ${slideNumber}`);
  }

  const { blocks } = toolBlock.input as ReportBlocksInput;

  return blocks.map((b) => ({
    text: b.text,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    slideIndex,
    fontName: b.fontName,
    fontSize: b.fontSize,
    fontWeight: b.fontWeight,
    color: b.color,
    semanticRole: b.semanticRole,
    variableBinding: b.variableBinding ?? null,
    overflowBehavior: b.overflowBehavior ?? null,
    characterCount: b.text.length,
  }));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Lorenzo-03 across all slides.
 * Downloads each canonical PNG from R2, groups Aldo word elements into lines,
 * and calls Opus 4.7 once per slide to enrich with font/semantic metadata.
 */
export async function runLorenzoVision(aldoResult: AldoResult): Promise<LorenzoTextBlock[][]> {
  const anthropic = getAnthropicClient();
  const storageProvider = await getStorageProviderAsync();
  const modelId = await resolveLorenzoVisionModelId();

  const blocksBySlide: LorenzoTextBlock[][] = [];

  for (let i = 0; i < TOTAL_SLIDES; i++) {
    const slideNumber = i + 1;
    const slideWords = aldoResult.elementsBySlide[i] ?? [];

    logger.info(
      `[lorenzo-03] enriching slide ${slideNumber} (${slideWords.length} word elements)`,
      "slide-factory",
    );

    const { buffer: pngBuffer } = await storageProvider.downloadBuffer(
      CANONICAL_ASSETS.slide(slideNumber, "png"),
    );

    const blocks = await enrichSlide(slideNumber, i, pngBuffer, slideWords, anthropic, modelId);
    blocksBySlide.push(blocks);

    logger.info(
      `[lorenzo-03] slide ${slideNumber} → ${blocks.length} text blocks`,
      "slide-factory",
    );
  }

  return blocksBySlide;
}
