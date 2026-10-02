// bb-plugin-presentations — backend entry.
//
// A presentation is a thread plus a folder of numbered markdown slides. The
// Presentations page spawns the thread; this side remembers which folder
// belongs to it, reads the slides for the panel, and serves the images the
// slides point at. The folder-to-thread mapping in bb.storage.kv is the only
// thing the plugin stores.
import { homedir } from "node:os";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { imageMimeType } from "./deck/images";
import {
  baseName,
  directChildName,
  pickSlides,
  resolveDeckDir,
  resolveInDeck,
  slideTitle,
} from "./deck/slides";

/** Slides past this size are text nobody meant to put on a slide. */
const MAX_SLIDE_BYTES = 200_000;
const MAX_IMAGE_BYTES = 10_000_000;
/** How many entries one listing may return, subfolders included. */
const LIST_LIMIT = 1000;

const threadIdSchema = z.string().trim().min(1).max(200);

const promptInputSchema = z.looseObject({ type: z.string() });
const newThreadRequestSchema = z.looseObject({
  projectId: z.string().min(1),
  input: z.array(promptInputSchema).min(1),
});

const slideSchema = z.object({
  file: z.string(),
  title: z.string(),
  content: z.string(),
  sha256: z.string(),
});

/** Where the panel's file links point, so Markdown Editor can open a slide. */
const fileRootSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace"), environmentId: z.string(), dir: z.string() }),
  z.object({ kind: z.literal("host"), hostId: z.string(), dir: z.string() }),
]);

const deckSchema = z.object({
  name: z.string(),
  /** The folder as the user typed it. */
  path: z.string(),
  slides: z.array(slideSchema),
  fileRoot: fileRootSchema,
  /** Why the folder could not be read, or null when it was. */
  problem: z.string().nullable(),
});

export type Deck = z.infer<typeof deckSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type FileRoot = z.infer<typeof fileRootSchema>;

export const rpcContract = defineRpcContract({
  deck_info: {
    input: z.object({ threadId: threadIdSchema }).strict(),
    output: z.object({ isDeck: z.boolean() }),
  },
  deck_load: {
    input: z.object({ threadId: threadIdSchema }).strict(),
    output: deckSchema,
  },
  deck_thread_create: {
    input: z.object({
      request: newThreadRequestSchema,
      deckPath: z.string().trim().min(1).max(4096),
    }),
    output: z.object({ threadId: z.string() }),
  },
  asset_base: {
    input: z.null(),
    output: z.object({ routePath: z.string() }),
  },
});

interface DeckRecord {
  path: string;
}

const recordKey = (threadId: string) => `deck:${threadId}`;

/** Prepended to the user's prompt so the agent knows where the slides go. */
export function deckInstruction(deckPath: string): string {
  return [
    `This thread is for the presentation in the folder \`${deckPath}\`.`,
    "Each slide is a markdown file directly in that folder whose name starts with a number, such as `01-title.md`, and slides are shown in numeric order.",
    "Put images in the folder too, for example under `images/`, and reference them with relative paths.",
    "Slides are drawn on a 16:9 canvas, so keep each one short: a heading and a few lines.",
    "Create the folder if it does not exist yet.",
    "What follows is what I want from this presentation.",
  ].join(" ");
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  async function readRecord(threadId: string): Promise<DeckRecord | null> {
    return (await bb.storage.kv.get<DeckRecord>(recordKey(threadId))) ?? null;
  }

  /** The deck folder and its host, from the thread's environment. */
  async function locate(threadId: string, record: DeckRecord) {
    const thread = await bb.sdk.threads.get({ threadId });
    const environmentId = (thread as { environmentId?: string | null }).environmentId ?? null;
    const environment =
      environmentId === null ? null : await bb.sdk.environments.get({ environmentId });
    const location = resolveDeckDir({
      deckPath: record.path,
      workspacePath: environment?.path ?? null,
      homeDir: homedir(),
    });
    const hostId = environment?.hostId;
    const fileRoot: FileRoot =
      location.workspaceDir !== null && environmentId !== null
        ? { kind: "workspace", environmentId, dir: location.workspaceDir }
        : { kind: "host", hostId: hostId ?? "", dir: location.dir };
    return { ...location, hostId, fileRoot };
  }

  function describe(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }

  bb.rpc.register(rpcContract, {
    deck_info: async ({ threadId }) => ({
      isDeck: (await readRecord(threadId)) !== null,
    }),

    deck_load: async ({ threadId }) => {
      const record = await readRecord(threadId);
      // Checked here as well as in the frontend: what the header draws is not
      // what decides which folders this plugin reads.
      if (record === null) throw new Error("This thread is not a presentation.");
      const where = await locate(threadId, record);
      const empty: Deck = {
        name: baseName(record.path),
        path: record.path,
        slides: [],
        fileRoot: where.fileRoot,
        problem: null,
      };

      let names: string[];
      try {
        const listing = await bb.sdk.files.list({
          hostId: where.hostId,
          path: where.dir,
          limit: LIST_LIMIT,
        });
        names = listing.files
          .map((file) => directChildName(where.dir, file.path))
          .filter((name): name is string => name !== null);
      } catch (cause) {
        return { ...empty, problem: describe(cause) };
      }

      const slides = await Promise.all(
        pickSlides(names).map(async (file) => {
          const read = await bb.sdk.files.read({
            hostId: where.hostId,
            path: `${where.dir}/${file}`,
          });
          const content =
            read.contentEncoding !== "utf8"
              ? "_This slide is not UTF-8 text._"
              : read.sizeBytes > MAX_SLIDE_BYTES
                ? "_This slide is too large to show._"
                : read.content;
          return { file, title: slideTitle(content, file), content, sha256: read.sha256 };
        }),
      );
      return { ...empty, slides };
    },

    deck_thread_create: async ({ request, deckPath }) => {
      const thread = await bb.sdk.threads.spawn({
        ...request,
        input: [
          { type: "text", text: deckInstruction(deckPath), mentions: [] },
          ...request.input,
        ],
        title: `Presentation: ${baseName(deckPath)}`,
      } as Parameters<typeof bb.sdk.threads.spawn>[0]);
      await bb.storage.kv.set(recordKey(thread.id), { path: deckPath } satisfies DeckRecord);
      bb.log.info(`spawned presentation thread ${thread.id}`);
      return { threadId: thread.id };
    },

    asset_base: () => ({ routePath: `/api/v1/plugins/${bb.pluginId}/http/asset` }),
  });

  /**
   * Serve one image from a presentation thread's deck folder. The path is
   * resolved inside the folder and refused if it leaves it, so this route
   * reads nothing a slide could not already reference.
   */
  bb.http.route("GET", "/asset", async (context) => {
    const query = context.req.query();
    const threadId = threadIdSchema.safeParse(query.threadId);
    const file = typeof query.file === "string" ? resolveInDeck(query.file) : null;
    if (!threadId.success || file === null) {
      return new Response("Bad request", { status: 400 });
    }
    const mimeType = imageMimeType(file);
    if (mimeType === null) return new Response("Not an image", { status: 415 });

    try {
      const record = await readRecord(threadId.data);
      if (record === null) return new Response("Not found", { status: 404 });
      const where = await locate(threadId.data, record);
      const read = await bb.sdk.files.read({ hostId: where.hostId, path: `${where.dir}/${file}` });
      if (read.sizeBytes > MAX_IMAGE_BYTES) {
        return new Response("Image too large", { status: 413 });
      }
      // The browser keeps the image and asks again on each use, so moving
      // between slides costs a 304 rather than the bytes, and an image an
      // agent replaced still shows up.
      const etag = `"${read.sha256}"`;
      const caching = { etag, "cache-control": "no-cache" };
      if (context.req.header("if-none-match") === etag) {
        return new Response(null, { status: 304, headers: caching });
      }
      const bytes =
        read.contentEncoding === "base64"
          ? Buffer.from(read.content, "base64")
          : Buffer.from(read.content, "utf8");
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": mimeType,
          "content-length": String(bytes.byteLength),
          ...caching,
        },
      });
    } catch (cause) {
      bb.log.warn(`asset failed for ${file}: ${describe(cause)}`);
      return new Response("Not found", { status: 404 });
    }
  });

  /**
   * `bb presentations attach <folder>` makes the thread it runs in a
   * presentation thread, for a deck started somewhere other than the
   * Presentations page. `bb presentations` alone says which folder the
   * thread presents.
   */
  bb.cli.register({
    name: "presentations",
    summary: "Show or set the slide folder this thread presents.",
    commands: [
      { name: "show", summary: "Show this thread's deck folder (the default).", usage: "bb presentations" },
      {
        name: "attach",
        summary: "Present a folder of numbered markdown slides from this thread.",
        usage: "bb presentations attach presentations/my-talk",
      },
    ],
    run: async (argv, ctx) => {
      const threadId = ctx.threadId;
      if (!threadId) {
        return { exitCode: 1, stderr: "bb presentations works inside a thread.\n" };
      }
      const [command = "show", ...rest] = argv;
      if (command === "show") {
        const record = await readRecord(threadId);
        return record === null
          ? { exitCode: 0, stdout: "This thread has no deck. Attach one with: bb presentations attach <folder>\n" }
          : { exitCode: 0, stdout: `${record.path}\n` };
      }
      if (command === "attach") {
        const deckPath = rest.join(" ").trim();
        if (deckPath === "") {
          return { exitCode: 1, stderr: "Usage: bb presentations attach <folder>\n" };
        }
        try {
          await locate(threadId, { path: deckPath });
        } catch (cause) {
          return { exitCode: 1, stderr: `${describe(cause)}\n` };
        }
        await bb.storage.kv.set(recordKey(threadId), { path: deckPath } satisfies DeckRecord);
        return {
          exitCode: 0,
          stdout: `This thread now presents ${deckPath}. Its header has a Present button.\n`,
        };
      }
      return { exitCode: 1, stderr: `Unknown command "${command}". Try: bb presentations attach <folder>\n` };
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
