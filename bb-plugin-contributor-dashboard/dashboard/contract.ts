// The RPC contract between server.ts and app.tsx.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Published while a sync stores pages and when it finishes; the open dashboard re-reads. */
export const DASHBOARD_CHANNEL = "dashboard-changed";

/** The most rows one Batch starts subthreads for. */
export const BATCH_LIMIT = 50;

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
  mergedAt: z.string().nullable(),
  /** Lines added and removed; null when the mirror has not stored them. */
  size: z.number().nullable(),
  firstReviewDays: z.number().nullable(),
  followUps: z.number(),
  mergeDays: z.number().nullable(),
  waitingDays: z.number().nullable(),
});

export const openItemSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string().nullable(),
  ...rowOwnershipSchema,
  isDraft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Lines added and removed, for a pull request; null for an issue. */
  size: z.number().nullable(),
});

/** How the open lists' toolbar narrows and orders them. See review/open-items.ts. */
export const openQuerySchema = z.object({
  sort: z.enum(["opened", "activity", "size", "author"]).default("opened"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  author: z.string().max(100).nullable().default(null),
  /** Null for anyone, "" for nobody, or a login. */
  assignee: z.string().max(100).nullable().default(null),
  state: z.enum(["draft", "ready"]).nullable().default(null),
  quiet: z.boolean().default(false),
});

const loginCountsSchema = z.array(z.object({ login: z.string(), count: z.number() }));

/** How the toolbar over a person's pull requests narrows and orders them. See review/list-query.ts. */
export const authoredQuerySchema = z.object({
  sort: z.enum(["opened", "merged", "firstReview", "mergeTime", "size"]).default("opened"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  state: z.enum(["open", "draft", "merged", "closed"]).nullable().default(null),
});

/** How many of a person's pull requests are in each state, before the state filter. */
export const authoredFacetsSchema = z.object({ open: z.number(), draft: z.number(), merged: z.number(), closed: z.number() });

/** How the toolbar over a stage's queue narrows and orders it. See review/list-query.ts. */
export const waitingQuerySchema = z.object({
  sort: z.enum(["wait", "author"]).default("wait"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  author: z.string().max(100).nullable().default(null),
  /** Null for anyone, "" for nobody, or a login. */
  assignee: z.string().max(100).nullable().default(null),
});

/** What each of a person menu's choices would leave, under the other filter. */
export const peopleFacetsSchema = z.object({ authors: loginCountsSchema, assignees: loginCountsSchema, nobody: z.number() });

/** What each of the toolbar's choices would leave, under the other filters. */
export const openFacetsSchema = z.object({
  authors: loginCountsSchema,
  assignees: loginCountsSchema,
  nobody: z.number(),
  drafts: z.number(),
  ready: z.number(),
  quiet: z.number(),
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
export const minorReleaseSchema = z.object({
  ...releaseSummaryShape,
  patches: z.array(z.object({ ...releaseSummaryShape, firstLine: z.string().nullable() })),
});

export const releasesSchema = z.object({
  published: z.number(),
  patches: z.number(),
  minors: z.array(minorReleaseSchema),
  /** Minors published before the period, which See more reads in batches. */
  older: z.number(),
});

/** What arrived and finished in each bucket, and where each bucket's arrivals finished. See review/flows.ts. */
export const bucketFlowsSchema = z.object({
  started: z.array(z.number()),
  finished: z.array(z.number()),
  flows: z.array(z.array(z.number())),
  fromEarlier: z.array(z.number()),
  open: z.array(z.number()),
  asked: z.array(z.number()).nullable(),
  median: z.number(),
  p90: z.number(),
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
  /** The past hour of syncs and what each cost on GitHub's GraphQL budget. */
  usage: z
    .object({
      syncs: z.array(z.object({ at: z.number(), points: z.number().nullable(), calls: z.number(), ms: z.number() })),
      budget: z.object({ used: z.number(), limit: z.number(), resetAt: z.number() }).nullable(),
    })
    .optional(),
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
      /** Opened to merged, and requested to reviewed, for the charts that open the velocity sections. */
      velocity: z.object({ merge: bucketFlowsSchema, review: bucketFlowsSchema }),
      authors: z.array(authorActivitySchema),
      people: z.array(personActivitySchema),
      /** Everyone the person finder offers, most recently active first. */
      everyone: z.array(z.string()),
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
      authoredQuery: authoredQuerySchema.default(authoredQuerySchema.parse({})),
    }),
    output: z.object({
      repository: z.string().nullable(),
      login: z.string(),
      buckets: z.array(bucketSchema),
      /** Their pull requests opened and merged, and where each bucket's went. */
      authorFlows: bucketFlowsSchema,
      /** Null when the person has no review activity in the period. */
      activity: personActivitySchema.nullable(),
      awaiting: z.array(awaitingReviewSchema),
      /** One page of their pull requests, as the toolbar narrows and orders them. */
      authored: z.array(authoredPullRequestSchema),
      /** All of their pull requests in the period, before the state filter. */
      authoredTotal: z.number(),
      authoredFacets: authoredFacetsSchema,
      /** The page that came back, and how the whole list divides into pages. */
      authoredPaging: z.object({
        page: z.number(),
        pages: z.number(),
        from: z.number(),
        to: z.number(),
        total: z.number(),
      }),
      /** Everyone the person finder offers, most recently active first. */
      everyone: z.array(z.string()),
      sync: syncStatusSchema,
    }),
  },
  stage_detail: {
    input: z.object({
      stage: stageKeySchema,
      range: rangeSchema,
      /** Which page of what is waiting; clamped into range by the server. */
      waitingPage: z.number().int().min(0).max(10_000).default(0),
      waitingQuery: waitingQuerySchema.default(waitingQuerySchema.parse({})),
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
        /** One page of what is in the stage now, as the toolbar narrows and orders it. */
        waitingNow: z.array(stageSpanSchema),
      }),
      waitingFacets: peopleFacetsSchema,
      waitingPaging: z.object({
        page: z.number(),
        pages: z.number(),
        from: z.number(),
        to: z.number(),
        total: z.number(),
      }),
      /** Everyone the person finder offers, most recently active first. */
      everyone: z.array(z.string()),
      sync: syncStatusSchema,
    }),
  },
  /** The next batch of minors published before `before`, epoch ms, for See more. */
  older_releases: {
    input: z.object({ before: z.number(), count: z.number().int().min(1).max(50).default(10) }),
    output: z.object({ minors: z.array(minorReleaseSchema), more: z.boolean() }),
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
  /**
   * One page of every open issue or pull request, oldest first, whatever the
   * period: what the Issues and Pull requests headings open.
   */
  open_items: {
    input: z.object({
      kind: z.enum(["issue", "pull"]),
      page: z.number().int().min(0).max(10_000).default(0),
      query: openQuerySchema.default(openQuerySchema.parse({})),
    }),
    output: z.object({
      repository: z.string().nullable(),
      kind: z.enum(["issue", "pull"]),
      rows: z.array(openItemSchema),
      /** Everything open of the kind, before the query narrows it. */
      totalOpen: z.number(),
      facets: openFacetsSchema,
      paging: z.object({
        page: z.number(),
        pages: z.number(),
        from: z.number(),
        to: z.number(),
        total: z.number(),
      }),
      /** Everyone the person finder offers, most recently active first. */
      everyone: z.array(z.string()),
      sync: syncStatusSchema,
    }),
  },
  /**
   * Every row the query matches, on every page, for Batch to tick from. Read
   * when Batch opens, not with each page.
   */
  open_items_matching: {
    input: z.object({ kind: z.enum(["issue", "pull"]), query: openQuerySchema }),
    output: z.object({ rows: z.array(openItemSchema) }),
  },
  /** Every one of a person's pull requests the query matches, on every page, for Batch. */
  authored_matching: {
    input: z.object({ login: z.string().min(1).max(100), range: rangeSchema, query: authoredQuerySchema }),
    output: z.object({ rows: z.array(authoredPullRequestSchema) }),
  },
  /** Everything waiting in a stage that the query matches, on every page, for Batch. */
  stage_waiting_matching: {
    input: z.object({ stage: stageKeySchema, query: waitingQuerySchema }),
    output: z.object({ rows: z.array(stageSpanSchema) }),
  },
  /**
   * Starts one main thread from the composer's request, then a subthread
   * under it for each row, with the same provider, model, and environment,
   * and remembers each subthread on its row as start_thread does.
   */
  start_batch: {
    input: z.object({
      kind: z.enum(["issue", "pull"]),
      title: z.string().max(300),
      rows: z.array(z.object({ number: z.number(), title: z.string(), url: z.string() })).min(1).max(BATCH_LIMIT),
      request: z.record(z.string(), z.unknown()),
    }),
    output: z.object({
      threadId: z.string(),
      subthreads: z.array(z.object({ number: z.number(), threadId: z.string() })),
      failed: z.array(z.object({ number: z.number(), error: z.string() })),
    }),
  },
  /**
   * The bb project checked out from the repository, which the composer opens
   * in, or null when no project's remote matches it.
   */
  repository_project: {
    input: z.null(),
    output: z.object({ projectId: z.string().nullable() }),
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
export type BucketFlows = z.infer<typeof bucketFlowsSchema>;
export type Releases = z.infer<typeof releasesSchema>;
export type MinorRelease = z.infer<typeof minorReleaseSchema>;
export type OlderReleases = z.infer<(typeof rpcContract)["older_releases"]["output"]>;
export type FlowCounts = z.infer<typeof flowCountsSchema>;
export type StageSummary = z.infer<typeof stageSummarySchema>;
export type StageSpan = z.infer<typeof stageSpanSchema>;
export type StageKey = z.infer<typeof stageKeySchema>;
export type StageDetailResult = z.infer<(typeof rpcContract)["stage_detail"]["output"]>;
export type PersonActivityResult = z.infer<(typeof rpcContract)["person_activity"]["output"]>;

export type OpenItemsResult = z.infer<(typeof rpcContract)["open_items"]["output"]>;
export type OpenItem = z.infer<typeof openItemSchema>;
export type OpenQuery = z.infer<typeof openQuerySchema>;
export type OpenFacets = z.infer<typeof openFacetsSchema>;
export type AuthoredQuery = z.infer<typeof authoredQuerySchema>;
export type AuthoredFacets = z.infer<typeof authoredFacetsSchema>;
export type AuthoredPullRequest = z.infer<typeof authoredPullRequestSchema>;
export type WaitingQuery = z.infer<typeof waitingQuerySchema>;
export type PeopleFacets = z.infer<typeof peopleFacetsSchema>;
export type StartBatchResult = z.infer<(typeof rpcContract)["start_batch"]["output"]>;
