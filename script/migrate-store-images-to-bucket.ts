/**
 * Phase C: Upload all property hero/album images from client/public/images/
 * to Replit Object Storage at /objects/properties/<filename>. Idempotent —
 * re-runs overwrite. After this, source code refs to /images/* can be
 * rewritten to /objects/properties/* and the local image tree can be
 * deleted in Phase E.
 */
import { readdirSync, readFileSync } from "fs";
import { extname, resolve } from "path";
import { ReplitStorageProvider } from "../server/providers/storage/replit-storage";

const SRC_DIR = resolve("client/public/images");
const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const CONTENT_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function main() {
  const provider = new ReplitStorageProvider();
  const files = readdirSync(SRC_DIR).filter((f) => ALLOWED.has(extname(f).toLowerCase()));
  console.log(`Uploading ${files.length} files from ${SRC_DIR}\n`);

  let bytes = 0;
  for (const name of files) {
    const buf = readFileSync(resolve(SRC_DIR, name));
    bytes += buf.length;
    const ct = CONTENT_TYPE[extname(name).toLowerCase()] || "application/octet-stream";
    const url = await provider.uploadBuffer(`properties/${name}`, buf, ct);
    console.log(`  ${name} → ${url} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  console.log(`\nDone — ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB total`);
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
