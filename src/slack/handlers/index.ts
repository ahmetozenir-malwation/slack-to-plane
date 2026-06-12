import type { App } from "@slack/bolt";
import type { Deps } from "../app.js";
import { registerBlockActions } from "./blockActions.js";
import { registerSlashCommand } from "./slashCommand.js";
import { registerViewSubmissions } from "./viewSubmission.js";

export function registerHandlers(app: App, deps: Deps): void {
  registerSlashCommand(app, deps);
  registerViewSubmissions(app, deps);
  registerBlockActions(app, deps);
}
