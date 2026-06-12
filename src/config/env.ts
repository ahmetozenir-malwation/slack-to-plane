import { z } from "zod";

const EnvSchema = z.object({
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  PLANE_TOKEN_ENCRYPTION_KEY: z.string().min(1),
  PLANE_API_BASE: z.string().url().or(z.string().startsWith("http")),
  PLANE_WORKSPACE_SLUG: z.string().min(1),
  PLANE_WEB_BASE: z.string().startsWith("http"),
  PORT: z.string().default("3000"),
  DB_PATH: z.string().default("./data/bridge.db"),
});

export type AppConfig = {
  slack: { signingSecret: string; botToken: string };
  encryption: { key: Buffer };
  plane: { apiBase: string; workspaceSlug: string; webBase: string };
  port: number;
  dbPath: string;
};

export function parseEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.parse(env);
  const key = Buffer.from(parsed.PLANE_TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("PLANE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64)");
  }
  return {
    slack: {
      signingSecret: parsed.SLACK_SIGNING_SECRET,
      botToken: parsed.SLACK_BOT_TOKEN,
    },
    encryption: { key },
    plane: {
      apiBase: parsed.PLANE_API_BASE,
      workspaceSlug: parsed.PLANE_WORKSPACE_SLUG,
      webBase: parsed.PLANE_WEB_BASE,
    },
    port: Number.parseInt(parsed.PORT, 10),
    dbPath: parsed.DB_PATH,
  };
}
