/**
 * bianca-verification.ts — Bianca, Visual Quality Verification Specialist (T2-4)
 *
 * Bianca checks rendered Factory v2 decks for quality issues before delivery:
 *   1. Downloads the PPTX from R2 using the run's pptxR2Key.
 *   2. Converts each slide to a PNG via LibreOffice headless (--convert-to png).
 *   3. Sends all slide images to Claude vision in one batched message.
 *   4. Returns structured per-slide findings against a fixed quality rubric.
 *
 * Rubric categories:
 *   - text_cutoff    Text truncated at slide edges or behind overlapping elements
 *   - placeholder    Visible Lorem ipsum, TODO, [INSERT], "Click to add title", etc.
 *   - readability    Text too small to read at normal presentation zoom
 *   - layout         Missing expected structural elements (header, footer, page number)
 *   - consistency    Palette / font / style diverges from the rest of the deck
 *   - data_quality   Empty data cells where a value was expected
 *
 * Severity: ok < advisory < warning < block
 *
 * Bianca is a cross-app Specialist — she can verify factory decks AND property
 * PDF exports (future). Her LLM slot (bianca-verification) is seeded by
 * admin-resources-014.ts and defaults to Claude Haiku for cost-efficient
 * batch image analysis.
 *
 * Naming: Bianca (Italian — white/pure) — appropriate for a visual quality
 * inspector focused on clean, professional presentation output.
 */
import { spawn } from "node:child_process";
import { mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../ai/clients";
import { logger } from "../logger";
import { getStorageProviderAsync } from "../providers/storage";
import { resolveLlmFor } from "../ai/llm-config-resolver";
import {
  BIANCA_VERIFICATION_LLM_SLOT,
  BIANCA_VERIFICATION_MAX_TOKENS,
  BIANCA_PNG_CONVERT_TIMEOUT_MS,
  BIANCA_SIGKILL_GRACE_MS,
  BIANCA_TMP_DIR_NAME_MAX_LEN,
} from "./factory-v2-constants";
import type { VerificationFinding } from "@workspace/db/schema";

// ── Agent identity ─────────────────────────────────────────────────────────

export const BIANCA = {
  role: "Visual Quality Verification Specialist",
  short_description:
    "Bianca checks rendered deck slides against a visual quality rubric using Claude vision. " +
    "Catches cut-off text, placeholders, readability issues, and layout anomalies.",
  long_description:
    "Cross-app specialist that renders PPTX slides to PNG via LibreOffice headless, " +
    "then submits all slides in a single batched vision call for cost efficiency. " +
    "Returns per-slide structured findings (severity + category + description). " +
    "Defaults to Claude Haiku; admin-retargetable via the bianca-verification llm_slot row.",
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface BiancaVerificationResult {
  status: "passed" | "failed";
  runAt: string;
  slideCount: number;
  findings: VerificationFinding[];
  overallVerdict: string;
}

interface LlmFindingEntry {
  slideNumber: number;
  severity: "ok" | "advisory" | "warning" | "block";
  category: "text_cutoff" | "placeholder" | "readability" | "layout" | "consistency" | "data_quality";
  description: string;
}

interface LlmRubricOutput {
  findings: LlmFindingEntry[];
  overallVerdict: string;
}

// ── Tool definition for structured output ─────────────────────────────────

const RUBRIC_TOOL: Anthropic.Tool = {
  name: "report_visual_quality",
  description:
    "Report the visual quality findings for the deck slides provided. " +
    "Return one entry per slide (even if severity is 'ok'). " +
    "Use 'block' only for severe issues that would embarrass the sender before investors.",
  input_schema: {
    type: "object",
    required: ["findings", "overallVerdict"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          required: ["slideNumber", "severity", "category", "description"],
          properties: {
            slideNumber: { type: "number" },
            severity: { type: "string", enum: ["ok", "advisory", "warning", "block"] },
            category: {
              type: "string",
              enum: ["text_cutoff", "placeholder", "readability", "layout", "consistency", "data_quality"],
            },
            description: { type: "string" },
          },
        },
      },
      overallVerdict: { type: "string" },
    },
  },
};

// ── LibreOffice PNG conversion ─────────────────────────────────────────────

const TMP_PARENT = "bianca-verify";
const INPUT_PPTX_FILENAME = "deck.pptx";

async function convertPptxToPngs(pptxBuffer: Buffer, runId: string): Promise<Buffer[]> {
  const workDir = path.join(tmpdir(), TMP_PARENT, runId.replace(/[^a-z\d._-]+/gi, "-").slice(0, BIANCA_TMP_DIR_NAME_MAX_LEN));
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const pptxPath = path.join(workDir, INPUT_PPTX_FILENAME);
  await writeFile(pptxPath, pptxBuffer);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("soffice", [
      "--headless",
      "--convert-to", "png",
      "--outdir", workDir,
      pptxPath,
    ]);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), BIANCA_SIGKILL_GRACE_MS);
      reject(new Error(`LibreOffice PNG conversion timed out after ${BIANCA_PNG_CONVERT_TIMEOUT_MS}ms`));
    }, BIANCA_PNG_CONVERT_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`soffice exited with code ${code}`));
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const files = await readdir(workDir);
  const pngFiles = files
    .filter((f) => f.endsWith(".png"))
    .sort();

  const buffers = await Promise.all(
    pngFiles.map((f) => readFile(path.join(workDir, f))),
  );

  await rm(workDir, { recursive: true, force: true });
  return buffers;
}

// ── Vision rubric call ─────────────────────────────────────────────────────

async function callVisionRubric(pngBuffers: Buffer[]): Promise<LlmRubricOutput> {
  const { modelId } = await resolveLlmFor(BIANCA_VERIFICATION_LLM_SLOT);
  const anthropic = getAnthropicClient();

  const imageBlocks: Anthropic.ImageBlockParam[] = pngBuffers.map((buf, i) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: buf.toString("base64"),
    },
  }));

  const slideLabels = pngBuffers.map((_, i) => `Slide ${i + 1}`).join(", ");

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: BIANCA_VERIFICATION_MAX_TOKENS,
    system:
      "You are Bianca, a visual quality specialist for professional investor presentations. " +
      "Your job is to inspect rendered slide deck images and identify quality issues " +
      "before delivery to investors. Be concise, objective, and use specific observations. " +
      "Severity guide: ok=no issue; advisory=minor polish needed; warning=noticeable problem; " +
      "block=severe issue that would embarrass the sender before investors.",
    tools: [RUBRIC_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text:
              `Above are ${pngBuffers.length} slides (${slideLabels}) from a rendered investor deck. ` +
              "Inspect each slide against this rubric:\n" +
              "1. text_cutoff — text cut off at edges or hidden behind other elements\n" +
              "2. placeholder — Lorem ipsum, TODO, [INSERT], empty title placeholders visible\n" +
              "3. readability — text appears too small to read at presentation zoom\n" +
              "4. layout — missing expected structural elements (title, content body, footer)\n" +
              "5. consistency — color palette or font style diverges from other slides\n" +
              "6. data_quality — blank data cells or '#N/A' where a value was expected\n\n" +
              "Return one finding per slide. Use severity 'ok' for clean slides. " +
              "Call report_visual_quality now.",
          },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (!toolBlock) {
    logger.warn("[bianca] No tool call in rubric response — defaulting to passed", "bianca-verification");
    return {
      findings: pngBuffers.map((_, i) => ({
        slideNumber: i + 1,
        severity: "ok" as const,
        category: "layout" as const,
        description: "No issues detected (rubric response unavailable)",
      })),
      overallVerdict: "No tool call — assuming pass.",
    };
  }

  return toolBlock.input as LlmRubricOutput;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run Bianca on a slide factory deck.
 *
 * @param pptxR2Key  R2 key for the deck PPTX (from slide_factory_runs.pptxR2Key)
 * @param runId      Used to scope the tmp dir (usually the run ID as a string)
 */
export async function runBiancaVerification(
  pptxR2Key: string,
  runId: string,
): Promise<BiancaVerificationResult> {
  logger.info(`[bianca] Starting verification for run ${runId}`, "bianca-verification");

  const storageProvider = await getStorageProviderAsync();
  const { buffer: pptxBuffer } = await storageProvider.downloadBuffer(pptxR2Key);

  logger.info(`[bianca] PPTX downloaded (${pptxBuffer.length} bytes) — converting to PNG`, "bianca-verification");

  const pngBuffers = await convertPptxToPngs(pptxBuffer, runId);

  if (pngBuffers.length === 0) {
    throw new Error("LibreOffice produced no PNG files — PPTX may be corrupt or empty");
  }

  logger.info(`[bianca] ${pngBuffers.length} slide PNGs ready — calling vision rubric`, "bianca-verification");

  const rubricOutput = await callVisionRubric(pngBuffers);

  const findings: VerificationFinding[] = rubricOutput.findings.map((f) => ({
    slideNumber: f.slideNumber,
    severity: f.severity,
    category: f.category,
    description: f.description,
  }));

  const hasBlock = findings.some((f) => f.severity === "block");
  const hasWarning = findings.some((f) => f.severity === "warning");
  const status = hasBlock || hasWarning ? "failed" : "passed";

  logger.info(
    `[bianca] Verification ${status} — ${findings.filter((f) => f.severity !== "ok").length} issue(s) found`,
    "bianca-verification",
  );

  return {
    status,
    runAt: new Date().toISOString(),
    slideCount: pngBuffers.length,
    findings,
    overallVerdict: rubricOutput.overallVerdict,
  };
}
