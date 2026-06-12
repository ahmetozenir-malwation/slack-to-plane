import { afterEach, describe, expect, it, vi } from "vitest";
import { postToResponseUrl } from "../../src/slack/responseUrl.js";

describe("postToResponseUrl", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs JSON payload to the url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock;
    await postToResponseUrl("https://hooks.slack.com/commands/T/1/a", {
      response_type: "in_channel",
      text: "hello",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.slack.com/commands/T/1/a");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ response_type: "in_channel", text: "hello" });
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(
      postToResponseUrl("https://hooks.slack.com/x", { response_type: "ephemeral", text: "t" }),
    ).rejects.toThrow();
  });
});
