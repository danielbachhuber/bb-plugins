// bb-plugin-contributor-dashboard — the Contributor Dashboard page.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useRpc,
  useRealtime,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";

import { SyncStatus as SyncStatusBar } from "@danielbachhuber/bb-plugin-component-library/sync-status";

import { DashboardView } from "@/components/dashboard-view";
import { PersonView } from "@/components/person-view";
import { StageView } from "@/components/stage-view";
import { OpenItemsView } from "@/components/open-items-view";
import { BatchDialog } from "@/components/batch-dialog";
import { describeFilters } from "@/components/list-toolbar";

import type { rpcContract } from "./server";
import {
  BATCH_LIMIT,
  DASHBOARD_CHANNEL,
  type OpenItem,
  type OpenItemsResult,
  type OpenQuery,
  type PeopleActivityResult,
  type PersonActivityResult,
  STAGE_KEYS,
  type StageDetailResult,
  type StageKey,
  type SyncStatus,
} from "./dashboard/contract.js";
import { rangeOf, selectionWords, type Selection } from "./dashboard/period.js";
import { announceStartedThread, useStartThreadBox, type StartThreadDraft } from "@danielbachhuber/bb-plugin-component-library/start-thread";
import { DEFAULT_QUERY } from "./review/open-items.js";
import { batchTitle, promptFor, type ThreadSeed } from "./components/thread-seed.js";
import { rememberedScreen, rememberedSelection, rememberScreen, rememberSelection } from "./dashboard/remember.js";
import { useThreadStatus } from "@danielbachhuber/bb-plugin-component-library/thread-status";
import { StartThreadContext, ThreadStatusContext } from "./components/item-row";

const PANEL_PATH = "contributor-dashboard";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** `person/<login>` and `stage/<key>` are the sub-paths; anything else is the dashboard. */
function personFrom(subPath: string): string | null {
  const match = /^person\/([^/]+)\/?$/.exec(subPath);
  return match === null ? null : decodeURIComponent(match[1]);
}

/** `issues` and `pulls` list everything open of that kind. */
function listFrom(subPath: string): "issue" | "pull" | null {
  const match = /^(issues|pulls)\/?$/.exec(subPath);
  if (match === null) return null;
  return match[1] === "issues" ? "issue" : "pull";
}

function stageFrom(subPath: string): StageKey | null {
  const match = /^stage\/([^/]+)\/?$/.exec(subPath);
  const key = match === null ? null : decodeURIComponent(match[1]);
  return STAGE_KEYS.find((stage) => stage === key) ?? null;
}

/**
 * Reads the page's data and re-reads it whenever a sync stores more. The
 * request is by period, and by login on a person's page; both read the local
 * mirror only.
 */
function useDashboardData<T>(call: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    call().then(
      (result) => {
        setData(result);
        setError(null);
      },
      (cause) => setError(messageOf(cause)),
    );
    // The caller's `call` closes over the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(load, [load]);
  useRealtime(DASHBOARD_CHANNEL, load);
  return { data, error, reload: load };
}

/**
 * The sync line and its button in the panel's title bar, where the other
 * plugins put theirs.
 *
 * Mounted separately from the page, so it reads the sync state on its own
 * rather than the whole dashboard payload. Both mounts re-read on the same
 * realtime event, so a sync started here updates the page too.
 */
function SyncHeader() {
  const rpc = useRpc<typeof rpcContract>();
  const { data, reload } = useDashboardData<SyncStatus | null>(
    () => rpc.call("sync_status", null),
    [rpc],
  );
  const sync = useCallback(() => {
    rpc.call("sync_now", null).then(reload, () => undefined);
  }, [rpc, reload]);

  if (data === null) return null;
  return <SyncStatusBar syncedAt={data.syncedAt} busy={data.running} onRefresh={sync} usage={data.usage} />;
}

function ContributorDashboardPage({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [selection, setSelection] = useState<Selection>(rememberedSelection);
  const [authoredPage, setAuthoredPage] = useState(0);
  const [waitingPage, setWaitingPage] = useState(0);
  // A shorter span has fewer pages; the server clamps, and this follows it
  // back to the first page rather than leaving a stale number in hand.
  const choose = useCallback((next: Selection) => {
    setAuthoredPage(0);
    setWaitingPage(0);
    setSelection(next);
    rememberSelection(next);
  }, []);
  // A preset is measured from now, so it is resolved once per choice rather
  // than on every render, which would reload the page on every render too.
  const range = useMemo(() => rangeOf(selection, Date.now()), [selection]);
  // bb keeps the page mounted while its sub-path changes and remounts it when
  // it is opened from elsewhere, which always arrives at the top. So the
  // remembered screen is restored on mount only, and Back to the dashboard
  // still lands there.
  const [restoring, setRestoring] = useState(() => {
    if (subPath !== "") return null;
    const remembered = rememberedScreen();
    return personFrom(remembered) !== null || stageFrom(remembered) !== null || listFrom(remembered) !== null
      ? remembered
      : null;
  });
  useEffect(() => {
    if (restoring !== null) navigate.toPluginPanel(PANEL_PATH, { subPath: restoring, replace: true });
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Until the redirect lands, show the remembered screen rather than a flash
  // of the dashboard; after it, follow the sub-path again.
  useEffect(() => {
    if (subPath !== "") setRestoring(null);
  }, [subPath]);
  const shown = restoring ?? subPath;
  useEffect(() => rememberScreen(shown), [shown]);
  const login = personFrom(shown);
  const stage = stageFrom(shown);
  const list = listFrom(shown);
  const [listPage, setListPage] = useState(0);
  const [listQuery, setListQuery] = useState<OpenQuery>(DEFAULT_QUERY);
  // A changed filter or sort starts the list over from its first page.
  const query = useCallback((next: OpenQuery) => {
    setListPage(0);
    setListQuery(next);
  }, []);
  // Batch reads every matching row when it opens, not with each page.
  const [batch, setBatch] = useState<{ rows: OpenItem[] | null; error: string | null } | null>(null);
  const { projectId: openedFrom } = useBbContext();
  // The project checked out from the repository comes first, so a thread
  // starts where the code is, whichever project the page was opened from.
  // Read once per open, not on each sync event, since it lists every project.
  const [repositoryProject, setRepositoryProject] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    rpc.call("repository_project", null).then(
      ({ projectId }) => live && setRepositoryProject(projectId),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [rpc]);
  const projectId = repositoryProject ?? openedFrom ?? null;
  const box = useStartThreadBox<StartThreadDraft & { thread: ThreadSeed }>({
    navigate,
    submit: async ({ thread }, request) => {
      const { threadId } = await rpc.call("start_thread", {
        kind: thread.kind,
        number: thread.number,
        title: `${thread.title} (#${thread.number})`,
        request: request as unknown as Record<string, unknown>,
      });
      return { threadId };
    },
    announcement: ({ thread }) => `Started a thread for #${thread.number}`,
  });

  // A row with a thread opens it; one without opens bb's composer under the
  // row, which owns the provider, environment and branch choices, or closes it
  // when it is already open there. It opens with no project too, when no
  // project is checked out from the repository and the page was opened from
  // outside one: the composer has its own picker.
  const onThread = useCallback(
    (next: ThreadSeed, threadId: string | null) => {
      if (threadId !== null) {
        navigate.toThread(threadId);
        return;
      }
      box.toggle({
        key: String(next.number),
        draftKey: `contributor-dashboard:${next.kind}:${next.number}`,
        thread: next,
        seed: {
          projectId,
          prompt: promptFor(next),
          preview: { title: next.title, number: next.number, url: next.url, meta: next.meta },
        },
      });
    },
    [box, navigate, projectId],
  );

  const dashboard = useDashboardData<PeopleActivityResult | null>(
    () => (login === null && stage === null && list === null ? rpc.call("people_activity", { range }) : Promise.resolve(null)),
    [rpc, range, login, stage, list],
  );
  const openList = useDashboardData<OpenItemsResult | null>(
    () => (list === null ? Promise.resolve(null) : rpc.call("open_items", { kind: list, page: listPage, query: listQuery })),
    [rpc, list, listPage, listQuery],
  );
  const stageDetail = useDashboardData<StageDetailResult | null>(
    () => (stage === null ? Promise.resolve(null) : rpc.call("stage_detail", { stage, range, waitingPage })),
    [rpc, range, stage, waitingPage],
  );
  const person = useDashboardData<PersonActivityResult | null>(
    () => (login === null ? Promise.resolve(null) : rpc.call("person_activity", { login, range, authoredPage })),
    [rpc, range, login, authoredPage],
  );

  const openPerson = useCallback(
    (who: string) => {
      setAuthoredPage(0);
      navigate.toPluginPanel(PANEL_PATH, { subPath: `person/${encodeURIComponent(who)}` });
    },
    [navigate],
  );
  const openStage = useCallback(
    (which: StageKey) => {
      setWaitingPage(0);
      navigate.toPluginPanel(PANEL_PATH, { subPath: `stage/${which}` });
    },
    [navigate],
  );
  const openItemsList = useCallback(
    (kind: "issue" | "pull") => {
      setListPage(0);
      setListQuery(DEFAULT_QUERY);
      navigate.toPluginPanel(PANEL_PATH, { subPath: kind === "issue" ? "issues" : "pulls" });
    },
    [navigate],
  );
  const back = useCallback(() => navigate.toPluginPanel(PANEL_PATH), [navigate]);
  const startRows = useMemo(
    () => ({
      boxFor: (number: number) => box.boxFor(String(number)),
      isStarting: (number: number) => box.isStarting(String(number)),
      startedThread: (number: number) => box.startedThread(String(number)),
    }),
    [box],
  );
  if (list !== null) {
    const openBatch = () => {
      setBatch({ rows: null, error: null });
      rpc.call("open_items_matching", { kind: list, query: listQuery }).then(
        ({ rows }) => setBatch((current) => (current === null ? null : { rows, error: null })),
        (cause) => setBatch((current) => (current === null ? null : { rows: [], error: messageOf(cause) })),
      );
    };
    const heading = describeFilters(list, listQuery);
    return (
      <StartThreadContext.Provider value={startRows}>
        <OpenItemsView
          kind={list}
          data={openList.data}
          error={openList.error}
          onBack={back}
          onOpenPerson={openPerson}
          onPage={setListPage}
          onThread={onThread}
          query={listQuery}
          onQuery={query}
          onBatch={openBatch}
          batch={
            <BatchDialog
              kind={list}
              open={batch !== null}
              heading={heading}
              rows={batch?.rows ?? null}
              error={batch?.error ?? null}
              projectId={projectId}
              limit={BATCH_LIMIT}
              onClose={() => setBatch(null)}
              onStart={async (rows, request) => {
                const started = await rpc.call("start_batch", {
                  kind: list,
                  title: batchTitle(list, rows.map((row) => row.number)),
                  rows: rows.map(({ number, title, url }) => ({ number, title, url })),
                  request: request as unknown as Record<string, unknown>,
                });
                setBatch(null);
                const failed = started.failed.length === 0 ? "" : `; ${started.failed.length} could not start`;
                announceStartedThread(navigate, started.threadId, `Started a main thread and ${started.subthreads.length} subthreads${failed}`);
              }}
            />
          }
        />
      </StartThreadContext.Provider>
    );
  }
  if (stage !== null) {
    return (
      <StartThreadContext.Provider value={startRows}>
        <StageView
          selection={selection}
          onSelect={choose}
          data={stageDetail.data}
          error={stageDetail.error}
          onBack={back}
          onOpenPerson={openPerson}
          onWaitingPage={setWaitingPage}
          periodLabel={selectionWords(selection)}
          onThread={onThread}
        />
      </StartThreadContext.Provider>
    );
  }
  if (login !== null) {
    return (
      <StartThreadContext.Provider value={startRows}>
        <PersonView
          login={login}
          selection={selection}
          onSelect={choose}
          data={person.data}
          error={person.error}
          onBack={back}
          onOpenPerson={openPerson}
          onAuthoredPage={setAuthoredPage}
          onThread={onThread}
        />
      </StartThreadContext.Provider>
    );
  }
  return (
    <DashboardView
      selection={selection}
      onSelect={choose}
      data={dashboard.data}
      error={dashboard.error}
      onOpenPerson={openPerson}
      onOpenStage={openStage}
      onOpenList={openItemsList}
      onLoadOlderReleases={(before, count) => rpc.call("older_releases", { before, count })}
    />
  );
}

/** The page, with what each row's thread is doing read once from bb's sidebar. */
function ContributorDashboardPanel(props: PluginNavPanelProps) {
  const threadStatus = useThreadStatus();
  return (
    <ThreadStatusContext.Provider value={threadStatus}>
      <ContributorDashboardPage {...props} />
    </ThreadStatusContext.Provider>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "contributor-dashboard",
    title: "Contributor Dashboard",
    icon: "ChartColumn",
    path: PANEL_PATH,
    component: ContributorDashboardPanel,
    headerContent: SyncHeader,
  });
});
