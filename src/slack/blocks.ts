import type { View } from "@slack/bolt";
import type {
  PlaneCycle,
  PlaneLabel,
  PlaneMember,
  PlaneModule,
  PlaneProject,
  PlaneState,
} from "../plane/types.js";
import { MESSAGES } from "./messages.js";

export const CALLBACK_IDS = {
  planeTokenSetup: "plane_token_setup_modal",
  issueCreate: "issue_create_modal",
  planeTokenResetConfirm: "plane_token_reset_confirm",
} as const;

export const ACTION_IDS = {
  projectSelect: "project_select",
} as const;

export const BLOCK_IDS = {
  planeTokenInput: "plane_token_input_block",
  project: "project_block",
  title: "title_block",
  description: "description_block",
  state: "state_block",
  priority: "priority_block",
  assignees: "assignees_block",
  labels: "labels_block",
  startDate: "start_date_block",
  dueDate: "due_date_block",
  cycle: "cycle_block",
  modules: "modules_block",
} as const;

export type ModalMeta = { channelId?: string; responseUrl?: string };

// channel_id + response_url are captured at /plane time and threaded through the
// modal so the success message can be posted back into the originating channel/DM.
export function encodeModalMeta(meta: ModalMeta): string {
  return JSON.stringify(meta);
}

export function decodeModalMeta(raw: string | undefined): ModalMeta {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as ModalMeta;
    return { channelId: o.channelId, responseUrl: o.responseUrl };
  } catch {
    return {};
  }
}

export function buildPlaneTokenSetupModal(opts: {
  planeWebBase: string;
  workspaceSlug: string;
}): View {
  return {
    type: "modal",
    callback_id: CALLBACK_IDS.planeTokenSetup,
    title: { type: "plain_text", text: "Plane token" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: MESSAGES.planeTokenSetupModalIntro(opts.planeWebBase, opts.workspaceSlug),
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.planeTokenInput,
        label: { type: "plain_text", text: "Personal Access Token" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          placeholder: { type: "plain_text", text: "plane_pat_..." },
        },
      },
    ],
  };
}

export function buildIssueCreateModal(opts: {
  projects: PlaneProject[];
  privateMetadata: string;
}): View {
  return {
    type: "modal",
    callback_id: CALLBACK_IDS.issueCreate,
    private_metadata: opts.privateMetadata,
    title: { type: "plain_text", text: "New Plane issue" },
    submit: { type: "plain_text", text: "Create" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      projectBlock(opts.projects),
      titleBlock(undefined),
      descriptionBlock(undefined),
      placeholderBlock(BLOCK_IDS.state, "State"),
      priorityBlock(undefined),
      placeholderBlock(BLOCK_IDS.assignees, "Assignees"),
      placeholderBlock(BLOCK_IDS.labels, "Labels"),
    ],
  };
}

export function buildIssueCreateModalWithProjectData(opts: {
  projects: PlaneProject[];
  selectedProjectId: string;
  states: PlaneState[];
  members: PlaneMember[];
  labels: PlaneLabel[];
  cycles: PlaneCycle[];
  modules: PlaneModule[];
  privateMetadata: string;
  previousValues?: {
    title?: string;
    description?: string;
    stateId?: string;
    priority?: string;
    assigneeIds?: string[];
    labelIds?: string[];
    startDate?: string;
    targetDate?: string;
  };
}): View {
  // No default state — the field opens empty so the user picks intentionally.
  // (A re-rendered modal still restores the user's previous pick.)
  const initialStateId = opts.previousValues?.stateId;
  // Dates are project-agnostic, so they survive a project change. Cycle/modules
  // are project-scoped and are intentionally NOT restored on re-select.
  const blocks = [
    projectBlock(opts.projects, opts.selectedProjectId),
    titleBlock(opts.previousValues?.title),
    descriptionBlock(opts.previousValues?.description),
    stateBlock(opts.states, initialStateId),
    priorityBlock(opts.previousValues?.priority as PriorityValue | undefined),
    startDateBlock(opts.previousValues?.startDate),
    dueDateBlock(opts.previousValues?.targetDate),
    cycleBlock(opts.cycles),
    modulesBlock(opts.modules),
    assigneesBlock(opts.members, opts.previousValues?.assigneeIds),
    labelsBlock(opts.labels, opts.previousValues?.labelIds),
  ].filter((b): b is NonNullable<typeof b> => b !== undefined);
  return {
    type: "modal",
    callback_id: CALLBACK_IDS.issueCreate,
    private_metadata: opts.privateMetadata,
    title: { type: "plain_text", text: "New Plane issue" },
    submit: { type: "plain_text", text: "Create" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

export function buildResetConfirmModal(): View {
  return {
    type: "modal",
    callback_id: CALLBACK_IDS.planeTokenResetConfirm,
    title: { type: "plain_text", text: "Delete token" },
    submit: { type: "plain_text", text: "Yes, delete" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: MESSAGES.planeTokenResetConfirmPrompt },
      },
    ],
  };
}

// ----- Block builders -----

function projectBlock(projects: PlaneProject[], initial?: string): View["blocks"][number] {
  const options = projects.map((p) => ({
    text: { type: "plain_text" as const, text: `${p.identifier} — ${p.name}` },
    value: p.id,
  }));
  const initialOption = initial ? options.find((o) => o.value === initial) : undefined;
  return {
    type: "input",
    block_id: BLOCK_IDS.project,
    dispatch_action: true,
    label: { type: "plain_text", text: "Project" },
    element: {
      type: "static_select",
      action_id: ACTION_IDS.projectSelect,
      placeholder: { type: "plain_text", text: "Select a project" },
      options,
      ...(initialOption ? { initial_option: initialOption } : {}),
    },
  };
}

function titleBlock(initial: string | undefined): View["blocks"][number] {
  return {
    type: "input",
    block_id: BLOCK_IDS.title,
    label: { type: "plain_text", text: "Title" },
    element: {
      type: "plain_text_input",
      action_id: "value",
      ...(initial ? { initial_value: initial } : {}),
    },
  };
}

function descriptionBlock(initial: string | undefined): View["blocks"][number] {
  return {
    type: "input",
    block_id: BLOCK_IDS.description,
    optional: true,
    label: { type: "plain_text", text: "Description" },
    element: {
      type: "plain_text_input",
      action_id: "value",
      multiline: true,
      ...(initial ? { initial_value: initial } : {}),
    },
  };
}

// Plane groups its states into these buckets; map each to an icon so the
// dropdown is scannable. Unknown groups fall back to a neutral dot.
const STATE_GROUP_ICONS: Record<string, string> = {
  backlog: "🗂️",
  unstarted: "📋",
  started: "🔄",
  completed: "✅",
  cancelled: "❌",
};

function stateBlock(states: PlaneState[], initialId?: string): View["blocks"][number] {
  const options = states.map((s) => {
    const icon = STATE_GROUP_ICONS[s.group] ?? "⚪";
    return {
      text: { type: "plain_text" as const, text: `${icon} ${s.name}`, emoji: true },
      value: s.id,
    };
  });
  const initialOption = initialId ? options.find((o) => o.value === initialId) : undefined;
  return {
    type: "input",
    block_id: BLOCK_IDS.state,
    optional: true,
    label: { type: "plain_text", text: "State" },
    element: {
      type: "static_select",
      action_id: "value",
      options,
      ...(initialOption ? { initial_option: initialOption } : {}),
    },
  };
}

type PriorityValue = "none" | "urgent" | "high" | "medium" | "low";

// Colored dots approximate Plane's priority colors (Slack can't style option text).
const PRIORITY_ICONS: Record<PriorityValue, string> = {
  urgent: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  none: "⚪",
};

function priorityBlock(initial?: PriorityValue): View["blocks"][number] {
  const options = (["none", "urgent", "high", "medium", "low"] as PriorityValue[]).map((p) => ({
    text: {
      type: "plain_text" as const,
      text: `${PRIORITY_ICONS[p]} ${p[0]?.toUpperCase() + p.slice(1)}`,
      emoji: true,
    },
    value: p,
  }));
  const initialOption = options.find((o) => o.value === (initial ?? "none"));
  return {
    type: "input",
    block_id: BLOCK_IDS.priority,
    optional: true,
    label: { type: "plain_text", text: "Priority" },
    element: {
      type: "static_select",
      action_id: "value",
      options,
      ...(initialOption ? { initial_option: initialOption } : {}),
    },
  };
}

function assigneesBlock(members: PlaneMember[], initialIds?: string[]): View["blocks"][number] {
  const options = members.map((m) => ({
    text: { type: "plain_text" as const, text: m.display_name },
    value: m.id,
  }));
  const initialOptions =
    initialIds && initialIds.length > 0
      ? options.filter((o) => initialIds.includes(o.value))
      : undefined;
  return {
    type: "input",
    block_id: BLOCK_IDS.assignees,
    optional: true,
    label: { type: "plain_text", text: "Assignees" },
    element: {
      type: "multi_static_select",
      action_id: "value",
      options,
      ...(initialOptions && initialOptions.length > 0 ? { initial_options: initialOptions } : {}),
    },
  };
}

function labelsBlock(labels: PlaneLabel[], initialIds?: string[]): View["blocks"][number] {
  const options = labels.map((l) => ({
    text: { type: "plain_text" as const, text: l.name },
    value: l.id,
  }));
  const initialOptions =
    initialIds && initialIds.length > 0
      ? options.filter((o) => initialIds.includes(o.value))
      : undefined;
  return {
    type: "input",
    block_id: BLOCK_IDS.labels,
    optional: true,
    label: { type: "plain_text", text: "Labels" },
    element: {
      type: "multi_static_select",
      action_id: "value",
      options,
      ...(initialOptions && initialOptions.length > 0 ? { initial_options: initialOptions } : {}),
    },
  };
}

function startDateBlock(initial?: string): View["blocks"][number] {
  return {
    type: "input",
    block_id: BLOCK_IDS.startDate,
    optional: true,
    label: { type: "plain_text", text: "Start date" },
    element: {
      type: "datepicker",
      action_id: "value",
      placeholder: { type: "plain_text", text: "Select a date" },
      ...(initial ? { initial_date: initial } : {}),
    },
  };
}

function dueDateBlock(initial?: string): View["blocks"][number] {
  return {
    type: "input",
    block_id: BLOCK_IDS.dueDate,
    optional: true,
    label: { type: "plain_text", text: "Due date" },
    element: {
      type: "datepicker",
      action_id: "value",
      placeholder: { type: "plain_text", text: "Select a date" },
      ...(initial ? { initial_date: initial } : {}),
    },
  };
}

// Cycle/modules are returned undefined when their option list is empty,
// because Slack rejects a select element with zero options. The caller filters
// undefined out, so the field simply does not appear.
function cycleBlock(cycles: PlaneCycle[]): View["blocks"][number] | undefined {
  if (cycles.length === 0) return undefined;
  return {
    type: "input",
    block_id: BLOCK_IDS.cycle,
    optional: true,
    label: { type: "plain_text", text: "Cycle" },
    element: {
      type: "static_select",
      action_id: "value",
      placeholder: { type: "plain_text", text: "Select a cycle" },
      options: cycles.map((c) => ({
        text: { type: "plain_text" as const, text: c.name },
        value: c.id,
      })),
    },
  };
}

function modulesBlock(modules: PlaneModule[]): View["blocks"][number] | undefined {
  if (modules.length === 0) return undefined;
  return {
    type: "input",
    block_id: BLOCK_IDS.modules,
    optional: true,
    label: { type: "plain_text", text: "Modules" },
    element: {
      type: "multi_static_select",
      action_id: "value",
      placeholder: { type: "plain_text", text: "Select modules" },
      options: modules.map((m) => ({
        text: { type: "plain_text" as const, text: m.name },
        value: m.id,
      })),
    },
  };
}

function placeholderBlock(blockId: string, label: string): View["blocks"][number] {
  return {
    type: "section",
    block_id: blockId,
    text: {
      type: "mrkdwn",
      text: `*${label}* — ${MESSAGES.loadingProjectFields}`,
    },
  };
}
