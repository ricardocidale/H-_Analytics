/**
 * upload-canonical-slides.ts
 *
 * Uploads the ONE canonical L+B 6-slide investor deck PDF to R2 and
 * generates per-slide PNG rasters (300 dpi) + individual slide PDFs.
 *
 * CANONICAL SOURCE PDF (the only authoritative design source):
 *   attached_assets/canonical/pdf/L+B_Property_6-Slide_Cannonical_1777859377769.pdf
 *
 * This file is the design authority for:
 *   • contract.ts    — palette, fonts, canvas dimensions (960×540), bb() coords
 *   • spec_skeleton_v4.json — element-level layout skeleton
 *   • slides.tsx     — renderer (to be rewritten against contract.ts)
 *
 * R2 output prefix: canonical/lb-6-slide/
 *   Full PDF:        canonical/lb-6-slide/lb-6-slide-canonical.pdf
 *   Per-slide PNGs:  canonical/lb-6-slide/slides/slide-{1..6}.png
 *   Per-slide PDFs:  canonical/lb-6-slide/slides/slide-{1..6}.pdf
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run upload:canonical-slides
 *
 * Requires: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID
 * System tools: pdftoppm (poppler-utils), pdfseparate (poppler-utils)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── R2 client ──────────────────────────────────────────────────────────────

const bucket = process.env.R2_BUCKET;
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
  console.error("Missing R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function upload(key: string, filePath: string, contentType: string): Promise<string> {
  const body = fs.readFileSync(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  console.log(`  ✓ uploaded → ${key}`);
  return key;
}

// ── Source PDF ─────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname, "../../");
const SOURCE_PDF = path.resolve(
  REPO_ROOT,
  "attached_assets/canonical/pdf/L+B_Property_6-Slide_Cannonical_1777859377769.pdf",
);

if (!fs.existsSync(SOURCE_PDF)) {
  console.error(`Source PDF not found: ${SOURCE_PDF}`);
  process.exit(1);
}

const TOTAL_SLIDES = 6;
const R2_PREFIX = "canonical/lb-6-slide";

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-canonical-"));
  console.log(`Working directory: ${tmp}`);

  const manifest: Record<string, string> = {};

  // 1. Upload the full PDF
  console.log("\n1. Uploading full PDF…");
  const fullPdfKey = `${R2_PREFIX}/lb-6-slide-canonical.pdf`;
  await upload(fullPdfKey, SOURCE_PDF, "application/pdf");
  manifest["full_pdf"] = fullPdfKey;

  // 2. Per-slide PNGs at 300 dpi via pdftoppm
  console.log("\n2. Generating per-slide PNGs (300 dpi)…");
  const pngPrefix = path.join(tmp, "slide");
  execSync(`pdftoppm -r 300 -png "${SOURCE_PDF}" "${pngPrefix}"`, { stdio: "inherit" });

  // pdftoppm names files as slide-1.png, slide-2.png … (zero-padded varies by page count)
  const pngFiles = fs
    .readdirSync(tmp)
    .filter((f) => f.startsWith("slide-") && f.endsWith(".png"))
    .sort();

  console.log(`   Found PNG files: ${pngFiles.join(", ")}`);

  for (let i = 0; i < pngFiles.length; i++) {
    const slideNum = i + 1;
    const pngPath = path.join(tmp, pngFiles[i]);
    const key = `${R2_PREFIX}/slides/slide-${slideNum}.png`;
    await upload(key, pngPath, "image/png");
    manifest[`slide_${slideNum}_png`] = key;
  }

  // 3. Per-slide PDFs via pdfseparate
  console.log("\n3. Generating per-slide PDFs…");
  const slideTemplate = path.join(tmp, "page-%d.pdf");
  execSync(`pdfseparate "${SOURCE_PDF}" "${slideTemplate}"`, { stdio: "inherit" });

  for (let n = 1; n <= TOTAL_SLIDES; n++) {
    const slidePdf = path.join(tmp, `page-${n}.pdf`);
    if (!fs.existsSync(slidePdf)) {
      console.warn(`   ⚠ page-${n}.pdf not found — skipping`);
      continue;
    }
    const key = `${R2_PREFIX}/slides/slide-${n}.pdf`;
    await upload(key, slidePdf, "application/pdf");
    manifest[`slide_${n}_pdf`] = key;
  }

  // 4. Print manifest
  console.log("\n── R2 Key Manifest ────────────────────────────────────────");
  console.log(JSON.stringify(manifest, null, 2));

  // 5. Write manifest to docs for reference
  const manifestPath = path.resolve(
    REPO_ROOT,
    "docs/slide-system/canonical/r2-manifest.json",
  );
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nManifest written to ${manifestPath}`);

  // Cleanup
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
