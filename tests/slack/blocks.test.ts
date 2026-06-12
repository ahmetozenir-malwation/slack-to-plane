import { describe, expect, it } from "vitest";
import {
  buildIssueCreateModal,
  buildIssueCreateModalWithProjectData,
  buildPlaneTokenSetupModal,
  buildResetConfirmModal,
  CALLBACK_IDS,
  decodeModalMeta,
  encodeModalMeta,
} from "../../src/slack/blocks.js";

describe("buildPlaneTokenSetupModal", () => {
  it("produces a view with token input block", () => {
    const view = buildPlaneTokenSetupModal({
      planeWebBase: "http://plane.example.com",
      workspaceSlug: "your-workspace",
    });
    expect(view.type).toBe("modal");
    expect(view.callback_id).toBe(CALLBACK_IDS.planeTokenSetup);
    const inputs = view.blocks.filter((b) => b.type === "input");
    expect(inputs).toHaveLength(1);
    expect((inputs[0] as { block_id: string }).block_id).toBe("plane_token_input_block");
  });
});

describe("buildIssueCreateModal (no project selected)", () => {
  it("renders project dropdown and disabled placeholder fields", () => {
    const view = buildIssueCreateModal({
      projects: [
        { id: "p1", name: "Project A", identifier: "PA" },
        { id: "p2", name: "Project B", identifier: "PB" },
      ],
      privateMetadata: "",
    });
    expect(view.callback_id).toBe(CALLBACK_IDS.issueCreate);
    const projectBlock = view.blocks.find(
      (b) => (b as { block_id?: string }).block_id === "project_block",
    );
    expect(projectBlock).toBeDefined();
    const stateBlock = view.blocks.find(
      (b) => (b as { block_id?: string }).block_id === "state_block",
    );
    expect(stateBlock).toBeDefined();
  });
});

describe("buildIssueCreateModalWithProjectData", () => {
  it("populates state, assignees, labels for selected project", () => {
    const view = buildIssueCreateModalWithProjectData({
      projects: [{ id: "p1", name: "A", identifier: "A" }],
      selectedProjectId: "p1",
      states: [
        { id: "s1", name: "Backlog", group: "backlog", default: true },
        { id: "s2", name: "Todo", group: "unstarted", default: false },
      ],
      members: [{ id: "m1", display_name: "Ahmet" }],
      labels: [{ id: "l1", name: "bug" }],
      cycles: [],
      modules: [],
      privateMetadata: "",
      previousValues: { title: "saved title" },
    });
    expect(view.callback_id).toBe(CALLBACK_IDS.issueCreate);
    const titleBlock = view.blocks.find(
      (b) => (b as { block_id?: string }).block_id === "title_block",
    ) as { element: { initial_value?: string } };
    expect(titleBlock?.element.initial_value).toBe("saved title");
  });
});

describe("buildResetConfirmModal", () => {
  it("uses plane_token_reset_confirm callback_id", () => {
    const view = buildResetConfirmModal();
    expect(view.callback_id).toBe(CALLBACK_IDS.planeTokenResetConfirm);
  });
});

describe("modal meta", () => {
  it("round-trips channelId and responseUrl", () => {
    const enc = encodeModalMeta({ channelId: "C1", responseUrl: "https://hooks.slack.com/x" });
    expect(decodeModalMeta(enc)).toEqual({
      channelId: "C1",
      responseUrl: "https://hooks.slack.com/x",
    });
  });
  it("decode tolerates undefined/garbage", () => {
    expect(decodeModalMeta(undefined)).toEqual({});
    expect(decodeModalMeta("not json")).toEqual({});
  });
});

describe("buildIssueCreateModalWithProjectData (extra fields)", () => {
  const base = {
    projects: [{ id: "p1", name: "A", identifier: "A" }],
    selectedProjectId: "p1",
    states: [{ id: "s1", name: "Backlog", group: "backlog", default: true }],
    members: [{ id: "m1", display_name: "Ahmet" }],
    labels: [{ id: "l1", name: "bug" }],
    privateMetadata: encodeModalMeta({ channelId: "C1", responseUrl: "https://hooks.slack.com/x" }),
  };
  const blockIds = (v: { blocks: Array<{ block_id?: string }> }) =>
    v.blocks.map((b) => b.block_id).filter(Boolean);

  it("renders date/cycle/module blocks and carries private_metadata", () => {
    const view = buildIssueCreateModalWithProjectData({
      ...base,
      cycles: [{ id: "c1", name: "Sprint 1" }],
      modules: [{ id: "mod1", name: "Auth" }],
    });
    expect(view.private_metadata).toBe(base.privateMetadata);
    const ids = blockIds(view as never);
    expect(ids).toEqual(
      expect.arrayContaining([
        "start_date_block",
        "due_date_block",
        "cycle_block",
        "modules_block",
      ]),
    );
  });

  it("omits cycle/module blocks when their lists are empty", () => {
    const view = buildIssueCreateModalWithProjectData({
      ...base,
      cycles: [],
      modules: [],
    });
    const ids = blockIds(view as never);
    expect(ids).not.toContain("cycle_block");
    expect(ids).not.toContain("modules_block");
    // dates are not project-scoped and always render
    expect(ids).toContain("start_date_block");
    expect(ids).toContain("due_date_block");
  });

  it("restores previous dates but not project-scoped picks", () => {
    const view = buildIssueCreateModalWithProjectData({
      ...base,
      cycles: [{ id: "c1", name: "Sprint 1" }],
      modules: [],
      previousValues: { startDate: "2026-06-01", targetDate: "2026-06-10" },
    });
    const start = (
      view.blocks as Array<{ block_id?: string; element?: { initial_date?: string } }>
    ).find((b) => b.block_id === "start_date_block");
    expect(start?.element?.initial_date).toBe("2026-06-01");
  });
});
