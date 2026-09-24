// bb-plugin-dynamic-ui — lets a skill show its results as a list above the
// thread's composer, instead of as a list in chat.
//
// The skill writes a view file and runs `bb dynamic-ui publish --file`. The
// view belongs to the thread that published it and appears above that
// thread's composer; each item opens in the side panel. Each button sends a
// message back to that thread, opens a new thread, runs a shell command the
// user has confirmed, or opens a link.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./view/contract.js";
import { runCommand } from "./view/run-command.js";
import { applyEdit, parseView, type Action } from "./view/schema.js";
import { MIGRATIONS, createStore, describeItems, type ActionResult, type StoredView } from "./view/store.js";

export { rpcContract };

/** Published with `{ threadId, viewId, title }` whenever a view is published. */
const PUBLISHED = "dynamic-ui-published";
/** Published with `{ threadId, viewId }` whenever an item changes. */
const CHANGED = "dynamic-ui-changed";

const KEY = /^[A-Za-z0-9._-]{1,60}$/;

const PERSONAL_WORKSPACE = { type: "host", workspace: { type: "personal" } } as const;
const PROJECT_DEFAULT = { type: "project-default" } as const;

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    providerId: {
      type: "string",
      label: "Provider for threads a view opens",
      // A view's task usually names a skill, and skills belong to one provider.
      default: "claude-code",
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db as never);
  const now = () => new Date().toISOString();

  /** projects.list leaves out the personal project; the sidebar bootstrap has it. */
  async function personalProjectId(): Promise<string | null> {
    try {
      const bootstrap = (await bb.sdk.projects.sidebarBootstrap()) as { personalProject?: { id?: string } };
      return bootstrap.personalProject?.id ?? null;
    } catch (error) {
      bb.log.warn(`could not resolve the personal project: ${String(error)}`);
      return null;
    }
  }

  async function projectFor(name: string): Promise<string> {
    const wanted = name.trim();
    const personal = await personalProjectId();
    if (personal !== null && (wanted.toLowerCase() === "personal" || wanted === personal)) return personal;
    const projects = (await bb.sdk.projects.list({})) as Array<{ id: string; name: string }>;
    const match = projects.find(
      (project) => project.id === wanted || project.name.toLowerCase() === wanted.toLowerCase(),
    );
    if (match === undefined) {
      throw new Error(`No bb project named "${name}". Projects: ${projects.map((p) => p.name).join(", ")}.`);
    }
    return match.id;
  }

  function requireView(viewId: number): StoredView {
    const stored = store.get(viewId);
    if (stored === null) throw new Error(`No view ${viewId}.`);
    return stored;
  }

  function findItem(stored: StoredView, itemId: string) {
    for (const section of stored.view.sections) {
      const item = section.items.find((candidate) => candidate.id === itemId);
      if (item !== undefined) return item;
    }
    throw new Error(`No item ${itemId} in view ${stored.id}.`);
  }

  async function perform(stored: StoredView, action: Action): Promise<Omit<ActionResult, "label" | "at">> {
    switch (action.type) {
      case "message":
        await bb.sdk.threads.send({
          threadId: stored.threadId,
          mode: "auto",
          input: [{ type: "text", text: action.text, mentions: [] }],
        });
        return {};
      case "thread": {
        const projectId = await projectFor(action.project);
        const providerId = (await settings.get()).providerId.trim();
        const thread = await bb.sdk.threads.spawn({
          projectId,
          environment: projectId === (await personalProjectId()) ? PERSONAL_WORKSPACE : PROJECT_DEFAULT,
          ...(providerId === "" ? {} : { providerId }),
          prompt: action.prompt,
          title: action.title,
        });
        return { threadId: thread.id };
      }
      case "command": {
        const { exitCode, output } = await runCommand(action.command, action.cwd ?? stored.cwd ?? homedir());
        return { exitCode, output };
      }
      case "link":
        // The panel opens links itself; nothing for the server to do.
        return {};
    }
  }

  async function runAction(viewId: number, itemId: string, index: number, text?: string): Promise<StoredView> {
    const stored = requireView(viewId);
    const item = findItem(stored, itemId);
    const original = item.actions[index];
    if (original === undefined) throw new Error(`Item ${itemId} has no action ${index}.`);
    const { action, edited } = applyEdit(original, text);
    let result: ActionResult;
    try {
      result = { label: action.label, at: now(), ...(edited ? { edited: true } : {}), ...(await perform(stored, action)) };
    } catch (error) {
      result = { label: action.label, at: now(), ...(edited ? { edited: true } : {}), error: error instanceof Error ? error.message : String(error) };
    }
    // A failed command or spawn leaves the item open, with the failure on it.
    const failed = result.error !== undefined || (result.exitCode !== undefined && result.exitCode !== 0);
    const updated = store.setItem(viewId, itemId, { state: failed ? "open" : "done", result }, now())!;
    bb.realtime.publish(CHANGED, { threadId: stored.threadId, viewId });
    bb.log.info(`ran "${action.label}" (${action.type}) on ${itemId} in view ${viewId}${failed ? ", failed" : ""}`);
    return updated;
  }

  function dismiss(viewId: number, itemId: string, dismissed: boolean): StoredView {
    const stored = requireView(viewId);
    findItem(stored, itemId);
    const previous = stored.items[itemId]?.result ?? null;
    const updated = store.setItem(viewId, itemId, { state: dismissed ? "dismissed" : "open", result: previous }, now())!;
    bb.realtime.publish(CHANGED, { threadId: stored.threadId, viewId });
    return updated;
  }

  bb.rpc.register(rpcContract, {
    thread_views: ({ threadId }) => ({ views: store.forThread(threadId) }),
    view_get: ({ viewId }) => store.get(viewId),
    action_run: ({ viewId, itemId, index, text }) => runAction(viewId, itemId, index, text),
    item_dismiss: ({ viewId, itemId, dismissed }) => dismiss(viewId, itemId, dismissed),
  });

  const usage = [
    "Usage:",
    "  bb dynamic-ui publish --file <view.json> [--key <name>]",
    "  bb dynamic-ui state [--key <name>]",
    "  bb dynamic-ui list",
    "",
    "Run these from the thread the view belongs to. `publish` shows the view above",
    "that thread's composer; publishing again with the same key replaces it and",
    "keeps what the user already did to each item. `state` prints each item's",
    "state and the result of the last button pressed on it. The view file's shape",
    "is in the dynamic-ui skill.",
  ].join("\n");

  function flag(args: string[], name: string): string | undefined {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? undefined : args[at + 1];
  }

  bb.cli.register({
    name: "dynamic-ui",
    summary: "Show a skill's results above the thread's composer, with buttons",
    commands: [
      {
        name: "publish",
        summary: "Publish or replace this thread's view from a JSON file",
        usage: "bb dynamic-ui publish --file <view.json> [--key <name>]",
      },
      {
        name: "state",
        summary: "Print each item's state and the result of its last action",
        usage: "bb dynamic-ui state [--key <name>]",
      },
      { name: "list", summary: "List this thread's views", usage: "bb dynamic-ui list" },
    ],
    async run(argv, ctx) {
      const [command, ...args] = argv;
      if (command === undefined || command === "help" || command === "--help") {
        return { exitCode: 0, stdout: usage };
      }
      const threadId = ctx.threadId;
      if (threadId === undefined) {
        return { exitCode: 1, stderr: "Run this from inside a bb thread: a view belongs to the thread that publishes it." };
      }
      const key = flag(args, "key") ?? "default";
      if (!KEY.test(key)) return { exitCode: 1, stderr: "A key is 1 to 60 letters, digits, or . _ -" };

      switch (command) {
        case "publish": {
          const file = flag(args, "file");
          if (file === undefined) return { exitCode: 1, stderr: usage };
          try {
            // The server's working directory is not the caller's.
            const path = ctx.cwd === undefined || isAbsolute(file) ? file : resolve(ctx.cwd, file);
            const view = parseView(await readFile(path, "utf8"));
            const stored = store.publish(threadId, key, view, ctx.cwd ?? null, now());
            bb.realtime.publish(PUBLISHED, { threadId, viewId: stored.id, title: view.title });
            const count = view.sections.reduce((sum, section) => sum + section.items.length, 0);
            return {
              exitCode: 0,
              stdout: `Published "${view.title}" (${count} items) as view ${stored.id}. It is above this thread's composer.`,
            };
          } catch (error) {
            // The agent reads this and fixes its file.
            return { exitCode: 1, stderr: error instanceof Error ? error.message : String(error) };
          }
        }
        case "state": {
          const stored = store.forThread(threadId).find((candidate) => candidate.key === key);
          if (stored === undefined) return { exitCode: 1, stderr: `This thread has no view with key "${key}".` };
          return { exitCode: 0, stdout: [`${stored.view.title} (view ${stored.id})`, ...describeItems(stored)].join("\n") };
        }
        case "list": {
          const views = store.forThread(threadId);
          return {
            exitCode: 0,
            stdout:
              views.length === 0
                ? "This thread has no views."
                : views.map((v) => `${v.id}  ${v.key}  ${v.publishedAt.slice(0, 16).replace("T", " ")}  ${v.view.title}`).join("\n"),
          };
        }
      }
      return { exitCode: 1, stderr: usage };
    },
  });
}
