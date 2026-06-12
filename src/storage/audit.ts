import type { Database } from "better-sqlite3";

export type AuditAction =
  | "plane_token_set"
  | "plane_token_reset"
  | "issue_create"
  | "issue_failed"
  | "plane_token_invalid"
  | "project_select_failed"
  | "issue_cycle_attach_failed"
  | "issue_module_attach_failed";

export type AuditWriteInput = {
  slackUserId: string;
  slackUsername?: string;
  action: AuditAction;
  planeProjectId?: string;
  planeIssueId?: string;
  errorCode?: string;
};

export type AuditRecord = {
  id: number;
  timestamp: number;
  slackUserId: string;
  slackUsername: string | null;
  action: AuditAction;
  planeProjectId: string | null;
  planeIssueId: string | null;
  errorCode: string | null;
};

export class AuditRepository {
  constructor(private readonly db: Database) {}

  write(input: AuditWriteInput): void {
    this.db
      .prepare(
        `INSERT INTO audit_log
         (timestamp, slack_user_id, slack_username, action, plane_project_id, plane_issue_id, error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        input.slackUserId,
        input.slackUsername ?? null,
        input.action,
        input.planeProjectId ?? null,
        input.planeIssueId ?? null,
        input.errorCode ?? null,
      );
  }

  recentForUser(slackUserId: string, limit: number): AuditRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, slack_user_id, slack_username, action, plane_project_id, plane_issue_id,
                error_code
         FROM audit_log WHERE slack_user_id = ?
         ORDER BY timestamp DESC, id DESC LIMIT ?`,
      )
      .all(slackUserId, limit) as Array<{
      id: number;
      timestamp: number;
      slack_user_id: string;
      slack_username: string | null;
      action: AuditAction;
      plane_project_id: string | null;
      plane_issue_id: string | null;
      error_code: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      slackUserId: r.slack_user_id,
      slackUsername: r.slack_username,
      action: r.action,
      planeProjectId: r.plane_project_id,
      planeIssueId: r.plane_issue_id,
      errorCode: r.error_code,
    }));
  }
}
