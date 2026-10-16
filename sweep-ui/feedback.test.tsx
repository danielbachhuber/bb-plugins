// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FeedbackList, type FeedbackEntry } from "./feedback";
import { PlainLink } from "./row";

afterEach(cleanup);

const url = "https://github.com/acme/widgets/pull/512";
const comment = (index: number): FeedbackEntry => ({
  kind: "comment",
  author: "hubber",
  avatarUrl: "",
  body: `Comment ${index}`,
  url,
  at: index,
});
const resolvedThread = (index: number): FeedbackEntry => ({
  kind: "thread",
  author: "octocat",
  avatarUrl: "",
  path: "export/csv.ts",
  line: index,
  status: "resolved",
  outdated: false,
  replies: 1,
  body: `Resolved ${index}`,
  url,
  at: index,
});

function draw(entries: FeedbackEntry[]) {
  render(<FeedbackList entries={entries} age={() => "1d ago"} url={url} Link={PlainLink} />);
}
const bodies = () => screen.queryAllByText(/^(Comment|Resolved) \d+$/).map((node) => node.textContent);

describe("FeedbackList", () => {
  it("shows every entry when there are 10 or fewer", () => {
    draw(Array.from({ length: 10 }, (_, index) => comment(index)));
    expect(bodies()).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /earlier/ })).toBeNull();
  });

  it("shows the 10 newest of a longer list, and the rest on Show earlier", () => {
    draw(Array.from({ length: 50 }, (_, index) => comment(index)));
    expect(bodies()).toEqual(Array.from({ length: 10 }, (_, index) => `Comment ${40 + index}`));
    fireEvent.click(screen.getByRole("button", { name: "Show 40 earlier" }));
    expect(bodies()).toHaveLength(50);
    expect(bodies()[0]).toBe("Comment 0");
    expect(screen.queryByRole("button", { name: /earlier/ })).toBeNull();
  });

  it("leaves hidden resolved threads out of the count", () => {
    draw([...Array.from({ length: 5 }, (_, index) => resolvedThread(index)), ...Array.from({ length: 12 }, (_, index) => comment(10 + index))]);
    expect(screen.getByRole("button", { name: "Show 2 earlier" })).toBeInTheDocument();
    expect(bodies()).toHaveLength(10);
  });
});
