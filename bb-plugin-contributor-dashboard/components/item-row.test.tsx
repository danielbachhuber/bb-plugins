// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ItemRow } from "./item-row";

// The row draws bb's own Icon, which needs the runtime bb normally provides.
beforeAll(installTestPluginRuntime);
afterEach(cleanup);

const row = {
  number: 1796,
  title: "Rebuild the gadget importer",
  url: "https://github.com/acme/widgets/pull/1796",
  facts: <span>since 5 weeks ago</span>,
};

describe("ItemRow", () => {
  it("offers to start a thread when the row has none", () => {
    const onThread = vi.fn();
    render(<ItemRow {...row} assignees={[]} threadId={null} onThread={onThread} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a thread" }));
    expect(onThread).toHaveBeenCalled();
  });

  it("offers to open the thread once the row has one", () => {
    render(<ItemRow {...row} assignees={[]} threadId="thr_1" onThread={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open the thread" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Start a thread" })).toBeNull();
  });

  it("says nobody is assigned, which is the common case", () => {
    render(<ItemRow {...row} assignees={[]} threadId={null} onThread={vi.fn()} />);
    expect(screen.getByTitle("Nobody assigned")).not.toBeNull();
  });

  it("names every assignee on the group, and draws at most three", () => {
    render(<ItemRow {...row} assignees={["mona", "hubber", "spacecat", "webcat"]} threadId={null} onThread={vi.fn()} />);
    const group = screen.getByTitle("mona, hubber, spacecat, webcat");
    expect(group.childElementCount).toBe(3);
  });

  it("leaves the assignee out where the list is already about one person", () => {
    render(<ItemRow {...row} threadId={null} onThread={vi.fn()} />);
    expect(screen.queryByTitle("Nobody assigned")).toBeNull();
  });

  it("links the title to GitHub", () => {
    render(<ItemRow {...row} assignees={[]} threadId={null} onThread={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Rebuild the gadget importer/ }).getAttribute("href")).toBe(row.url);
  });
});
