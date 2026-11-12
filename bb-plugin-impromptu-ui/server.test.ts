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
  const rpc = (method: string, input: unknown) => host.harness.behavior.callRpc(method, input as never) as Promise<any>;
  const idle = () =>
    host.harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "thr_a" }), lastAssistantText: null } as never);
  return { cli, views, rpc, idle };
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

  it("publish says nothing about a hidden view with nothing open", async () => {
    const { cli } = await start();
    await cli("publish", "--file", viewFile({ title: "Info", layout: "list", sections: [{ items: [{ id: "n", title: "A note" }] }] }), "--key", "info");
    await cli("hide", "--key", "info");
    const result = await cli("publish", "--file", viewFile({ title: "Draft", layout: "inline", sections: [{ items: [question("d", "Apply?")] }] }), "--key", "draft");
    expect(result.stdout).not.toMatch(/Hidden|Still above/);
  });
});

describe("replacing an earlier question", () => {
  const question = (id: string, title: string) => ({ id, title, actions: [answer("Yes"), answer("No")] });
  const publish = (cli: (...argv: string[]) => Promise<any>, key: string, title: string, ...extra: string[]) =>
    cli("publish", "--file", viewFile({ title: key, layout: "inline", sections: [{ items: [question("q", title)] }] }), "--key", key, ...extra);
  const shown = async (rpc: (method: string, input: unknown) => Promise<any>) =>
    ((await rpc("composer_views", { threadId: "thr_a" })).views as Array<{ key: string }>).map((view) => view.key);

  it("names the other views still above the composer with open items", async () => {
    const { cli } = await start();
    await publish(cli, "step", "Commit the fix?");
    const { stdout } = await publish(cli, "fix-1", "Commit the fix?");
    expect(stdout).toMatch(/Still above the composer: "step" \(step\) with 1 open item: "Commit the fix\?"\./);
    expect(stdout).toMatch(/--replaces <key>/);
  });

  it("says nothing about a view whose items are answered, or the view being republished", async () => {
    const { cli, rpc } = await start();
    const { stdout: first } = await publish(cli, "step", "Go?");
    await rpc("item_dismiss", { viewId: Number(/view (\d+)/.exec(first)![1]), itemId: "q", dismissed: true });
    await publish(cli, "next", "Next?");
    const { stdout } = await publish(cli, "next", "Next, revised?");
    expect(stdout).not.toMatch(/Still above/);
  });

  it("hides the views --replaces names once the new view is published", async () => {
    const { cli, rpc, idle } = await start();
    await publish(cli, "step", "Commit?");
    await publish(cli, "other", "Push?");
    const { stdout } = await publish(cli, "fix-1", "Commit?", "--replaces", "step", "--replaces", "other");
    expect(stdout).toMatch(/Replaced "step" \(step\)/);
    expect(stdout).not.toMatch(/Still above/);
    expect(await shown(rpc)).toEqual(["fix-1"]);
    // Hidden by the agent, so the end of the turn does not bring it back.
    await idle();
    expect(await shown(rpc)).toEqual(["fix-1"]);
  });

  it("refuses an unknown key, or the key being published, and publishes nothing", async () => {
    const { cli, rpc } = await start();
    await publish(cli, "step", "Commit?");
    const unknown = await publish(cli, "fix-1", "Commit?", "--replaces", "nope");
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toMatch(/no view with that key/);
    const self = await publish(cli, "step", "Commit?", "--replaces", "step");
    expect(self.exitCode).toBe(1);
    expect(await shown(rpc)).toEqual(["step"]);
  });
});

describe("reopening an archived view", () => {
  const question = (id: string, title: string) => ({ id, title, actions: [answer("Yes"), answer("No")] });
  const publishQuestion = async (cli: (...argv: string[]) => Promise<any>, key: string) =>
    cli("publish", "--file", viewFile({ title: key, layout: "inline", sections: [{ items: [question("q", "Go?")] }] }), "--key", key);
  const shown = async (rpc: (method: string, input: unknown) => Promise<any>) =>
    ((await rpc("composer_views", { threadId: "thr_a" })).views as Array<{ key: string }>).map((view) => view.key);

  it("brings back a view the user archived with an open question when the turn ends", async () => {
    const { cli, rpc, idle } = await start();
    const { stdout } = await publishQuestion(cli, "next");
    const viewId = Number(/view (\d+)/.exec(stdout)![1]);
    await rpc("view_hide", { viewId, hidden: true, threadId: "thr_a" });
    expect(await shown(rpc)).toEqual([]);
    expect((await publishQuestion(cli, "other")).stdout).toMatch(/Archived by the user: "next" \(next\) with 1 open item\. It comes back above the composer when this turn ends\./);
    await idle();
    expect(await shown(rpc)).toEqual(["other", "next"]);
  });

  it("leaves a view the agent hid, and one with nothing open", async () => {
    const { cli, rpc, idle } = await start();
    await publishQuestion(cli, "agent");
    await cli("hide", "--key", "agent");
    const { stdout } = await publishQuestion(cli, "answered");
    const viewId = Number(/view (\d+)/.exec(stdout)![1]);
    await rpc("item_dismiss", { viewId, itemId: "q", dismissed: true });
    await rpc("view_hide", { viewId, hidden: true, threadId: "thr_a" });
    await idle();
    expect(await shown(rpc)).toEqual([]);
  });
});
