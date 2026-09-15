import { describe, expect, it } from 'vitest';

import { rpcContract } from './contract.js';

/**
 * The frontend calls a no-input method as `rpc.call("listRepos", null)`, so
 * every such method has to accept null. `z.void()` does not, and the only
 * symptom is a line in the server log and a control with nothing in it.
 */
describe('no-input methods accept null', () => {
  for (const method of ['listRepos', 'selectedRepo'] as const) {
    it(`${method} parses null`, () => {
      const schema = (rpcContract as unknown as Record<string, { input: { safeParse(v: unknown): { success: boolean } } }>)[method].input;
      expect(schema.safeParse(null).success).toBe(true);
    });
  }
});

describe('input schemas reject the wrong shape', () => {
  it('listRows requires a repo', () => {
    const schema = (rpcContract as unknown as Record<string, { input: { safeParse(v: unknown): { success: boolean } } }>).listRows.input;
    expect(schema.safeParse({ repo: 'acme/widgets' }).success).toBe(true);
    expect(schema.safeParse(null).success).toBe(false);
  });

  it('researchSeed caps a batch at 50', () => {
    const schema = (rpcContract as unknown as Record<string, { input: { safeParse(v: unknown): { success: boolean } } }>).researchSeed.input;
    expect(schema.safeParse({ repo: 'acme/widgets', count: 10 }).success).toBe(true);
    expect(schema.safeParse({ repo: 'acme/widgets', count: 0 }).success).toBe(false);
    expect(schema.safeParse({ repo: 'acme/widgets', count: 51 }).success).toBe(false);
  });
});
