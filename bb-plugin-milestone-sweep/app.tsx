import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useRealtime,
  useRpc,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { SyncStatus } from "@danielbachhuber/bb-plugin-component-library/sync-status";
import { useLastValue } from "@danielbachhuber/bb-plugin-component-library/last-value";
import { StartThreadContext, ThreadStatusContext } from "@danielbachhuber/bb-plugin-component-library/item-row";
import { useStartThreadBox, type StartThreadDraft } from "@danielbachhuber/bb-plugin-component-library/start-thread";
import { useThreadStatus } from "@danielbachhuber/bb-plugin-component-library/thread-status";

import type { rpcContract } from "./server.js";
import type { Listing, MilestonePageData } from "./milestones/contract.js";
import { MilestoneList } from "./milestones/list-view.js";
import { MilestonePage } from "./milestones/milestone-page.js";

const PANEL_PATH = "milestones";
const CHANNEL = "milestones-updated";

/** `<owner>/<name>/<number>` is one milestone's page; anything else is the list. */
export function milestoneFrom(subPath: string): { repo: string; number: number } | null {
  const match = /^([^/]+)\/([^/]+)\/(\d+)\/?$/.exec(subPath);
  return match ? { repo: `${match[1]}/${match[2]}`, number: Number(match[3]) } : null;
}

/** The stored listing. The page opens on the one it last read, so it draws at once. */
function useListing() {
  const rpc = useRpc<typeof rpcContract>();
  const [listing, setListing] = useLastValue<Listing>("bb-plugin-milestone-sweep:listing");
  const load = useCallback(async () => {
    setListing(await rpc.call("list", null));
  }, [rpc, setListing]);
  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(CHANNEL, () => {
    void load();
  });
  return { listing, reload: load, rpc };
}

function SyncHeader() {
  const { listing, reload, rpc } = useListing();
  const [busy, setBusy] = useState(false);
  const onRefresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await rpc.call("refresh", null);
      if (!result.ok) toast.error(result.error ?? "Sync failed.");
      await reload();
    } finally {
      setBusy(false);
    }
  }, [reload, rpc]);
  return <SyncStatus syncedAt={listing?.syncedAt ?? null} usage={listing?.usage} busy={busy} onRefresh={() => void onRefresh()} />;
}

function MilestoneScreen({ repo, number, onBack }: { repo: string; number: number; onBack: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<MilestonePageData | null>(null);
  const load = useCallback(async () => {
    setData(await rpc.call("milestone", { repo, number }));
  }, [rpc, repo, number]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  useRealtime(CHANNEL, () => {
    void load();
  });

  // A thread starts in the project checked out from the repository, or the
  // one the page was opened from; bb's composer has its own picker for the rest.
  const navigate = useBbNavigate();
  const { projectId: openedFrom } = useBbContext();
  const [repositoryProject, setRepositoryProject] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    rpc.call("repository_project", { repo }).then(
      ({ projectId }) => live && setRepositoryProject(projectId),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [rpc, repo]);
  const projectId = repositoryProject ?? openedFrom ?? null;

  type Issue = { number: number; title: string; url: string };
  const box = useStartThreadBox<StartThreadDraft & { issue: Issue }>({
    navigate,
    submit: async ({ issue }, request) =>
      rpc.call("start_thread", {
        repo,
        number: issue.number,
        title: `${issue.title} (#${issue.number})`,
        request: request as unknown as Record<string, unknown>,
      }),
    announcement: ({ issue }) => `Started a thread for #${issue.number}`,
  });
  const onThread = useCallback(
    (issue: Issue, threadId: string | null) => {
      if (threadId !== null) {
        navigate.toThread(threadId);
        return;
      }
      box.toggle({
        key: String(issue.number),
        draftKey: `milestone-sweep:${repo.toLowerCase()}:${issue.number}`,
        issue,
        seed: {
          projectId,
          prompt: `Work on issue #${issue.number}, "${issue.title}".\n\n${issue.url}\n`,
          preview: { title: issue.title, number: issue.number, url: issue.url, meta: data?.milestone ? `In ${repo} milestone ${data.milestone.title}` : null },
        },
      });
    },
    [box, navigate, projectId, repo, data?.milestone?.title],
  );
  const startRows = useMemo(
    () => ({
      boxFor: (n: number) => box.boxFor(String(n)),
      isStarting: (n: number) => box.isStarting(String(n)),
      startedThread: (n: number) => box.startedThread(String(n)),
    }),
    [box],
  );
  const threadStatus = useThreadStatus();

  return (
    <ThreadStatusContext.Provider value={threadStatus}>
      <StartThreadContext.Provider value={startRows}>
        <MilestonePage repo={repo} number={number} data={data} onBack={onBack} onThread={onThread} />
      </StartThreadContext.Provider>
    </ThreadStatusContext.Provider>
  );
}

function Panel({ subPath }: PluginNavPanelProps) {
  const navigate = useBbNavigate();
  const { listing } = useListing();
  const open = milestoneFrom(subPath);
  if (open !== null) {
    return (
      <MilestoneScreen
        repo={open.repo}
        number={open.number}
        onBack={() => navigate.toPluginPanel(PANEL_PATH, { subPath: "" })}
      />
    );
  }
  return (
    <MilestoneList
      listing={listing}
      onOpenMilestone={(repo, number) => navigate.toPluginPanel(PANEL_PATH, { subPath: `${repo}/${number}` })}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "milestones",
    title: "Milestones",
    icon: "milestone-sweep/milestone",
    path: PANEL_PATH,
    component: Panel,
    headerContent: SyncHeader,
  });
});
