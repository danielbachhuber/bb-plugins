import { describe, expect, it } from "vitest";
import { openInEditor, pickOpenTarget, type OpenTarget } from "./open-in-editor";

const vscode: OpenTarget = { id: "vscode", label: "VS Code", kind: "editor", capabilities: { openFile: true } };
const cursor: OpenTarget = { id: "cursor", label: "Cursor", kind: "editor", capabilities: { openFile: true } };
const terminal: OpenTarget = { id: "terminal", label: "Terminal", kind: "terminal", capabilities: { openFile: true } };
const finder: OpenTarget = { id: "finder", label: "Finder", kind: "file-manager", capabilities: { openFile: false } };
const defaultApp: OpenTarget = { id: "default-app", label: "Default app", kind: "default-app", capabilities: { openFile: true } };

describe("pickOpenTarget", () => {
  it("uses the editor chosen in bb", () => {
    expect(pickOpenTarget([vscode, cursor], "cursor")).toBe(cursor);
  });

  it("falls back to the default app when the chosen editor is gone", () => {
    expect(pickOpenTarget([terminal, defaultApp, vscode], "zed")).toBe(defaultApp);
  });

  it("ranks editors ahead of terminals with no choice made", () => {
    expect(pickOpenTarget([finder, terminal, defaultApp, vscode], null)).toBe(vscode);
  });

  it("skips a chosen app that cannot open files", () => {
    expect(pickOpenTarget([finder, terminal], "finder")).toBe(terminal);
  });

  it("returns null when nothing can open a file", () => {
    expect(pickOpenTarget([finder], null)).toBeNull();
  });
});

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const key = Object.keys(routes).find((route) => url.startsWith(route));
    if (key === undefined) return new Response("Not Found", { status: 404 });
    return Response.json(routes[key]);
  }) as typeof fetch;
}

describe("openInEditor", () => {
  const routes = {
    "http://127.0.0.1:4000/api/v1/system/config": { localHelperPorts: [4001, 4002] },
    "http://127.0.0.1:4001/status": { hostId: "host_other", serverUrl: "http://127.0.0.1:5000" },
    "http://127.0.0.1:4002/status": { hostId: "host_1", serverUrl: "http://127.0.0.1:4000" },
    "http://127.0.0.1:4002/workspace-open-targets": { targets: [terminal, vscode, cursor] },
    "http://127.0.0.1:4002/open-in-target": { ok: true },
  };

  it("opens the file in the chosen editor through this bb's helper", async () => {
    const calls: string[] = [];
    const label = await openInEditor({
      fetch: fakeFetch(routes, calls),
      serverOrigin: "http://127.0.0.1:4000",
      path: "/Users/hubber/work/acme-widgets/docs/plan.md",
      preferredId: "cursor",
    });
    expect(label).toBe("Cursor");
    expect(calls.at(-1)).toBe("POST http://127.0.0.1:4002/open-in-target");
    expect(calls).toContain(
      "GET http://127.0.0.1:4002/workspace-open-targets?path=%2FUsers%2Fhubber%2Fwork%2Facme-widgets%2Fdocs%2Fplan.md",
    );
  });

  it("refuses a host file on a different host than the helper", async () => {
    await expect(
      openInEditor({
        fetch: fakeFetch(routes),
        serverOrigin: "http://127.0.0.1:4000",
        path: "/home/octocat/notes.md",
        hostId: "host_remote",
        preferredId: null,
      }),
    ).rejects.toThrow("another host");
  });

  it("says so when no helper answers", async () => {
    await expect(
      openInEditor({
        fetch: fakeFetch({ "http://127.0.0.1:4000/api/v1/system/config": { localHelperPorts: [4009] } }),
        serverOrigin: "http://127.0.0.1:4000",
        path: "/tmp/notes.md",
        preferredId: null,
      }),
    ).rejects.toThrow("isn't reachable");
  });
});
