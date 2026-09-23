import { describe, expect, it } from "vitest";
import {
  pickEditor,
  pickProjectPath,
  type OpenTarget,
  type Project,
} from "./rules";

const target = (
  id: string,
  kind: string,
  openDirectory = true,
): OpenTarget => ({
  id,
  label: id,
  kind,
  capabilities: { openDirectory },
});

const TARGETS = [
  target("vscode", "editor"),
  target("zed", "editor"),
  target("finder", "file-manager"),
  target("ghostty", "terminal"),
];

describe("pickEditor", () => {
  it("uses bb's preferred directory target when it is an editor", () => {
    expect(pickEditor(TARGETS, "zed")?.id).toBe("zed");
  });

  it("falls back to the first editor when the preference is not an editor", () => {
    expect(pickEditor(TARGETS, "finder")?.id).toBe("vscode");
  });

  it("falls back to the first editor when there is no preference", () => {
    expect(pickEditor(TARGETS, null)?.id).toBe("vscode");
  });

  it("skips an editor that cannot open a directory", () => {
    expect(
      pickEditor([target("xcode", "editor", false), target("zed", "editor")], null)
        ?.id,
    ).toBe("zed");
  });

  it("returns null when the machine has no editor", () => {
    expect(pickEditor([target("finder", "file-manager")], "finder")).toBeNull();
  });
});

describe("pickProjectPath", () => {
  const project = (sources: Project["sources"]): Project => ({
    id: "proj_1",
    name: "widgets",
    sources,
  });
  const source = (hostId: string, path: string, isDefault = false) => ({
    type: "local_path",
    hostId,
    path,
    isDefault,
  });

  it("returns the checkout on this machine", () => {
    expect(
      pickProjectPath(
        project([
          source("host_other", "/elsewhere/widgets"),
          source("host_here", "/src/widgets"),
        ]),
        "host_here",
      ),
    ).toBe("/src/widgets");
  });

  it("prefers the default source when this machine holds two", () => {
    expect(
      pickProjectPath(
        project([
          source("host_here", "/src/widgets-old"),
          source("host_here", "/src/widgets", true),
        ]),
        "host_here",
      ),
    ).toBe("/src/widgets");
  });

  it("returns null when the project has no checkout on this machine", () => {
    expect(
      pickProjectPath(project([source("host_other", "/src/widgets")]), "host_here"),
    ).toBeNull();
  });

  it("returns null for a project with no sources", () => {
    expect(pickProjectPath(project([]), "host_here")).toBeNull();
  });
});
