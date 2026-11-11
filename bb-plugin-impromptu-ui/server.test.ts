import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

async function start() {
  const host = createFakePluginHost({
    pluginId: "impromptu-ui",
    sdk: { threads: { get: async () => makeThreadResponse({ id: "thr_a" }) } } as never,
  });
  await plugin(host.bb);
  const cli = (...argv: string[]) => host.harness.behavior.runCli(argv, { threadId: "thr_a" } as never);
  const views = async () =>
    ((await host.harness.behavior.callRpc("thread_views", { threadId: "thr_a" })) as { views: Array<{ key: string; view: { layout: string } }> }).views;
  return { cli, views };
}

function viewFile(view: object): string {
  const file = join(mkdtempSync(join(tmpdir(), "impromptu-ui-")), "view.json");
  writeFileSync(file, JSON.stringify(view));
  return file;
}

const answer = (label: string) => ({ type: "message", label, text: label });

describe("bb impromptu-ui publish", () => {
  it("publishes an inline view with a status and one button as cards, with a warning", async () => {
    const { cli, views } = await start();
    const file = viewFile({
      title: "Fix the check",
      layout: "inline",
      sections: [{ items: [{ id: "q", title: "Push the fix?", status: { label: "In progress" }, actions: [answer("Push")] }] }],
    });
    const result = await cli("publish", "--file", file, "--key", "fix");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Published "Fix the check"/);
    expect(result.stdout).toMatch(/Warning: Published as "cards", not "inline", because .*status needs the side panel/);
    expect(result.stdout).toMatch(/actions: a question in an "inline" view has 2 to 4 buttons/);
    expect((await views()).find((view) => view.key === "fix")?.view.layout).toBe("cards");
  });

  it("refuses an inline question with no buttons, naming hide with the view's key", async () => {
    const { cli, views } = await start();
    const file = viewFile({ title: "T", layout: "inline", sections: [{ items: [{ id: "q", title: "Go ahead?", actions: [] }] }] });
    const result = await cli("publish", "--file", file, "--key", "deploy");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/bb impromptu-ui hide --key deploy/);
    expect(await views()).toEqual([]);
  });

  it("publishes a valid inline view with no warning", async () => {
    const { cli, views } = await start();
    const file = viewFile({ title: "T", layout: "inline", sections: [{ items: [{ id: "q", title: "Go?", actions: [answer("Yes"), answer("No")] }] }] });
    const result = await cli("publish", "--file", file);
    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).not.toMatch(/Warning/);
    expect((await views())[0]?.view.layout).toBe("inline");
  });
});

describe("hidden views", () => {
  const question = (id: string, title: string) => ({ id, title, actions: [answer("Yes"), answer("No")] });

  it("state says a hidden view is not above the composer", async () => {
    const { cli } = await start();
    await cli("publish", "--file", viewFile({ title: "Next steps", layout: "inline", sections: [{ items: [question("pr2", "Start PR 2?")] }] }), "--key", "next");
    await cli("hide", "--key", "next");
    const result = await cli("state", "--key", "next");
    expect(result.stdout).toMatch(/^Next steps \(view \d+\)\nHidden: not above the composer/);
    expect(result.stdout).toMatch(/\[open\] pr2/);
  });

  it("publish names other hidden views that still have open items", async () => {
    const { cli } = await start();
    await cli("publish", "--file", viewFile({ title: "Next steps", layout: "inline", sections: [{ items: [question("pr2", "Start PR 2?")] }] }), "--key", "next");
    await cli("hide", "--key", "next");
    const result = await cli("publish", "--file", viewFile({ title: "Draft", layout: "inline", sections: [{ items: [question("d", "Apply?")] }] }), "--key", "draft");
    expect(result.stdout).toMatch(/Hidden, so not above the composer: "Next steps" \(next\) with 1 open item\./);
  });

  it("publish says nothing about a shown view or a hidden one with nothing open", async () => {
    const { cli } = await start();
    await cli("publish", "--file", viewFile({ title: "Shown", layout: "inline", sections: [{ items: [question("a", "A?")] }] }), "--key", "shown");
    await cli("publish", "--file", viewFile({ title: "Info", layout: "list", sections: [{ items: [{ id: "n", title: "A note" }] }] }), "--key", "info");
    await cli("hide", "--key", "info");
    const result = await cli("publish", "--file", viewFile({ title: "Draft", layout: "inline", sections: [{ items: [question("d", "Apply?")] }] }), "--key", "draft");
    expect(result.stdout).not.toMatch(/Hidden/);
  });
});
