import { describe, expect, test } from "vitest";

import { buildStateQuery, parseStateResponse, stateFromHeader } from "./state.js";

const refs = [
  { repo: "acme/widgets", number: 128, kind: "pull" as const },
  { repo: "acme/gadgets", number: 42, kind: "issue" as const },
];

describe("buildStateQuery", () => {
  test("asks for every reference in one query", () => {
    const { query, aliases } = buildStateQuery(refs);
    expect(query).toMatch(/r0: repository\(owner: "acme", name: "widgets"\) \{ viewerPermission [^{]*issueOrPullRequest\(number: 128\)/);
    expect(query).toMatch(/r1: repository\(owner: "acme", name: "gadgets"\) \{ viewerPermission [^{]*issueOrPullRequest\(number: 42\)/);
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
    expect(states.get("acme/widgets#128")).toEqual({
      state: "open",
      review: "changes_requested",
      closedAs: null,
      checks: null,
      mergeMethods: [],
    });
    expect(states.get("acme/gadgets#42")).toEqual({ state: "closed", review: null, closedAs: "completed" });
  });

  test("reads whose review is still pending, teams by their org/team slug", () => {
    const states = parseStateResponse(
      {
        data: {
          r0: {
            issueOrPullRequest: {
              __typename: "PullRequest",
              state: "OPEN",
              isDraft: false,
              reviewDecision: "REVIEW_REQUIRED",
              reviewRequests: {
                nodes: [
                  { requestedReviewer: { __typename: "Team", combinedSlug: "acme/reviewers" } },
                  { requestedReviewer: { __typename: "User", login: "hubber" } },
                ],
              },
            },
          },
        },
      },
      aliases,
    );
    expect(states.get("acme/widgets#128")?.pendingReviewers).toEqual(["acme/reviewers", "hubber"]);
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

  describe("checks and merging", () => {
    const answer = (repository: Record<string, unknown>, pull: Record<string, unknown>) =>
      parseStateResponse(
        {
          data: {
            r0: {
              viewerPermission: "WRITE",
              mergeCommitAllowed: true,
              squashMergeAllowed: true,
              rebaseMergeAllowed: false,
              ...repository,
              issueOrPullRequest: {
                __typename: "PullRequest",
                state: "OPEN",
                isDraft: false,
                reviewDecision: "APPROVED",
                mergeStateStatus: "CLEAN",
                viewerDidAuthor: true,
                commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
                ...pull,
              },
            },
          },
        },
        aliases,
      ).get("acme/widgets#128");

    test("reads the latest commit's checks and the methods the repository allows", () => {
      expect(answer({}, {})).toMatchObject({ checks: "passing", mergeMethods: ["merge", "squash"] });
      expect(answer({}, { commits: { nodes: [{ commit: { statusCheckRollup: { state: "ERROR" } } }] } })?.checks).toBe("failing");
      expect(answer({}, { commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })?.checks).toBeNull();
    });

    test("offers a merge where GitHub's own merge box would, and not otherwise", () => {
      expect(answer({}, { mergeStateStatus: "UNSTABLE" })?.mergeMethods).toEqual(["merge", "squash"]);
      for (const status of ["BLOCKED", "BEHIND", "DIRTY", "UNKNOWN"]) {
        expect(answer({}, { mergeStateStatus: status })?.mergeMethods).toEqual([]);
      }
      expect(answer({}, { isDraft: true })?.mergeMethods).toEqual([]);
      expect(answer({ viewerPermission: "READ" }, {})?.mergeMethods).toEqual([]);
      expect(answer({}, { viewerDidAuthor: false })?.mergeMethods).toEqual([]);
    });
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
