import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditRepository } from "../../src/storage/audit.js";
import { createTestDb } from "../helpers/testDb.js";

describe("AuditRepository", () => {
  let db: Database;
  let repo: AuditRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new AuditRepository(db);
  });
  afterEach(() => db.close());

  it("writes a basic event", () => {
    repo.write({ slackUserId: "U1", action: "plane_token_set" });
    const rows = db.prepare("SELECT * FROM audit_log").all() as Array<{
      slack_user_id: string;
      action: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("plane_token_set");
  });

  it("writes an event with error_code", () => {
    repo.write({
      slackUserId: "U1",
      action: "issue_failed",
      errorCode: "PLANE_5XX",
    });
    const row = db.prepare("SELECT * FROM audit_log").get() as {
      error_code: string;
    };
    expect(row.error_code).toBe("PLANE_5XX");
  });

  it("recordsForUser returns most recent first", () => {
    repo.write({ slackUserId: "U1", action: "plane_token_set" });
    repo.write({ slackUserId: "U1", action: "issue_create", planeIssueId: "PROJ-1" });
    const recent = repo.recentForUser("U1", 10);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.action).toBe("issue_create");
  });
});
