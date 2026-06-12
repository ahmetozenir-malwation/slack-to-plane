import { randomBytes } from "node:crypto";
import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UsersRepository } from "../../src/storage/users.js";
import { createTestDb } from "../helpers/testDb.js";

describe("UsersRepository", () => {
  let db: Database;
  let key: Buffer;
  let repo: UsersRepository;

  beforeEach(() => {
    db = createTestDb();
    key = randomBytes(32);
    repo = new UsersRepository(db, key);
  });

  afterEach(() => db.close());

  it("returns null when user not found", () => {
    expect(repo.getPlaneToken("U_missing")).toBeNull();
  });

  it("stores token encrypted and reads it back decrypted", () => {
    repo.setPlaneToken({
      slackUserId: "U123",
      slackTeamId: "T1",
      planeToken: "plane_pat_xxx",
      planeUserEmail: "ahmet@example.com",
    });
    expect(repo.getPlaneToken("U123")).toBe("plane_pat_xxx");
  });

  it("upserts on second setPlaneToken call", () => {
    repo.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "old" });
    repo.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "new" });
    expect(repo.getPlaneToken("U1")).toBe("new");
  });

  it("token bytes in DB are not the plaintext", () => {
    repo.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "supersecret" });
    const row = db
      .prepare("SELECT plane_token_encrypted FROM users WHERE slack_user_id = ?")
      .get("U1") as { plane_token_encrypted: Buffer };
    expect(row.plane_token_encrypted.toString("utf8")).not.toContain("supersecret");
  });

  it("deletePlaneToken removes the row", () => {
    repo.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });
    repo.deletePlaneToken("U1");
    expect(repo.getPlaneToken("U1")).toBeNull();
  });

  it("touchLastUsed updates last_used_at", () => {
    repo.setPlaneToken({ slackUserId: "U1", slackTeamId: "T1", planeToken: "p" });
    const before = Date.now();
    repo.touchLastUsed("U1");
    const row = db.prepare("SELECT last_used_at FROM users WHERE slack_user_id = ?").get("U1") as {
      last_used_at: number;
    };
    expect(row.last_used_at).toBeGreaterThanOrEqual(before);
  });
});
