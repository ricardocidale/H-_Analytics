import { getStorageProviderAsync } from "./src/providers/storage";
import { writeFileSync } from "fs";

async function main() {
  const sp = await getStorageProviderAsync();
  const { buffer } = await sp.downloadBuffer("canonical/lb-6-slide/templates/lb-v7-template.pptx");
  writeFileSync("/tmp/lb-v7-template.pptx", buffer);
  console.log("Downloaded:", buffer.length, "bytes");
}
main().catch(e => { console.error(e.message); process.exit(1); });
