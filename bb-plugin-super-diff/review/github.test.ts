import { describe, expect, it } from "vitest";
import { isRead, planRead, planFileViewed, syncOf, type FileContext } from "./github";

const items = [
  { path: "src/a.ts", index: 0, hash: "h0" },
  { path: "src/a.ts", index: 1, hash: "h1" },
  { path: "src/a.ts", index: 2, hash: "h2" },
];

function ctx(over: Partial<FileContext> = {}): FileContext {
  return { items, marks: new Map(), sync: "synced", githubViewed: false, ...over };
}
const marked = (...indexes: number[]) => new Map(indexes.map((i) => [`src/a.ts#${i}`, `h${i}`]));
const keys = (list: Array<{ index: number }>) => list.map((item) => item.index);

describe("syncOf", () => {
  it("is synced when the pull request has the file with the same counts", () => {
    expect(syncOf({ added: 3, removed: 1 }, { path: "a", additions: 3, deletions: 1, viewed: false }, true)).toBe("synced");
  });

  it("is local when the counts differ or the pull request lacks the file", () => {
    expect(syncOf({ added: 4, removed: 1 }, { path: "a", additions: 3, deletions: 1, viewed: false }, true)).toBe("local");
    expect(syncOf({ added: 3, removed: 1 }, undefined, true)).toBe("local");
  });

  it("is none without a pull request", () => {
    expect(syncOf({ added: 3, removed: 1 }, undefined, false)).toBe("none");
  });
});

describe("isRead", () => {
  it("reads every hunk of a synced file GitHub shows viewed", () => {
    expect(isRead(ctx({ githubViewed: true }), items[1]!)).toBe(true);
  });

  it("otherwise reads the local mark, while the hunk's lines match it", () => {
    expect(isRead(ctx({ marks: marked(1) }), items[1]!)).toBe(true);
    expect(isRead(ctx({ marks: new Map([["src/a.ts#1", "old"]]) }), items[1]!)).toBe(false);
    expect(isRead(ctx({ sync: "local", githubViewed: true }), items[1]!)).toBe(false);
  });
});

describe("planRead", () => {
  it("marks the hunk, and the file on GitHub once every hunk of a synced file is read", () => {
    const plan = planRead(ctx({ marks: marked(0, 1) }), [2], true);
    expect(keys(plan.set)).toEqual([2]);
    expect(plan.clear).toEqual([]);
    expect(plan.github).toBe("mark");
  });

  it("marks only the hunk while others are unread", () => {
    expect(planRead(ctx(), [0], true)).toMatchObject({ github: null });
  });

  it("never touches GitHub for a file that is not synced", () => {
    expect(planRead(ctx({ sync: "local", marks: marked(0, 1) }), [2], true).github).toBeNull();
    expect(planRead(ctx({ sync: "none", marks: marked(0, 1, 2) }), [2], false).github).toBeNull();
  });

  it("unchecking a hunk of a file GitHub shows viewed keeps the others read and unmarks it there", () => {
    const plan = planRead(ctx({ githubViewed: true }), [1], false);
    expect(keys(plan.set)).toEqual([0, 2]);
    expect(keys(plan.clear)).toEqual([1]);
    expect(plan.github).toBe("unmark");
  });

  it("unchecking otherwise clears only the hunk", () => {
    const plan = planRead(ctx({ marks: marked(0, 1) }), [1], false);
    expect(plan).toEqual({ set: [], clear: [items[1]], github: null });
  });
});

describe("planFileViewed", () => {
  it("checking Viewed marks every hunk and the file on GitHub", () => {
    expect(planFileViewed(ctx(), true)).toEqual({ set: items, clear: [], github: "mark" });
  });

  it("unchecking Viewed clears every hunk and unmarks it on GitHub", () => {
    expect(planFileViewed(ctx({ githubViewed: true, marks: marked(0) }), false)).toEqual({ set: [], clear: items, github: "unmark" });
  });
});
