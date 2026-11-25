// The Milestones page: every repository's open milestones, a table each,
// due soonest first. Display only.
import type { ReactNode } from "react";
import { MilestonesLegend, MilestonesTable } from "@danielbachhuber/bb-plugin-component-library/milestones";

import type { Listing } from "./contract";

export function MilestoneList({
  listing,
  onOpenMilestone,
  now = Date.now(),
}: {
  /** Null until the first read lands. */
  listing: Listing | null;
  onOpenMilestone: (repo: string, number: number) => void;
  now?: number;
}) {
  if (listing === null) {
    return <Page>{<p className="text-sm text-muted-foreground">Reading milestones…</p>}</Page>;
  }
  const withMilestones = listing.repositories.filter((repository) => repository.milestones.length > 0);
  const without = listing.repositories.filter((repository) => repository.milestones.length === 0 && repository.error === null);
  const failed = listing.repositories.filter((repository) => repository.error !== null && repository.milestones.length === 0);
  return (
    <Page>
      {listing.lastError === null ? null : (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {listing.lastError}
        </p>
      )}
      {listing.repositories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {listing.syncedAt === null
            ? "Reading milestones…"
            : "No repositories to list. Add a bb project with a GitHub remote, or name repositories in the plugin's settings."}
        </p>
      ) : withMilestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open milestones in the repositories checked out here.</p>
      ) : (
        <>
          <MilestonesLegend periodLabel={listing.periodLabel} />
          {withMilestones.map((repository) => (
            <section key={repository.repo} className="mt-6">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                <a
                  href={`https://github.com/${repository.repo}/milestones`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {repository.repo}
                </a>
                <span className="font-normal tabular-nums text-muted-foreground">{repository.milestones.length}</span>
                {repository.error === null ? null : (
                  <span className="text-xs font-normal text-destructive" title={repository.error}>
                    could not sync; showing the last read
                  </span>
                )}
              </h2>
              <MilestonesTable
                milestones={repository.milestones}
                periodLabel={listing.periodLabel}
                onOpenMilestone={(number) => onOpenMilestone(repository.repo, number)}
                now={now}
                perPage={0}
                legend={false}
                fixedColumns
              />
            </section>
          ))}
        </>
      )}
      {without.length === 0 && failed.length === 0 ? null : (
        <div className="mt-6 space-y-1 text-xs text-muted-foreground">
          {without.length === 0 ? null : <p>No open milestones: {without.map((repository) => repository.repo).join(", ")}.</p>}
          {failed.length === 0 ? null : (
            <p className="text-destructive">
              Could not read: {failed.map((repository) => `${repository.repo} (${repository.error})`).join(", ")}.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">{children}</div>
    </div>
  );
}
