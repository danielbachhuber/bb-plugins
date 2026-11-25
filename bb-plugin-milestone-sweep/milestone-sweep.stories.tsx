import { MilestoneList } from "./milestones/list-view";
import { MilestonePage } from "./milestones/milestone-page";
import type { ReactNode } from "react";
import type { ThreadStatus } from "@danielbachhuber/bb-plugin-component-library/thread-status";
import { ThreadStatusContext } from "@danielbachhuber/bb-plugin-component-library/item-row";

import { listingFor, milestonePageFor } from "./milestones/fixtures";

export default {
  title: "milestone-sweep/Page",
};

const NOW = new Date(2026, 10, 25, 9, 30).getTime();

/** What the fixture rows' threads are doing, as bb's sidebar would say. */
function Threads({ children }: { children: ReactNode }) {
  const status = (id: string | null): ThreadStatus | null =>
    id === "thr_working"
      ? { id, title: "Sprocket export drops the last row (#1409)", live: "working" }
      : id === "thr_needs_you"
        ? { id, title: "Add keyboard shortcuts to the widget editor (#1411)", live: "needs-you" }
        : null;
  return <ThreadStatusContext.Provider value={status}>{children}</ThreadStatusContext.Provider>;
}

/** Every open milestone in each repository checked out here, due soonest first, with the repositories that have none named at the end. */
export const Milestones = () => <MilestoneList listing={listingFor(NOW)} onOpenMilestone={() => {}} now={NOW} />;

/** Before the first sync has finished. */
export const FirstSync = () => (
  <MilestoneList listing={{ ...listingFor(NOW), syncedAt: null, repositories: [] }} onOpenMilestone={() => {}} now={NOW} />
);

/** A repository that could not be read on the last sync keeps the milestones read before, flagged beside its name. */
export const SyncFailed = () => {
  const listing = listingFor(NOW);
  return (
    <MilestoneList
      listing={{
        ...listing,
        repositories: listing.repositories.map((repository) =>
          repository.repo === "acme/widgets" ? { ...repository, error: "HTTP 502" } : repository,
        ),
      }}
      onOpenMilestone={() => {}}
      now={NOW}
    />
  );
};

/** A milestone's page, opened from its row: past due, with where each open issue stands and its history since it was created. Each issue row starts or opens a thread and copies its link; two already have a thread. */
export const Milestone = () => (
  <Threads>
    <MilestonePage repo="acme/widgets" number={14} data={milestonePageFor(NOW)} onBack={() => {}} onThread={() => {}} now={NOW} />
  </Threads>
);

/** The same milestone with its closed issues opened under the open ones. */
export const MilestoneClosedOpen = () => (
  <Threads>
    <MilestonePage repo="acme/widgets" number={14} data={milestonePageFor(NOW)} onBack={() => {}} onThread={() => {}} now={NOW} initialShowClosed />
  </Threads>
);

/** A milestone that closed since the last sync. */
export const MilestoneGone = () => (
  <MilestonePage
    repo="acme/widgets"
    number={21}
    data={{ ...milestonePageFor(NOW), milestone: null, open: [], closed: [], history: { at: [], total: [], closed: [] } }}
    onBack={() => {}}
    onThread={() => {}}
    now={NOW}
  />
);
