// Checks the open-in-editor requests against the bb running on this machine.
//
// open-in-editor.ts calls bb's local helper the way bb's app does, through
// requests bb does not publish for plugins. When a bb update renames or
// reshapes one, this test fails and says which. It skips when bb is not
// running, as in CI. It never opens anything: the open request names an
// editor that does not exist, which the helper turns away.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fetchHelperPorts,
  fetchOpenTargets,
  findHelper,
  HELPER_HOST,
} from "./open-in-editor";

function runningServerOrigin(): string | null {
  const runtime = join(homedir(), ".bb", "bb-app-runtime.json");
  if (!existsSync(runtime)) return null;
  try {
    const { serverUrl } = JSON.parse(readFileSync(runtime, "utf8")) as { serverUrl?: string };
    return serverUrl === undefined ? null : new URL(serverUrl).origin;
  } catch {
    return null;
  }
}

async function reachable(origin: string): Promise<boolean> {
  try {
    return (await fetch(`${origin}/api/v1/system/config`)).status !== 0;
  } catch {
    return false;
  }
}

const origin = runningServerOrigin();
const live = origin !== null && (await reachable(origin));

describe.skipIf(!live)("bb's local helper, live", () => {
  const serverOrigin = origin as string;

  it("still lists helper ports, answers /status, lists editors, and takes open requests", async () => {
    const ports = await fetchHelperPorts(fetch, serverOrigin);
    expect(ports.length).toBeGreaterThan(0);

    const helper = await findHelper(fetch, serverOrigin, ports);
    expect(helper, "no helper port answered /status with a hostId and serverUrl").not.toBeNull();
    expect(new URL(helper!.serverUrl).origin).toBe(serverOrigin);

    const targets = await fetchOpenTargets(fetch, helper!.port, join(homedir(), "notes.md"));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(typeof target.id).toBe("string");
      expect(typeof target.label).toBe("string");
      expect(typeof target.capabilities).toBe("object");
    }
    expect(targets.some((target) => target.capabilities.openFile === true)).toBe(true);

    const response = await fetch(`http://${HELPER_HOST}:${helper!.port}/open-in-target`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: { kind: "local" },
        columnNumber: null,
        lineNumber: null,
        path: join(homedir(), "markdown-editor-contract-check.md"),
        targetId: "markdown-editor-no-such-target",
      }),
    });
    // 404 means the route is gone. Any other answer but this one means the
    // request body no longer passes the helper's validation.
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("markdown-editor-no-such-target");
  });
});
