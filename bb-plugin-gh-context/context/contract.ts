import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const threadInput = z.object({ threadId: z.string() }).strict();

const itemKind = z.enum(["issue", "pull"]);
const itemKey = z.object({ repo: z.string(), kind: itemKind, number: z.number() }).strict();

/** The thread's pull request, from bb's environment lookup or a sweep's link. */
const pullRequestSchema = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["open", "draft", "closed", "merged"]),
  attention: z.enum([
    "blocked",
    "changes_requested",
    "checks_failed",
    "checks_pending",
    "closed",
    "conflicts",
    "draft",
    "merged",
    "none",
    "ready_to_merge",
    "review_requested",
  ]),
  checks: z
    .object({
      state: z.string(),
      totalCount: z.number(),
      passedCount: z.number(),
      failedCount: z.number(),
      pendingCount: z.number(),
    })
    .nullable(),
  /**
   * Whether the banner can merge it: only a mergeable pull request on the
   * thread's own branch, because merging goes through bb's environment API.
   */
  canMerge: z.boolean(),
});

const issueSchema = z.object({
  repo: z.string(),
  number: z.number(),
  url: z.string(),
  /** Null when `gh` could not be asked; the banner shows the number alone. */
  title: z.string().nullable(),
  state: z.enum(["open", "closed"]).nullable(),
  /** Why it is linked: `prompt`, `opening-line`, `via-pr`, or a sweep's source. */
  source: z.string(),
  /** For `via-pr` links, the pull request that names it. */
  viaPullRequest: z.number().nullable(),
  /** Whether it is assigned to the user `gh` is signed in as; false when unknown. */
  assignedToMe: z.boolean(),
});

const changesSchema = z.object({
  label: z.enum(["Committed", "Uncommitted", "Untracked"]),
  files: z.number(),
  insertions: z.number(),
  deletions: z.number(),
});

const runningSchema = z
  .object({
    externalId: z.string(),
    groupId: z.string().nullable(),
    // Declared explicitly: zod strips unknown keys, so an omitted field here
    // silently disappears and the clock cannot tick.
    entryId: z.number(),
    startedAt: z.string().nullable(),
    projectName: z.string(),
    taskName: z.string(),
  })
  .nullable();

export const threadContextSchema = z.object({
  archived: z.boolean(),
  /** Whether bb's own banner should be hidden: the `hideDefaultBanner` setting. */
  hide: z.boolean(),
  pullRequest: pullRequestSchema.nullable(),
  issues: z.array(issueSchema),
  changes: changesSchema.nullable(),
  harvest: z.object({ available: z.boolean(), running: runningSchema }),
});

export type ThreadContext = z.infer<typeof threadContextSchema>;
export type ContextPullRequest = z.infer<typeof pullRequestSchema>;
export type ContextIssue = z.infer<typeof issueSchema>;
export type ContextChanges = z.infer<typeof changesSchema>;
export type RunningReference = z.infer<typeof runningSchema>;
export type MergeMethod = "merge" | "squash" | "rebase";

const linkSchema = z.object({
  repo: z.string(),
  kind: itemKind,
  number: z.number(),
  source: z.string(),
});

export const rpcContract = defineRpcContract({
  threadContext: {
    input: threadInput,
    output: threadContextSchema,
  },
  mergePullRequest: {
    input: z
      .object({ threadId: z.string(), method: z.enum(["merge", "squash", "rebase"]) })
      .strict(),
    output: z.null(),
  },
  markPullRequestReady: { input: threadInput, output: z.null() },
  unarchiveThread: { input: threadInput, output: z.null() },

  /**
   * The links bridge's methods (`bb-plugin-gh-context/links`), for the sweeps.
   * gh-context is the one record of which threads are about which items.
   */
  linkThread: {
    input: z
      .object({
        threadId: z.string(),
        repo: z.string(),
        kind: itemKind,
        number: z.number(),
        source: z.string(),
      })
      .strict(),
    output: z.null(),
  },
  unlinkThread: {
    input: z.object({ threadId: z.string(), source: z.string().optional() }).strict(),
    output: z.null(),
  },
  threadsForItems: {
    input: z.object({ items: z.array(itemKey) }).strict(),
    output: z.array(
      itemKey.extend({
        threads: z.array(z.object({ threadId: z.string(), source: z.string() })),
      }),
    ),
  },
  itemsForThread: {
    input: threadInput,
    output: z.array(linkSchema),
  },

  /**
   * The Harvest surface, proxied.
   *
   * bb plugins cannot render each other's React components, so gh-context
   * draws Harvest's clock and forwards these to the Harvest plugin, which owns
   * every credential and every Harvest request. Reads degrade to an empty
   * answer; the write reports its failure.
   */
  harvestAssignments: {
    input: z.null(),
    output: z.object({
      projects: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          code: z.string().nullable(),
          clientName: z.string().nullable(),
          tasks: z.array(z.object({ id: z.number(), name: z.string() })),
        }),
      ),
    }),
  },
  harvestTrackedHours: {
    input: z.object({ externalId: z.string(), groupId: z.string().nullish() }).strict(),
    output: z.object({ hours: z.number() }),
  },
  harvestLastSelection: {
    input: z.object({ scope: z.string().nullable() }).strict(),
    // `exact` must be declared, or zod silently strips it and the picker
    // cannot tell a surface's own history from the global fallback.
    output: z
      .object({ projectId: z.number(), taskId: z.number(), exact: z.boolean() })
      .nullable(),
  },
  harvestStopTimer: {
    input: z.object({ entryId: z.number() }).strict(),
    output: z.null(),
  },
  harvestStartTimer: {
    input: z
      .object({
        projectId: z.number(),
        taskId: z.number(),
        notes: z.string(),
        externalReference: z
          .object({
            id: z.string(),
            groupId: z.string().nullable(),
            accountId: z.string().nullable(),
            permalink: z.string().nullable(),
          })
          .optional(),
      })
      .strict(),
    output: z.object({
      entry: z
        .object({
          id: z.number(),
          projectName: z.string(),
          taskName: z.string(),
          notes: z.string().nullable(),
          hours: z.number(),
          timerStartedAt: z.string().nullable(),
          externalReference: z
            .object({
              id: z.string(),
              groupId: z.string().nullable(),
              accountId: z.string().nullable(),
              permalink: z.string().nullable(),
            })
            .nullable(),
        })
        .nullable(),
    }),
  },
});
