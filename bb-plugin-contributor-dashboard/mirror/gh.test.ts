import { describe, expect, it } from "vitest";

import { ghGraphql } from "./gh";

/** A gh failure as execFile reports it: the argv in the message, the reason on stderr. */
function ghFailure(stderr: string) {
  return Object.assign(new Error("Command failed: gh api graphql -f query=... -f after=Y3Vyc29y"), { stderr });
}

function runner(results: Array<string | Error>) {
  let calls = 0;
  return {
    calls: () => calls,
    run: async () => {
      const result = results[calls++];
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const noWait = async () => {};

describe("ghGraphql", () => {
  it("tries a page GitHub answered with a 502 again", async () => {
    const gh = runner([ghFailure("gh: HTTP 502\n"), JSON.stringify({ data: { ok: true } })]);
    await expect(ghGraphql(gh, noWait)("query", {})).resolves.toEqual({ ok: true });
    expect(gh.calls()).toBe(2);
  });

  it("gives up after two retries with gh's short error, not the command line", async () => {
    const gh = runner([ghFailure("gh: HTTP 502\n"), ghFailure("gh: HTTP 504\n"), ghFailure("gh: HTTP 502\n")]);
    await expect(ghGraphql(gh, noWait)("query", {})).rejects.toThrow(/^GitHub answered HTTP 502$/);
    expect(gh.calls()).toBe(3);
  });

  it("does not retry a failure other than a 5xx", async () => {
    const gh = runner([ghFailure("gh: Could not resolve to a Repository\n")]);
    await expect(ghGraphql(gh, noWait)("query", {})).rejects.toThrow("GitHub answered Could not resolve to a Repository");
    expect(gh.calls()).toBe(1);
  });

  it("passes an error without stderr through unchanged", async () => {
    const unavailable = new Error("`gh` was not found on PATH.");
    await expect(ghGraphql(runner([unavailable]), noWait)("query", {})).rejects.toBe(unavailable);
  });
});
