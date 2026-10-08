// The RPC contract between server.ts and app.tsx.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Published while a sync stores pages and when it finishes; the open dashboard re-reads. */
export const DASHBOARD_CHANNEL = "dashboard-changed";

export const periodSchema = z.enum(["6w", "12w", "6m", "1y"]);

export const bucketSchema = z.object({ start: z.number(), end: z.number(), label: z.string() });

export const personActivitySchema = z.object({
  login: z.string(),
  requested: z.array(z.number()),
  given: z.array(z.number()),
  requestedTotal: z.number(),
  givenTotal: z.number(),
});

export const awaitingReviewSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string().nullable(),
  requestedAt: z.string(),
  waitingDays: z.number(),
});

export const authoredPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  createdAt: z.string(),
  firstReviewDays: z.number().nullable(),
  followUps: z.number(),
  mergeDays: z.number().nullable(),
  waitingDays: z.number().nullable(),
});

export const syncStatusSchema = z.object({
  /** When the last sync finished, epoch ms; null before the first one has. */
  syncedAt: z.number().nullable(),
  running: z.boolean(),
  /** False until the first sync has reached two years back. */
  backfillDone: z.boolean(),
  /** Pull requests stored for the repository so far. */
  pullRequests: z.number(),
  /** Why the last sync failed, if it did. */
  error: z.string().nullable(),
});

export const rpcContract = defineRpcContract({
  people_activity: {
    input: z.object({ period: periodSchema }),
    output: z.object({
      /** The configured repository, or null when it has not been set. */
      repository: z.string().nullable(),
      buckets: z.array(bucketSchema),
      people: z.array(personActivitySchema),
      sync: syncStatusSchema,
    }),
  },
  person_activity: {
    // A login is GitHub's own, so it is bounded and has no path separators.
    input: z.object({
      login: z.string().min(1).max(100),
      period: periodSchema,
      /** Which page of their pull requests; clamped into range by the server. */
      authoredPage: z.number().int().min(0).max(10_000).default(0),
    }),
    output: z.object({
      repository: z.string().nullable(),
      login: z.string(),
      buckets: z.array(bucketSchema),
      /** Null when the person has no review activity in the period. */
      activity: personActivitySchema.nullable(),
      awaiting: z.array(awaitingReviewSchema),
      /** One page of their pull requests. */
      authored: z.array(authoredPullRequestSchema),
      /** The page that came back, and how the whole list divides into pages. */
      authoredPaging: z.object({
        page: z.number(),
        pages: z.number(),
        from: z.number(),
        to: z.number(),
        total: z.number(),
      }),
      sync: syncStatusSchema,
    }),
  },
  sync_now: {
    input: z.null(),
    output: syncStatusSchema,
  },
});

export type SyncStatus = z.infer<typeof syncStatusSchema>;
export type PeopleActivityResult = z.infer<(typeof rpcContract)["people_activity"]["output"]>;
export type PersonActivityResult = z.infer<(typeof rpcContract)["person_activity"]["output"]>;
