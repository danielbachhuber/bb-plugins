import { describe, expect, it } from 'vitest';

import { toRow } from './classify.js';
import { buildResearchPrompt, describeRow } from './prompt.js';
import type { RawIssue } from './types.js';

const NOW = new Date('2026-09-15T00:00:00Z');

function row(over: Partial<RawIssue> = {}) {
  const issue: RawIssue = {
    number: 43,
    title: 'Configure prettier',
    url: 'https://github.com/acme/widgets/issues/43',
    body: '',
    createdAt: '2024-07-06T00:00:00Z',
    updatedAt: '2024-07-06T00:00:00Z',
    author: { login: 'octocat' },
    assignees: [],
    labels: [],
    milestone: null,
    comments: [],
    issueType: null,
    ...over,
  };
  return toRow(issue, 'acme/widgets', NOW);
}

describe('describeRow', () => {
  it('carries the evidence the sweep derived', () => {
    const text = describeRow(row());
    expect(text).toContain('#43 Configure prettier');
    expect(text).toContain('https://github.com/acme/widgets/issues/43');
    expect(text).toContain('@octocat');
    expect(text).toContain('empty body');
    expect(text).toContain('no type');
    expect(text).toContain('unassigned');
    expect(text).toContain('0 comments');
  });

  it('singularises one comment', () => {
    expect(describeRow(row({ comments: [{}] }))).toContain('1 comment,');
  });

  it('names the milestone when there is one', () => {
    expect(describeRow(row({ milestone: { title: 'Acme Board' } }))).toContain('milestone Acme Board');
  });
});

describe('buildResearchPrompt', () => {
  const prompt = buildResearchPrompt('acme/widgets', [row(), row({ number: 44, title: 'Another' })]);

  it('names the repo and the batch size', () => {
    expect(prompt).toContain('Triage 2 stale issues in acme/widgets');
  });

  it('lists every issue', () => {
    expect(prompt).toContain('#43');
    expect(prompt).toContain('#44');
  });

  it('tells the thread how to write its answer back', () => {
    expect(prompt).toContain('bb backlog-triage suggest');
    expect(prompt).toContain('--repo acme/widgets');
    expect(prompt).toContain('--action');
    expect(prompt).toContain('--rationale');
    expect(prompt).toContain('--body');
  });

  // The plugin holds the line that only an approved click writes to GitHub.
  it('forbids the thread from writing to GitHub itself', () => {
    expect(prompt).toContain('Never run `gh issue close`');
    expect(prompt).toContain('Nothing you do here writes to GitHub');
  });

  it('biases an uncertain call towards keep', () => {
    expect(prompt).toContain('prefer `keep` over a');
  });

  it('singularises a one-issue batch', () => {
    expect(buildResearchPrompt('acme/widgets', [row()])).toContain('Triage 1 stale issue in');
  });
});
