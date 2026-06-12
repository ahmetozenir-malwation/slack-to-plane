import pino, { type Logger } from "pino";

// Fixed at "trace" — the lowest level — so every log call is always emitted.
// There is intentionally no LOG_LEVEL knob: the bridge logs everything.
export function createLogger(): Logger {
  return pino({
    level: "trace",
    base: { service: "slack-plane-bridge" },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty",
            // One compact line per log; hide fields that repeat on every line.
            options: {
              colorize: true,
              singleLine: true,
              ignore: "pid,hostname,service",
            },
          },
  });
}

export type { Logger };
