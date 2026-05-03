import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "drop-marcela-columns";

const MARCELA_COLUMNS = [
  "ai_agent_name",
  "marcela_agent_id",
  "marcela_voice_id",
  "marcela_tts_model",
  "marcela_stt_model",
  "marcela_output_format",
  "marcela_stability",
  "marcela_similarity_boost",
  "marcela_speaker_boost",
  "marcela_chunk_schedule",
  "marcela_llm_model",
  "marcela_max_tokens",
  "marcela_max_tokens_voice",
  "marcela_enabled",
  "marcela_twilio_enabled",
  "marcela_sms_enabled",
  "marcela_phone_greeting",
  "marcela_language",
  "marcela_turn_timeout",
  "marcela_avatar_url",
  "marcela_widget_variant",
  "marcela_speed",
  "marcela_streaming_latency",
  "marcela_text_normalisation",
  "marcela_asr_provider",
  "marcela_input_audio_format",
  "marcela_background_voice_detection",
  "marcela_turn_eagerness",
  "marcela_spelling_patience",
  "marcela_speculative_turn",
  "marcela_silence_end_call_timeout",
  "marcela_max_duration",
  "marcela_cascade_timeout",
];

export async function runDropMarcelaColumns(): Promise<void> {
  let dropped = 0;
  for (const col of MARCELA_COLUMNS) {
    try {
      await db.execute(
        sql.raw(`ALTER TABLE global_assumptions DROP COLUMN IF EXISTS "${col}"`)
      );
      dropped++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[${TAG}] Failed to drop column ${col}: ${msg}`);
    }
  }
  logger.info(`[${TAG}] Dropped ${dropped} Marcela columns from global_assumptions`);
}
