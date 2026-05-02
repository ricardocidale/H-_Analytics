import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] rebecca-context-contract-001";

export async function runRebeccaContextContract001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rebecca_context_contract_turns (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      conversation_id integer REFERENCES rebecca_conversations(id) ON DELETE CASCADE,
      message_id integer REFERENCES rebecca_messages(id) ON DELETE SET NULL,
      user_id integer REFERENCES users(id) ON DELETE SET NULL,
      contract jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_ctx_contract_conv_idx 
      ON rebecca_context_contract_turns (conversation_id, created_at)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_ctx_contract_gin_idx 
      ON rebecca_context_contract_turns USING gin (contract)
  `);

  // Task #971: FK indexes on message_id / user_id (ON DELETE SET NULL).
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_ctx_contract_message_idx
      ON rebecca_context_contract_turns (message_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS rebecca_ctx_contract_user_idx
      ON rebecca_context_contract_turns (user_id)
  `);

  logger.info(`${TAG} rebecca_context_contract_turns ready`);
}
