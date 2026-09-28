// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelfTable, type ShelfTableProps } from "./ShelfTable";
import { FIXTURE_NOW, emptyList, fixtureList, unknownList } from "./fixtures";

afterEach(cleanup);

function renderTable(list = fixtureList(), extra: Partial<ShelfTableProps> = {}) {
  const onPublish = vi.fn();
  const onOpenPlugin = vi.fn();
  render(
    <ShelfTable
      list={list}
      providerId="claude-code"
      publishing={null}
      onPublish={onPublish}
      onOpenPlugin={onOpenPlugin}
      now={FIXTURE_NOW}
      {...extra}
    />,
  );
  return { onPublish, onOpenPlugin };
}

describe("ShelfTable", () => {
  it("groups rows under their headings in order, with counts", () => {
    renderTable();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Needs a release1", "Published2", "Personal2"]);
  });

  it("expands a row's unreleased commits and marks docs-only ones", () => {
    renderTable();
    expect(screen.queryByRole("list", { name: "Unreleased commits in Widgets" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "3 commits" }));
    const list = screen.getByRole("list", { name: "Unreleased commits in Widgets" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getAllByText("docs")).toHaveLength(1);
    const link = within(list).getAllByRole("link")[0] as HTMLAnchorElement;
    expect(link.href).toBe(`https://github.com/acme/widgets/commit/${"4f1c".repeat(10)}`);
  });

  it("offers a current plugin's docs-only changes without asking for a release", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "1 docs change" }));
    expect(screen.getByRole("list", { name: "Unreleased commits in Sprockets" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish update for Sprockets" })).toBeNull();
  });

  it("publishes the row's plugin", () => {
    const { onPublish } = renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Publish update for Widgets" }));
    expect(onPublish).toHaveBeenCalledWith("widgets");
  });

  it("says which provider Publish will use", () => {
    renderTable();
    expect(
      screen.getByText(/Publish update starts a claude-code thread running publish-plugin-update/),
    ).toBeTruthy();
  });

  it("offers a Start thread button on every row, in every group", () => {
    const onStartThread = vi.fn();
    renderTable(fixtureList(), { onStartThread });
    const buttons = screen.getAllByRole("button", { name: /^Start a thread on / });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Start a thread on Widgets",
      "Start a thread on Gadgets",
      "Start a thread on Sprockets",
      "Start a thread on Gizmos",
      "Start a thread on Doohickeys",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Start a thread on Gizmos" }));
    expect(onStartThread).toHaveBeenCalledWith("gizmos");
  });

  it("disables Publish while that plugin's publish is in flight", () => {
    renderTable(fixtureList(), { publishing: "widgets" });
    const button = screen.getByRole("button", { name: "Publish update for Widgets" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows flags under the name", () => {
    renderTable();
    expect(screen.getByText("package.json says 0.1.3")).toBeTruthy();
    expect(screen.getByText("id taken by another source")).toBeTruthy();
  });

  it("opens installed plugins only", () => {
    const { onOpenPlugin } = renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Gizmos" }));
    expect(onOpenPlugin).toHaveBeenCalledWith("gizmos");
    expect(screen.queryByRole("button", { name: "Doohickeys" })).toBeNull();
    expect(screen.getByText("not installed")).toBeTruthy();
  });

  it("shows names as plain text when there is nowhere to open them", () => {
    render(
      <ShelfTable list={fixtureList()} providerId="claude-code" publishing={null} onPublish={vi.fn()} now={FIXTURE_NOW} />,
    );
    expect(screen.queryByRole("button", { name: "Gizmos" })).toBeNull();
    expect(screen.getByText("Gizmos")).toBeTruthy();
  });

  it("shows the release without its tag prefix", () => {
    renderTable();
    expect(screen.getByText("v0.1.2")).toBeTruthy();
  });

  it("says when it last checked", () => {
    renderTable();
    expect(screen.getByText(/Checked 4 minutes ago/)).toBeTruthy();
  });

  it("says why when the marketplace is unreachable", () => {
    renderTable(unknownList());
    expect(screen.getByText(/fetch failed/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Personal/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Unknown/ })).toBeTruthy();
  });

  it("does not blame the marketplace when GitHub was what failed", () => {
    const list = unknownList();
    renderTable({ ...list, marketplaceError: null, fetchError: "could not resolve host" });
    expect(screen.getByText(/Could not reach GitHub: could not resolve host/)).toBeTruthy();
    expect(screen.queryByText(/marketplace unreachable/i)).toBeNull();
  });

  it("shows the empty reason when there is no checkout", () => {
    renderTable(emptyList());
    expect(screen.getByText(/is not inside a git checkout/)).toBeTruthy();
  });
});
