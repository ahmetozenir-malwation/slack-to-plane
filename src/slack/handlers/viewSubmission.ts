import type { App } from "@slack/bolt";
import type { Deps } from "../app.js";
import { ACTION_IDS, BLOCK_IDS, CALLBACK_IDS, decodeModalMeta } from "../blocks.js";
import { MESSAGES } from "../messages.js";
import { postToResponseUrl } from "../responseUrl.js";
import { slackUsername } from "./slackUser.js";

function buildIssueUrl(
  webBase: string,
  workspaceSlug: string,
  projectId: string,
  issueId: string,
): string {
  return `${webBase}/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`;
}

export function registerViewSubmissions(app: App, deps: Deps): void {
  app.view(CALLBACK_IDS.planeTokenSetup, async ({ ack, body, client }) => {
    const userId = body.user.id;
    const username = slackUsername(body.user);
    const teamId = body.user.team_id ?? body.team?.id ?? "";
    const teamKey = `team:${body.team?.id ?? body.user.team_id}`;
    if (!deps.limiter.tryAcquire(teamKey)) {
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.planeTokenInput]: "Too many requests — please wait a moment." },
      });
      return;
    }
    const planeToken = body.view.state.values[BLOCK_IDS.planeTokenInput]?.value?.value as
      | string
      | undefined;

    if (!planeToken || planeToken.trim().length === 0) {
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.planeTokenInput]: "Token cannot be empty" },
      });
      return;
    }

    try {
      // Validate via listProjects
      await deps.plane.listProjects(planeToken);
      // Best-effort: record which Plane account this is. A failure here must not
      // block saving an otherwise-valid token, so swallow errors and store null.
      let planeUserEmail: string | undefined;
      try {
        planeUserEmail = (await deps.plane.getCurrentUser(planeToken)).email;
      } catch (meErr) {
        deps.logger.warn({ err: meErr, userId }, "could not fetch Plane user email");
      }
      deps.users.setPlaneToken({
        slackUserId: userId,
        slackUsername: username,
        slackTeamId: teamId,
        planeToken,
        planeUserEmail,
      });
      deps.audit.write({ slackUserId: userId, slackUsername: username, action: "plane_token_set" });
      await ack();
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: MESSAGES.planeTokenSavedSuccess,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "PLANE_TOKEN_INVALID") {
        deps.audit.write({
          slackUserId: userId,
          slackUsername: username,
          action: "plane_token_invalid",
        });
        await ack({
          response_action: "errors",
          errors: { [BLOCK_IDS.planeTokenInput]: "Token invalid — generate a new one in Plane." },
        });
        return;
      }
      deps.logger.error({ err, userId }, "Plane token validation failed");
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.planeTokenInput]: "Could not reach Plane — please try again." },
      });
    }
  });

  // PAT reset confirm
  app.view(CALLBACK_IDS.planeTokenResetConfirm, async ({ ack, body, client }) => {
    const userId = body.user.id;
    const username = slackUsername(body.user);
    // Rate-limit: this modal has no input BLOCK_ID to surface an inline error,
    // so on throttle we silently ack to dismiss the modal and skip the deletion
    // + audit. The user can retry shortly after.
    const teamKey = `team:${body.team?.id ?? body.user.team_id}`;
    if (!deps.limiter.tryAcquire(teamKey)) {
      await ack();
      return;
    }
    deps.users.deletePlaneToken(userId);
    deps.audit.write({ slackUserId: userId, slackUsername: username, action: "plane_token_reset" });
    await ack();
    await client.chat.postEphemeral({
      channel: userId,
      user: userId,
      text: MESSAGES.planeTokenReset,
    });
  });

  app.view(CALLBACK_IDS.issueCreate, async ({ ack, body, client }) => {
    const userId = body.user.id;
    const username = slackUsername(body.user);
    const teamKey = `team:${body.team?.id ?? body.user.team_id}`;
    if (!deps.limiter.tryAcquire(teamKey)) {
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.title]: "Too many requests — please wait a moment." },
      });
      return;
    }
    const values = body.view.state.values;
    const projectId = values[BLOCK_IDS.project]?.[ACTION_IDS.projectSelect]?.selected_option
      ?.value as string | undefined;
    const title = values[BLOCK_IDS.title]?.value?.value as string | undefined;
    // Slack sends `value: null` (not undefined) for an empty optional text input,
    // so normalize to undefined to keep it out of the Plane payload.
    const description =
      (values[BLOCK_IDS.description]?.value?.value as string | null | undefined) ?? undefined;
    const stateId = values[BLOCK_IDS.state]?.value?.selected_option?.value as string | undefined;
    const priority = values[BLOCK_IDS.priority]?.value?.selected_option?.value as
      | "none"
      | "urgent"
      | "high"
      | "medium"
      | "low"
      | undefined;
    const assigneeIds =
      (
        values[BLOCK_IDS.assignees]?.value?.selected_options as Array<{ value: string }> | undefined
      )?.map((o) => o.value) ?? [];
    const labelIds =
      (
        values[BLOCK_IDS.labels]?.value?.selected_options as Array<{ value: string }> | undefined
      )?.map((o) => o.value) ?? [];
    const startDate =
      (values[BLOCK_IDS.startDate]?.value?.selected_date as string | null | undefined) ?? undefined;
    const targetDate =
      (values[BLOCK_IDS.dueDate]?.value?.selected_date as string | null | undefined) ?? undefined;
    const cycleId = values[BLOCK_IDS.cycle]?.value?.selected_option?.value as string | undefined;
    const moduleIds =
      (
        values[BLOCK_IDS.modules]?.value?.selected_options as Array<{ value: string }> | undefined
      )?.map((o) => o.value) ?? [];

    if (!projectId) {
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.project]: "Select a project" },
      });
      return;
    }
    if (!title || title.trim().length === 0) {
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.title]: "Title cannot be empty" },
      });
      return;
    }

    const planeToken = deps.users.getPlaneToken(userId);
    if (!planeToken) {
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.title]: "Token not found — add one with `/plane setup`." },
      });
      return;
    }

    // ISO "YYYY-MM-DD" strings compare correctly lexicographically. Validate here
    // because the Plane 400 for start>target maps to a generic error with no field.
    if (startDate && targetDate && startDate > targetDate) {
      await ack({
        response_action: "errors",
        errors: { [BLOCK_IDS.dueDate]: MESSAGES.dateRangeInvalid },
      });
      return;
    }

    await ack();

    const { responseUrl } = decodeModalMeta(body.view.private_metadata);

    try {
      const issue = await deps.plane.createIssue(planeToken, {
        projectId,
        name: title,
        description,
        stateId,
        priority,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
        startDate,
        targetDate,
      });
      deps.users.touchLastUsed(userId);
      deps.audit.write({
        slackUserId: userId,
        slackUsername: username,
        action: "issue_create",
        planeProjectId: projectId,
        planeIssueId: issue.id,
      });

      // Cycle/module attaches are separate Plane endpoints and best-effort: a
      // failure is logged + audited but never blocks the success message, since
      // the issue itself already exists.
      const attachTasks: Promise<unknown>[] = [];
      if (cycleId) {
        attachTasks.push(
          deps.plane.addIssueToCycle(planeToken, projectId, cycleId, issue.id).catch((e) => {
            deps.logger.warn({ err: e, issueId: issue.id, cycleId }, "cycle attach failed");
            deps.audit.write({
              slackUserId: userId,
              slackUsername: username,
              action: "issue_cycle_attach_failed",
              planeProjectId: projectId,
              planeIssueId: issue.id,
              errorCode: (e as { code?: string }).code,
            });
          }),
        );
      }
      for (const moduleId of moduleIds) {
        attachTasks.push(
          deps.plane.addIssueToModule(planeToken, projectId, moduleId, issue.id).catch((e) => {
            deps.logger.warn({ err: e, issueId: issue.id, moduleId }, "module attach failed");
            deps.audit.write({
              slackUserId: userId,
              slackUsername: username,
              action: "issue_module_attach_failed",
              planeProjectId: projectId,
              planeIssueId: issue.id,
              errorCode: (e as { code?: string }).code,
            });
          }),
        );
      }
      await Promise.allSettled(attachTasks);

      const url = buildIssueUrl(
        deps.config.plane.webBase,
        deps.config.plane.workspaceSlug,
        projectId,
        issue.id,
      );
      const text = MESSAGES.issueSuccess(issue.sequence_id, issue.name, url);

      // Post publicly into the channel/DM where /plane was run. Fall back to an
      // ephemeral DM to the creator if the response_url is missing or fails, so
      // the user always gets their link.
      if (responseUrl) {
        try {
          await postToResponseUrl(responseUrl, { response_type: "in_channel", text });
        } catch (e) {
          deps.logger.warn({ err: e, userId }, "response_url post failed; ephemeral fallback");
          await client.chat.postEphemeral({ channel: userId, user: userId, text });
        }
      } else {
        await client.chat.postEphemeral({ channel: userId, user: userId, text });
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      deps.audit.write({
        slackUserId: userId,
        slackUsername: username,
        action: "issue_failed",
        planeProjectId: projectId,
        errorCode: code,
      });
      deps.logger.error({ err, userId, code, projectId }, "issue create failed");
      const text =
        code === "PLANE_TOKEN_INVALID"
          ? MESSAGES.planeTokenInvalid
          : code === "PLANE_5XX" || code === "TIMEOUT"
            ? MESSAGES.planeUnavailable
            : code === "NETWORK_ERROR"
              ? MESSAGES.networkError
              : MESSAGES.unknownError;
      await client.chat.postEphemeral({ channel: userId, user: userId, text });
    }
  });
}
