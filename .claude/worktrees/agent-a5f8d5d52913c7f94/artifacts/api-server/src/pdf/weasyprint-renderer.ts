/**
 * weasyprint-renderer.ts — Converts HTML documents to PDF via WeasyPrint.
 *
 * WeasyPrint handles CSS layout faithfully — financial tables look like they
 * were printed from Excel. One statement per landscape page, chart follows.
 *
 * Falls back gracefully if WeasyPrint is not installed (e.g. local dev).
 * We handle page breaks ourselves in the HTML (page-break-before: always)
 * because WeasyPrint's automatic pagination has weak widow/orphan control.
 */

import { execFile } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { logger } from "../logger";

const TIMEOUT_MS = 20_000;

let _available: boolean | null = null;
let _pythonCmd: string | null = null;

/** Check if WeasyPrint is available. Result is cached. */
export async function isWeasyPrintAvailable(): Promise<boolean> {
  if (_available !== null) return _available;

  const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];

  for (const cmd of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      execFile(cmd, ["-c", "import weasyprint; print(weasyprint.__version__)"], { timeout: 5000 }, (err, stdout) => {
        if (!err && stdout.trim().length > 0) {
          _pythonCmd = cmd;
          logger.info(`WeasyPrint ${stdout.trim()} available (${cmd})`, "pdf-export");
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
    if (ok) { _available = true; return true; }
  }

  _available = false;
  logger.warn("WeasyPrint not available — PDF exports will use @react-pdf/renderer fallback", "pdf-export");
  return false;
}

/**
 * Render a complete HTML document to PDF via WeasyPrint.
 *
 * The HTML should be a full document with <!DOCTYPE>, <html>, <head>+<style>, <body>.
 * Page breaks are controlled in the HTML/CSS, not by WeasyPrint settings.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  if (!_pythonCmd) throw new Error("WeasyPrint not available");

  const id = randomUUID().slice(0, 8);
  const tempDir = join(tmpdir(), "hbg-pdf-export");
  mkdirSync(tempDir, { recursive: true });

  const htmlPath = join(tempDir, `export-${id}.html`);
  const pdfPath = join(tempDir, `export-${id}.pdf`);

  try {
    writeFileSync(htmlPath, html, "utf-8");

    const script = [
      "import sys",
      "from weasyprint import HTML",
      "HTML(filename=sys.argv[1]).write_pdf(sys.argv[2])",
      "print('OK')",
    ].join("; ");

    return new Promise((resolve, reject) => {
      execFile(
        _pythonCmd!,
        ["-c", script, htmlPath, pdfPath],
        { timeout: TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
        (err, _stdout, stderr) => {
          if (err) {
            logger.error(`WeasyPrint failed: ${err.message}${stderr ? ` — ${stderr.slice(0, 200)}` : ""}`, "pdf-export");
            reject(new Error(`PDF rendering failed: ${err.message}`));
            return;
          }

          try {
            const pdfBuffer = readFileSync(pdfPath);
            logger.info(`WeasyPrint rendered ${(pdfBuffer.length / 1024).toFixed(0)}KB PDF`, "pdf-export");
            resolve(pdfBuffer);
          } catch (readErr: unknown) {
            reject(new Error(`Failed to read PDF: ${readErr instanceof Error ? readErr.message : String(readErr)}`));
          }
        }
      );
    });
  } finally {
    try { unlinkSync(htmlPath); } catch { /* ignore */ }
    try { unlinkSync(pdfPath); } catch { /* ignore */ }
  }
}
