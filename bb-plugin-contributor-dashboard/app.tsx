// bb-plugin-contributor-dashboard — the Contributor Dashboard page.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { MilestoneView } from "@/components/milestone-view";
import { StageView } from "@/components/stage-view";
import { OpenItemsView } from "@/components/open-items-view";
import { BatchDialog, type BatchItem } from "@/components/batch-dialog";
import { describeFilters } from "@/components/list-toolbar";

import type { rpcContract } from "./server";
import {
  BATCH_LIMIT,
  DASHBOARD_CHANNEL,
  type AuthoredQuery,
  type OpenItemsResult,
  type OpenQuery,
  type PeopleActivityResult,
  type PersonActivityResult,
  STAGE_KEYS,
  type MilestoneDetailResult,
  type StageDetailResult,
  type StageKey,
  type Subject,
  type SyncStatus,
  type WaitingQuery,
} from "./dashboard/contract.js";
import { rangeOf, selectionWords, type Selection } from "./dashboard/period.js";
import { announceStartedThread, useStartThreadBox, type StartThreadDraft } from "@danielbachhuber/bb-plugin-component-library/start-thread";
import { DEFAULT_QUERY } from "./review/open-items.js";
import { DEFAULT_AUTHORED_QUERY, DEFAULT_WAITING_QUERY } from "./review/list-query.js";
import { batchTitle, promptFor, type ThreadSeed } from "./components/thread-seed.js";
import { rememberedScreen, rememberedSelection, rememberScreen, rememberSelection } from "./dashboard/remember.js";
import { useThreadStatus } from "@danielbachhuber/bb-plugin-component-library/thread-status";
import { StartThreadContext, ThreadStatusContext } from "@danielbachhuber/bb-plugin-component-library/item-row";

const PANEL_PATH = "contributor-dashboard";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** `person/<login>`, `team/<slug>`, `stage/<key>`, and `milestone/<number>` are the sub-paths; anything else is the dashboard. */
function personFrom(subPath: string): string | null {
  const match = /^person\/([^/]+)\/?$/.exec(subPath);
  return match === null ? null : decodeURIComponent(match[1]);
}

function teamFrom(subPath: string): string | null {
  const match = /^team\/([^/]+)\/?$/.exec(subPath);
  return match === null ? null : decodeURIComponent(match[1]);
}

/** `issues` and `pulls` list everything open of that kind. */
function listFrom(subPath: string): "issue" | "pull" | null {
  const match = /^(issues|pulls)\/?$/.exec(subPath);
  if (match === null) return null;
  return match[1] === "issues" ? "issue" : "pull";
}

function milestoneFrom(subPath: string): number | null {
  const match = /^milestone\/(\d+)\/?$/.exec(subPath);
  return match === null ? null : Number(match[1]);
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
 *
 * `identity` names what the screen shows, such as which person or stage. When
 * it changes, the last result is dropped rather than shown under the new
 * name, so the screen draws its loading skeleton until its own data arrives,
 * and a late answer for the screen just left is ignored. A changed period,
 * page, or filter keeps the last result on screen until the new one lands.
 */
function useDashboardData<T>(call: () => Promise<T>, deps: unknown[], identity = "") {
  const [stored, setStored] = useState<{ identity: string; data: T } | null>(null);
  const [failed, setFailed] = useState<{ identity: string; error: string } | null>(null);
  const current = useRef(identity);
  current.current = identity;
  const load = useCallback(() => {
    const asked = identity;
    call().then(
      (result) => {
        if (asked !== current.current) return;
        setStored({ identity: asked, data: result });
        setFailed(null);
      },
      (cause) => {
        if (asked === current.current) setFailed({ identity: asked, error: messageOf(cause) });
      },
    );
    // The caller's `call` closes over the deps below, and `identity` is one of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(load, [load]);
  useRealtime(DASHBOARD_CHANNEL, load);
  const data = stored !== null && stored.identity === identity ? stored.data : null;
  const error = failed !== null && failed.identity === identity ? failed.error : null;
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
  const [authoredQuery, setAuthoredQuery] = useState<AuthoredQuery>(DEFAULT_AUTHORED_QUERY);
  const [waitingQuery, setWaitingQuery] = useState<WaitingQuery>(DEFAULT_WAITING_QUERY);
  // A changed filter or sort starts the list over from its first page.
  const queryAuthored = useCallback((next: AuthoredQuery) => {
    setAuthoredPage(0);
    setAuthoredQuery(next);
  }, []);
  const queryWaiting = useCallback((next: WaitingQuery) => {
    setWaitingPage(0);
    setWaitingQuery(next);
  }, []);
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
    return personFrom(remembered) !== null ||
      teamFrom(remembered) !== null ||
      stageFrom(remembered) !== null ||
      milestoneFrom(remembered) !== null ||
      listFrom(remembered) !== null
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
  const team = teamFrom(shown);
  // A team's page is a person's page, adding up its members'.
  const subject = useMemo<Subject | null>(
    () => (login !== null ? { login } : team !== null ? { team } : null),
    [login, team],
  );
  const stage = stageFrom(shown);
  const milestone = milestoneFrom(shown);
  const list = listFrom(shown);
  const [listPage, setListPage] = useState(0);
  const [listQuery, setListQuery] = useState<OpenQuery>(DEFAULT_QUERY);
  // A changed filter or sort starts the list over from its first page.
  const query = useCallback((next: OpenQuery) => {
    setListPage(0);
    setListQuery(next);
  }, []);
  // Batch reads every matching row when it opens, not with each page. Every
  // list on every page opens the same dialog, saying which list it came from.
  const [batch, setBatch] = useState<{
    kind: "issue" | "pull";
    heading: string;
    rows: BatchItem[] | null;
    error: string | null;
  } | null>(null);
  const openBatch = useCallback(
    (kind: "issue" | "pull", heading: string, load: () => Promise<readonly BatchItem[]>) => {
      setBatch({ kind, heading, rows: null, error: null });
      load().then(
        (rows) => setBatch((current) => (current === null ? null : { ...current, rows: [...rows] })),
        (cause) => setBatch((current) => (current === null ? null : { ...current, rows: [], error: messageOf(cause) })),
      );
    },
    [],
  );
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
    () =>
      subject === null && stage === null && list === null && milestone === null
        ? rpc.call("people_activity", { range })
        : Promise.resolve(null),
    [rpc, range, subject, stage, list, milestone],
  );
  const milestoneDetail = useDashboardData<MilestoneDetailResult | null>(
    () => (milestone === null ? Promise.resolve(null) : rpc.call("milestone_detail", { number: milestone, range })),
    [rpc, range, milestone],
    String(milestone),
  );
  const openList = useDashboardData<OpenItemsResult | null>(
    () => (list === null ? Promise.resolve(null) : rpc.call("open_items", { kind: list, page: listPage, query: listQuery })),
    [rpc, list, listPage, listQuery],
    String(list),
  );
  const stageDetail = useDashboardData<StageDetailResult | null>(
    () => (stage === null ? Promise.resolve(null) : rpc.call("stage_detail", { stage, range, waitingPage, waitingQuery })),
    [rpc, range, stage, waitingPage, waitingQuery],
    String(stage),
  );
  const person = useDashboardData<PersonActivityResult | null>(
    () => (subject === null ? Promise.resolve(null) : rpc.call("person_activity", { subject, range, authoredPage, authoredQuery })),
    [rpc, range, subject, authoredPage, authoredQuery],
    subject === null ? "" : "login" in subject ? `person:${subject.login}` : `team:${subject.team}`,
  );

  const openPerson = useCallback(
    (who: string) => {
      setAuthoredPage(0);
      setAuthoredQuery(DEFAULT_AUTHORED_QUERY);
      navigate.toPluginPanel(PANEL_PATH, { subPath: `person/${encodeURIComponent(who)}` });
    },
    [navigate],
  );
  const openTeam = useCallback(
    (slug: string) => {
      setAuthoredPage(0);
      setAuthoredQuery(DEFAULT_AUTHORED_QUERY);
      navigate.toPluginPanel(PANEL_PATH, { subPath: `team/${encodeURIComponent(slug)}` });
    },
    [navigate],
  );
  const openStage = useCallback(
    (which: StageKey) => {
      setWaitingPage(0);
      setWaitingQuery(DEFAULT_WAITING_QUERY);
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
  const openMilestone = useCallback(
    (number: number) => navigate.toPluginPanel(PANEL_PATH, { subPath: `milestone/${number}` }),
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
  const batchDialog = (
    <BatchDialog
      kind={batch?.kind ?? "pull"}
      open={batch !== null}
      heading={batch?.heading ?? ""}
      rows={batch?.rows ?? null}
      error={batch?.error ?? null}
      projectId={projectId}
      limit={BATCH_LIMIT}
      onClose={() => setBatch(null)}
      onStart={async (rows, request) => {
        if (batch === null) return;
        const started = await rpc.call("start_batch", {
          kind: batch.kind,
          title: batchTitle(batch.kind, rows.map((row) => row.number)),
          rows: rows.map(({ number, title, url }) => ({ number, title, url })),
          request: request as unknown as Record<string, unknown>,
        });
        setBatch(null);
        const failed = started.failed.length === 0 ? "" : `; ${started.failed.length} could not start`;
        announceStartedThread(navigate, started.threadId, `Started a main thread and ${started.subthreads.length} subthreads${failed}`);
      }}
    />
  );
  if (list !== null) {
    const heading = describeFilters(list, listQuery);
    return (
      <StartThreadContext.Provider value={startRows}>
        <OpenItemsView
          kind={list}
          data={openList.data}
          error={openList.error}
          onBack={back}
          onOpenPerson={openPerson}
          onOpenTeam={openTeam}
          onPage={setListPage}
          onThread={onThread}
          query={listQuery}
          onQuery={query}
          onBatch={() =>
            openBatch(list, heading, () => rpc.call("open_items_matching", { kind: list, query: listQuery }).then(({ rows }) => rows))
          }
          batch={batchDialog}
        />
      </StartThreadContext.Provider>
    );
  }
  if (milestone !== null) {
    return (
      <StartThreadContext.Provider value={startRows}>
        <MilestoneView
          number={milestone}
          selection={selection}
          onSelect={choose}
          data={milestoneDetail.data}
          error={milestoneDetail.error}
          onBack={back}
          onOpenPerson={openPerson}
          onOpenTeam={openTeam}
          periodLabel={selectionWords(selection)}
          onThread={onThread}
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
          onOpenTeam={openTeam}
          onWaitingPage={setWaitingPage}
          periodLabel={selectionWords(selection)}
          onThread={onThread}
          waitingQuery={waitingQuery}
          onWaitingQuery={queryWaiting}
          onBatch={(kind, heading) =>
            openBatch(kind, heading, () => rpc.call("stage_waiting_matching", { stage, query: waitingQuery }).then(({ rows }) => rows))
          }
        />
        {batchDialog}
      </StartThreadContext.Provider>
    );
  }
  if (subject !== null) {
    return (
      <StartThreadContext.Provider value={startRows}>
        <PersonView
          key={"login" in subject ? `person:${subject.login}` : `team:${subject.team}`}
          subject={subject}
          selection={selection}
          onSelect={choose}
          data={person.data}
          error={person.error}
          onBack={back}
          onOpenPerson={openPerson}
          onOpenTeam={openTeam}
          onAuthoredPage={setAuthoredPage}
          onThread={onThread}
          authoredQuery={authoredQuery}
          onAuthoredQuery={queryAuthored}
          onBatchAuthored={(heading) =>
            openBatch("pull", heading, () =>
              rpc.call("authored_matching", { subject, range, query: authoredQuery }).then(({ rows }) => rows),
            )
          }
          onBatch={(kind, heading, rows) => openBatch(kind, heading, () => Promise.resolve(rows))}
        />
        {batchDialog}
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
      onOpenTeam={openTeam}
      onOpenStage={openStage}
      onOpenList={openItemsList}
      onOpenMilestone={openMilestone}
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
