import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

async function main() {
  const isR2 = process.env.STORAGE_PROVIDER === "r2";
  const endpoint =
    process.env.S3_ENDPOINT ||
    (isR2 && process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined);

  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    credentials: {
      accessKeyId:
        process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey:
        process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const out = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET || process.env.R2_BUCKET!,
      Prefix: "archive/helium-rollback-20260424/",
    }),
  );
  for (const obj of out.Contents || []) {
    console.log(
      `${obj.Size?.toString().padStart(12)}  ${obj.LastModified?.toISOString()}  ${obj.Key}`,
    );
  }
  console.log(`\n${out.KeyCount ?? 0} object(s)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
