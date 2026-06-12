import { describe, expect, it } from "vitest";
import { MESSAGES } from "../../src/slack/messages.js";

describe("MESSAGES.issueSuccess", () => {
  const url = "https://plane.example.com/your-workspace/projects/p1/issues/i1/";

  it("wraps the entire title + number in a single Slack link", () => {
    const name = "HTTP - HTTPS Auto Redirect on OnPremise Deployment";
    const text = MESSAGES.issueSuccess(619, name, url);

    // Bold markup is outside the link label, so the whole label is one link.
    expect(text).toBe(`✅ Issue created: *<${url}|${name} — #619>*`);

    // The link label must not contain mrkdwn formatting that breaks the link.
    const label = text.slice(text.indexOf("|") + 1, text.indexOf(">"));
    expect(label).toBe(`${name} — #619`);
    expect(label).not.toContain("*");
  });

  it("escapes characters that would corrupt the link markup", () => {
    const name = "A & B <C> redirect";
    const text = MESSAGES.issueSuccess(1, name, url);

    expect(text).toBe(`✅ Issue created: *<${url}|A &amp; B &lt;C&gt; redirect — #1>*`);
  });
});
