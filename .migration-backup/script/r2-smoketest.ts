import { S3StorageProvider } from "../server/providers/storage/s3-storage";

async function main() {
  console.log("=== R2 connection smoke test ===");
  console.log(`STORAGE_PROVIDER: ${process.env.STORAGE_PROVIDER}`);
  console.log(`R2_ACCOUNT_ID:    ${process.env.R2_ACCOUNT_ID ? "set" : "MISSING"}`);
  console.log(`R2_BUCKET:        ${process.env.R2_BUCKET || "MISSING"}`);
  console.log(`R2_ACCESS_KEY_ID: ${process.env.R2_ACCESS_KEY_ID ? "set" : "MISSING"}`);
  console.log(`R2_SECRET_ACCESS_KEY: ${process.env.R2_SECRET_ACCESS_KEY ? "set" : "MISSING"}`);
  console.log("");

  const provider = new S3StorageProvider();
  const key = `smoke/${Date.now()}.txt`;
  const body = Buffer.from(`hello from r2 smoke test at ${new Date().toISOString()}`);

  console.log(`[1/4] Uploading ${key} ...`);
  const path = await provider.uploadBuffer(key, body, "text/plain");
  console.log(`      -> ${path}`);

  console.log(`[2/4] Checking exists ...`);
  const ok = await provider.exists(key);
  console.log(`      -> ${ok}`);
  if (!ok) throw new Error("exists() returned false after upload");

  console.log(`[3/4] Downloading ...`);
  const dl = await provider.downloadBuffer(key);
  const text = dl.buffer.toString("utf8");
  console.log(`      -> ${dl.buffer.length} bytes, contentType=${dl.contentType}`);
  console.log(`      -> body: "${text}"`);
  if (text !== body.toString("utf8")) throw new Error("downloaded body mismatch");

  console.log(`[4/4] Deleting ...`);
  await provider.delete(key);
  const stillThere = await provider.exists(key);
  console.log(`      -> exists after delete: ${stillThere}`);
  if (stillThere) throw new Error("object still exists after delete");

  console.log("");
  console.log("ALL CLEAR — R2 round-trip succeeded.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
