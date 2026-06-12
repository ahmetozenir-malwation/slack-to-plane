import type { Logger } from "pino";
import {
  type CreateIssueInput,
  PlaneApiError,
  type PlaneCycle,
  type PlaneIssue,
  type PlaneLabel,
  type PlaneMember,
  type PlaneModule,
  type PlaneProject,
  type PlaneState,
} from "./types.js";

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 250;

type ClientConfig = {
  apiBase: string;
  workspaceSlug: string;
  logger?: Logger;
};

export class PlaneClient {
  constructor(private readonly cfg: ClientConfig) {}

  async listProjects(planeToken: string): Promise<PlaneProject[]> {
    const data = await this.request<unknown>(planeToken, "GET", "projects/");
    const projects = this.unwrapList<PlaneProject>(data);
    // Only projects the user belongs to — you can't create issues elsewhere.
    // Plane omits is_member on some responses; keep those rather than hide all.
    return projects.filter((p) => p.is_member !== false);
  }

  // The token owner's own identity — used to record which Plane account a
  // Slack user linked. Lives outside the workspace path, hence the leading "/".
  async getCurrentUser(planeToken: string): Promise<PlaneMember> {
    return await this.request<PlaneMember>(planeToken, "GET", "/users/me/");
  }

  async listStates(planeToken: string, projectId: string): Promise<PlaneState[]> {
    const data = await this.request<unknown>(planeToken, "GET", `projects/${projectId}/states/`);
    return this.unwrapList<PlaneState>(data);
  }

  // Assignees are scoped to the selected project's members, so you can only
  // assign people who actually belong to that project (matching Plane).
  async listMembers(planeToken: string, projectId: string): Promise<PlaneMember[]> {
    const data = await this.request<unknown>(planeToken, "GET", `projects/${projectId}/members/`);
    return this.unwrapList<PlaneMember>(data);
  }

  async listLabels(planeToken: string, projectId: string): Promise<PlaneLabel[]> {
    const data = await this.request<unknown>(planeToken, "GET", `projects/${projectId}/labels/`);
    return this.unwrapList<PlaneLabel>(data);
  }

  async listCycles(planeToken: string, projectId: string): Promise<PlaneCycle[]> {
    const data = await this.request<unknown>(planeToken, "GET", `projects/${projectId}/cycles/`);
    const cycles = this.unwrapList<PlaneCycle>(data);
    // Plane's REST cycle object has no reliable `status`; the web UI derives a
    // cycle's state from its dates. Mirror that here by dropping cycles whose
    // end_date is already in the past (completed), while keeping current,
    // upcoming, and undated (draft) cycles.
    const today = new Date().toISOString().slice(0, 10);
    return cycles.filter((c) => !c.end_date || c.end_date.slice(0, 10) >= today);
  }

  async listModules(planeToken: string, projectId: string): Promise<PlaneModule[]> {
    const data = await this.request<unknown>(planeToken, "GET", `projects/${projectId}/modules/`);
    return this.unwrapList<PlaneModule>(data);
  }

  async addIssueToCycle(
    planeToken: string,
    projectId: string,
    cycleId: string,
    issueId: string,
  ): Promise<void> {
    await this.request<unknown>(
      planeToken,
      "POST",
      `projects/${projectId}/cycles/${cycleId}/cycle-issues/`,
      { issues: [issueId] },
    );
  }

  async addIssueToModule(
    planeToken: string,
    projectId: string,
    moduleId: string,
    issueId: string,
  ): Promise<void> {
    await this.request<unknown>(
      planeToken,
      "POST",
      `projects/${projectId}/modules/${moduleId}/module-issues/`,
      { issues: [issueId] },
    );
  }

  async createIssue(planeToken: string, input: CreateIssueInput): Promise<PlaneIssue> {
    const body: Record<string, unknown> = {
      name: input.name,
    };
    // Plane renders issue descriptions from `description_html`, not the plain
    // `description` field. Wrap the user-entered text into minimal HTML so it
    // actually shows up in the Plane UI.
    if (input.description != null) {
      body.description_html = toDescriptionHtml(input.description);
    }
    if (input.stateId !== undefined) body.state = input.stateId;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.assigneeIds !== undefined) body.assignees = input.assigneeIds;
    if (input.labelIds !== undefined) body.labels = input.labelIds;
    if (input.startDate !== undefined) body.start_date = input.startDate;
    if (input.targetDate !== undefined) body.target_date = input.targetDate;
    return await this.request<PlaneIssue>(
      planeToken,
      "POST",
      `projects/${input.projectId}/issues/`,
      body,
    );
  }

  private async request<T>(
    planeToken: string,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    // A leading-slash path is workspace-independent (e.g. "/users/me/"); other
    // paths are scoped under the workspace.
    const url = path.startsWith("/")
      ? `${this.cfg.apiBase}/api/v1${path}`
      : `${this.cfg.apiBase}/api/v1/workspaces/${this.cfg.workspaceSlug}/${path}`;
    // Log every Plane call's lifecycle (never the token). One line per attempt
    // on the way out and one on completion, so all Plane traffic is traceable.
    const log = this.cfg.logger;
    const startedAt = Date.now();
    let lastError: PlaneApiError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAY_MS);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const headers: Record<string, string> = {
          "X-Api-Key": planeToken,
          Accept: "application/json",
        };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        const res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        // One compact line per Plane call: "plane GET projects/ 200 (43ms)".
        log?.info(
          { status: res.status, ms: Date.now() - startedAt },
          `plane ${method} ${path} ${res.status}`,
        );
        if (res.status === 401 || res.status === 403) {
          throw new PlaneApiError(
            "PLANE_TOKEN_INVALID",
            `Plane rejected token (${res.status})`,
            res.status,
          );
        }
        if (res.status >= 500) {
          lastError = new PlaneApiError("PLANE_5XX", `Plane ${res.status}`, res.status);
          continue;
        }
        if (res.status >= 400) {
          // Capture the response body so 4xx causes are diagnosable (e.g. an
          // "Estimate not found" 404 vs a missing-route 404 look identical otherwise).
          const bodyText = await res.text().catch(() => "");
          throw new PlaneApiError(
            "PLANE_4XX",
            `Plane ${res.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`,
            res.status,
          );
        }
        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof PlaneApiError) {
          if (err.code === "PLANE_TOKEN_INVALID" || err.code === "PLANE_4XX") {
            log?.warn({ code: err.code }, `plane ${method} ${path} failed (${err.status})`);
            throw err;
          }
          lastError = err;
          continue;
        }
        const code = (err as Error).name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
        lastError = new PlaneApiError(code, (err as Error).message);
      } finally {
        clearTimeout(timer);
      }
    }
    log?.warn({ code: lastError?.code }, `plane ${method} ${path} exhausted retries`);
    throw lastError ?? new PlaneApiError("NETWORK_ERROR", "unknown failure");
  }

  private unwrapList<T>(data: unknown): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data && typeof data === "object" && "results" in data) {
      return (data as { results: T[] }).results;
    }
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Plane stores rich-text descriptions as HTML. Convert the plain text a user
// typed in Slack into minimal, safe HTML: escape special characters so it can
// never inject markup, split blank-line-separated blocks into <p> paragraphs,
// and turn remaining single newlines into <br>. Empty input becomes an empty
// paragraph, which Plane renders as a blank description.
function toDescriptionHtml(text: string): string {
  const escape = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => escape(block).replace(/\n/g, "<br>"))
    .filter((block) => block.length > 0);
  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}
