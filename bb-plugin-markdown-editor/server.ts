// bb-plugin-markdown-editor — backend entry.
//
// The frontend has no filesystem API, so this file is the whole bridge
// between an open file tab and the bytes on a host: two RPC methods, and the
// lookups that turn a `PluginFileOpenerSource` into somewhere bb.files can
// point. The decisions worth arguing about — which paths are allowed, which
// hash a write should expect — live in editor/ as pure functions.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  TargetError,
  assertPathShape,
  buildFileTarget,
  type FileSourceKind,
  type FileTarget,
  type ResolvedRoot,
} from "./editor/target";

/** Refuse anything larger than this rather than hand a browser a huge string. */
const MAX_BYTES = 2_000_000;

const idSchema = z.string().trim().min(1).max(200);

/**
 * Mirrors the SDK's `PluginFileOpenerSource`. It arrives over the wire from
 * a component we wrote, which is not a reason to trust it: the frontend is
 * the least trustworthy caller this plugin has.
 */
const sourceSchema = z
  .object({
    kind: z.enum(["host", "thread-storage", "workspace"]),
    threadId: idSchema.nullable(),
    environmentId: idSchema.nullable(),
    projectId: idSchema.nullable(),
    hostId: idSchema.optional(),
  })
  .strict();

const pathSchema = z.string().min(1).max(4096);

export const rpcContract = defineRpcContract({
  file_read: {
    input: z.object({ path: pathSchema, source: sourceSchema }).strict(),
    output: z.object({ content: z.string(), sha256: z.string() }),
  },
  file_write: {
    input: z
      .object({
        path: pathSchema,
        source: sourceSchema,
        content: z.string().max(MAX_BYTES),
        /**
         * The hash the client believes is on disk. Null writes
         * unconditionally — the overwrite a user picks after seeing the
         * conflict banner.
         */
        expectedSha256: z.string().trim().min(1).max(128).nullable(),
      })
      .strict(),
    output: z.discriminatedUnion("outcome", [
      z.object({ outcome: z.literal("written"), sha256: z.string() }),
      z.object({ outcome: z.literal("conflict") }),
    ]),
  },
});

export type FileSource = z.infer<typeof sourceSchema>;

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  /**
   * Find the directory a rooted source is relative to. A workspace file
   * hangs off its environment's checkout; a thread-storage file off the
   * thread's storage directory. Both lookups also settle which host the file
   * is on, which is why they happen here and not in the pure layer.
   */
  async function resolveRoot(source: FileSource): Promise<ResolvedRoot | null> {
    if (source.kind === "workspace") {
      if (source.environmentId === null) return null;
      const environment = await bb.sdk.environments.get({
        environmentId: source.environmentId,
      });
      return { hostId: environment.hostId, rootPath: environment.path };
    }
    if (source.kind === "thread-storage") {
      if (source.threadId === null) return null;
      const location = await bb.sdk.threads.storageLocation({
        threadId: source.threadId,
      });
      return { hostId: location.hostId, rootPath: location.storageRootPath };
    }
    return null;
  }

  async function resolveTarget(
    path: string,
    source: FileSource,
  ): Promise<FileTarget> {
    const kind = source.kind as FileSourceKind;
    // Before the root lookup, not after: a refused path should cost nothing
    // and should say why it was refused.
    assertPathShape(kind, path);
    return buildFileTarget({
      kind,
      path,
      hostId: source.hostId ?? null,
      root: await resolveRoot(source),
    });
  }

  /**
   * Turn anything thrown down here into a sentence worth putting in a
   * banner. A `TargetError` already says something useful; anything else is
   * a host or network failure whose message is better than a generic one but
   * whose stack is not the user's problem.
   */
  function describe(cause: unknown): string {
    if (cause instanceof TargetError) return cause.message;
    if (cause instanceof Error) return cause.message;
    return String(cause);
  }

  bb.rpc.register(rpcContract, {
    file_read: async ({ path, source }) => {
      try {
        const target = await resolveTarget(path, source);
        const file = await bb.sdk.files.read(target);
        // A markdown opener that silently base64-decodes whatever it is
        // handed will one day mangle a binary someone renamed to .md.
        if (file.contentEncoding !== "utf8") {
          throw new Error("This file is not UTF-8 text, so it cannot be edited here.");
        }
        if (file.sizeBytes > MAX_BYTES) {
          throw new Error(
            `This file is ${Math.round(file.sizeBytes / 1000)} KB, past the ${Math.round(MAX_BYTES / 1000)} KB editing limit.`,
          );
        }
        return { content: file.content, sha256: file.sha256 };
      } catch (cause) {
        bb.log.warn(`file_read failed: ${describe(cause)}`);
        throw new Error(describe(cause));
      }
    },

    file_write: async ({ path, source, content, expectedSha256 }) => {
      try {
        const target = await resolveTarget(path, source);
        const result = await bb.sdk.files.write({
          ...target,
          content,
          contentEncoding: "utf8",
          // Editing is not creating. A missing parent directory means the
          // path is wrong, and quietly building it hides that.
          createParents: false,
          // Omitting the field entirely is what makes a write
          // unconditional; passing null would assert "no file here yet".
          ...(expectedSha256 === null ? {} : { expectedSha256 }),
        });
        if (result.outcome === "conflict") return { outcome: "conflict" as const };
        return { outcome: "written" as const, sha256: result.sha256 };
      } catch (cause) {
        bb.log.warn(`file_write failed: ${describe(cause)}`);
        throw new Error(describe(cause));
      }
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
