// The RPC contract between server.ts and app.tsx.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Published while a sync stores pages and when it finishes; the open dashboard re-reads. */
export const DASHBOARD_CHANNEL = "dashboard-changed";

/** The span a page is reading: inclusive start, exclusive end, epoch ms. */
export const rangeSchema = z.object({ from: z.number(), to: z.number() });

export const bucketSchema = z.object({ start: z.number(), end: z.number(), label: z.string() });

export const personActivitySchema = z.object({
  login: z.string(),
  requested: z.array(z.number()),
  given: z.array(z.number()),
  requestedTotal: z.number(),
  givenTotal: z.number(),
});

export const authorActivitySchema = z.object({
  login: z.string(),
  opened: z.array(z.number()),
  merged: z.array(z.number()),
  openedTotal: z.number(),
  mergedTotal: z.number(),
});

/** Who a row is assigned to now, and the thread this plugin started for it. */
export const rowOwnershipSchema = {
  assignees: z.array(z.string()),
  threadId: z.string().nullable(),
};

export const awaitingReviewSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string().nullable(),
  ...rowOwnershipSchema,
  requestedAt: z.string(),
  waitingDays: z.number(),
});

export const authoredPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  /** No assignee here: the list is the person's own pull requests. */
  threadId: z.string().nullable(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  createdAt: z.string(),
  firstReviewDays: z.number().nullable(),
  followUps: z.number(),
  mergeDays: z.number().nullable(),
  waitingDays: z.number().nullable(),
});

export const stageKeySchema = z.enum(["triage", "ownership", "implement", "prepare", "review", "decision"]);

/** Every stage key, in flow order; `app.tsx` matches sub-paths against these. */
export const STAGE_KEYS = stageKeySchema.options;

export const stageSummarySchema = z.object({
  key: stageKeySchema,
  label: z.string(),
  measures: z.string(),
  source: z.enum(["issue", "pullRequest"]),
  left: z.number(),
  waiting: z.number(),
  median: z.number(),
  p75: z.number(),
  p90: z.number(),
  weekly: z.array(z.number()),
});

export const stageSpanSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string().nullable(),
  ...rowOwnershipSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  days: z.number(),
});

/** Where everything opened in the period has got to, by path. See review/flow.ts. */
export const flowCountsSchema = z.object({
  issues: z.object({
    opened: z.number(),
    planned: z.number(),
    assignedFromPlan: z.number(),
    assignedWithoutPlan: z.number(),
    closedAssigned: z.number(),
    closedPlanned: z.number(),
    closedUntriaged: z.number(),
  }),
  pullRequests: z.object({
    opened: z.number(),
    drafted: z.number(),
    asked: z.number(),
    reviewedUnasked: z.number(),
    changesRequested: z.number(),
    approved: z.number(),
    merged: z.number(),
    mergedUnreviewed: z.number(),
    closed: z.number(),
  }),
});

const releaseSummaryShape = {
  tag: z.string(),
  url: z.string(),
  publishedAt: z.string(),
  total: z.number(),
  kinds: z.object({
    feat: z.number(),
    fix: z.number(),
    refactor: z.number(),
    chore: z.number(),
    deps: z.number(),
    none: z.number(),
  }),
  people: z.array(z.object({ login: z.string(), merged: z.number(), reviews: z.number() })),
  bot: z.number(),
  missing: z.number(),
};

/** The releases published in the period. See review/releases.ts. */
export const releasesSchema = z.object({
  published: z.number(),
  patches: z.number(),
  minors: z.array(
    z.object({
      ...releaseSummaryShape,
      patches: z.array(z.object({ ...releaseSummaryShape, firstLine: z.string().nullable() })),
    }),
  ),
});

export const syncStatusSchema = z.object({
  /** When the last sync finished, epoch ms; null before the first one has. */
  syncedAt: z.number().nullable(),
  running: z.boolean(),
  /** False until the first sync has reached two years back. */
  backfillDone: z.boolean(),
  /** Pull requests stored for the repository so far. */
  pullRequests: z.number(),
  /** Issues stored for the repository so far. */
  issues: z.number(),
  /** Why the last sync failed, if it did. */
  error: z.string().nullable(),
});

export const rpcContract = defineRpcContract({
  people_activity: {
    input: z.object({ range: rangeSchema }),
    output: z.object({
      /** The configured repository, or null when it has not been set. */
      repository: z.string().nullable(),
      buckets: z.array(bucketSchema),
      stages: z.array(stageSummarySchema),
      flow: flowCountsSchema,
      releases: releasesSchema,
      authors: z.array(authorActivitySchema),
      people: z.array(personActivitySchema),
      sync: syncStatusSchema,
    }),
  },
  person_activity: {
    // A login is GitHub's own, so it is bounded and has no path separators.
    input: z.object({
      login: z.string().min(1).max(100),
      range: rangeSchema,
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
  stage_detail: {
    input: z.object({
      stage: stageKeySchema,
      range: rangeSchema,
      /** Which page of what is waiting; clamped into range by the server. */
      waitingPage: z.number().int().min(0).max(10_000).default(0),
    }),
    output: z.object({
      repository: z.string().nullable(),
      buckets: z.array(bucketSchema),
      stage: stageSummarySchema.extend({
        spread: z.array(z.object({ label: z.string(), count: z.number() })),
        queue: z.array(z.object({ label: z.string(), count: z.number(), late: z.boolean() })),
        series: z.array(
          z.object({ label: z.string(), count: z.number(), median: z.number(), p90: z.number() }),
        ),
        /** One page of what is in the stage now, longest wait first. */
        waitingNow: z.array(stageSpanSchema),
      }),
      waitingPaging: z.object({
        page: z.number(),
        pages: z.number(),
        from: z.number(),
        to: z.number(),
        total: z.number(),
      }),
      sync: syncStatusSchema,
    }),
  },
  /**
   * Starts a thread for one issue or pull request and remembers it, so the
   * row offers to open that thread rather than start a second one. The
   * composer builds the request; this forwards it and adds the title.
   */
  start_thread: {
    input: z.object({
      kind: z.enum(["issue", "pull"]),
      number: z.number(),
      title: z.string(),
      request: z.record(z.string(), z.unknown()),
    }),
    output: z.object({ threadId: z.string() }),
  },
  sync_status: {
    input: z.null(),
    output: syncStatusSchema,
  },
  sync_now: {
    input: z.null(),
    output: syncStatusSchema,
  },
});

export type SyncStatus = z.infer<typeof syncStatusSchema>;
export type PeopleActivityResult = z.infer<(typeof rpcContract)["people_activity"]["output"]>;
export type Releases = z.infer<typeof releasesSchema>;
export type MinorRelease = Releases["minors"][number];
export type FlowCounts = z.infer<typeof flowCountsSchema>;
export type StageSummary = z.infer<typeof stageSummarySchema>;
export type StageSpan = z.infer<typeof stageSpanSchema>;
export type StageKey = z.infer<typeof stageKeySchema>;
export type StageDetailResult = z.infer<(typeof rpcContract)["stage_detail"]["output"]>;
export type PersonActivityResult = z.infer<(typeof rpcContract)["person_activity"]["output"]>;
