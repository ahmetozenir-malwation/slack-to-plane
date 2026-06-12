// Escape characters that are special inside Slack mrkdwn link text (`<url|text>`)
// so a title containing them can't corrupt the link markup.
const escapeSlackText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const MESSAGES = {
  planeTokenSavedSuccess: "✅ Plane token saved. You can now create issues with `/plane`.",
  planeTokenInvalid:
    "❌ Token looks invalid. Generate a new one at Plane > Profile > API Tokens and try again with `/plane setup`.",
  planeTokenReset: "✅ Token deleted. Add a new one with `/plane setup` when you need it again.",
  planeTokenResetNoToken: "ℹ️ No token saved — nothing to delete.",
  planeTokenResetConfirmPrompt: "Are you sure you want to delete your Plane token?",
  planeUnavailable: "⚠️ Plane is not responding right now. Please try again in a few seconds.",
  networkError: "⚠️ Can't reach Plane. Possible network/tunnel issue.",
  unknownError: "⚠️ Unexpected error occurred; it has been written to the audit log.",
  rateLimited: "⚠️ Too many requests — try again in a minute.",
  dateRangeInvalid: "Start date must be on or before the due date.",
  issueSuccess: (sequenceId: number, name: string, url: string) =>
    `✅ Issue created: *<${url}|${escapeSlackText(name)} — #${sequenceId}>*`,
  helpText: [
    "*Slack → Plane Bridge*",
    "• `/plane` — create a new issue; the title + link is posted to this channel/DM (opens the setup modal if no token is saved)",
    "• `/plane setup` — add or change your Plane Personal Access Token",
    "• `/plane reset` — delete the saved token",
    "• `/plane help` — this help message",
  ].join("\n"),
  loadingProjectFields: "Select a project first...",
  projectFieldsFailed: "⚠️ Could not load states/members/labels; you may leave them empty.",
  planeTokenSetupModalIntro: (planeWebBase: string, workspaceSlug: string) =>
    `A Personal Access Token is required to create issues in Plane. <${planeWebBase}/${workspaceSlug}/settings/api-tokens/|Create one in Plane> and paste it below.`,
} as const;
