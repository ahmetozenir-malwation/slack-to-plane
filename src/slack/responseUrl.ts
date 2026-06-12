const TIMEOUT_MS = 5_000;

// Posts a message to a Slack slash-command response_url. Using the response_url
// (rather than chat.postMessage) makes the message appear in the exact channel
// or DM where /plane was invoked, even when the bot is not a member there.
export async function postToResponseUrl(
  responseUrl: string,
  payload: { response_type: "in_channel" | "ephemeral"; text: string },
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`response_url responded ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}
