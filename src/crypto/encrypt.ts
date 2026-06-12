import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export type EncryptedPlaneToken = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

export function encryptPlaneToken(plaintext: string, key: Buffer): EncryptedPlaneToken {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptPlaneToken(enc: EncryptedPlaneToken, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, enc.iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(enc.authTag);
  const plaintext = Buffer.concat([decipher.update(enc.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
