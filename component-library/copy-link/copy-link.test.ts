import { describe, expect, it } from "vitest";

import { escapeHtml, linkHtml, linkMarkdown } from "./copy-link";

describe("escapeHtml", () => {
  it("escapes what a real title carries", () => {
    expect(escapeHtml('Switch <RichText> to "plain" & back')).toBe(
      "Switch &lt;RichText&gt; to &quot;plain&quot; &amp; back",
    );
  });
});

describe("linkHtml", () => {
  it("wraps the title in an anchor, escaping both parts", () => {
    expect(linkHtml("Lazy load <modules>", "https://example.test/a?b=1&c=2")).toBe(
      '<a href="https://example.test/a?b=1&amp;c=2">Lazy load &lt;modules&gt;</a>',
    );
  });
});

describe("linkMarkdown", () => {
  it("writes the markdown GitHub and an editor both read", () => {
    expect(linkMarkdown("Lazy load modules", "https://example.test/a")).toBe("[Lazy load modules](https://example.test/a)");
  });
});
