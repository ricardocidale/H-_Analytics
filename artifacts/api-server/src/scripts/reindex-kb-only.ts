/**
 * One-shot: clear the knowledge-base vector namespace and re-embed from kb-content.ts.
 * Run with: pnpm --filter @workspace/api-server exec tsx src/scripts/reindex-kb-only.ts
 */
import { deleteNamespace } from "../ai/vector-store-service";
import { indexKnowledgeBase } from "../ai/knowledge-base";
import { indexAllAssets } from "../ai/asset-intelligence";

async function main() {
  console.log("Deleting knowledge-base namespace from vector store...");
  await deleteNamespace("knowledge-base");

  console.log("Re-indexing from kb-content.ts...");
  const kbResult = await indexKnowledgeBase();
  console.log(`KB: ${kbResult.chunksIndexed} chunks indexed in ${kbResult.timeMs}ms`);

  console.log("Re-indexing assets...");
  const assetResult = await indexAllAssets();
  console.log(`Assets: ${assetResult.photos} photos, ${assetResult.logos} logos`);

  console.log("Done.");
  process.exit(0);
}

main().catch(e => {
  console.error("Re-index failed:", e);
  process.exit(1);
});
