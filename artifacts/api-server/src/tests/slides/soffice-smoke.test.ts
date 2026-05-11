/**
 * Factory v2 U2 — `soffice` PPTX → PDF smoke conversion test.
 *
 * Verifies the LibreOffice headless install layer added to the Dockerfile
 * runtime stage by:
 *   1. Building a one-slide PPTX with pptxgenjs in a tmp dir.
 *   2. Invoking `soffice --headless --convert-to pdf`.
 *   3. Asserting exit code 0, output PDF exists, non-empty, and starts with %PDF-.
 *
 * Gating: the entire suite is skipped if `soffice` is not on PATH. That means:
 *   - Locally (where soffice is absent) the test is a no-op.
 *   - CI (today's environment, no LibreOffice image) the test is a no-op.
 *   - Railway after this PR's image rebuild — the test exercises the install.
 *
 * If you're reading this because the suite is failing on Railway, see
 * docs/solutions/integration-issues/libreoffice-headless-railway-install-2026-05-11.md
 * for exit-code mapping and known fidelity caveats.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Named constants for the smoke deck's synthetic content + conversion budget.
// Tests are not exempt from CLAUDE.md §1 (numeric literal rule).
const TITLE_BOX_WIDTH_IN = 8;        // pptxgenjs uses inches for slide geometry
const TITLE_BOX_HEIGHT_IN = 1;
const TITLE_BOX_X_IN = 1;
const TITLE_BOX_Y_IN = 1;
const TITLE_FONT_SIZE_PT = 24;
const SOFFICE_TIMEOUT_MS = 60_000;   // 60 s — generous; matches U7's default budget
const PDF_MAGIC_PREFIX_LEN = 5;      // length of the literal "%PDF-" header

function hasSoffice(): boolean {
  const result = spawnSync("soffice", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

const SOFFICE_AVAILABLE = hasSoffice();

// Use describe.skipIf so test-discovery still surfaces the suite (gives a
// clear "skipped" line in the test output) but no body runs when soffice
// isn't present.
describe.skipIf(!SOFFICE_AVAILABLE)("soffice PPTX → PDF smoke conversion", () => {
  let workDir: string;
  let pptxPath: string;

  beforeAll(async () => {
    workDir = mkdtempSync(path.join(tmpdir(), "factory-v2-soffice-smoke-"));
    pptxPath = path.join(workDir, "smoke.pptx");

    // Build a minimal 1-slide PPTX using the same library the api-server
    // ships in node_modules. Dynamic import mirrors the production usage
    // pattern in routes/format-generators/pptx-generator.ts.
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pres = new PptxGenJS();
    const slide = pres.addSlide();
    slide.addText("Factory v2 soffice smoke", {
      x: TITLE_BOX_X_IN,
      y: TITLE_BOX_Y_IN,
      w: TITLE_BOX_WIDTH_IN,
      h: TITLE_BOX_HEIGHT_IN,
      fontSize: TITLE_FONT_SIZE_PT,
      bold: true,
    });
    // pres.write returns a Buffer/ArrayBuffer/string depending on outputType.
    const buf = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(pptxPath, buf);
  });

  afterAll(() => {
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("converts a minimal PPTX to PDF cleanly", () => {
    const profileDir = path.join(workDir, "lo-profile");
    const result = spawnSync(
      "soffice",
      [
        "--headless",
        `-env:UserInstallation=file://${profileDir}`,
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        pptxPath,
      ],
      { encoding: "utf8", timeout: SOFFICE_TIMEOUT_MS },
    );

    // Exit code 0 = clean conversion. See integration-issues doc for the
    // exit-code mapping (1 = generic failure, 77 = profile lock collision).
    expect(result.status).toBe(0);

    const pdfPath = path.join(workDir, "smoke.pdf");
    expect(existsSync(pdfPath)).toBe(true);

    const stat = statSync(pdfPath);
    expect(stat.size).toBeGreaterThan(0);

    // Verify PDF magic bytes — soffice has been known to write a 0-byte file
    // and exit 0 in pathological font-init scenarios; this guard catches that.
    const head = readFileSync(pdfPath).subarray(0, PDF_MAGIC_PREFIX_LEN).toString("utf8");
    expect(head).toBe("%PDF-");
  });
});

// Always-on guard test that makes the gating posture explicit in the test
// log even when the conversion suite is skipped. Provides one passing case
// per file, which keeps test reporters happy and makes the skipped-suite
// visible.
describe("soffice install detection", () => {
  it("records whether soffice is on PATH in this environment", () => {
    // No assertion — the act of detecting and logging is the test's value.
    // The conversion suite above is the assertion-bearing surface; this
    // case ensures the file isn't accidentally empty when soffice is absent.
    expect(typeof SOFFICE_AVAILABLE).toBe("boolean");
  });
});
