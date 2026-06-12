import type { Database } from "better-sqlite3";
import { openDatabase } from "../../src/storage/db.js";

export function createTestDb(): Database {
  return openDatabase(":memory:");
}
