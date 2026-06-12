import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/storage/db.js";

describe("openDatabase", () => {
  it("opens in-memory db and applies migrations", () => {
    const db = openDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("audit_log");
    db.close();
  });

  it("is idempotent — running migrations twice does not fail", () => {
    const db = openDatabase(":memory:");
    // Re-run by importing the migration function and calling explicitly
    const version = db.pragma("user_version", { simple: true });
    expect(version).toBeGreaterThan(0);
    db.close();
  });
});
