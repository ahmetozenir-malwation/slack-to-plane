import type { App } from "@slack/bolt";
import type { Deps } from "../app.js";
import {
  buildIssueCreateModal,
  buildPlaneTokenSetupModal,
  buildResetConfirmModal,
  encodeModalMeta,
} from "../blocks.js";
import { MESSAGES } from "../messages.js";

export function registerSlashCommand(app: App, deps: Deps): void {
  app.command("/plane", async ({ command, ack, client, respond }) => {
    await ack();
    if (!deps.limiter.tryAcquire(`team:${command.team_id}`)) {
      await respond({ text: MESSAGES.rateLimited, response_type: "ephemeral" });
      return;
    }
    const sub = command.text.trim().toLowerCase();

    if (sub === "help") {
      await respond({ text: MESSAGES.helpText, response_type: "ephemeral" });
      return;
    }

    if (sub === "reset") {
      const has = deps.users.getPlaneToken(command.user_id) !== null;
      if (!has) {
        await respond({ text: MESSAGES.planeTokenResetNoToken, response_type: "ephemeral" });
        return;
      }
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildResetConfirmModal(),
      });
      return;
    }

    if (sub === "setup") {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildPlaneTokenSetupModal({
          planeWebBase: deps.config.plane.webBase,
          workspaceSlug: deps.config.plane.workspaceSlug,
        }),
      });
      return;
    }

    // Default: open issue modal or token setup if user has no token saved
    const planeToken = deps.users.getPlaneToken(command.user_id);
    if (!planeToken) {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildPlaneTokenSetupModal({
          planeWebBase: deps.config.plane.webBase,
          workspaceSlug: deps.config.plane.workspaceSlug,
        }),
      });
      return;
    }

    try {
      const projects = await deps.plane.listProjects(planeToken);
      const privateMetadata = encodeModalMeta({
        channelId: command.channel_id,
        responseUrl: command.response_url,
      });
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildIssueCreateModal({ projects, privateMetadata }),
      });
    } catch (err) {
      deps.logger.warn({ err, userId: command.user_id }, "listProjects failed");
      const code = (err as { code?: string }).code;
      if (code === "PLANE_TOKEN_INVALID") {
        deps.audit.write({
          slackUserId: command.user_id,
          slackUsername: command.user_name,
          action: "plane_token_invalid",
        });
        await respond({ text: MESSAGES.planeTokenInvalid, response_type: "ephemeral" });
      } else if (code === "PLANE_5XX" || code === "TIMEOUT") {
        await respond({ text: MESSAGES.planeUnavailable, response_type: "ephemeral" });
      } else {
        await respond({ text: MESSAGES.networkError, response_type: "ephemeral" });
      }
    }
  });
}
