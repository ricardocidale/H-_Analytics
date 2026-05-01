/**
 * One-shot migration script (Task #517, April 25, 2026).
 *
 * Uploads the Helium rollback dumps from `backups/heliumdb-*` to
 * `r2://h-analysis/archive/helium-rollback-20260424/` and verifies each
 * upload by re-downloading and SHA-256-comparing against the local file.
 *
 * Re-running requires the `backups/heliumdb-*` files to be present on disk.
 * They were `git rm`d after the migration, so a fresh clone will NOT have
 * them — recovery options are documented in
 * `docs/developer/migration-from-replit.md` step 2 of "Cancelling the
 * Helium Postgres add-on (when ready)".
 */
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { S3StorageProvider } from "../server/providers/storage/s3-storage";

const PREFIX = "archive/helium-rollback-20260424";
const ALL_FILES = [
  "backups/heliumdb-data-only-20260424T174432Z.sql.gz",
  "backups/heliumdb-full-20260424T174432Z.sql.gz",
  "backups/heliumdb-rowcounts-20260424T174432Z.txt",
  "backups/heliumdb-sequences-20260424T174432Z.sql",
];

function contentTypeFor(path: string): string {
  if (path.endsWith(".sql.gz")) return "application/gzip";
  if (path.endsWith(".sql")) return "application/sql";
  if (path.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

async function sha256OfFile(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

async function main() {
  // Optional: pass a single file path as argv to upload just that file
  const only = process.argv[2];
  const files = only ? [only] : ALL_FILES;

  log("=== Upload Helium rollback dumps to R2 ===");
  log(`Bucket prefix: ${PREFIX}`);
  log(`Files: ${files.length}`);
  log("");
  const provider = new S3StorageProvider();

  const summary: Array<{ key: string; bytes: number; sha256: string }> = [];

  for (const localPath of files) {
    const basename = localPath.split("/").pop()!;
    const key = `${PREFIX}/${basename}`;
    const st = await stat(localPath);
    log(`---`);
    log(`Local : ${localPath}  (${st.size.toLocaleString()} bytes)`);
    log(`Key   : ${key}`);

    log(`[1/4] sha256 (local) ...`);
    const localSha = await sha256OfFile(localPath);
    log(`      ${localSha}`);

    log(`[2/4] uploading ...`);
    const t0 = Date.now();
    const buf = await readFile(localPath);
    await provider.uploadBuffer(key, buf, contentTypeFor(localPath));
    log(`      ok in ${Math.round((Date.now() - t0) / 1000)}s`);

    log(`[3/4] exists check ...`);
    const ok = await provider.exists(key);
    if (!ok) throw new Error(`exists() returned false after upload of ${key}`);
    log(`      ok`);

    log(`[4/4] download + sha256 verify ...`);
    const dl = await provider.downloadBuffer(key);
    if (dl.buffer.length !== st.size) {
      throw new Error(
        `size mismatch on ${key}: local ${st.size}, remote ${dl.buffer.length}`,
      );
    }
    const remoteSha = createHash("sha256").update(dl.buffer).digest("hex");
    if (remoteSha !== localSha) {
      throw new Error(
        `SHA-256 mismatch on ${key}\n  local:  ${localSha}\n  remote: ${remoteSha}`,
      );
    }
    log(`      ${remoteSha} (match)`);
    summary.push({ key, bytes: st.size, sha256: localSha });
  }

  log("");
  log(`=== ALL CLEAR — ${files.length} files uploaded and verified ===`);
  for (const row of summary) {
    log(
      `${row.sha256}  ${row.bytes.toString().padStart(12)}  ${row.key}`,
    );
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
