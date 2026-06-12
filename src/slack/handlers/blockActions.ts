import type { App } from "@slack/bolt";
import type { Deps } from "../app.js";
import {
  ACTION_IDS,
  BLOCK_IDS,
  buildIssueCreateModal,
  buildIssueCreateModalWithProjectData,
} from "../blocks.js";
import { MESSAGES } from "../messages.js";
import { slackUsername } from "./slackUser.js";

export function registerBlockActions(app: App, deps: Deps): void {
  app.action(ACTION_IDS.projectSelect, async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const planeToken = deps.users.getPlaneToken(userId);
    if (!planeToken) return;

    const view = (
      body as unknown as {
        view: {
          id: string;
          private_metadata?: string;
          state: {
            values: Record<
              string,
              Record<
                string,
                {
                  type?: string;
                  value?: string;
                  selected_option?: { value: string };
                  selected_date?: string;
                }
              >
            >;
          };
        };
      }
    ).view;

    const privateMetadata = view.private_metadata ?? "";
    const selectedProjectId =
      view.state.values[BLOCK_IDS.project]?.[ACTION_IDS.projectSelect]?.selected_option?.value;
    if (!selectedProjectId) return;

    // Preserve project-agnostic inputs across the re-render.
    const title = view.state.values[BLOCK_IDS.title]?.value?.value;
    const description = view.state.values[BLOCK_IDS.description]?.value?.value;
    const startDate = view.state.values[BLOCK_IDS.startDate]?.value?.selected_date;
    const targetDate = view.state.values[BLOCK_IDS.dueDate]?.value?.selected_date;

    try {
      const [projects, states, members, labels, cycles, modules] = await Promise.all([
        deps.plane.listProjects(planeToken),
        deps.plane.listStates(planeToken, selectedProjectId),
        deps.plane.listMembers(planeToken, selectedProjectId),
        deps.plane.listLabels(planeToken, selectedProjectId),
        deps.plane.listCycles(planeToken, selectedProjectId),
        deps.plane.listModules(planeToken, selectedProjectId),
      ]);

      const updatedView = buildIssueCreateModalWithProjectData({
        projects,
        selectedProjectId,
        states,
        members,
        labels,
        cycles,
        modules,
        privateMetadata,
        previousValues: {
          title: typeof title === "string" ? title : undefined,
          description: typeof description === "string" ? description : undefined,
          startDate: typeof startDate === "string" ? startDate : undefined,
          targetDate: typeof targetDate === "string" ? targetDate : undefined,
        },
      });
      await client.views.update({ view_id: view.id, view: updatedView });
    } catch (err) {
      deps.audit.write({
        slackUserId: userId,
        slackUsername: slackUsername(body.user),
        action: "project_select_failed",
        planeProjectId: selectedProjectId,
        errorCode: (err as { code?: string }).code,
      });
      deps.logger.warn({ err, userId, selectedProjectId }, "project select fetch failed");
      // Re-render modal with a notice so the user knows fields didn't load.
      try {
        const projects = await deps.plane.listProjects(planeToken);
        const updatedView = buildIssueCreateModal({ projects, privateMetadata });
        updatedView.blocks = [
          {
            type: "section",
            text: { type: "mrkdwn", text: MESSAGES.projectFieldsFailed },
          },
          ...updatedView.blocks,
        ];
        await client.views.update({ view_id: view.id, view: updatedView });
      } catch {
        // If even projects-only refresh fails, give up silently — partial degradation.
      }
    }
  });
}
