import { describe, expect, it } from "vitest";
import {
  baseName,
  directChildName,
  pickSlides,
  resolveDeckDir,
  resolveInDeck,
  slideTitle,
} from "./slides";
import { imageMimeType, rewriteSlideImages } from "./images";
import { applyMove, keyToMove } from "./keys";

describe("pickSlides", () => {
  it("orders by number, so 10 follows 9", () => {
    expect(pickSlides(["10-thanks.md", "9-demo.md", "01-title.md"])).toEqual([
      "01-title.md",
      "9-demo.md",
      "10-thanks.md",
    ]);
  });

  it("ignores files without a leading number or a .md extension", () => {
    expect(
      pickSlides(["README.md", "notes.txt", "02-why.md", "03-logo.png", "draft-04.md"]),
    ).toEqual(["02-why.md"]);
  });

  it("breaks a tie between equal numbers by name", () => {
    expect(pickSlides(["2-b.md", "02-a.md"])).toEqual(["02-a.md", "2-b.md"]);
  });
});

describe("directChildName", () => {
  it("accepts an absolute path directly in the folder", () => {
    expect(directChildName("/decks/talk", "/decks/talk/01-title.md")).toBe("01-title.md");
  });

  it("accepts a relative listed path", () => {
    expect(directChildName("/decks/talk/", "01-title.md")).toBe("01-title.md");
  });

  it("rejects a file in a subfolder", () => {
    expect(directChildName("/decks/talk", "/decks/talk/images/01-x.md")).toBeNull();
    expect(directChildName("/decks/talk", "drafts/01-x.md")).toBeNull();
  });

  it("rejects a path outside the folder", () => {
    expect(directChildName("/decks/talk", "/decks/other/01-x.md")).toBeNull();
  });
});

describe("resolveDeckDir", () => {
  const base = { workspacePath: "/work/acme-widgets", homeDir: "/home/octocat" };

  it("resolves a relative path against the workspace", () => {
    expect(resolveDeckDir({ ...base, deckPath: "presentations/talk/" })).toEqual({
      dir: "/work/acme-widgets/presentations/talk",
      workspaceDir: "presentations/talk",
    });
  });

  it("uses an absolute path as it is", () => {
    expect(resolveDeckDir({ ...base, deckPath: "/decks/talk" })).toEqual({
      dir: "/decks/talk",
      workspaceDir: null,
    });
  });

  it("expands ~ to the home folder", () => {
    expect(resolveDeckDir({ ...base, deckPath: "~/decks/talk" }).dir).toBe(
      "/home/octocat/decks/talk",
    );
  });

  it("refuses a relative path that leaves the workspace", () => {
    expect(() => resolveDeckDir({ ...base, deckPath: "../elsewhere" })).toThrow(
      /outside the workspace/,
    );
  });

  it("refuses a relative path when there is no workspace", () => {
    expect(() =>
      resolveDeckDir({ ...base, workspacePath: null, deckPath: "talk" }),
    ).toThrow(/absolute path/);
  });
});

describe("resolveInDeck", () => {
  it("keeps a path inside the deck", () => {
    expect(resolveInDeck("images/./logo.png")).toBe("images/logo.png");
  });

  it("refuses a path that climbs out or is absolute", () => {
    expect(resolveInDeck("../../etc/passwd")).toBeNull();
    expect(resolveInDeck("images/../../x.png")).toBeNull();
    expect(resolveInDeck("/etc/passwd")).toBeNull();
    expect(resolveInDeck("")).toBeNull();
  });
});

describe("slideTitle", () => {
  it("uses the first heading", () => {
    expect(slideTitle("Intro text\n\n## What bb is ##\n\n# Later", "02-x.md")).toBe(
      "What bb is",
    );
  });

  it("skips headings inside code fences", () => {
    expect(slideTitle("```\n# not this\n```\n# This one", "01.md")).toBe("This one");
  });

  it("falls back to the file name without number or extension", () => {
    expect(slideTitle("Just a picture", "04-live_demo.md")).toBe("live demo");
  });
});

describe("baseName", () => {
  it("returns the last segment", () => {
    expect(baseName("presentations/talk/")).toBe("talk");
  });
});

describe("rewriteSlideImages", () => {
  const toUrl = (path: string) => `https://bb.test/asset?file=${path}`;

  it("rewrites a relative image inside the deck", () => {
    expect(rewriteSlideImages("![Sidebar](images/sidebar.png)", toUrl)).toBe(
      "![Sidebar](https://bb.test/asset?file=images/sidebar.png)",
    );
  });

  it("decodes percent-encoding in the reference", () => {
    expect(rewriteSlideImages("![](my%20shot.png)", toUrl)).toBe(
      "![](https://bb.test/asset?file=my shot.png)",
    );
  });

  it("leaves absolute URLs, escapes from the deck, and code alone", () => {
    const source = [
      "![](https://example.com/a.png)",
      "![](../shared/logo.png)",
      "![](notes.txt)",
      "`![](inline.png)`",
      "```",
      "![](fenced.png)",
      "```",
    ].join("\n");
    expect(rewriteSlideImages(source, toUrl)).toBe(source);
  });
});

describe("imageMimeType", () => {
  it("knows svg and png, and nothing else", () => {
    expect(imageMimeType("a/b.SVG")).toBe("image/svg+xml");
    expect(imageMimeType("b.png")).toBe("image/png");
    expect(imageMimeType("b.md")).toBeNull();
  });
});

describe("keys", () => {
  it("maps clicker and arrow keys", () => {
    expect(keyToMove("PageDown")).toBe("next");
    expect(keyToMove(" ")).toBe("next");
    expect(keyToMove("PageUp")).toBe("previous");
    expect(keyToMove("Home")).toBe("first");
    expect(keyToMove("a")).toBeNull();
  });

  it("stays inside the deck", () => {
    expect(applyMove(4, 5, "next")).toBe(4);
    expect(applyMove(0, 5, "previous")).toBe(0);
    expect(applyMove(2, 5, "last")).toBe(4);
    expect(applyMove(0, 0, "next")).toBe(0);
  });
});
