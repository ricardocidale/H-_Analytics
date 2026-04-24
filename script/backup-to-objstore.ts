/**
 * One-off: upload local backup files to private object storage and emit
 * 7-day signed GET URLs the user can click to download for off-site keeping.
 */
import fs from "fs";
import path from "path";
import { objectStorageClient } from "../server/replit_integrations/object_storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const TTL_SEC = 86400 * 7;
const TS = process.argv[2];

if (!TS) {
  console.error("usage: tsx script/backup-to-objstore.ts <timestamp>");
  process.exit(1);
}

async function signGet(bucketName: string, objectName: string, ttlSec: number): Promise<string> {
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  const resp = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket_name: bucketName, object_name: objectName, method: "GET", expires_at: expiresAt }),
  });
  if (!resp.ok) throw new Error(`sign failed: ${resp.status} ${await resp.text()}`);
  const { signed_url } = await resp.json() as { signed_url: string };
  return signed_url;
}

async function main() {
  const backupDir = ".local/backups";
  const files = fs.readdirSync(backupDir).filter(f =>
    f.includes(TS) && (f.endsWith(".sql") || f.endsWith(".txt"))
  ).sort();
  if (files.length === 0) throw new Error(`no backup files matched timestamp ${TS}`);

  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");

  const m = privateDir.match(/^\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`PRIVATE_OBJECT_DIR malformed: ${privateDir}`);
  const [, bucketName, privatePrefix] = m;

  const bucket = objectStorageClient.bucket(bucketName);
  console.log(`Bucket: ${bucketName}`);
  console.log(`Prefix: ${privatePrefix}/backups/`);
  console.log(`TTL:    ${Math.floor(TTL_SEC / 86400)} days`);
  console.log("");

  const out: Array<{ file: string; size: string; url: string }> = [];

  for (const f of files) {
    const localPath = path.join(backupDir, f);
    const objectName = `${privatePrefix}/backups/${f}`;
    const sizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1);
    process.stdout.write(`Uploading ${f} (${sizeMB} MB)... `);
    await bucket.upload(localPath, {
      destination: objectName,
      resumable: true,
    });
    const url = await signGet(bucketName, objectName, TTL_SEC);
    console.log("ok");
    out.push({ file: f, size: `${sizeMB} MB`, url });
  }

  console.log("\n=== signed download URLs (valid 7 days) ===\n");
  for (const o of out) {
    console.log(`# ${o.file} (${o.size})`);
    console.log(o.url);
    console.log("");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
