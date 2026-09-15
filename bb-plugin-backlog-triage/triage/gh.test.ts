import { describe, expect, it, vi } from 'vitest';

import type { GhRunner } from '@danielb/gh-shared/gh';

import { FETCH_LIMIT, InvalidRepoError, applyDisposition, assertRepoSlug, fetchOpenIssues } from './gh.js';

const NOW = new Date('2026-09-15T00:00:00Z');

function runner(stdout: string): GhRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      return stdout;
    },
  };
}

const ONE_ISSUE = JSON.stringify([
  {
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
  },
]);

describe('assertRepoSlug', () => {
  it('accepts an owner/name slug', () => {
    expect(() => assertRepoSlug('acme/widgets')).not.toThrow();
  });

  it('rejects anything else, including an injected flag', () => {
    expect(() => assertRepoSlug('widgets')).toThrow(InvalidRepoError);
    expect(() => assertRepoSlug('--repo=evil/x')).toThrow(InvalidRepoError);
    expect(() => assertRepoSlug('acme/widgets;rm -rf /')).toThrow(InvalidRepoError);
  });
});

describe('fetchOpenIssues', () => {
  it('asks gh for open issues in the named repo', async () => {
    const gh = runner(ONE_ISSUE);
    await fetchOpenIssues(gh, 'acme/widgets', NOW);
    expect(gh.calls[0]).toContain('--repo');
    expect(gh.calls[0][gh.calls[0].indexOf('--repo') + 1]).toBe('acme/widgets');
    expect(gh.calls[0]).toContain('open');
  });

  it('classifies what it fetches', async () => {
    const { rows } = await fetchOpenIssues(runner(ONE_ISSUE), 'acme/widgets', NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].staleness.emptyBody).toBe(true);
    expect(rows[0].staleness.hasType).toBe(false);
    expect(rows[0].repo).toBe('acme/widgets');
  });

  it('reports truncation only when the limit is reached', async () => {
    const full = JSON.stringify(
      Array.from({ length: FETCH_LIMIT }, (_, i) => JSON.parse(ONE_ISSUE)[0] && { ...JSON.parse(ONE_ISSUE)[0], number: i + 1 }),
    );
    expect((await fetchOpenIssues(runner(full), 'acme/widgets', NOW)).truncated).toBe(true);
    expect((await fetchOpenIssues(runner(ONE_ISSUE), 'acme/widgets', NOW)).truncated).toBe(false);
  });

  it('drops malformed entries rather than throwing', async () => {
    const mixed = JSON.stringify([JSON.parse(ONE_ISSUE)[0], { title: 'no number' }, null]);
    const { rows } = await fetchOpenIssues(runner(mixed), 'acme/widgets', NOW);
    expect(rows.map((r) => r.number)).toEqual([43]);
  });

  it('refuses a bad slug before spawning gh', async () => {
    const gh = runner(ONE_ISSUE);
    await expect(fetchOpenIssues(gh, 'nope', NOW)).rejects.toThrow(InvalidRepoError);
    expect(gh.calls).toHaveLength(0);
  });
});

describe('applyDisposition', () => {
  it('comments then closes, in that order', async () => {
    const gh = runner('');
    await applyDisposition(gh, 'acme/widgets', 43, { comment: 'Closing as obsolete.', close: true });
    expect(gh.calls.map((c) => c[1])).toEqual(['comment', 'close']);
  });

  it('comments without closing', async () => {
    const gh = runner('');
    await applyDisposition(gh, 'acme/widgets', 43, { comment: 'Still relevant?', close: false });
    expect(gh.calls.map((c) => c[1])).toEqual(['comment']);
  });

  it('closes without commenting', async () => {
    const gh = runner('');
    await applyDisposition(gh, 'acme/widgets', 43, { comment: null, close: true });
    expect(gh.calls.map((c) => c[1])).toEqual(['close']);
  });

  it('treats a whitespace-only comment as no comment', async () => {
    const gh = runner('');
    await applyDisposition(gh, 'acme/widgets', 43, { comment: '   \n ', close: true });
    expect(gh.calls.map((c) => c[1])).toEqual(['close']);
  });

  it('writes nothing at all for a keep', async () => {
    const gh = runner('');
    await applyDisposition(gh, 'acme/widgets', 43, { comment: null, close: false });
    expect(gh.calls).toHaveLength(0);
  });

  // A close that lands without its explanation is the worse failure.
  it('does not close when the comment fails', async () => {
    const gh: GhRunner = { run: vi.fn().mockRejectedValueOnce(new Error('gh: rate limited')) };
    await expect(
      applyDisposition(gh, 'acme/widgets', 43, { comment: 'Closing.', close: true }),
    ).rejects.toThrow('rate limited');
    expect(gh.run).toHaveBeenCalledTimes(1);
  });
});
