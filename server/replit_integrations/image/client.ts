import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { getGeminiClient } from "../../ai/clients";
import { Buffer } from "node:buffer";
import { logger } from "../../logger";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// getGeminiClient re-exported from centralized singleton (server/ai/clients.ts)
export { getGeminiClient } from "../../ai/clients";

/**
 * Generate an image using Nano Banana (gemini-2.5-flash-image) and return as Buffer.
 * Falls back to gpt-image-1 if Gemini is unavailable.
 */
export async function generateImageBuffer(
  prompt: string,
  _size: "1024x1024" | "1024x1536" | "1536x1024" | "auto" = "1024x1024"
): Promise<Buffer> {
  try {
    const gemini = getGeminiClient();

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["image", "text"],
      },
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return Buffer.from(part.inlineData.data, "base64");
        }
      }
    }
    throw new Error("No image data in Nano Banana response");
  } catch (err) {
    logger.warn(`Nano Banana image generation failed, falling back to OpenAI: ${err instanceof Error ? err.message : String(err)}`, "image-gen");
  }

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: _size === "auto" ? "1024x1024" : _size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

/**
 * Edit/combine multiple images into a composite.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */
export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
