// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPencil,
  existingPencil,
  findHeaders,
  OWNED_ATTR,
  undecorate,
} from "./header";
import { renderCard } from "./fixture";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("findHeaders", () => {
  it("finds a header and reads its path from the path control's title", () => {
    renderCard({ path: "docs/decisions/0002-widget-caching.md" });
    const headers = findHeaders(document);
    expect(headers).toHaveLength(1);
    expect(headers[0]?.path).toBe("docs/decisions/0002-widget-caching.md");
  });

  it("reads the path, not the rename label, so a renamed file stays right", () => {
    renderCard({ path: "docs/new.md", label: "docs/old.md -> docs/new.md" });
    expect(findHeaders(document)[0]?.path).toBe("docs/new.md");
  });

  it("resolves the path control, which is the button bb opens the file with", () => {
    renderCard({ path: "notes.md" });
    const pathButton = findHeaders(document)[0]?.pathButton;
    expect(pathButton?.title).toBe("notes.md");
  });

  it("skips timeline diffs, where the same path recurs every message", () => {
    renderCard({ path: "notes.md", timeline: true });
    expect(findHeaders(document)).toHaveLength(0);
  });

  it("skips a header with nothing to expand", () => {
    renderCard({ path: "notes.md", inert: true });
    expect(findHeaders(document)).toHaveLength(0);
  });

  it("reports no path control when bb rendered the path as a plain span", () => {
    renderCard({ path: "notes.md", openable: false, icons: false });
    const headers = findHeaders(document);
    expect(headers).toHaveLength(1);
    expect(headers[0]?.pathButton).toBe(null);
  });

  it("does not mistake the copy or open-in-editor icons for the path", () => {
    renderCard({ path: "notes.md" });
    expect(findHeaders(document)[0]?.pathButton?.textContent).toBe("notes.md");
  });
});

describe("createPencil", () => {
  it("is a button that names the file it edits", () => {
    const pencil = createPencil("docs/notes.md", () => {});
    expect(pencil.tagName).toBe("BUTTON");
    expect(pencil.getAttribute("aria-label")).toBe(
      "Edit docs/notes.md in the markdown editor",
    );
  });

  it("calls its handler on click and keeps the click off the header", () => {
    const onActivate = vi.fn();
    const pencil = createPencil("notes.md", onActivate);
    const header = document.createElement("div");
    const onHeaderClick = vi.fn();
    header.addEventListener("click", onHeaderClick);
    header.append(pencil);
    document.body.append(header);

    pencil.click();

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onHeaderClick).not.toHaveBeenCalled();
  });

  it("draws an icon that is hidden from assistive technology", () => {
    const svg = createPencil("notes.md", () => {}).querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelectorAll("path").length).toBeGreaterThan(0);
  });
});

describe("existingPencil and undecorate", () => {
  it("finds a pencil already in a header and reports none otherwise", () => {
    renderCard({ path: "notes.md" });
    const header = findHeaders(document)[0]!;
    expect(existingPencil(header)).toBe(null);
    header.iconGroup.append(createPencil(header.path, () => {}));
    expect(existingPencil(header)).not.toBe(null);
  });

  it("removes every node this plugin added and nothing bb added", () => {
    renderCard({ path: "notes.md" });
    const header = findHeaders(document)[0]!;
    const before = header.iconGroup.childElementCount;
    header.iconGroup.append(createPencil(header.path, () => {}));

    undecorate(document.body);

    expect(document.querySelectorAll(`[${OWNED_ATTR}]`)).toHaveLength(0);
    expect(header.iconGroup.childElementCount).toBe(before);
  });
});
