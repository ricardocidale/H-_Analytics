import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) return null;
  return crypto.createHash("sha256").update(key).digest();
}

export function isEncryptionConfigured(): boolean {
  return getEncryptionKey() !== null;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is required to encrypt tokens");

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:${Buffer.concat([iv, authTag, encrypted]).toString("base64")}`;
}

export function decryptToken(ciphertext: string): string {
  if (!ciphertext.startsWith("enc:")) return ciphertext;
  const key = getEncryptionKey();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is required to decrypt tokens");

  const data = Buffer.from(ciphertext.slice(4), "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
