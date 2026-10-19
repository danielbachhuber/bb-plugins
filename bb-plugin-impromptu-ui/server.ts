// bb-plugin-impromptu-ui — lets a skill show its results as a list above the
// thread's composer, instead of as a list in chat.
//
// The skill writes a view file and runs `bb impromptu-ui publish --file`. The
// view belongs to the thread that published it and appears above that
// thread's composer; each item opens in the side panel. Each button sends a
// message back to that thread, opens a new thread, runs a shell command the
// user has confirmed, or opens a link.
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { expandPatchFiles } from "./view/changes.js";
import { fillTally, openBeforeClosing } from "./view/closing.js";
import { rpcContract } from "./view/contract.js";
import { viewJsonSchema } from "./view/describe.js";
import { INLINE_REPLY_LABEL, inlineReplyMessage } from "./view/inline.js";
import { runCommand } from "./view/run-command.js";
import { THREAD_INSTRUCTIONS } from "./view/instructions.js";
import { fetchArgsFor, threadEnvironment } from "./view/thread-environment.js";
import { itemThreadPrompt } from "./view/thread-prompt.js";
import { MAX_IMAGE_BYTES, feedbackMessage, hasFeedback, imageMime, type Feedback } from "./view/review.js";
import { fillDraft, fillNote, itemThreads, messageTargets, parseView, usesDraft, usesNote, type Action, type View } from "./view/schema.js";
import { MIGRATIONS, createStore, describeItems, stateAfterAction, viewFor, type ActionResult, type StoredImage, type StoredView } from "./view/store.js";

export { rpcContract };

/** Published with `{ threadId, viewId, title }` whenever a view is published. */
const PUBLISHED = "impromptu-ui-published";
/** Published with `{ threadId, viewId }` whenever an item changes. */
const CHANGED = "impromptu-ui-changed";

const KEY = /^[A-Za-z0-9._-]{1,60}$/;

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    providerId: {
      type: "string",
      label: "Provider for threads a view opens",
      // A view's task usually names a skill, and skills belong to one provider.
      default: "claude-code",
    },
    threadInstructions: {
      type: "boolean",
      label: "Tell every thread when to publish a view",
      description: "Adds a short section to each thread's instructions on when to show results above the composer.",
      default: true,
    },
  });

  // The instructions hook must answer synchronously, so keep the setting in hand.
  let threadInstructions = (await settings.get()).threadInstructions;
  settings.onChange((next) => {
    threadInstructions = next.threadInstructions;
  });
  bb.agents.contributeInstructions(() => (threadInstructions ? THREAD_INSTRUCTIONS : null));

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

  type ProjectSource = { path?: string | null; hostId?: string | null; isDefault?: boolean | null };

  /** The project, with where its default checkout is, which a worktree for it is made from. */
  async function projectFor(
    name: string,
  ): Promise<{ id: string; personal: boolean; hostId: string | null; path: string | null }> {
    const wanted = name.trim();
    const personal = await personalProjectId();
    if (personal !== null && (wanted.toLowerCase() === "personal" || wanted === personal)) {
      return { id: personal, personal: true, hostId: null, path: null };
    }
    const projects = (await bb.sdk.projects.list({})) as Array<{ id: string; name: string; sources?: ProjectSource[] | null }>;
    const match = projects.find(
      (project) => project.id === wanted || project.name.toLowerCase() === wanted.toLowerCase(),
    );
    if (match === undefined) {
      throw new Error(`No bb project named "${name}". Projects: ${projects.map((p) => p.name).join(", ")}.`);
    }
    const sources = (match.sources ?? []).filter((source) => source.path && source.hostId);
    const source = sources.find((candidate) => candidate.isDefault) ?? sources[0];
    return { id: match.id, personal: false, hostId: source?.hostId ?? null, path: source?.path ?? null };
  }

  function git(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      execFile("git", ["-C", cwd, ...args], { timeout: 60_000 }, (error, stdout, stderr) =>
        resolve({ ok: !error, stdout: stdout ?? "", stderr: (stderr ?? "").trim() || (error ? error.message : "") }),
      );
    });
  }

  /**
   * Fetches a `<remote>/<branch>` base before a worktree is cut from it, so a
   * branch pushed or rebased on GitHub since the last fetch is current. A
   * failed fetch is logged rather than thrown: the ref may still be good.
   */
  async function fetchBase(path: string, baseBranch: string) {
    const remotes = (await git(path, ["remote"])).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    const args = fetchArgsFor(baseBranch, remotes);
    if (args === null) return;
    const fetched = await git(path, args);
    if (!fetched.ok) bb.log.warn(`could not fetch ${baseBranch} in ${path}: ${fetched.stderr}`);
  }

  /** Tells every thread that shows the view to look again: the one that published it, and each one its items show in. */
  function changed(stored: StoredView) {
    for (const threadId of [stored.threadId, ...itemThreads(stored.view)]) {
      bb.realtime.publish(CHANGED, { threadId, viewId: stored.id });
    }
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

  function threadName(thread: { id: string; title: string | null; titleFallback: string | null }): string {
    const title = thread.title ?? thread.titleFallback;
    return title === null ? thread.id : `${title} (${thread.id})`;
  }

  /** Refuses a view whose buttons send to a thread that does not exist. An archived one is fine: it can be unarchived. */
  async function checkTargets(view: View) {
    for (const { threadId, where } of messageTargets(view)) {
      try {
        await bb.sdk.threads.get({ threadId });
      } catch {
        throw new Error(`${where}: no bb thread ${threadId}.`);
      }
    }
  }

  /** Where a message goes when that is not the thread that published the view, kept whether or not the send works. */
  function sentTo(stored: StoredView, action: Action): Pick<ActionResult, "sentTo"> {
    return action.type === "message" && action.threadId !== undefined && action.threadId !== stored.threadId ? { sentTo: action.threadId } : {};
  }

  async function perform(stored: StoredView, action: Action): Promise<Omit<ActionResult, "label" | "at">> {
    switch (action.type) {
      case "message": {
        // "auto" starts a turn in an idle thread and joins a running one, as typing into it would.
        const target = action.threadId ?? stored.threadId;
        if (target !== stored.threadId) {
          const thread = await bb.sdk.threads.get({ threadId: target });
          if (thread.archivedAt !== null) throw new Error(`${threadName(thread)} is archived. Unarchive it and try again.`);
        }
        await bb.sdk.threads.send({
          threadId: target,
          mode: "auto",
          input: [{ type: "text", text: action.text, mentions: [] }],
        });
        return {};
      }
      case "thread": {
        const project = await projectFor(action.project);
        const environment = threadEnvironment({ baseBranch: action.baseBranch, project: action.project, ...project });
        if (action.baseBranch !== undefined && project.path !== null) await fetchBase(project.path, action.baseBranch);
        const providerId = (await settings.get()).providerId.trim();
        const thread = await bb.sdk.threads.spawn({
          projectId: project.id,
          environment,
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

  /** A closing step's button with `{tally}` filled in from what was done with the items before it. */
  function withTally(action: Action, stored: StoredView): Action {
    if (action.type === "message") return { ...action, text: fillTally(action.text, stored) };
    if (action.type === "thread") return { ...action, prompt: fillTally(action.prompt, stored) };
    return action;
  }

  async function runAction(viewId: number, itemId: string, index: number, draft?: string, note?: string): Promise<StoredView> {
    const stored = requireView(viewId);
    const item = findItem(stored, itemId);
    const original = item.actions[index];
    if (original === undefined) throw new Error(`Item ${itemId} has no action ${index}.`);
    // Only a button that sends the draft takes the user's version of it.
    if (draft !== undefined && !usesDraft(original)) throw new Error(`"${original.label}" does not send the draft.`);
    // A text field can start empty, and an empty answer is not one to send.
    if (usesDraft(original) && (draft ?? item.draft).trim() === "") throw new Error(`Fill in "${item.draftLabel}" before "${original.label}".`);
    if (note !== undefined && !usesNote(original)) throw new Error(`"${original.label}" does not send the note.`);
    // The panel disables these too, but what it draws is not a check.
    const left = item.closing ? openBeforeClosing(stored) : 0;
    if (left > 0) throw new Error(`Handle the ${left} open item${left === 1 ? "" : "s"} before "${original.label}".`);
    const filled = fillDraft(original, item.draft, draft);
    const edited = filled.edited;
    const noted = usesNote(original) ? fillNote(filled.action, note ?? "") : filled.action;
    const action = item.closing ? withTally(noted, stored) : noted;
    // What was sent is kept when the user changed it, or typed it into a
    // one-line field, so the card, the list, and the agent see it.
    const keep = edited || (item.draftFormat === "text" && usesDraft(original));
    const sent = {
      ...sentTo(stored, action),
      ...(edited ? { edited: true } : {}),
      ...(keep ? { draft: draft ?? item.draft } : {}),
      ...(note === undefined || note === "" ? {} : { note }),
    };
    let result: ActionResult;
    try {
      result = { label: action.label, at: now(), ...sent, ...(await perform(stored, action)) };
    } catch (error) {
      result = { label: action.label, at: now(), ...sent, error: error instanceof Error ? error.message : String(error) };
    }
    // A failed command or spawn leaves the item open, with the failure on it.
    const failed = result.error !== undefined || (result.exitCode !== undefined && result.exitCode !== 0);
    const updated = store.setItem(viewId, itemId, { state: stateAfterAction(item, original, failed), result }, now())!;
    changed(stored);
    bb.log.info(`ran "${action.label}" (${action.type}) on ${itemId} in view ${viewId}${failed ? ", failed" : ""}`);
    return updated;
  }

  /**
   * Answers an inline question with the user's own words, sent to the thread
   * with the question so the agent knows what they answer. Recorded like a
   * button, under the field's label, with the text as typed.
   */
  async function replyInline(viewId: number, itemId: string, text: string): Promise<StoredView> {
    const stored = requireView(viewId);
    const item = findItem(stored, itemId);
    if (stored.view.layout !== "inline") throw new Error(`View ${viewId} is not an inline view.`);
    if ((stored.items[itemId]?.state ?? "open") !== "open") throw new Error(`"${item.title}" is already answered.`);
    let result: ActionResult = { label: INLINE_REPLY_LABEL, at: now(), draft: text };
    try {
      await bb.sdk.threads.send({
        threadId: stored.threadId,
        mode: "auto",
        input: [{ type: "text", text: inlineReplyMessage(item, text), mentions: [] }],
      });
    } catch (error) {
      result = { ...result, error: error instanceof Error ? error.message : String(error) };
    }
    const updated = store.setItem(viewId, itemId, { state: result.error === undefined ? "done" : "open", result }, now())!;
    changed(stored);
    bb.log.info(`answered ${itemId} in view ${viewId} in the user's words${result.error === undefined ? "" : ", failed"}`);
    return updated;
  }

  /** Runs a related entry's button. The item stays as it was; only the entry records what happened. */
  async function runRelated(viewId: number, itemId: string, entryId: string): Promise<StoredView> {
    const stored = requireView(viewId);
    const item = findItem(stored, itemId);
    const entry = item.related?.entries.find((candidate) => candidate.id === entryId);
    if (entry?.action === undefined) throw new Error(`Item ${itemId} has no related entry ${entryId} with a button.`);
    let result: ActionResult;
    try {
      result = { label: entry.action.label, at: now(), ...sentTo(stored, entry.action), ...(await perform(stored, entry.action)) };
    } catch (error) {
      result = { label: entry.action.label, at: now(), ...sentTo(stored, entry.action), error: error instanceof Error ? error.message : String(error) };
    }
    const updated = store.setRelated(viewId, itemId, entryId, result, now())!;
    changed(stored);
    bb.log.info(`ran "${entry.action.label}" on related ${entryId} of ${itemId} in view ${viewId}${result.error === undefined ? "" : ", failed"}`);
    return updated;
  }

  function dismiss(viewId: number, itemId: string, dismissed: boolean): StoredView {
    const stored = requireView(viewId);
    findItem(stored, itemId);
    const previous = stored.items[itemId]?.result ?? null;
    const updated = store.setItem(viewId, itemId, { state: dismissed ? "dismissed" : "open", result: previous }, now())!;
    changed(stored);
    return updated;
  }

  /** Reads every visual review image a view names, so a bad path fails the publish. */
  async function loadImages(view: View, cwd: string | undefined) {
    const images: Array<{ itemId: string; index: number } & StoredImage> = [];
    for (const item of view.sections.flatMap((section) => section.items)) {
      for (const [index, variation] of item.variations.entries()) {
        const where = `${item.id}, variation ${index + 1} ("${variation.label}")`;
        const mime = imageMime(variation.image);
        if (mime === null) throw new Error(`${where}: ${variation.image} is not a PNG, JPEG, WebP, or GIF.`);
        const path = cwd === undefined || isAbsolute(variation.image) ? variation.image : resolve(cwd, variation.image);
        let size: number;
        try {
          size = (await stat(path)).size;
        } catch {
          throw new Error(`${where}: no image at ${path}.`);
        }
        if (size > MAX_IMAGE_BYTES) {
          throw new Error(`${where}: ${path} is ${Math.round(size / 1024 / 1024)} MB; the limit is 8 MB. Crop it or take it at a lower scale.`);
        }
        images.push({ itemId: item.id, index, mime, data: await readFile(path) });
      }
    }
    return images;
  }

  async function submitReview(viewId: number, itemId: string, feedback: Feedback): Promise<StoredView> {
    const stored = requireView(viewId);
    const item = findItem(stored, itemId);
    if (item.variations.length === 0) throw new Error(`Item ${itemId} is not a visual review.`);
    if (feedback.pick !== null && item.variations[feedback.pick] === undefined) throw new Error(`Item ${itemId} has no variation ${feedback.pick}.`);
    if (!hasFeedback(feedback)) throw new Error("Pick a variation or write a note first.");
    if ((stored.items[itemId]?.state ?? "open") === "done") throw new Error("This review's feedback was already sent.");
    let result: ActionResult = { label: "Send feedback", at: now(), feedback };
    try {
      await bb.sdk.threads.send({
        threadId: stored.threadId,
        mode: "auto",
        input: [{ type: "text", text: feedbackMessage(item, feedback), mentions: [] }],
      });
    } catch (error) {
      result = { ...result, error: error instanceof Error ? error.message : String(error) };
    }
    const updated = store.setItem(viewId, itemId, { state: result.error === undefined ? "done" : "open", result }, now())!;
    changed(stored);
    bb.log.info(`sent visual review feedback on ${itemId} in view ${viewId}${result.error === undefined ? "" : ", failed"}`);
    return updated;
  }

  bb.rpc.register(rpcContract, {
    // A thread's own views first, then the ones whose items show in it.
    thread_views: ({ threadId }) => ({ views: [...store.forThread(threadId), ...store.linkedTo(threadId)] }),
    view_get: ({ viewId }) => store.get(viewId),
    action_run: ({ viewId, itemId, index, draft, note }) => runAction(viewId, itemId, index, draft, note),
    related_run: ({ viewId, itemId, entryId }) => runRelated(viewId, itemId, entryId),
    inline_reply: ({ viewId, itemId, text }) => replyInline(viewId, itemId, text),
    view_threads: async ({ viewId }) => {
      const threads: Record<string, { title: string; archived: boolean }> = {};
      for (const { threadId } of messageTargets(requireView(viewId).view)) {
        if (threadId in threads) continue;
        try {
          const thread = await bb.sdk.threads.get({ threadId });
          threads[threadId] = { title: thread.title ?? thread.titleFallback ?? threadId, archived: thread.archivedAt !== null };
        } catch {
          // Deleted since the view was published: the panel shows the id.
        }
      }
      return { threads };
    },
    view_hide: ({ viewId, hidden, threadId }) => {
      const stored = requireView(viewId);
      if (threadId !== undefined && threadId !== stored.threadId) {
        // Hidden only from above that thread; the thread that published it keeps it.
        store.setLinkedHidden(viewId, threadId, hidden, now());
        bb.realtime.publish(CHANGED, { threadId, viewId });
        return viewFor(stored, threadId);
      }
      const updated = store.setHidden(viewId, hidden, now())!;
      changed(stored);
      return updated;
    },
    item_dismiss: ({ viewId, itemId, dismissed }) => dismiss(viewId, itemId, dismissed),
    item_thread_seed: async ({ viewId, itemId }) => {
      const stored = requireView(viewId);
      const item = findItem(stored, itemId);
      // The thread that published the view knows the codebase the item is about.
      const source = await bb.sdk.threads.get({ threadId: stored.threadId });
      const providerId = (await settings.get()).providerId.trim();
      return {
        projectId: source.projectId,
        providerId: providerId === "" ? null : providerId,
        prompt: itemThreadPrompt(stored.view.title, item, stored.threadId),
      };
    },
    item_thread_start: async ({ viewId, itemId, request }) => {
      const stored = requireView(viewId);
      const item = findItem(stored, itemId);
      const thread = await bb.sdk.threads.spawn({ ...request, title: item.title } as Parameters<typeof bb.sdk.threads.spawn>[0]);
      bb.log.info(`started ${thread.id} from ${itemId} in view ${viewId}`);
      return { threadId: thread.id };
    },
    review_submit: ({ viewId, itemId, pick, notes, overall }) => submitReview(viewId, itemId, { pick, notes, overall }),
    image_get: ({ viewId, itemId, index }) => {
      const image = store.image(viewId, itemId, index);
      return { dataUrl: image === null ? null : `data:${image.mime};base64,${Buffer.from(image.data).toString("base64")}` };
    },
  });

  const usage = [
    "Usage:",
    "  bb impromptu-ui publish --file <view.json> [--key <name>]",
    "  bb impromptu-ui state [--key <name>]",
    "  bb impromptu-ui hide [--key <name>]",
    "  bb impromptu-ui list",
    "  bb impromptu-ui schema",
    "",
    "Run these from the thread the view belongs to. `publish` shows the view above",
    "that thread's composer; publishing again with the same key replaces it and",
    "keeps what the user already did to each item. `state` prints each item's",
    "state and the result of the last button pressed on it. `hide` takes the view",
    "down from above the composer, as its archive button does, until the next",
    "publish under its key. `schema` prints the JSON Schema of the view file,",
    "everything a view can hold; the impromptu-ui skill shows how to use it.",
  ].join("\n");

  function flag(args: string[], name: string): string | undefined {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? undefined : args[at + 1];
  }

  bb.cli.register({
    name: "impromptu-ui",
    summary: "Show a skill's results above the thread's composer, with buttons",
    commands: [
      {
        name: "publish",
        summary: "Publish or replace this thread's view from a JSON file",
        usage: "bb impromptu-ui publish --file <view.json> [--key <name>]",
      },
      {
        name: "state",
        summary: "Print each item's state and the result of its last action",
        usage: "bb impromptu-ui state [--key <name>]",
      },
      {
        name: "hide",
        summary: "Take this thread's view down from above the composer until the next publish",
        usage: "bb impromptu-ui hide [--key <name>]",
      },
      { name: "list", summary: "List this thread's views", usage: "bb impromptu-ui list" },
      {
        name: "schema",
        summary: "Print the JSON Schema of the view file: everything a view can hold",
        usage: "bb impromptu-ui schema",
      },
    ],
    async run(argv, ctx) {
      const [command, ...args] = argv;
      if (command === undefined || command === "help" || command === "--help") {
        return { exitCode: 0, stdout: usage };
      }
      if (command === "schema") return { exitCode: 0, stdout: viewJsonSchema() };
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
            // A patchFile is read now, like an image, so the view keeps what was proposed.
            const view = await expandPatchFiles(parseView(await readFile(path, "utf8")), (patchFile) =>
              readFile(ctx.cwd === undefined || isAbsolute(patchFile) ? patchFile : resolve(ctx.cwd, patchFile), "utf8"),
            );
            await checkTargets(view);
            const images = await loadImages(view, ctx.cwd);
            const stored = store.publish(threadId, key, view, ctx.cwd ?? null, now());
            store.putImages(stored.id, images);
            for (const shown of [threadId, ...itemThreads(view)]) {
              bb.realtime.publish(PUBLISHED, { threadId: shown, viewId: stored.id, title: view.title });
            }
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
          if (stored !== undefined) {
            return { exitCode: 0, stdout: [`${stored.view.title} (view ${stored.id})`, ...describeItems(stored)].join("\n") };
          }
          // A thread an item shows in reads back that item, from each view that has one.
          const linked = store.linkedTo(threadId);
          if (flag(args, "key") === undefined && linked.length > 0) {
            return {
              exitCode: 0,
              stdout: linked
                .map((view) => [`${view.view.title} (view ${view.id}, published by ${view.threadId})`, ...describeItems(view)].join("\n"))
                .join("\n\n"),
            };
          }
          return { exitCode: 1, stderr: `This thread has no view with key "${key}".` };
        }
        case "hide": {
          const stored = store.forThread(threadId).find((candidate) => candidate.key === key);
          if (stored === undefined) return { exitCode: 1, stderr: `This thread has no view with key "${key}".` };
          store.setHidden(stored.id, true, now());
          changed(stored);
          return {
            exitCode: 0,
            stdout: `Hid "${stored.view.title}" (view ${stored.id}). Publishing again under key "${key}" shows it again.`,
          };
        }
        case "list": {
          const views = [...store.forThread(threadId), ...store.linkedTo(threadId)];
          return {
            exitCode: 0,
            stdout:
              views.length === 0
                ? "This thread has no views."
                : views
                    .map((v) => `${v.id}  ${v.key}  ${v.publishedAt.slice(0, 16).replace("T", " ")}  ${v.view.title}${v.threadId === threadId ? "" : `  (from ${v.threadId})`}${v.hiddenAt === null ? "" : "  (hidden)"}`).join("\n"),
          };
        }
      }
      return { exitCode: 1, stderr: usage };
    },
  });
}
