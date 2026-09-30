// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SweepRow, type SweepRowProps } from "./row";
import type { SweepItem } from "./types";

afterEach(cleanup);

const item: SweepItem = {
  key: "acme/widgets#1",
  runId: "now",
  title: "Widget rotation drifts after a resize",
  url: "https://github.com/acme/widgets/issues/1",
  number: 1,
  newComments: 0,
  flags: [],
  facts: ["3h ago"],
  parent: null,
  note: null,
  stage: 0,
};

function draw(overrides: Partial<SweepRowProps> = {}) {
  render(
    <ul>
      <SweepRow
        item={item}
        tier="now"
        open
        stages={[{ name: "Ready", color: "bg-emerald-500" }]}
        actions={<button type="button">Start thread</button>}
        trailing={<span>clock</span>}
        editing={false}
        onEditNote={() => {}}
        onNoteSave={async () => true}
        onNoteCancel={() => {}}
        renderTrack={() => <div data-testid="track">track</div>}
        {...overrides}
      />
    </ul>,
  );
  const track = screen.getByTestId("track");
  const actionLine = screen.getByRole("button", { name: "Start thread" }).parentElement!;
  return { track, actionLine };
}

describe("SweepRow track placement", () => {
  it("draws the track as a column beside everything by default", () => {
    const { track, actionLine } = draw();
    expect(track.parentElement).toBe(screen.getByRole("listitem"));
    expect(track.parentElement!.contains(actionLine)).toBe(true);
  });

  it("puts the track beside the title only in the header, so the action line runs underneath", () => {
    const { track, actionLine } = draw({ trackPlacement: "header" });
    expect(track.parentElement!.contains(screen.getByRole("link", { name: item.title }))).toBe(true);
    expect(track.parentElement!.contains(actionLine)).toBe(false);
  });

  it("gives the track its own line before the action line when below", () => {
    const { track, actionLine } = draw({ trackPlacement: "below" });
    expect(track.parentElement!.contains(screen.getByRole("link", { name: item.title }))).toBe(false);
    expect(track.compareDocumentPosition(actionLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
