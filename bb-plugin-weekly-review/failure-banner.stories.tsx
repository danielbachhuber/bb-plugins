// The banner at the top of the Weekly Review page when a gather fails. The
// errors are invented, in the shape the CLIs print them.
import { FailureBanner } from "./review/failure-banner";

export default {
  title: "weekly-review/FailureBanner",
};

const NOW = new Date(2026, 8, 9, 15, 0);

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl px-5 pt-4">{children}</div>;
}

/** One source has never gathered this week, so the page has nothing from it. */
export const NeverGathered = () => (
  <Page>
    <FailureBanner
      now={NOW}
      failing={[
        {
          name: "Harvest",
          error:
            "`hrvst time-entries list` failed: Your authentication token is either expired or invalid. Run `hrvst login` to reauthenticate.",
          lastOkAt: null,
        },
      ]}
    />
  </Page>
);

/**
 * Two sources failed on the latest run. One is showing this morning's data;
 * the other has nothing yet.
 */
export const TwoSources = () => (
  <Page>
    <FailureBanner
      now={NOW}
      failing={[
        {
          name: "GitHub",
          error: "`gh search prs` failed: HTTP 401: Bad credentials (https://api.github.com/search/issues)",
          lastOkAt: new Date(2026, 8, 9, 7, 1).toISOString(),
        },
        {
          name: "Todoist",
          error: "`td task list` failed: not logged in. Run `td auth login`.",
          lastOkAt: null,
        },
      ]}
    />
  </Page>
);
