import { describe, expect, test } from "vitest";

import { buildStateQuery, parseStateResponse, stateFromHeader } from "./state.js";

const refs = [
  { repo: "acme/widgets", number: 128, kind: "pull" as const },
  { repo: "acme/gadgets", number: 42, kind: "issue" as const },
];

describe("buildStateQuery", () => {
  test("asks for every reference in one query", () => {
    const { query, aliases } = buildStateQuery(refs);
    expect(query).toContain('r0: repository(owner: "acme", name: "widgets") { issueOrPullRequest(number: 128)');
    expect(query).toContain('r1: repository(owner: "acme", name: "gadgets") { issueOrPullRequest(number: 42)');
    expect([...aliases.keys()]).toEqual(["r0", "r1"]);
  });

  test("leaves out a name that could not be GitHub's, rather than splicing it in", () => {
    const { query, aliases } = buildStateQuery([{ repo: 'acme/wid"gets', number: 1, kind: "pull" }]);
    expect(query).toBe("");
    expect(aliases.size).toBe(0);
  });
});

describe("parseStateResponse", () => {
  const { aliases } = buildStateQuery(refs);

  test("reads merged, draft, review decisions, and closed issues", () => {
    const states = parseStateResponse(
      {
        data: {
          r0: { issueOrPullRequest: { __typename: "PullRequest", state: "OPEN", isDraft: false, reviewDecision: "CHANGES_REQUESTED" } },
          r1: { issueOrPullRequest: { __typename: "Issue", state: "CLOSED" } },
        },
      },
      aliases,
    );
    expect(states.get("acme/widgets#128")).toEqual({ state: "open", review: "changes_requested", closedAs: null });
    expect(states.get("acme/gadgets#42")).toEqual({ state: "closed", review: null, closedAs: "completed" });
  });

  test("drops the review decision once a pull request has merged", () => {
    const states = parseStateResponse(
      { data: { r0: { issueOrPullRequest: { __typename: "PullRequest", state: "MERGED", isDraft: false, reviewDecision: "APPROVED" } } } },
      aliases,
    );
    expect(states.get("acme/widgets#128")).toEqual({ state: "merged", review: null, closedAs: null });
  });

  test("tells an issue closed as not planned from one completed", () => {
    const states = parseStateResponse(
      { data: { r1: { issueOrPullRequest: { __typename: "Issue", state: "CLOSED", stateReason: "NOT_PLANNED" } } } },
      aliases,
    );
    expect(states.get("acme/gadgets#42")).toEqual({ state: "closed", review: null, closedAs: "not_planned" });
  });

  test("skips a repository gh could not see", () => {
    const states = parseStateResponse({ data: { r0: null }, errors: [{ message: "Could not resolve" }] }, aliases);
    expect(states.size).toBe(0);
  });
});

describe("stateFromHeader", () => {
  test("reads the header's values", () => {
    expect(stateFromHeader("merged")).toEqual({ state: "merged", review: null });
    expect(stateFromHeader(null)).toBeNull();
    expect(stateFromHeader("weird")).toBeNull();
  });
});
