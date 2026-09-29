// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  ChecksBadge,
  DiffCount,
  PullRequestIcon,
  ReviewerStack,
  checksGlyph,
  checksLabel,
  githubAvatar,
  type ChecksSummary,
  type Reviewer,
  type ReviewerTooltipProps,
} from "./pull-request";

afterEach(cleanup);

const NONE: ChecksSummary = { pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 0 };
const GREEN: ChecksSummary = { pass: 4, fail: 0, skip: 1, pending: 0, cancelled: 0, total: 5 };

describe("githubAvatar", () => {
  it("links GitHub's small picture for the owner", () => {
    expect(githubAvatar("octocat")).toBe("https://github.com/octocat.png?size=40");
  });
});

describe("checksGlyph", () => {
  it("counts passing checks out of those that ran, leaving skips out", () => {
    expect(checksGlyph(GREEN)).toEqual({ tone: "passed", text: "4/4" });
  });

  it("counts failing checks when any fail", () => {
    expect(checksGlyph({ pass: 5, fail: 2, skip: 1, pending: 0, cancelled: 0, total: 8 })).toEqual({
      tone: "failed",
      text: "2/7 failing",
    });
  });

  it("counts cancelled checks as failing, never as a green tick", () => {
    expect(checksGlyph({ pass: 6, fail: 0, skip: 0, pending: 0, cancelled: 1, total: 7 })).toEqual({
      tone: "failed",
      text: "1/7 cancelled",
    });
  });

  it("marks checks still running", () => {
    expect(checksGlyph({ pass: 2, fail: 0, skip: 0, pending: 3, cancelled: 0, total: 5 })).toEqual({
      tone: "running",
      text: "2/5",
    });
  });

  it("is null when the pull request has no checks", () => {
    expect(checksGlyph(NONE)).toBeNull();
    expect(checksGlyph({ ...NONE, skip: 2, total: 2 })).toBeNull();
  });
});

describe("checksLabel", () => {
  it("leads with the counts that matter and leaves out zeroes", () => {
    expect(checksLabel({ pass: 7, fail: 2, skip: 0, pending: 1, cancelled: 0, total: 10 })).toBe(
      "2 fail, 1 running, 7 pass",
    );
  });

  it("says so when there are no checks", () => {
    expect(checksLabel(NONE)).toBe("no checks");
  });
});

describe("PullRequestIcon", () => {
  it("draws an open pull request in green and a draft muted", () => {
    render(
      <>
        <PullRequestIcon draft={false} />
        <PullRequestIcon draft />
      </>,
    );
    expect(screen.getByLabelText("Open pull request")).toHaveClass("text-success");
    expect(screen.getByLabelText("Draft pull request")).toHaveClass("text-muted-foreground");
  });
});

const REVIEWERS: Reviewer[] = [
  { login: "octocat", state: "pending", team: false, avatarUrl: githubAvatar("octocat") },
  { login: "acme/reviewers", state: "approved", team: true, avatarUrl: githubAvatar("acme") },
];

describe("ReviewerStack", () => {
  it("names every reviewer and their review for assistive technology", () => {
    render(<ReviewerStack reviewers={REVIEWERS} />);
    expect(
      screen.getByRole("img", { name: "Reviewers: octocat review pending, @acme/reviewers approved" }),
    ).toBeInTheDocument();
  });

  it("draws a team square and a person round", () => {
    const { container } = render(<ReviewerStack reviewers={REVIEWERS} />);
    const [person, team] = Array.from(container.querySelectorAll("img"));
    expect(person).toHaveAttribute("src", "https://github.com/octocat.png?size=40");
    expect(person).toHaveClass("rounded-full");
    expect(team).toHaveAttribute("src", "https://github.com/acme.png?size=40");
    expect(team).toHaveClass("rounded-[4px]");
  });

  it("falls back to a native title on each avatar", () => {
    render(<ReviewerStack reviewers={REVIEWERS} />);
    expect(screen.getByTitle("octocat review pending")).toBeInTheDocument();
    expect(screen.getByTitle("@acme/reviewers approved")).toBeInTheDocument();
  });

  it("wraps each avatar in the plugin's tooltip when one is passed", () => {
    function Labelled({ label, children }: ReviewerTooltipProps) {
      return (
        <span data-testid="tooltip">
          <span data-testid="label">{label}</span>
          {children}
        </span>
      );
    }
    render(<ReviewerStack reviewers={REVIEWERS} Tooltip={Labelled} />);
    expect(screen.getAllByTestId("tooltip")).toHaveLength(2);
    expect(screen.getAllByTestId("label").map((label) => label.textContent)).toEqual([
      "octocat review pending",
      "@acme/reviewers approved",
    ]);
    expect(screen.queryByTitle("octocat review pending")).toBeNull();
  });
});

describe("ChecksBadge", () => {
  it("draws passing checks with a green tick and every count on hover", () => {
    const { container } = render(<ChecksBadge checks={GREEN} />);
    const badge = container.querySelector('[data-part="checks"]')!;
    expect(badge).toHaveTextContent("4/4");
    expect(badge).toHaveAttribute("title", "4 pass, 1 skip");
    expect(badge.querySelector('[data-icon="CircleCheck"]')).toHaveClass("text-success");
  });

  it("draws failing checks in red and running ones with a clock", () => {
    const { container, rerender } = render(<ChecksBadge checks={{ ...GREEN, fail: 1, total: 6 }} />);
    expect(container.querySelector('[data-icon="CircleX"]')).toHaveClass("text-destructive-text");
    expect(screen.getByText("1/5 failing")).toHaveClass("text-destructive-text");
    rerender(<ChecksBadge checks={{ ...GREEN, pending: 2, total: 7 }} />);
    expect(container.querySelector('[data-icon="Clock"]')).not.toBeNull();
  });

  it("draws nothing when the pull request has no checks", () => {
    const { container } = render(<ChecksBadge checks={NONE} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DiffCount", () => {
  it("draws additions in green and deletions in red, with a minus sign", () => {
    const { container } = render(<DiffCount additions={128} deletions={12} />);
    expect(container.querySelector('[data-part="diff"]')).toHaveTextContent("+128 −12");
    expect(screen.getByText("+128")).toHaveClass("text-success");
    expect(screen.getByText("−12")).toHaveClass("text-destructive-text");
  });
});
