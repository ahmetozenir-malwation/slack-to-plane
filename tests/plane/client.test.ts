import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaneClient } from "../../src/plane/client.js";

const BASE = "http://plane-api:8000";
const SLUG = "your-workspace";

function mockFetch(response: { status: number; body?: unknown; throws?: Error }) {
  return vi.fn().mockImplementation(async () => {
    if (response.throws) throw response.throws;
    return new Response(JSON.stringify(response.body ?? {}), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("PlaneClient", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("listProjects returns parsed list on 200", async () => {
    globalThis.fetch = mockFetch({
      status: 200,
      body: { results: [{ id: "p1", name: "Project A", identifier: "PA" }] },
    });
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    const projects = await client.listProjects("token-xyz");
    expect(projects).toEqual([{ id: "p1", name: "Project A", identifier: "PA" }]);
  });

  it("listProjects accepts array response", async () => {
    globalThis.fetch = mockFetch({
      status: 200,
      body: [{ id: "p1", name: "A", identifier: "A" }],
    });
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    const projects = await client.listProjects("token");
    expect(projects).toHaveLength(1);
  });

  it("maps 401 to PLANE_TOKEN_INVALID", async () => {
    globalThis.fetch = mockFetch({ status: 401 });
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    await expect(client.listProjects("bad")).rejects.toMatchObject({
      code: "PLANE_TOKEN_INVALID",
    });
  });

  it("maps 403 to PLANE_TOKEN_INVALID", async () => {
    globalThis.fetch = mockFetch({ status: 403 });
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    await expect(client.listProjects("bad")).rejects.toMatchObject({
      code: "PLANE_TOKEN_INVALID",
    });
  });

  it("maps 503 to PLANE_5XX with 1 retry then fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    globalThis.fetch = fetchMock;
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    await expect(client.listProjects("p")).rejects.toMatchObject({ code: "PLANE_5XX" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 503 once and succeeds on second try", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    globalThis.fetch = fetchMock;
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    const projects = await client.listProjects("p");
    expect(projects).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps network error to NETWORK_ERROR with 1 retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"));
    globalThis.fetch = fetchMock;
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    await expect(client.listProjects("p")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("createIssue POSTs correct body and returns issue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "i1", sequence_id: 42, name: "T", project: "p1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    const issue = await client.createIssue("token", {
      projectId: "p1",
      name: "Title",
      description: "desc",
      priority: "high",
      stateId: "s1",
      assigneeIds: ["a1"],
      labelIds: ["l1"],
    });
    expect(issue.sequence_id).toBe(42);
    const call = fetchMock.mock.calls[0];
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("token");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "Title",
      // Plane renders descriptions from description_html, not the plain field.
      description_html: "<p>desc</p>",
      priority: "high",
      state: "s1",
      assignees: ["a1"],
      labels: ["l1"],
    });
  });

  it("createIssue includes start_date and target_date when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "i1", sequence_id: 7, name: "T", project: "p1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    await client.createIssue("token", {
      projectId: "p1",
      name: "Title",
      startDate: "2026-06-01",
      targetDate: "2026-06-10",
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "Title",
      start_date: "2026-06-01",
      target_date: "2026-06-10",
    });
  });

  it("listCycles unwraps results", async () => {
    globalThis.fetch = mockFetch({
      status: 200,
      body: { results: [{ id: "c1", name: "Sprint 1" }] },
    });
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    expect(await client.listCycles("t", "p1")).toEqual([{ id: "c1", name: "Sprint 1" }]);
  });

  it("listCycles drops cycles whose end_date has already passed", async () => {
    const today = new Date().toISOString().slice(0, 10);
    globalThis.fetch = mockFetch({
      status: 200,
      body: {
        results: [
          { id: "past", name: "Sprint 1", end_date: "2020-01-01" },
          { id: "current", name: "Sprint 2", end_date: today },
          { id: "future", name: "Sprint 3", end_date: "2999-12-31" },
          { id: "draft", name: "Sprint 4", end_date: null },
        ],
      },
    });
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    const cycles = await client.listCycles("t", "p1");
    expect(cycles.map((c) => c.id)).toEqual(["current", "future", "draft"]);
  });

  it("listModules unwraps results", async () => {
    globalThis.fetch = mockFetch({ status: 200, body: { results: [{ id: "m1", name: "Auth" }] } });
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    expect(await client.listModules("t", "p1")).toEqual([{ id: "m1", name: "Auth" }]);
  });

  it("addIssueToCycle POSTs {issues:[id]} to cycle-issues", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      );
    globalThis.fetch = fetchMock;
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    await client.addIssueToCycle("t", "p1", "c1", "i1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/projects/p1/cycles/c1/cycle-issues/");
    expect(JSON.parse(init.body as string)).toEqual({ issues: ["i1"] });
  });

  it("addIssueToModule POSTs {issues:[id]} to module-issues", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      );
    globalThis.fetch = fetchMock;
    const client = new PlaneClient({ apiBase: BASE, workspaceSlug: SLUG });
    await client.addIssueToModule("t", "p1", "m1", "i1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/projects/p1/modules/m1/module-issues/");
    expect(JSON.parse(init.body as string)).toEqual({ issues: ["i1"] });
  });
});
