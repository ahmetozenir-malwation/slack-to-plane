// Bolt's view/action `body.user` union doesn't guarantee a `username` field,
// but Slack does include `username` (and/or `name`) on these payloads. Read it
// defensively so we capture a human-readable handle without fighting the types.
export function slackUsername(user: { username?: string; name?: string }): string | undefined {
  return user.username ?? user.name ?? undefined;
}
