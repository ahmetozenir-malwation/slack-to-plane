import type { Database } from "better-sqlite3";
import type { Application, Request, Response } from "express";

export function registerHealthRoute(app: Application, db: Database): void {
  app.get("/health", (_req: Request, res: Response) => {
    try {
      db.prepare("SELECT 1").get();
      res.status(200).json({ status: "ok" });
    } catch (err) {
      res.status(503).json({ status: "degraded", error: (err as Error).message });
    }
  });
}
