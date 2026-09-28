// The RPC contract between Plugin Shelf's server and its page. Both schemas
// run at the wire boundary; the page imports this file as a type only.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const commitSchema = z.object({
  sha: z.string(),
  subject: z.string(),
  date: z.string(),
  files: z.array(z.string()),
  docsOnly: z.boolean(),
});

const flagSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("version-mismatch"), packageVersion: z.string(), tagVersion: z.string() }),
  z.object({ kind: z.literal("tag-outside-range"), tag: z.string(), range: z.string() }),
  z.object({ kind: z.literal("no-release-in-range"), range: z.string() }),
  z.object({ kind: z.literal("id-taken"), url: z.string() }),
]);

const rowSchema = z.object({
  id: z.string(),
  dir: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  installed: z.boolean(),
  group: z.enum(["needs-release", "current", "personal", "unknown"]),
  entryId: z.string().nullable(),
  latestTag: z.string().nullable(),
  latestVersion: z.string().nullable(),
  commits: z.array(commitSchema),
  docsChangesOnly: z.boolean(),
  flags: z.array(flagSchema),
});

export const shelfListSchema = z.object({
  checkout: z.object({ root: z.string(), repo: z.string() }).nullable(),
  emptyReason: z.string().nullable(),
  rows: z.array(rowSchema),
  fetchedAt: z.number().nullable(),
  fetchError: z.string().nullable(),
  marketplaceError: z.string().nullable(),
});

export const rpcContract = defineRpcContract({
  shelf_list: {
    input: z.object({ refresh: z.boolean().optional() }).strict(),
    output: shelfListSchema,
  },
  shelf_publish: {
    input: z.object({ pluginId: z.string().min(1) }).strict(),
    output: z.object({ threadId: z.string() }),
  },
  shelf_settings: {
    input: z.object({}).strict(),
    output: z.object({ providerId: z.string() }),
  },
});
