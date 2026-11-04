// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { installTestPluginRuntime, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { BatchDialog, OPEN_LIMIT } from "./batch-dialog";

// The dialog draws bb's own Icon, which needs the runtime bb normally provides.
beforeAll(installTestPluginRuntime);
afterEach(cleanup);

const rows = Array.from({ length: OPEN_LIMIT + 2 }, (_, index) => ({
  number: 100 + index,
  title: `Widget ${index}`,
  url: `https://github.com/acme/widgets/issues/${100 + index}`,
  threadId: null,
}));

describe("BatchDialog", () => {
  it("opens the first picked links through bb's link setting", () => {
    const slot = renderSlot(
      {
        component: () => (
          <BatchDialog
            kind="issue"
            open
            heading="Open issues"
            rows={rows}
            error={null}
            projectId={null}
            limit={50}
            onClose={vi.fn()}
            onStart={vi.fn()}
          />
        ),
      },
      {},
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick every issue" }));
    fireEvent.click(screen.getByRole("button", { name: "Open on GitHub" }));
    expect(slot.navigateCalls).toEqual(rows.slice(0, OPEN_LIMIT).map((row) => ({ method: "openUrl", url: row.url })));
  });
});
