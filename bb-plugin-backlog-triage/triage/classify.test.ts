import { describe, expect, it } from 'vitest';

import { classifyIssue, daysBetween, pendingRows, rankRows, scoreStaleness, toRow, unresearchedRows } from './classify.js';
import { actionClosesIssue, actionLabel, actionPostsComment, PENDING_DISPOSITION, type RawIssue, type TriageRow } from './types.js';

const NOW = new Date('2026-09-15T00:00:00Z');

function issue(over: Partial<RawIssue> = {}): RawIssue {
  return {
    number: 1,
    title: 'An issue',
    url: 'https://github.com/acme/widgets/issues/1',
    body: 'A body',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    author: { login: 'octocat' },
    assignees: [],
    labels: [{ name: 'bug' }],
    milestone: { title: 'Acme Board' },
    comments: [{}],
    issueType: { name: 'Bug' },
    ...over,
  };
}

describe('daysBetween', () => {
  it('counts whole days elapsed', () => {
    expect(daysBetween('2026-09-01T00:00:00Z', NOW)).toBe(14);
  });

  it('floors a future timestamp at zero rather than going negative', () => {
    expect(daysBetween('2026-10-01T00:00:00Z', NOW)).toBe(0);
  });

  it('treats an unparseable timestamp as zero', () => {
    expect(daysBetween('not a date', NOW)).toBe(0);
  });
});

describe('scoreStaleness', () => {
  const base = {
    ageDays: 0,
    idleDays: 0,
    emptyBody: false,
    commentCount: 1,
    hasType: true,
    hasLabels: true,
    hasMilestone: true,
    assigned: false,
  };

  it('scores a fully specified fresh issue at zero', () => {
    expect(scoreStaleness(base)).toBe(0);
  });

  it('carries idle days through directly', () => {
    expect(scoreStaleness({ ...base, idleDays: 500 })).toBe(500);
  });

  it('adds for each missing signal', () => {
    expect(scoreStaleness({ ...base, emptyBody: true })).toBe(120);
    expect(scoreStaleness({ ...base, commentCount: 0 })).toBe(90);
    expect(scoreStaleness({ ...base, hasType: false })).toBe(45);
    expect(scoreStaleness({ ...base, hasMilestone: false })).toBe(30);
    expect(scoreStaleness({ ...base, hasLabels: false })).toBe(15);
  });

  it('subtracts when someone has accepted the issue', () => {
    expect(scoreStaleness({ ...base, idleDays: 100, assigned: true })).toBe(40);
  });

  it('never returns a negative score', () => {
    expect(scoreStaleness({ ...base, assigned: true })).toBe(0);
  });
});

describe('classifyIssue', () => {
  it('reads an empty body, a whitespace body, and a null body all as empty', () => {
    expect(classifyIssue(issue({ body: '' }), NOW).emptyBody).toBe(true);
    expect(classifyIssue(issue({ body: '   \n  ' }), NOW).emptyBody).toBe(true);
    expect(classifyIssue(issue({ body: null }), NOW).emptyBody).toBe(true);
    expect(classifyIssue(issue({ body: 'real' }), NOW).emptyBody).toBe(false);
  });

  it('treats a missing issue type as untriaged', () => {
    expect(classifyIssue(issue({ issueType: null }), NOW).hasType).toBe(false);
    expect(classifyIssue(issue({ issueType: undefined }), NOW).hasType).toBe(false);
  });

  it('separates age from idle time', () => {
    const s = classifyIssue(issue({ createdAt: '2024-09-15T00:00:00Z', updatedAt: '2026-09-08T00:00:00Z' }), NOW);
    expect(s.ageDays).toBe(730);
    expect(s.idleDays).toBe(7);
  });
});

describe('toRow', () => {
  it('starts every row pending with no suggestion', () => {
    const row = toRow(issue(), 'acme/widgets', NOW);
    expect(row.suggestion).toBeNull();
    expect(row.disposition).toEqual(PENDING_DISPOSITION);
  });

  it('does not share the pending disposition object between rows', () => {
    const a = toRow(issue({ number: 1 }), 'acme/widgets', NOW);
    const b = toRow(issue({ number: 2 }), 'acme/widgets', NOW);
    a.disposition.verdict = 'approved';
    expect(b.disposition.verdict).toBe('pending');
    expect(PENDING_DISPOSITION.verdict).toBe('pending');
  });

  it('falls back to a placeholder author when gh omits one', () => {
    expect(toRow(issue({ author: null }), 'acme/widgets', NOW).author).toBe('unknown');
  });
});

describe('rankRows', () => {
  function row(number: number, score: number): TriageRow {
    const r = toRow(issue({ number }), 'acme/widgets', NOW);
    r.staleness.score = score;
    return r;
  }

  it('sorts stalest first', () => {
    expect(rankRows([row(1, 10), row(2, 900), row(3, 50)]).map((r) => r.number)).toEqual([2, 3, 1]);
  });

  it('breaks ties by issue number so bulk-filed rows hold their order', () => {
    expect(rankRows([row(64, 500), row(61, 500), row(63, 500)]).map((r) => r.number)).toEqual([61, 63, 64]);
  });

  it('does not mutate its input', () => {
    const input = [row(1, 10), row(2, 900)];
    rankRows(input);
    expect(input.map((r) => r.number)).toEqual([1, 2]);
  });
});

describe('pendingRows and unresearchedRows', () => {
  function decided(number: number, verdict: 'pending' | 'approved' | 'rejected', researched: boolean): TriageRow {
    const r = toRow(issue({ number }), 'acme/widgets', NOW);
    r.disposition.verdict = verdict;
    if (researched) {
      r.suggestion = { action: 'close', body: 'b', rationale: 'r', suggestedAt: NOW.toISOString(), threadId: null };
    }
    return r;
  }

  it('drops rows the user has already ruled on', () => {
    const rows = [decided(1, 'approved', true), decided(2, 'pending', true), decided(3, 'rejected', true)];
    expect(pendingRows(rows).map((r) => r.number)).toEqual([2]);
  });

  it('offers only unresearched rows to a batch', () => {
    const rows = [decided(1, 'pending', true), decided(2, 'pending', false)];
    expect(unresearchedRows(rows).map((r) => r.number)).toEqual([2]);
  });
});

describe('actionLabel', () => {
  it('names the close reason, so a button never just says Approve', () => {
    expect(actionLabel({ action: 'close', closeReason: 'not planned', duplicateOf: null })).toBe('Close as not planned');
    expect(actionLabel({ action: 'close', closeReason: 'completed', duplicateOf: null })).toBe('Close as completed');
  });

  it('names the issue a duplicate points at', () => {
    expect(actionLabel({ action: 'close', closeReason: 'duplicate', duplicateOf: 294 })).toBe('Close as duplicate of #294');
  });

  it('falls back when a duplicate has no target', () => {
    expect(actionLabel({ action: 'close', closeReason: 'duplicate', duplicateOf: null })).toBe('Close as duplicate');
  });

  it('labels the actions that do not close', () => {
    expect(actionLabel({ action: 'comment', closeReason: 'not planned', duplicateOf: null })).toBe('Post comment');
    expect(actionLabel({ action: 'keep', closeReason: 'not planned', duplicateOf: null })).toBe('Keep open');
    expect(actionLabel({ action: 'needsInfo', closeReason: 'not planned', duplicateOf: null })).toBe('Ask for a repro');
  });
});

describe('actionPostsComment and actionClosesIssue', () => {
  it('only close closes', () => {
    expect(actionClosesIssue('close')).toBe(true);
    for (const a of ['comment', 'keep', 'needsInfo'] as const) expect(actionClosesIssue(a)).toBe(false);
  });

  it('keep is the only action that writes nothing', () => {
    expect(actionPostsComment('keep')).toBe(false);
    for (const a of ['close', 'comment', 'needsInfo'] as const) expect(actionPostsComment(a)).toBe(true);
  });
});
