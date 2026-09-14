import { describe, expect, it } from "vitest";
import {
  buildAssetUrl,
  findImageRefs,
  imageMimeType,
  isSiblingRef,
  replaceImageUrls,
  resolveSibling,
} from "./images";

const urls = (markdown: string) => findImageRefs(markdown).map((ref) => ref.url);

describe("findImageRefs", () => {
  it("finds a plain image", () => {
    expect(urls("![A widget](screenshots/widget.png)")).toEqual([
      "screenshots/widget.png",
    ]);
  });

  it("reports the span the URL occupies", () => {
    const markdown = "text ![alt](a.png) more";
    const [ref] = findImageRefs(markdown);
    expect(markdown.slice(ref.start, ref.end)).toBe("a.png");
  });

  it("finds several, including one with a title", () => {
    expect(
      urls('![one](a.png)\n\n![two](b.png "The second one")\n'),
    ).toEqual(["a.png", "b.png"]);
  });

  it("reads an angle-bracketed URL without its brackets", () => {
    expect(urls("![alt](<my screenshots/a b.png>)")).toEqual([
      "my screenshots/a b.png",
    ]);
  });

  it("handles brackets inside the alt text", () => {
    expect(urls("![the [raw] view](a.png)")).toEqual(["a.png"]);
  });

  it("ignores a link, which is not an image", () => {
    expect(urls("[not an image](a.png)")).toEqual([]);
  });

  // A README that documents markdown shows this syntax on purpose. Rewriting
  // it would corrupt the very thing the author is demonstrating.
  it("skips images inside a fenced code block", () => {
    expect(urls("```md\n![alt](a.png)\n```\n\n![real](b.png)")).toEqual([
      "b.png",
    ]);
  });

  it("skips a tilde fence too", () => {
    expect(urls("~~~\n![alt](a.png)\n~~~\n")).toEqual([]);
  });

  it("skips images inside inline code", () => {
    expect(urls("Write `![alt](a.png)` to embed, like ![real](b.png).")).toEqual(
      ["b.png"],
    );
  });

  it("survives an unclosed fence without hanging", () => {
    expect(urls("```\n![alt](a.png)\n")).toEqual([]);
  });

  it("survives an unterminated image without hanging", () => {
    expect(urls("![alt](a.png")).toEqual([]);
  });
});

describe("isSiblingRef", () => {
  it("accepts a path relative to the file", () => {
    expect(isSiblingRef("a.png")).toBe(true);
    expect(isSiblingRef("screenshots/a.png")).toBe(true);
    expect(isSiblingRef("../images/a.png")).toBe(true);
  });

  it("leaves anything that already resolves alone", () => {
    expect(isSiblingRef("https://example.com/a.png")).toBe(false);
    expect(isSiblingRef("http://example.com/a.png")).toBe(false);
    expect(isSiblingRef("//example.com/a.png")).toBe(false);
    expect(isSiblingRef("data:image/png;base64,AAAA")).toBe(false);
    expect(isSiblingRef("#anchor")).toBe(false);
    expect(isSiblingRef("")).toBe(false);
  });

  // On GitHub a leading slash means the repository root. A host file has no
  // repository, so guessing would point at the wrong image instead of showing
  // an honestly broken one.
  it("leaves a root-relative path alone", () => {
    expect(isSiblingRef("/logo.png")).toBe(false);
  });
});

describe("resolveSibling", () => {
  it("resolves against the markdown file's own directory", () => {
    expect(resolveSibling("docs/notes.md", "img/a.png")).toBe("docs/img/a.png");
  });

  it("resolves for a file at the root", () => {
    expect(resolveSibling("README.md", "screenshots/a.png")).toBe(
      "screenshots/a.png",
    );
  });

  it("walks up out of the file's directory but not out of the root", () => {
    expect(resolveSibling("docs/notes.md", "../img/a.png")).toBe("img/a.png");
    expect(resolveSibling("docs/notes.md", "../../escape.png")).toBeNull();
  });

  it("keeps an absolute path absolute", () => {
    expect(resolveSibling("/Users/hubber/notes/plan.md", "img/a.png")).toBe(
      "/Users/hubber/notes/img/a.png",
    );
    expect(resolveSibling("/Users/hubber/notes/plan.md", "../a.png")).toBe(
      "/Users/hubber/a.png",
    );
  });

  it("refuses to climb above the filesystem root", () => {
    expect(resolveSibling("/a.md", "../../b.png")).toBeNull();
  });

  it("collapses a redundant current-directory segment", () => {
    expect(resolveSibling("docs/notes.md", "./img/a.png")).toBe("docs/img/a.png");
  });
});

describe("imageMimeType", () => {
  it("maps the formats a browser can show inline", () => {
    expect(imageMimeType("a/b/c.png")).toBe("image/png");
    expect(imageMimeType("c.JPG")).toBe("image/jpeg");
    expect(imageMimeType("c.jpeg")).toBe("image/jpeg");
    expect(imageMimeType("c.svg")).toBe("image/svg+xml");
    expect(imageMimeType("c.webp")).toBe("image/webp");
  });

  it("refuses anything that is not an image", () => {
    expect(imageMimeType("c.md")).toBeNull();
    expect(imageMimeType("c.pdf")).toBeNull();
    expect(imageMimeType("noextension")).toBeNull();
    expect(imageMimeType(".hidden")).toBeNull();
  });
});

describe("replaceImageUrls", () => {
  it("swaps a URL for its data URL", () => {
    const markdown = "![alt](a.png)";
    const refs = findImageRefs(markdown);
    expect(
      replaceImageUrls(markdown, refs, new Map([["a.png", "data:image/png;base64,AAAA"]])),
    ).toBe("![alt](data:image/png;base64,AAAA)");
  });

  it("keeps later spans valid while rewriting several", () => {
    const markdown = "![one](a.png) and ![two](b.png)";
    const refs = findImageRefs(markdown);
    expect(
      replaceImageUrls(
        markdown,
        refs,
        new Map([
          ["a.png", "data:image/png;base64,AAAA"],
          ["b.png", "data:image/png;base64,BBBB"],
        ]),
      ),
    ).toBe("![one](data:image/png;base64,AAAA) and ![two](data:image/png;base64,BBBB)");
  });

  it("leaves a reference it has no replacement for exactly as written", () => {
    const markdown = "![one](a.png) and ![two](b.png)";
    const refs = findImageRefs(markdown);
    expect(
      replaceImageUrls(markdown, refs, new Map([["a.png", "data:image/png;base64,AAAA"]])),
    ).toBe("![one](data:image/png;base64,AAAA) and ![two](b.png)");
  });

  it("keeps the title when it rewrites the URL", () => {
    const markdown = '![alt](a.png "A title")';
    const refs = findImageRefs(markdown);
    expect(replaceImageUrls(markdown, refs, new Map([["a.png", "data:x"]]))).toBe(
      '![alt](data:x "A title")',
    );
  });
});

describe("buildAssetUrl", () => {
  const source = {
    kind: "workspace",
    threadId: "thr_1",
    environmentId: "env_1",
    projectId: "proj_1",
  };

  // A relative src is exactly what bb's sanitizer drops, so the absolute
  // origin is the point of this function, not a detail of it.
  it("is absolute, so the sanitizer keeps the image", () => {
    const url = buildAssetUrl(
      "http://127.0.0.1:38886",
      "/api/v1/plugins/markdown-editor/http/asset",
      "docs/img/a.png",
      source,
    );
    expect(url.startsWith("http://127.0.0.1:38886/api/v1/plugins/")).toBe(true);
  });

  it("carries the file's origin so the server can find the same root", () => {
    const url = new URL(
      buildAssetUrl("http://127.0.0.1:38886", "/http/asset", "docs/a.png", source),
    );
    expect(url.searchParams.get("path")).toBe("docs/a.png");
    expect(url.searchParams.get("kind")).toBe("workspace");
    expect(url.searchParams.get("environmentId")).toBe("env_1");
    expect(url.searchParams.get("threadId")).toBe("thr_1");
  });

  it("omits the ids a source does not have", () => {
    const url = new URL(
      buildAssetUrl("http://127.0.0.1:38886", "/http/asset", "/srv/a.png", {
        kind: "host",
        threadId: null,
        environmentId: null,
        projectId: null,
      }),
    );
    expect(url.searchParams.get("threadId")).toBeNull();
    expect(url.searchParams.get("environmentId")).toBeNull();
    expect(url.searchParams.get("hostId")).toBeNull();
  });

  it("escapes a path with characters a query string cares about", () => {
    const url = new URL(
      buildAssetUrl("http://127.0.0.1:38886", "/http/asset", "docs/a b&c.png", source),
    );
    expect(url.searchParams.get("path")).toBe("docs/a b&c.png");
  });

  it("does not double the slash when the origin carries one", () => {
    expect(
      buildAssetUrl("http://127.0.0.1:38886/", "/http/asset", "a.png", source),
    ).toContain("http://127.0.0.1:38886/http/asset?");
  });
});
