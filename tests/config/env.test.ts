import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

describe("parseEnv", () => {
  const valid = {
    SLACK_SIGNING_SECRET: "abc123",
    SLACK_BOT_TOKEN: "xoxb-test",
    PLANE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    PLANE_API_BASE: "http://plane-api:8000",
    PLANE_WORKSPACE_SLUG: "your-workspace",
    PLANE_WEB_BASE: "http://plane.example.com",
  };

  it("parses valid env", () => {
    const cfg = parseEnv(valid);
    expect(cfg.slack.signingSecret).toBe("abc123");
    expect(cfg.plane.workspaceSlug).toBe("your-workspace");
    expect(cfg.encryption.key).toHaveLength(32);
    expect(cfg.port).toBe(3000);
  });

  it("uses default port", () => {
    const cfg = parseEnv(valid);
    expect(cfg.port).toBe(3000);
  });

  it("overrides PORT", () => {
    const cfg = parseEnv({ ...valid, PORT: "4000" });
    expect(cfg.port).toBe(4000);
  });

  it("throws on missing required field", () => {
    const { SLACK_SIGNING_SECRET, ...incomplete } = valid;
    expect(() => parseEnv(incomplete)).toThrow(/SLACK_SIGNING_SECRET/);
  });

  it("throws on invalid PLANE_TOKEN_ENCRYPTION_KEY length", () => {
    const bad = { ...valid, PLANE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") };
    expect(() => parseEnv(bad)).toThrow(/32 bytes/);
  });
});
