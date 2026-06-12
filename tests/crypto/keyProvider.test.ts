import { describe, expect, it } from "vitest";
import { EnvKeyProvider } from "../../src/crypto/keyProvider.js";

describe("EnvKeyProvider", () => {
  it("returns the buffer it was constructed with", async () => {
    const buf = Buffer.alloc(32, 7);
    const provider = new EnvKeyProvider(buf);
    const key = await provider.getEncryptionKey();
    expect(key.equals(buf)).toBe(true);
  });
});
