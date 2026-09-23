import { describe, expect, it } from "vitest";
import {
  githubRepoFromRemote,
  openingLineIssueNumber,
  promptIssue,
  promptPullRequest,
  pullRequestIssueRefs,
  workItems,
} from "./rules.js";

const ISSUE = "https://github.com/acme/widgets/issues/12";
const OTHER_ISSUE = "https://github.com/acme/widgets/issues/34";
const PULL = "https://github.com/acme/widgets/pull/56";

describe("workItems", () => {
  it("lists distinct issues and pull requests in the order they appear", () => {
    expect(workItems(`${PULL} then ${ISSUE} and ${ISSUE} again`)).toEqual([
      { kind: "pull", repo: "acme/widgets", number: 56 },
      { kind: "issue", repo: "acme/widgets", number: 12 },
    ]);
  });

  it("lowercases the repository, as GitHub matches it", () => {
    expect(workItems("https://github.com/Acme/Widgets/issues/1")).toEqual([
      { kind: "issue", repo: "acme/widgets", number: 1 },
    ]);
  });
});

describe("promptIssue (rule 1)", () => {
  it("links the one issue a prompt works on", () => {
    expect(promptIssue(`Work on ${ISSUE}`)).toEqual({ repo: "acme/widgets", number: 12 });
  });

  it("reads issue-sweep's generated prompt", () => {
    const prompt = [
      'Work on issue acme/widgets#12: "Retire the old widget endpoint".',
      ISSUE,
      "",
      "Read it first, including its comments.",
    ].join("\n");
    expect(promptIssue(prompt)).toEqual({ repo: "acme/widgets", number: 12 });
  });

  it("ignores pull request links when counting", () => {
    expect(promptIssue(`Work on ${ISSUE} as a stacked PR on top of ${PULL}`)).toEqual({
      repo: "acme/widgets",
      number: 12,
    });
  });

  it("links nothing when the prompt names two issues", () => {
    expect(promptIssue(`Work on ${ISSUE}, a subtask of ${OTHER_ISSUE}`)).toBeNull();
  });

  it("links nothing when the prompt names no issue", () => {
    expect(promptIssue(`Review ${PULL}`)).toBeNull();
    expect(promptIssue("Create a plugin for open pull requests")).toBeNull();
  });

  it("accepts comment permalinks, tracking parameters, and www", () => {
    expect(promptIssue(`Take a look at ${ISSUE}#issuecomment-123456`)).toEqual({
      repo: "acme/widgets",
      number: 12,
    });
    expect(promptIssue(`${ISSUE}?notification_referrer_id=abc is this addressed?`)).toEqual({
      repo: "acme/widgets",
      number: 12,
    });
    expect(promptIssue("Is https://www.github.com/acme/widgets/issues/9 still valid?")).toEqual({
      repo: "acme/widgets",
      number: 9,
    });
  });

  it("counts the same issue linked twice once", () => {
    expect(promptIssue(`${ISSUE}\n\nWork on this: ${ISSUE}#issuecomment-1`)).toEqual({
      repo: "acme/widgets",
      number: 12,
    });
  });
});

describe("promptPullRequest", () => {
  it("links the one pull request a prompt names", () => {
    expect(promptPullRequest(`Review ${PULL}`)).toEqual({ repo: "acme/widgets", number: 56 });
    expect(promptPullRequest(`${PULL}/files and ${PULL}#discussion_r1`)).toEqual({
      repo: "acme/widgets",
      number: 56,
    });
  });

  it("links nothing when the prompt also names an issue, or two pull requests", () => {
    expect(promptPullRequest(`Work on ${ISSUE} as a stacked PR on top of ${PULL}`)).toBeNull();
    expect(promptPullRequest(`${PULL} and https://github.com/acme/widgets/pull/6000`)).toBeNull();
    expect(promptPullRequest(`Work on ${ISSUE}`)).toBeNull();
  });
});

describe("openingLineIssueNumber (rule 2)", () => {
  const handoff = [
    "Take on one part of issue #78: the gadget half of the widget cleanup.",
    "",
    "## Your scope",
    "",
    `First line of the PR description: See ${ISSUE}, a subtask of ${OTHER_ISSUE}.`,
  ].join("\n");

  it("reads `issue #N` from the first line of a handoff prompt", () => {
    expect(openingLineIssueNumber(handoff)).toBe(78);
    // The URLs further down name two issues, so rule 1 stays out of it.
    expect(promptIssue(handoff)).toBeNull();
  });

  it("skips leading blank lines", () => {
    expect(openingLineIssueNumber("\n\n  Fix issue #12 today")).toBe(12);
  });

  it("ignores a bare #N without the word issue, and anything after line one", () => {
    expect(openingLineIssueNumber("Look at #12")).toBeNull();
    expect(openingLineIssueNumber("Some context.\nWork on issue #12")).toBeNull();
  });

  it("is case-insensitive about the word", () => {
    expect(openingLineIssueNumber("Issue #44: tidy up")).toBe(44);
  });
});

describe("pullRequestIssueRefs (rule 3)", () => {
  const repo = "acme/widgets";

  it("lists closing references first, then keyword references in the body", () => {
    expect(
      pullRequestIssueRefs({
        repo,
        closing: [{ repo, number: 10 }],
        body: `Part of #11.\n\nRefs ${OTHER_ISSUE}`,
      }),
    ).toEqual([
      { repo, number: 10 },
      { repo, number: 11 },
      { repo, number: 34 },
    ]);
  });

  it("recognises every keyword, in any case", () => {
    for (const keyword of ["Fixes", "closes", "RESOLVES", "Refs", "Ref", "See", "Part of"]) {
      expect(pullRequestIssueRefs({ repo, closing: [], body: `${keyword} #7` })).toEqual([
        { repo, number: 7 },
      ]);
    }
  });

  it("ignores a bare #N with no keyword, and a keyword pointing at a pull request", () => {
    expect(pullRequestIssueRefs({ repo, closing: [], body: "Follows #7" })).toEqual([]);
    expect(pullRequestIssueRefs({ repo, closing: [], body: `See ${PULL}` })).toEqual([]);
  });

  it("does not list an issue twice", () => {
    expect(
      pullRequestIssueRefs({ repo, closing: [{ repo, number: 7 }], body: "Fixes #7" }),
    ).toEqual([{ repo, number: 7 }]);
  });

  it("resolves a bare #N to the pull request's own repository, lowercased", () => {
    expect(pullRequestIssueRefs({ repo: "Acme/Widgets", closing: [], body: "See #3" })).toEqual([
      { repo: "acme/widgets", number: 3 },
    ]);
  });
});

describe("githubRepoFromRemote", () => {
  it("reads https and ssh remotes, with or without .git", () => {
    expect(githubRepoFromRemote("https://github.com/acme/widgets.git")).toBe("acme/widgets");
    expect(githubRepoFromRemote("https://github.com/acme/widgets")).toBe("acme/widgets");
    expect(githubRepoFromRemote("git@github.com:acme/widgets.git")).toBe("acme/widgets");
    expect(githubRepoFromRemote("ssh://git@github.com/Acme/Widgets.git")).toBe("acme/widgets");
  });

  it("returns null for another host", () => {
    expect(githubRepoFromRemote("https://gitlab.com/acme/widgets.git")).toBeNull();
  });
});
