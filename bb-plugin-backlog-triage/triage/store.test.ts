import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { toRow } from './classify.js';
import { MIGRATIONS, createStore, type TriageStore } from './store.js';
import type { Disposition, RawIssue, Suggestion } from './types.js';

const NOW = new Date('2026-09-15T00:00:00Z');
const REPO = 'acme/widgets';

function issue(number: number, over: Partial<RawIssue> = {}): RawIssue {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    body: 'A body',
    createdAt: '2024-09-15T00:00:00Z',
    updatedAt: '2024-09-15T00:00:00Z',
    author: { login: 'octocat' },
    assignees: [],
    labels: [],
    milestone: null,
    comments: [],
    issueType: null,
    ...over,
  };
}

const SUGGESTION: Suggestion = {
  action: 'close',
  body: 'Closing as obsolete.',
  rationale: 'The tool it names was replaced.',
  suggestedAt: NOW.toISOString(),
  threadId: 'thr_abc',
};

function store(): TriageStore {
  const db = new Database(':memory:');
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db);
}

describe('createStore', () => {
  let s: TriageStore;
  beforeEach(() => {
    s = store();
  });

  it('returns nothing for a repo that has never been swept', () => {
    expect(s.listRows(REPO)).toEqual([]);
    expect(s.getMeta(REPO)).toBeNull();
    expect(s.listRepos()).toEqual([]);
  });

  it('round-trips rows through a sweep', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW), toRow(issue(2), REPO, NOW)]);
    expect(s.listRows(REPO).map((r) => r.number).sort()).toEqual([1, 2]);
  });

  it('defaults an unruled row to pending with no suggestion', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    const row = s.getRow(REPO, 1);
    expect(row?.suggestion).toBeNull();
    expect(row?.disposition.verdict).toBe('pending');
  });

  // The whole point of the two-table split. A pass takes days; a sweep runs
  // every few minutes in between.
  it('keeps suggestions and dispositions across a re-sweep', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    s.putSuggestion(REPO, 1, SUGGESTION);
    const approved: Disposition = {
      verdict: 'approved',
      rejectionReason: '',
      approvedBody: 'Edited before approving.',
      decidedAt: NOW.toISOString(),
      appliedAt: null,
      applyError: null,
    };
    s.putDisposition(REPO, 1, approved);

    s.replaceIssues(REPO, [toRow(issue(1, { title: 'Retitled upstream' }), REPO, NOW)]);

    const row = s.getRow(REPO, 1);
    expect(row?.title).toBe('Retitled upstream');
    expect(row?.suggestion).toEqual(SUGGESTION);
    expect(row?.disposition).toEqual(approved);
  });

  it('keeps a disposition even for an issue that leaves the sweep', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    s.putSuggestion(REPO, 1, SUGGESTION);
    s.replaceIssues(REPO, []);
    expect(s.listRows(REPO)).toEqual([]);
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    expect(s.getRow(REPO, 1)?.suggestion).toEqual(SUGGESTION);
  });

  it('writes a suggestion before any disposition exists', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    s.putSuggestion(REPO, 1, SUGGESTION);
    expect(s.getRow(REPO, 1)?.disposition.verdict).toBe('pending');
  });

  it('replaces a suggestion when a batch is re-run', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    s.putSuggestion(REPO, 1, SUGGESTION);
    s.putSuggestion(REPO, 1, { ...SUGGESTION, action: 'keep', rationale: 'Second look.' });
    expect(s.getRow(REPO, 1)?.suggestion?.action).toBe('keep');
  });

  it('scopes rows to their repo', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    s.replaceIssues('acme/gadgets', [toRow(issue(1), 'acme/gadgets', NOW)]);
    s.putSuggestion(REPO, 1, SUGGESTION);
    expect(s.getRow('acme/gadgets', 1)?.suggestion).toBeNull();
    expect(s.listRows('acme/gadgets')).toHaveLength(1);
  });

  it('does not let one repo sweep clear another', () => {
    s.replaceIssues(REPO, [toRow(issue(1), REPO, NOW)]);
    s.replaceIssues('acme/gadgets', []);
    expect(s.listRows(REPO)).toHaveLength(1);
  });

  it('ranks listRows stalest first', () => {
    const fresh = toRow(issue(1, { updatedAt: '2026-09-14T00:00:00Z' }), REPO, NOW);
    const stale = toRow(issue(2, { updatedAt: '2023-01-01T00:00:00Z' }), REPO, NOW);
    s.replaceIssues(REPO, [fresh, stale]);
    expect(s.listRows(REPO).map((r) => r.number)).toEqual([2, 1]);
  });

  it('round-trips meta and lists swept repos', () => {
    s.setMeta({ repo: REPO, sweptAt: 1_700_000, total: 499, truncated: true, lastError: null });
    expect(s.getMeta(REPO)).toEqual({ repo: REPO, sweptAt: 1_700_000, total: 499, truncated: true, lastError: null });
    s.setMeta({ repo: 'acme/gadgets', sweptAt: null, total: 0, truncated: false, lastError: 'gh failed' });
    expect(s.listRepos()).toEqual(['acme/gadgets', REPO]);
  });

  it('starts with no repo selected and round-trips a selection', () => {
    expect(s.selectedRepo()).toBeNull();
    s.selectRepo(REPO);
    expect(s.selectedRepo()).toBe(REPO);
    s.selectRepo('acme/gadgets');
    expect(s.selectedRepo()).toBe('acme/gadgets');
    s.selectRepo(null);
    expect(s.selectedRepo()).toBeNull();
  });

  it('round-trips a batch and reports an unknown thread as null', () => {
    s.recordBatch('thr_abc', REPO, [61, 62, 63]);
    expect(s.batchNumbers('thr_abc')).toEqual({ repo: REPO, numbers: [61, 62, 63] });
    expect(s.batchNumbers('thr_missing')).toBeNull();
  });
});
