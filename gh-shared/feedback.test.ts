import { describe, expect, it } from "vitest";
import type { GhRunner } from "./gh.js";
import { fetchFeedback, parseFeedback } from "./feedback.js";

const author = (login: string, typename = "User") => ({ __typename: typename, login, avatarUrl: `https://example.test/${login}.png` });

const response = (pullRequest: unknown) =>
  JSON.stringify({ data: { viewer: { login: "octocat" }, repository: { pullRequest } } });

const review = (login: string, state: string, bodyText: string, submittedAt = "2026-01-02T00:00:00Z") => ({
  author: author(login),
  state,
  bodyText,
  url: `https://github.com/acme/widgets/pull/12#review-${login}-${state}`,
  submittedAt,
});

const thread = (
  opener: string,
  last: string,
  extra: { isResolved?: boolean; isOutdated?: boolean; line?: number | null; originalLine?: number; createdAt?: string; total?: number } = {},
) => ({
  isResolved: extra.isResolved ?? false,
  isOutdated: extra.isOutdated ?? false,
  path: "export/csv.ts",
  line: extra.line === undefined ? 42 : extra.line,
  originalLine: extra.originalLine ?? 40,
  first: {
    nodes: [
      {
        author: author(opener),
        bodyText: `${opener} on a line`,
        url: `https://github.com/acme/widgets/pull/12#discussion-${opener}`,
        createdAt: extra.createdAt ?? "2026-01-03T00:00:00Z",
      },
    ],
  },
  last: { totalCount: extra.total ?? 1, nodes: [{ author: { login: last } }] },
});

const comment = (login: string, bodyText: string, typename = "User") => ({
  author: author(login, typename),
  bodyText,
  url: `https://github.com/acme/widgets/pull/12#comment-${login}`,
  createdAt: "2026-01-04T00:00:00Z",
});

describe("parseFeedback", () => {
  it("puts requested changes first, then open threads, comments, and resolved threads", () => {
    const entries = parseFeedback(
      response({
        reviews: { nodes: [review("hubber", "APPROVED", "Looks good."), review("hubber", "CHANGES_REQUESTED", "Drops rows.")] },
        reviewThreads: {
          nodes: [
            thread("hubber", "hubber", { isResolved: true }),
            thread("hubber", "octocat", { total: 2 }),
            thread("hubber", "hubber"),
          ],
        },
        comments: { nodes: [comment("hubber", "Any update?")] },
      }),
    );
    expect(entries.map((entry) => [entry.kind, "state" in entry ? entry.state : "status" in entry ? entry.status : ""])).toEqual([
      ["review", "changes_requested"],
      ["review", "approved"],
      ["thread", "unanswered"],
      ["thread", "replied"],
      ["comment", ""],
      ["thread", "resolved"],
    ]);
  });

  it("keeps a review that requested changes without a body, and drops an empty approval", () => {
    const entries = parseFeedback(
      response({ reviews: { nodes: [review("hubber", "CHANGES_REQUESTED", ""), review("hubber", "APPROVED", " ")] } }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "review", state: "changes_requested", body: "" });
  });

  it("leaves out your own comments, pending and dismissed reviews", () => {
    const entries = parseFeedback(
      response({
        reviews: { nodes: [review("octocat", "COMMENTED", "Self note"), review("hubber", "PENDING", "Draft"), review("hubber", "DISMISSED", "Old")] },
        reviewThreads: { nodes: [thread("octocat", "octocat")] },
        comments: { nodes: [comment("octocat", "Rebased")] },
      }),
    );
    expect(entries).toEqual([]);
  });

  it("keeps bots' comments and marks them", () => {
    const entries = parseFeedback(
      response({
        comments: {
          nodes: [comment("hubber", "Any update?"), comment("github-actions", "Coverage 91%"), comment("acme-ci", "Deployed", "Bot")],
        },
      }),
    );
    expect(entries.map((entry) => [entry.author, entry.bot ?? false])).toEqual([
      ["hubber", false],
      ["github-actions", true],
      ["acme-ci", true],
    ]);
  });

  it("keeps your own when asked, and says which threads still wait on someone else", () => {
    const entries = parseFeedback(
      response({
        reviews: { nodes: [review("octocat", "COMMENTED", "A few notes inline.")] },
        reviewThreads: {
          nodes: [
            thread("octocat", "octocat"),
            thread("octocat", "hubber", { total: 2, createdAt: "2026-01-03T00:00:00Z" }),
            thread("octocat", "octocat", { total: 3, createdAt: "2026-01-04T00:00:00Z" }),
          ],
        },
        comments: { nodes: [comment("octocat", "Rebased")] },
      }),
      { includeViewer: true },
    );
    expect(entries.map((entry) => [entry.kind, entry.author, entry.kind === "thread" ? entry.status : null])).toEqual([
      ["review", "octocat", null],
      ["thread", "octocat", "unanswered"],
      ["thread", "octocat", "waiting"],
      ["thread", "octocat", "replied"],
      ["comment", "octocat", null],
    ]);
  });

  it("reads a thread's line, falling back to where it was before the code moved", () => {
    const [current, outdated] = parseFeedback(
      response({
        reviewThreads: {
          nodes: [
            thread("hubber", "hubber", { line: 42, total: 3 }),
            thread("hubber", "hubber", { line: null, originalLine: 17, isOutdated: true, createdAt: "2026-01-05T00:00:00Z" }),
          ],
        },
      }),
    );
    expect(current).toMatchObject({ path: "export/csv.ts", line: 42, outdated: false, replies: 2 });
    expect(outdated).toMatchObject({ line: 17, outdated: true, replies: 0 });
  });

  it("returns nothing when the pull request is missing", () => {
    expect(parseFeedback(JSON.stringify({ data: { repository: { pullRequest: null } } }))).toEqual([]);
  });
});

describe("fetchFeedback", () => {
  it("asks for one pull request in one GraphQL call", async () => {
    const calls: string[][] = [];
    const gh: GhRunner = {
      run: async (args) => {
        calls.push(args);
        return response({ comments: { nodes: [comment("hubber", "Hi")] } });
      },
    };
    const entries = await fetchFeedback(gh, "acme/widgets", 12);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.arrayContaining(["owner=acme", "name=widgets", "number=12"]));
    expect(entries).toHaveLength(1);
  });
});
