// @slack/bolt is a CommonJS package, so under NodeNext ESM output a named
// import (`import { App } from "@slack/bolt"`) compiles but crashes at runtime
// ("Named export 'App' not found"). Import the default and destructure, then
// recover the instance types for use in annotations below.
import bolt from "@slack/bolt";
import type { Logger } from "pino";

const { App, ExpressReceiver } = bolt;
type App = InstanceType<typeof App>;
type ExpressReceiver = InstanceType<typeof ExpressReceiver>;

import type { AppConfig } from "../config/env.js";
import type { PlaneClient } from "../plane/client.js";
import type { TokenBucketLimiter } from "../rateLimit/tokenBucket.js";
import type { AuditRepository } from "../storage/audit.js";
import type { UsersRepository } from "../storage/users.js";
import { registerHandlers } from "./handlers/index.js";

export type Deps = {
  config: AppConfig;
  logger: Logger;
  users: UsersRepository;
  audit: AuditRepository;
  plane: PlaneClient;
  limiter: TokenBucketLimiter;
};

export function buildApp(deps: Deps): { app: App; receiver: ExpressReceiver } {
  const receiver = new ExpressReceiver({
    signingSecret: deps.config.slack.signingSecret,
    endpoints: { events: "/slack/events" },
    processBeforeResponse: true,
  });
  const app = new App({
    token: deps.config.slack.botToken,
    receiver,
    // In tests, provide bot identity placeholders so Bolt skips its startup
    // `auth.test` verification call (no real Slack workspace available).
    // In production, omit them so Bolt performs its normal auth.test startup
    // check and fails fast on a wrong/revoked SLACK_BOT_TOKEN.
    ...(process.env.NODE_ENV === "test" ? { botId: "B000000000", botUserId: "U000000000" } : {}),
  });

  // Global middleware: one compact line per inbound interaction with its
  // outcome, so there is always a trace of what the bridge handled — not just
  // failures. Runs for every command/action/view before the specific handler.
  app.use(async ({ body, next }) => {
    const { label, userId } = describeSlackEvent(body);
    const startedAt = Date.now();
    try {
      await next();
      deps.logger.info({ userId, ms: Date.now() - startedAt }, `slack ${label} ok`);
    } catch (err) {
      deps.logger.error({ userId, ms: Date.now() - startedAt, err }, `slack ${label} failed`);
      throw err;
    }
  });

  registerHandlers(app, deps);
  return { app, receiver };
}

// Build a short label (e.g. "/plane", "action:project_select",
// "submit:issue_create_modal") plus the acting user for one-line logging.
// Never includes tokens or input values — only routing metadata.
function describeSlackEvent(body: unknown): { label: string; userId?: string } {
  const b = body as {
    type?: string;
    command?: string;
    user_id?: string;
    user?: { id?: string };
    actions?: Array<{ action_id?: string }>;
    view?: { callback_id?: string };
  };
  if (b.command) return { label: b.command, userId: b.user_id };
  if (b.type === "block_actions") {
    return { label: `action:${b.actions?.[0]?.action_id ?? "?"}`, userId: b.user?.id };
  }
  if (b.type === "view_submission") {
    return { label: `submit:${b.view?.callback_id ?? "?"}`, userId: b.user?.id };
  }
  return { label: b.type ?? "unknown", userId: b.user?.id };
}
