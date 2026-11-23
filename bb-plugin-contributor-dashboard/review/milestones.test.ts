import { describe, expect, it } from "vitest";

import type { Bucket } from "../dashboard/period";
import type { IssueTimelineItem, IssueWithActivity, Milestone, PullRequestReview, PullRequestWithActivity } from "../mirror/github";

import { addedAt, milestoneDetail, milestoneSummaries, standingOf } from "./milestones";

const at = (iso: string) => Date.parse(iso);

function issue(number: number, overrides: Partial<IssueWithActivity> = {}): IssueWithActivity {
  return {
    id: `I_${number}`,
    number,
    title: `Widget issue ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    state: "OPEN",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-09-01T09:00:00Z",
    closedAt: null,
    author: { login: "hubber" },
    assignees: [],
    milestone: { number: 7 },
    timelineItems: [],
    ...overrides,
  };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    number: 7,
    title: "Gadget importer",
    url: "https://github.com/acme/widgets/milestone/7",
    dueOn: null,
    createdAt: "2026-05-01T09:00:00Z",
    openIssues: { totalCount: 3 },
    closedIssues: { totalCount: 2 },
    ...overrides,
  };
}

function pr(number: number, overrides: Partial<PullRequestWithActivity> = {}): PullRequestWithActivity {
  return {
    id: `PR_${number}`,
    number,
    title: `Gadget change ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-02T09:00:00Z",
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

const review = (state: PullRequestReview["state"], login: string, submittedAt: string): PullRequestReview => ({
  id: `R_${login}_${submittedAt}`,
  state,
  submittedAt,
  createdAt: submittedAt,
  author: { login },
});

const milestoned = (createdAt: string, milestoneTitle?: string): IssueTimelineItem => ({
  __typename: "MilestonedEvent",
  id: `M_${createdAt}`,
  createdAt,
  ...(milestoneTitle === undefined ? {} : { milestoneTitle }),
});

const WEEKS: Bucket[] = [
  { start: at("2026-09-28T00:00:00Z"), end: at("2026-10-05T00:00:00Z"), label: "Sep 28" },
  { start: at("2026-10-05T00:00:00Z"), end: at("2026-10-12T00:00:00Z"), label: "Oct 5" },
];

describe("addedAt", () => {
  it("is the last time it was put in a milestone of this title", () => {
    const row = issue(1, {
      timelineItems: [milestoned("2026-07-01T09:00:00Z", "Gadget importer"), milestoned("2026-08-01T09:00:00Z", "Sprocket export"), milestoned("2026-09-01T09:00:00Z", "Gadget importer")],
    });
    expect(addedAt(row, "Gadget importer")).toBe(at("2026-09-01T09:00:00Z"));
  });

  it("falls back to events without a title, then to when the issue was opened", () => {
    expect(addedAt(issue(1, { timelineItems: [milestoned("2026-07-01T09:00:00Z")] }), "Gadget importer")).toBe(at("2026-07-01T09:00:00Z"));
    expect(addedAt(issue(2), "Gadget importer")).toBe(at("2026-06-01T09:00:00Z"));
  });
});

describe("milestoneSummaries", () => {
  it("counts what was added and closed in each bucket, and the open issues nobody holds", () => {
    const [summary] = milestoneSummaries(
      [milestone()],
      [
        issue(1, { timelineItems: [milestoned("2026-09-30T09:00:00Z", "Gadget importer")] }),
        issue(2, { assignees: [{ login: "octocat" }], timelineItems: [milestoned("2026-10-06T09:00:00Z", "Gadget importer")] }),
        issue(3, { state: "CLOSED", closedAt: "2026-10-07T09:00:00Z" }),
        issue(4, { state: "CLOSED", closedAt: "2026-08-07T09:00:00Z" }),
        issue(5, { milestone: { number: 8 } }),
        issue(6, { milestone: null }),
      ],
      WEEKS,
    );
    expect(summary).toMatchObject({ open: 3, closed: 2, nobody: 1, added: [1, 1], closedIn: [0, 1], openAdded: 2 });
  });

  it("puts the most active first, then ties by due date", () => {
    const order = milestoneSummaries(
      [
        milestone({ number: 1, title: "Quiet" }),
        milestone({ number: 2, title: "Busy" }),
        milestone({ number: 3, title: "Due later", dueOn: "2026-12-01T00:00:00Z" }),
        milestone({ number: 4, title: "Past due", dueOn: "2026-09-01T00:00:00Z" }),
      ],
      [issue(1, { milestone: { number: 2 }, timelineItems: [milestoned("2026-10-06T09:00:00Z", "Busy")] })],
      WEEKS,
    ).map((m) => m.title);
    expect(order).toEqual(["Busy", "Past due", "Due later", "Quiet"]);
  });
});

describe("standingOf", () => {
  const row = issue(9);
  it("is nobody or assigned without an open pull request that closes it", () => {
    expect(standingOf(row, [])).toBe("nobody");
    expect(standingOf(issue(9, { assignees: [{ login: "octocat" }] }), [pr(1, { closingIssuesReferences: [{ number: 10 }] })])).toBe("assigned");
  });

  it("takes the furthest of its pull requests", () => {
    const draft = pr(1, { isDraft: true, closingIssuesReferences: [{ number: 9 }] });
    const inReview = pr(2, { closingIssuesReferences: [{ number: 9 }] });
    expect(standingOf(row, [draft])).toBe("draft");
    expect(standingOf(row, [draft, inReview])).toBe("review");
  });

  it("is approved only while no reviewer's latest review asks for changes", () => {
    const approved = pr(1, {
      closingIssuesReferences: [{ number: 9 }],
      reviews: [review("CHANGES_REQUESTED", "hubber", "2026-10-02T09:00:00Z"), review("APPROVED", "hubber", "2026-10-03T09:00:00Z")],
    });
    const blocked = pr(2, {
      closingIssuesReferences: [{ number: 9 }],
      reviews: [review("APPROVED", "hubber", "2026-10-02T09:00:00Z"), review("CHANGES_REQUESTED", "mona", "2026-10-03T09:00:00Z")],
    });
    expect(standingOf(row, [approved])).toBe("approved");
    expect(standingOf(row, [blocked])).toBe("review");
  });
});

describe("milestoneDetail", () => {
  it("lists open issues furthest along first and builds its history from when each joined and closed", () => {
    const now = at("2026-10-08T09:00:00Z");
    const detail = milestoneDetail(
      milestone({ createdAt: "2026-09-10T09:00:00Z" }),
      [
        issue(1, { timelineItems: [milestoned("2026-09-11T09:00:00Z", "Gadget importer")] }),
        issue(2, { assignees: [{ login: "octocat" }], timelineItems: [milestoned("2026-09-20T09:00:00Z", "Gadget importer")] }),
        issue(3, {
          state: "CLOSED",
          closedAt: "2026-10-01T09:00:00Z",
          stateReason: "NOT_PLANNED",
          timelineItems: [milestoned("2026-09-12T09:00:00Z", "Gadget importer")],
        }),
      ],
      [],
      now,
    );
    expect(detail.open.map((row) => [row.number, row.standing])).toEqual([
      [2, "assigned"],
      [1, "nobody"],
    ]);
    expect(detail.closed).toMatchObject([{ number: 3, notDone: true }]);
    expect(detail.history.at[0]).toBe(at("2026-09-10T09:00:00Z"));
    expect(detail.history.at.at(-1)).toBe(now);
    expect(detail.history.total.at(-1)).toBe(3);
    expect(detail.history.closed.at(-1)).toBe(1);
    expect(detail.history.total[0]).toBe(0);
  });
});
