import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database, { type Database as DatabaseType } from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Migrations live at repo root; locate relative to dist or src.
function findMigrationsDir(): string {
  const candidates = [
    resolve(__dirname, "../../migrations"),
    resolve(__dirname, "../../../migrations"),
    resolve(process.cwd(), "migrations"),
  ];
  for (const c of candidates) {
    try {
      readdirSync(c);
      return c;
    } catch {
      // try next
    }
  }
  throw new Error("migrations/ directory not found");
}

export function openDatabase(path: string): DatabaseType {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

function applyMigrations(db: DatabaseType): void {
  const dir = findMigrationsDir();
  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  const currentVersion = db.pragma("user_version", { simple: true }) as number;
  for (const file of files) {
    const version = Number.parseInt(file.slice(0, 3), 10);
    if (version <= currentVersion) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}
