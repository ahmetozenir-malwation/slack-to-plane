import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPlaneToken, encryptPlaneToken } from "../../src/crypto/encrypt.js";

describe("encryptPlaneToken / decryptPlaneToken", () => {
  const key = randomBytes(32);

  it("roundtrips a token", () => {
    const original = "plane_pat_abc123";
    const { ciphertext, iv, authTag } = encryptPlaneToken(original, key);
    const restored = decryptPlaneToken({ ciphertext, iv, authTag }, key);
    expect(restored).toBe(original);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "same-token";
    const a = encryptPlaneToken(plaintext, key);
    const b = encryptPlaneToken(plaintext, key);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it("rejects tampered ciphertext", () => {
    const { ciphertext, iv, authTag } = encryptPlaneToken("secret", key);
    ciphertext[0] = ciphertext[0] ^ 0xff;
    expect(() => decryptPlaneToken({ ciphertext, iv, authTag }, key)).toThrow();
  });

  it("rejects wrong key", () => {
    const enc = encryptPlaneToken("secret", key);
    const wrongKey = randomBytes(32);
    expect(() => decryptPlaneToken(enc, wrongKey)).toThrow();
  });

  it("rejects non-32-byte key on encrypt", () => {
    expect(() => encryptPlaneToken("secret", randomBytes(16))).toThrow(/32 bytes/);
  });
});
