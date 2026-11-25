import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const standingSchema = z.enum(["nobody", "assigned", "draft", "review", "approved"]);

export const milestoneSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  due: z.number().nullable(),
  open: z.number(),
  closed: z.number(),
  nobody: z.number(),
  added: z.array(z.number()),
  closedIn: z.array(z.number()),
  openAdded: z.number(),
});

const usageSchema = z
  .object({
    syncs: z.array(z.object({ at: z.number(), points: z.number().nullable(), calls: z.number(), ms: z.number() })),
    budget: z.object({ used: z.number(), limit: z.number(), resetAt: z.number() }).nullable(),
  })
  .optional();

export const listingSchema = z.object({
  /** What the period is called in a sentence, such as "six weeks". */
  periodLabel: z.string(),
  syncedAt: z.number().nullable(),
  usage: usageSchema,
  lastError: z.string().nullable(),
  /** Every repository the sync covers, in name order, with its open milestones, due soonest first. */
  repositories: z.array(
    z.object({
      repo: z.string(),
      error: z.string().nullable(),
      milestones: z.array(milestoneSummarySchema),
    }),
  ),
});

export const milestonePageSchema = z.object({
  periodLabel: z.string(),
  /** Epoch ms the period starts. */
  periodStart: z.number(),
  repo: z.string(),
  /** Null when the repository has no open milestone with this number. */
  milestone: milestoneSummarySchema.nullable(),
  open: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      url: z.string(),
      assignees: z.array(z.string()),
      standing: standingSchema,
      addedAt: z.number(),
      /** The thread started from this row, until it is archived. */
      threadId: z.string().nullable(),
    }),
  ),
  closed: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      url: z.string(),
      assignees: z.array(z.string()),
      closedAt: z.number(),
      notDone: z.boolean(),
      threadId: z.string().nullable(),
    }),
  ),
  history: z.object({ at: z.array(z.number()), total: z.array(z.number()), closed: z.array(z.number()) }),
  lastError: z.string().nullable(),
});

export const rpcContract = defineRpcContract({
  /** Every repository's open milestones, from the last sync. */
  list: {
    input: z.null(),
    output: listingSchema,
  },
  /** One milestone's page. */
  milestone: {
    input: z.object({ repo: z.string(), number: z.number() }),
    output: milestonePageSchema,
  },
  /** The bb project checked out from the repository, where a row's thread starts. */
  repository_project: {
    input: z.object({ repo: z.string() }),
    output: z.object({ projectId: z.string().nullable() }),
  },
  /** Starts the thread bb's composer under an issue's row asked for, and remembers it for the row. */
  start_thread: {
    input: z.object({ repo: z.string(), number: z.number(), title: z.string(), request: z.record(z.string(), z.unknown()) }),
    output: z.object({ threadId: z.string() }),
  },
  /** Syncs now, and answers once it is done. */
  refresh: {
    input: z.null(),
    output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
  },
});

export type Listing = z.infer<typeof listingSchema>;
export type MilestonePageData = z.infer<typeof milestonePageSchema>;
