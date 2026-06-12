import type { Database } from "better-sqlite3";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerHealthRoute } from "../../src/http/health.js";
import { createTestDb } from "../helpers/testDb.js";

describe("GET /health", () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => db.close());

  it("returns 200 with status ok when DB pings", async () => {
    const app = express();
    registerHealthRoute(app, db);
    const res = await request(app).get("/health").expect(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns 503 when DB is closed", async () => {
    const app = express();
    registerHealthRoute(app, db);
    db.close();
    const res = await request(app).get("/health").expect(503);
    expect(res.body.status).toBe("degraded");
  });
});
