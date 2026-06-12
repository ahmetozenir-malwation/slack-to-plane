import "dotenv/config";
import process from "node:process";
import { parseEnv } from "./config/env.js";
import { EnvKeyProvider } from "./crypto/keyProvider.js";
import { registerHealthRoute } from "./http/health.js";
import { createLogger } from "./logging/logger.js";
import { PlaneClient } from "./plane/client.js";
import { TokenBucketLimiter } from "./rateLimit/tokenBucket.js";
import { buildApp } from "./slack/app.js";
import { AuditRepository } from "./storage/audit.js";
import { openDatabase } from "./storage/db.js";
import { UsersRepository } from "./storage/users.js";

async function main(): Promise<void> {
  const config = parseEnv(process.env);
  const logger = createLogger();

  const keyProvider = new EnvKeyProvider(config.encryption.key);
  const encryptionKey = await keyProvider.getEncryptionKey();

  const db = openDatabase(config.dbPath);
  const users = new UsersRepository(db, encryptionKey);
  const audit = new AuditRepository(db);
  const plane = new PlaneClient({
    apiBase: config.plane.apiBase,
    workspaceSlug: config.plane.workspaceSlug,
    logger,
  });
  const limiter = new TokenBucketLimiter({ capacity: 60, refillPerSec: 1 });

  const { app, receiver } = buildApp({ config, logger, users, audit, plane, limiter });
  registerHealthRoute(receiver.app, db);

  await app.start(config.port);
  logger.info({ port: config.port }, "slack-plane-bridge started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutdown initiated");
    try {
      await app.stop();
      db.close();
      logger.info("shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "shutdown failure");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("fatal startup error:", err);
  process.exit(1);
});
