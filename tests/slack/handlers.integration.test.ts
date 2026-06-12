import { randomBytes } from "node:crypto";
import type { Database } from "better-sqlite3";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneClient } from "../../src/plane/client.js";
import { TokenBucketLimiter } from "../../src/rateLimit/tokenBucket.js";
import { buildApp, type Deps } from "../../src/slack/app.js";
import { AuditRepository } from "../../src/storage/audit.js";
import { UsersRepository } from "../../src/storage/users.js";
import { createTestDb } from "../helpers/testDb.js";

function makeDeps(db: Database): Deps {
  const key = randomBytes(32);
  return {
    config: {
      slack: { signingSecret: "test-secret", botToken: "xoxb-test" },
      encryption: { key },
      plane: {
        apiBase: "http://plane-api:8000",
        workspaceSlug: "your-workspace",
        webBase: "http://plane.example.com",
      },
      port: 3000,
      dbPath: ":memory:",
    },
    // Silent logger keeps test output clean (the app logger is fixed at trace).
    logger: pino({ level: "silent" }),
    users: new UsersRepository(db, key),
    audit: new AuditRepository(db),
    plane: new PlaneClient({ apiBase: "http://plane-api:8000", workspaceSlug: "your-workspace" }),
    limiter: new TokenBucketLimiter({ capacity: 1000, refillPerSec: 1000 }),
  };
}

// Bolt routes through a per-team WebClientPool when body.team_id is set, which
// creates a fresh WebClient that bypasses our mock on app.client. Stubbing the
// pool to always hand back app.client makes our mocks observable in the listener.
function pinClientToAppClient(app: { client: unknown; clients?: unknown }, teamId: string): void {
  (app as { clients: Record<string, { getOrCreate: () => unknown }> }).clients = {
    [teamId]: { getOrCreate: () => app.client },
  };
}

describe("/plane slash command", () => {
  let db: Database;
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => {
    db.close();
    globalThis.fetch = originalFetch;
  });

  it("opens PAT setup modal when user has no PAT", async () => {
    const deps = makeDeps(db);
    const viewsOpen = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { views: { open: typeof viewsOpen } }).views = {
      open: viewsOpen,
    };
    pinClientToAppClient(app, "T1");
    await app.processEvent({
      body: {
        command: "/plane",
        text: "",
        user_id: "U1",
        team_id: "T1",
        trigger_id: "trig",
      },
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);
    expect(viewsOpen).toHaveBeenCalled();
    const view = viewsOpen.mock.calls[0]?.[0]?.view;
    expect(view.callback_id).toBe("plane_token_setup_modal");
  });

  it("opens issue create modal when user has PAT (mocked Plane)", async () => {
    const deps = makeDeps(db);
    deps.users.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p-good" });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ id: "p1", name: "A", identifier: "A" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const viewsOpen = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { views: { open: typeof viewsOpen } }).views = {
      open: viewsOpen,
    };
    pinClientToAppClient(app, "T1");
    await app.processEvent({
      body: {
        command: "/plane",
        text: "",
        user_id: "U1",
        team_id: "T1",
        trigger_id: "trig",
      },
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);
    const view = viewsOpen.mock.calls[0]?.[0]?.view;
    expect(view.callback_id).toBe("issue_create_modal");
  });
});

describe("PAT setup view_submission", () => {
  let db: Database;
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => {
    db.close();
    globalThis.fetch = originalFetch;
  });

  it("validates PAT, stores it, and sends ephemeral success", async () => {
    const deps = makeDeps(db);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const chatPost = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { chat: { postEphemeral: typeof chatPost } }).chat = {
      postEphemeral: chatPost,
    };
    pinClientToAppClient(app, "T1");

    await app.processEvent({
      body: {
        type: "view_submission",
        user: { id: "U1", team_id: "T1" },
        team: { id: "T1" },
        view: {
          callback_id: "plane_token_setup_modal",
          state: {
            values: {
              plane_token_input_block: { value: { type: "plain_text_input", value: "good-pat" } },
            },
          },
        },
      },
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    expect(deps.users.getPlaneToken("U1")).toBe("good-pat");
    expect(chatPost).toHaveBeenCalled();
  });

  it("rejects invalid PAT and sends ephemeral error", async () => {
    const deps = makeDeps(db);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const chatPost = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { chat: { postEphemeral: typeof chatPost } }).chat = {
      postEphemeral: chatPost,
    };
    pinClientToAppClient(app, "T1");

    await app.processEvent({
      body: {
        type: "view_submission",
        user: { id: "U1", team_id: "T1" },
        team: { id: "T1" },
        view: {
          callback_id: "plane_token_setup_modal",
          state: {
            values: {
              plane_token_input_block: { value: { type: "plain_text_input", value: "bad-pat" } },
            },
          },
        },
      },
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    expect(deps.users.getPlaneToken("U1")).toBeNull();
    expect(chatPost).not.toHaveBeenCalled();
  });
});

describe("Issue create view_submission", () => {
  let db: Database;
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => {
    db.close();
    globalThis.fetch = originalFetch;
  });

  function buildSubmissionBody() {
    return {
      type: "view_submission",
      user: { id: "U1", team_id: "T1" },
      team: { id: "T1" },
      view: {
        callback_id: "issue_create_modal",
        private_metadata: JSON.stringify({
          channelId: "C1",
          responseUrl: "https://hooks.slack.com/commands/T1/1/abc",
        }),
        state: {
          values: {
            project_block: {
              project_select: { type: "static_select", selected_option: { value: "p1" } },
            },
            title_block: {
              value: { type: "plain_text_input", value: "Title here" },
            },
            description_block: {
              value: { type: "plain_text_input", value: "desc" },
            },
            state_block: {
              value: { type: "static_select", selected_option: { value: "s1" } },
            },
            priority_block: {
              value: { type: "static_select", selected_option: { value: "high" } },
            },
            assignees_block: {
              value: { type: "multi_static_select", selected_options: [] },
            },
            labels_block: {
              value: { type: "multi_static_select", selected_options: [] },
            },
          },
        },
      },
    };
  }

  it("creates issue and posts an in_channel message to response_url", async () => {
    const deps = makeDeps(db);
    deps.users.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("hooks.slack.com")) return new Response("ok", { status: 200 });
      // Plane create issue
      return new Response(
        JSON.stringify({ id: "i1", sequence_id: 42, name: "Title here", project: "p1" }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock;
    const chatPost = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { chat: { postEphemeral: typeof chatPost } }).chat = {
      postEphemeral: chatPost,
    };
    pinClientToAppClient(app, "T1");

    await app.processEvent({
      body: buildSubmissionBody(),
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    const slackCall = fetchMock.mock.calls.find(([u]) => String(u).includes("hooks.slack.com"));
    expect(slackCall).toBeDefined();
    const payload = JSON.parse((slackCall?.[1] as RequestInit).body as string);
    expect(payload.response_type).toBe("in_channel");
    expect(payload.text).toContain("#42");
    // success goes to the channel, not an ephemeral DM
    expect(chatPost).not.toHaveBeenCalled();
    expect(deps.audit.recentForUser("U1", 5)[0]?.action).toBe("issue_create");
  });

  it("on PAT_INVALID, sends invalid PAT message and audits", async () => {
    const deps = makeDeps(db);
    deps.users.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const chatPost = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { chat: { postEphemeral: typeof chatPost } }).chat = {
      postEphemeral: chatPost,
    };
    pinClientToAppClient(app, "T1");

    await app.processEvent({
      body: buildSubmissionBody(),
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    expect(chatPost).toHaveBeenCalled();
    const text = chatPost.mock.calls[0]?.[0]?.text as string;
    expect(text.toLowerCase()).toContain("invalid");
  });

  it("on PLANE_5XX, sends unavailable message", async () => {
    const deps = makeDeps(db);
    deps.users.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    const chatPost = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { chat: { postEphemeral: typeof chatPost } }).chat = {
      postEphemeral: chatPost,
    };
    pinClientToAppClient(app, "T1");

    await app.processEvent({
      body: buildSubmissionBody(),
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    const text = chatPost.mock.calls[0]?.[0]?.text as string;
    expect(text.toLowerCase()).toContain("not responding");
  });

  it("rejects start_date after due_date with an inline error", async () => {
    const deps = makeDeps(db);
    deps.users.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });
    const ack = vi.fn();
    const { app } = buildApp(deps);
    pinClientToAppClient(app, "T1");
    const body = buildSubmissionBody();
    body.view.state.values.start_date_block = {
      value: { type: "datepicker", selected_date: "2026-06-10" },
    } as never;
    body.view.state.values.due_date_block = {
      value: { type: "datepicker", selected_date: "2026-06-01" },
    } as never;

    await app.processEvent({
      body,
      ack,
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ response_action: "errors" }));
  });

  it("attaches selected cycle and still reports success when attach fails", async () => {
    const deps = makeDeps(db);
    deps.users.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("hooks.slack.com")) return new Response("ok", { status: 200 });
      if (url.includes("/cycle-issues/")) return new Response("", { status: 500 }); // attach fails (+ retry)
      return new Response(JSON.stringify({ id: "i1", sequence_id: 9, name: "T", project: "p1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock;
    const { app } = buildApp(deps);
    pinClientToAppClient(app, "T1");
    const body = buildSubmissionBody();
    body.view.state.values.cycle_block = {
      value: { type: "static_select", selected_option: { value: "c1" } },
    } as never;

    await app.processEvent({
      body,
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/cycles/c1/cycle-issues/"))).toBe(
      true,
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("hooks.slack.com"))).toBe(true);
    const actions = deps.audit.recentForUser("U1", 5).map((r) => r.action);
    expect(actions).toContain("issue_cycle_attach_failed");
    expect(actions).toContain("issue_create");
  });
});

describe("project_select block_action", () => {
  let db: Database;
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => {
    db.close();
    globalThis.fetch = originalFetch;
  });

  it("on project select, fetches states/members/labels and calls views.update", async () => {
    const deps = makeDeps(db);
    deps.users.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/states/"))
        return new Response(
          JSON.stringify({
            results: [{ id: "s1", name: "Backlog", group: "backlog", default: true }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      if (url.includes("/members/"))
        return new Response(JSON.stringify({ results: [{ id: "m1", display_name: "Ahmet" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/labels/"))
        return new Response(JSON.stringify({ results: [{ id: "l1", name: "bug" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.endsWith("/projects/"))
        return new Response(
          JSON.stringify({ results: [{ id: "p1", name: "A", identifier: "A" }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      return new Response("", { status: 404 });
    });
    globalThis.fetch = fetchMock;

    const viewsUpdate = vi.fn().mockResolvedValue({ ok: true });
    const { app } = buildApp(deps);
    (app.client as unknown as { views: { update: typeof viewsUpdate } }).views = {
      update: viewsUpdate,
    };
    pinClientToAppClient(app, "T1");

    await app.processEvent({
      body: {
        type: "block_actions",
        user: { id: "U1", team_id: "T1" },
        team: { id: "T1" },
        view: {
          id: "V1",
          callback_id: "issue_create_modal",
          state: {
            values: {
              project_block: {
                project_select: { type: "static_select", selected_option: { value: "p1" } },
              },
              title_block: { value: { type: "plain_text_input", value: "" } },
              description_block: { value: { type: "plain_text_input", value: "" } },
            },
          },
        },
        actions: [{ action_id: "project_select", selected_option: { value: "p1" } }],
      },
      ack: vi.fn(),
      retryNum: undefined,
      retryReason: undefined,
      customProperties: {},
    } as never);

    expect(viewsUpdate).toHaveBeenCalled();
    const call = viewsUpdate.mock.calls[0]?.[0];
    expect(call.view_id).toBe("V1");
    expect(call.view.callback_id).toBe("issue_create_modal");
  });
});
