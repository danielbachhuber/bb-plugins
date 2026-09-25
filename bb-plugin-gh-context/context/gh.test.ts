import { describe, expect, it } from "vitest";
import { GhUnavailableError, type GhRunner } from "@danielb/gh-shared/gh";
import { createGh, myReview, type GhPullRequest } from "./gh.js";

const ref = { repo: "acme/widgets", number: 12 };

function runner(answer: (args: string[]) => string | Error): GhRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      const result = answer(args);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe("issue", () => {
  it("reads the title and state", async () => {
    const gh = createGh(
      runner(() =>
        JSON.stringify({ title: "Widgets drift", state: "OPEN", assignees: [{ login: "Octocat" }] }),
      ),
    );
    expect(await gh.issue(ref)).toEqual({
      title: "Widgets drift",
      state: "open",
      assignees: ["octocat"],
    });
  });

  it("asks gh once within the cache window, and again after it", async () => {
    let clock = 0;
    const fake = runner(() => JSON.stringify({ title: "Widgets drift", state: "CLOSED" }));
    const gh = createGh(fake, () => clock);
    await gh.issue(ref);
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(1);
    clock = 6 * 60_000;
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(2);
  });

  it("returns null instead of throwing when gh is missing or fails", async () => {
    const missing = createGh(runner(() => new GhUnavailableError("`gh` was not found", "")));
    expect(await missing.issue(ref)).toBeNull();
    const garbled = createGh(runner(() => "not json"));
    expect(await garbled.issue(ref)).toBeNull();
  });

  it("remembers a failure for a minute, not five", async () => {
    let clock = 0;
    const fake = runner(() => new Error("network"));
    const gh = createGh(fake, () => clock);
    await gh.issue(ref);
    clock = 30_000;
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(1);
    clock = 61_000;
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(2);
  });
});

describe("pullRequest", () => {
  it("reads state, body, and closing references", async () => {
    const gh = createGh(
      runner(() =>
        JSON.stringify({
          title: "Promote widgets into core",
          url: "https://github.com/acme/widgets/pull/128",
          body: "Part of #7",
          state: "OPEN",
          isDraft: false,
          closingIssuesReferences: [
            { number: 12, repository: { name: "Widgets", owner: { login: "Acme" } } },
          ],
        }),
      ),
    );
    expect(await gh.pullRequest({ repo: "acme/widgets", number: 128 })).toEqual({
      title: "Promote widgets into core",
      url: "https://github.com/acme/widgets/pull/128",
      body: "Part of #7",
      state: "open",
      closing: [{ repo: "acme/widgets", number: 12 }],
      author: null,
      latestReviews: {},
      requestedReviewers: [],
      checks: { state: "no_checks", totalCount: 0, passedCount: 0, failedCount: 0, pendingCount: 0 },
    });
  });

  it("maps draft, merged, and closed", async () => {
    const shaped = (fields: object) =>
      createGh(runner(() => JSON.stringify({ title: "t", url: "u", ...fields }))).pullRequest(ref);
    expect((await shaped({ state: "OPEN", isDraft: true }))?.state).toBe("draft");
    expect((await shaped({ state: "MERGED" }))?.state).toBe("merged");
    expect((await shaped({ state: "CLOSED" }))?.state).toBe("closed");
  });

  it("reads who has reviewed and whose request is outstanding", async () => {
    const pr = await createGh(
      runner(() =>
        JSON.stringify({
          title: "t",
          url: "u",
          state: "OPEN",
          reviews: [
            { author: { login: "octocat" }, state: "COMMENTED", submittedAt: "2026-09-02T10:00:00Z" },
            { author: { login: "Octocat" }, state: "APPROVED", submittedAt: "2026-09-01T10:00:00Z" },
            { author: { login: "hubber" }, state: "PENDING", submittedAt: null },
            { author: { login: "monalisa" }, state: "APPROVED", submittedAt: "2026-09-01T10:00:00Z" },
            { author: { login: "monalisa" }, state: "DISMISSED", submittedAt: "2026-09-03T10:00:00Z" },
          ],
          reviewRequests: [{ login: "Hubber" }, { name: "Widget Team" }],
        }),
      ),
    ).pullRequest(ref);
    // A later comment leaves an approval standing; a pending draft is no review.
    expect(pr?.latestReviews).toEqual({ octocat: "approved", monalisa: "dismissed" });
    expect(pr?.requestedReviewers).toEqual(["hubber"]);
  });

  it("passes arguments as an array, never a shell string", async () => {
    const fake = runner(() => JSON.stringify({ title: "t", url: "u", state: "OPEN" }));
    await createGh(fake).pullRequest({ repo: "acme/widgets", number: 128 });
    expect(fake.calls[0]).toEqual([
      "pr",
      "view",
      "128",
      "--repo",
      "acme/widgets",
      "--json",
      "title,url,body,state,isDraft,author,closingIssuesReferences,reviews,reviewRequests,statusCheckRollup",
    ]);
  });
});

describe("myReview", () => {
  const pr = (fields: Partial<GhPullRequest>): GhPullRequest => ({
    title: "t",
    url: "u",
    body: "",
    state: "open",
    closing: [],
    author: "hubber",
    latestReviews: {},
    requestedReviewers: [],
    checks: { state: "no_checks", totalCount: 0, passedCount: 0, failedCount: 0, pendingCount: 0 },
    ...fields,
  });

  it("is the viewer's standing review", () => {
    expect(myReview(pr({ latestReviews: { octocat: "commented" } }), "octocat", false)).toBe("commented");
  });

  it("is requested when asked directly, or through a team before a first review", () => {
    expect(myReview(pr({ requestedReviewers: ["octocat"] }), "octocat", false)).toBe("requested");
    expect(myReview(pr({}), "octocat", true)).toBe("requested");
  });

  it("is re-requested after a review only when asked directly", () => {
    const reviewed = { latestReviews: { octocat: "approved" as const } };
    expect(myReview(pr({ ...reviewed, requestedReviewers: ["octocat"] }), "octocat", true)).toBe("re-requested");
    expect(myReview(pr(reviewed), "octocat", true)).toBe("approved");
  });

  it("ignores requests left on a merged pull request", () => {
    expect(myReview(pr({ state: "merged", requestedReviewers: ["octocat"] }), "octocat", true)).toBeNull();
  });

  it("is null on the viewer's own pull request, where replies count as reviews", () => {
    expect(myReview(pr({ author: "octocat", latestReviews: { octocat: "commented" } }), "octocat", false)).toBeNull();
  });

  it("is null for someone else's review, or without a viewer", () => {
    expect(myReview(pr({ latestReviews: { hubber: "approved" } }), "octocat", false)).toBeNull();
    expect(myReview(pr({ latestReviews: { octocat: "approved" } }), null, false)).toBeNull();
  });
});

describe("reviewRequested", () => {
  it("keys each pull request waiting on the viewer, lowercased", async () => {
    const fake = runner(() =>
      JSON.stringify([{ number: 128, repository: { nameWithOwner: "Acme/Widgets" } }, { number: "x" }]),
    );
    expect(await createGh(fake).reviewRequested()).toEqual(["acme/widgets#128"]);
    expect(fake.calls[0]).toEqual([
      "search",
      "prs",
      "--review-requested=@me",
      "--state=open",
      "--limit",
      "100",
      "--json",
      "number,repository",
    ]);
  });
});

describe("viewer", () => {
  it("reads the signed-in login once, lowercased", async () => {
    const fake = runner(() => "Octocat\n");
    const gh = createGh(fake);
    expect(await gh.viewer()).toBe("octocat");
    expect(await gh.viewer()).toBe("octocat");
    expect(fake.calls).toEqual([["api", "user", "--jq", ".login"]]);
  });

  it("is null when gh cannot say", async () => {
    expect(await createGh(runner(() => new Error("not logged in"))).viewer()).toBeNull();
  });
});
