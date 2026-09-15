/**
 * The zod schemas the panel and server agree on.
 *
 * A field missing from the row schema is silently dropped on the way to the
 * panel, so this file changes whenever a row grows a field.
 */

import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';

export const suggestedActionSchema = z.enum(['close', 'comment', 'keep', 'needsInfo']);

export const verdictSchema = z.enum(['pending', 'approved', 'rejected']);

export const closeReasonSchema = z.enum(['completed', 'not planned', 'duplicate']);

export const suggestionSchema = z.object({
  action: suggestedActionSchema,
  closeReason: closeReasonSchema,
  duplicateOf: z.number().nullable(),
  body: z.string(),
  rationale: z.string(),
  suggestedAt: z.string(),
  threadId: z.string().nullable(),
});

export const dispositionSchema = z.object({
  verdict: verdictSchema,
  rejectionReason: z.string(),
  approvedBody: z.string(),
  decidedAt: z.string().nullable(),
  appliedAt: z.string().nullable(),
  applyError: z.string().nullable(),
});

export const stalenessSchema = z.object({
  ageDays: z.number(),
  idleDays: z.number(),
  emptyBody: z.boolean(),
  commentCount: z.number(),
  hasType: z.boolean(),
  hasLabels: z.boolean(),
  hasMilestone: z.boolean(),
  assigned: z.boolean(),
  score: z.number(),
});

export const rowSchema = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  milestone: z.string().nullable(),
  labels: z.array(z.string()),
  staleness: stalenessSchema,
  suggestion: suggestionSchema.nullable(),
  disposition: dispositionSchema,
});

export const listRowsInput = z.object({ repo: z.string() });

export const listRowsOutput = z.object({
  repo: z.string(),
  rows: z.array(rowSchema),
  sweptAt: z.number().nullable(),
  total: z.number(),
  truncated: z.boolean(),
  lastError: z.string().nullable(),
  counts: z.object({
    pending: z.number(),
    researched: z.number(),
    approved: z.number(),
    rejected: z.number(),
  }),
  /** The configured batch size, so the button says what it will actually do. */
  batchSize: z.number(),
});

export const reposOutput = z.object({
  /** Repos already swept, so the picker can offer them first. */
  swept: z.array(z.string()),
  candidates: z.array(z.string()),
  error: z.string().nullable(),
});

export const syncInput = z.object({ repo: z.string() });

export const researchInput = z.object({
  repo: z.string(),
  count: z.number().int().min(1).max(50),
});

/** The environment shapes this plugin's own seeds produce, and no others. */
const environmentSchema = z.union([
  z.object({ type: z.literal('project-default') }),
  z.object({
    type: z.literal('host'),
    hostId: z.string().optional(),
    workspace: z.object({
      type: z.literal('managed-worktree'),
      baseBranch: z.object({ kind: z.literal('default') }),
    }),
  }),
]);

/**
 * What BB's composer is seeded with for a research batch. Settings decide the
 * provider and model; the composer only lets one batch differ from them.
 */
export const researchSeedOutput = z.object({
  seed: z
    .object({
      projectId: z.string(),
      providerId: z.string().nullable(),
      model: z.string().nullable(),
      permissionMode: z.enum(['accept-edits', 'auto', 'full']),
      prompt: z.string(),
      environment: environmentSchema,
    })
    .nullable(),
  numbers: z.array(z.number()),
  /** Why no seed could be built, for a button that would otherwise do nothing. */
  reason: z.string().nullable(),
});

/**
 * The composer guarantees a complete, serializable NewThreadRequest, so this
 * validates only what the plugin reads and forwards the rest verbatim.
 */
const newThreadRequestSchema = z.looseObject({
  projectId: z.string().min(1),
  input: z.array(z.looseObject({ type: z.string() })).min(1),
});

export const startResearchInput = z.object({
  request: newThreadRequestSchema,
  repo: z.string(),
  numbers: z.array(z.number()),
});

export const startResearchOutput = z.object({
  threadId: z.string().nullable(),
  reason: z.string().nullable(),
});

/**
 * Approving carries the body as it stands in the textarea, not as the agent
 * wrote it, so an edit made just before the click is what gets posted.
 */
export const approveInput = z.object({
  repo: z.string(),
  number: z.number(),
  body: z.string(),
});

export const rejectInput = z.object({
  repo: z.string(),
  number: z.number(),
  reason: z.string(),
});

export const mutateOutput = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});

export const selectionOutput = z.object({ repo: z.string().nullable() });
export const selectInput = z.object({ repo: z.string().nullable() });

export const rpcContract = defineRpcContract({
  // z.null(), not z.void(): the frontend sends `null` for a no-input call, and
  // z.void() rejects it as invalid input on every load.
  listRepos: { input: z.null(), output: reposOutput },
  selectedRepo: { input: z.null(), output: selectionOutput },
  selectRepo: { input: selectInput, output: selectionOutput },
  listRows: { input: listRowsInput, output: listRowsOutput },
  sync: { input: syncInput, output: mutateOutput },
  researchSeed: { input: researchInput, output: researchSeedOutput },
  startResearch: { input: startResearchInput, output: startResearchOutput },
  approve: { input: approveInput, output: mutateOutput },
  reject: { input: rejectInput, output: mutateOutput },
});
