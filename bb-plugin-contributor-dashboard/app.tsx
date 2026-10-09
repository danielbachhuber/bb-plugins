// bb-plugin-contributor-dashboard — the Contributor Dashboard page.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useRpc,
  useRealtime,
  type NewThreadRequest,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";

import { SyncStatus as SyncStatusBar } from "component-library/sync-status";

import { DashboardView } from "@/components/dashboard-view";
import { PersonView } from "@/components/person-view";
import { StageView } from "@/components/stage-view";

import type { rpcContract } from "./server";
import {
  DASHBOARD_CHANNEL,
  type PeopleActivityResult,
  type PersonActivityResult,
  STAGE_KEYS,
  type StageDetailResult,
  type StageKey,
  type SyncStatus,
} from "./dashboard/contract.js";
import { rangeOf, selectionWords, type Selection } from "./dashboard/period.js";
import { StartThreadDialog, type ThreadSeed } from "./components/start-thread-dialog.js";
import { rememberedSelection, rememberSelection } from "./dashboard/remember.js";

const PANEL_PATH = "contributor-dashboard";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** `person/<login>` and `stage/<key>` are the sub-paths; anything else is the dashboard. */
function personFrom(subPath: string): string | null {
  const match = /^person\/([^/]+)\/?$/.exec(subPath);
  return match === null ? null : decodeURIComponent(match[1]);
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
  return <SyncStatusBar syncedAt={data.syncedAt} busy={data.running} onRefresh={sync} />;
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
  const login = personFrom(subPath);
  const stage = stageFrom(subPath);
  const { projectId } = useBbContext();
  const [seed, setSeed] = useState<ThreadSeed | null>(null);

  // A row with a thread opens it; one without offers bb's composer, which
  // owns the provider, environment and branch choices.
  const onThread = useCallback(
    (next: ThreadSeed, threadId: string | null) => {
      if (threadId !== null) {
        navigate.toThread(threadId);
        return;
      }
      setSeed(next);
    },
    [navigate],
  );
  const startThread = useCallback(
    async (started: ThreadSeed, request: NewThreadRequest) => {
      setSeed(null);
      const { threadId } = await rpc.call("start_thread", {
        kind: started.kind,
        number: started.number,
        title: `${started.title} (#${started.number})`,
        request: request as unknown as Record<string, unknown>,
      });
      navigate.toThread(threadId);
    },
    [navigate, rpc],
  );

  const dashboard = useDashboardData<PeopleActivityResult | null>(
    () => (login === null && stage === null ? rpc.call("people_activity", { range }) : Promise.resolve(null)),
    [rpc, range, login, stage],
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
  const back = useCallback(() => navigate.toPluginPanel(PANEL_PATH), [navigate]);
  // One dialog for the page, whichever list the row came from. It opens with
  // no project too: the composer has its own picker, and bb's panel reports no
  // project when the page was opened from outside one.
  const dialog = (
    <StartThreadDialog seed={seed} projectId={projectId} onClose={() => setSeed(null)} onSubmit={startThread} />
  );
  if (stage !== null) {
    return (
      <>
        <StageView
          selection={selection}
          onSelect={choose}
          data={stageDetail.data}
          error={stageDetail.error}
          onBack={back}
          onWaitingPage={setWaitingPage}
          periodLabel={selectionWords(selection)}
          onThread={onThread}
        />
        {dialog}
      </>
    );
  }
  if (login !== null) {
    return (
      <>
        <PersonView
          login={login}
          selection={selection}
          onSelect={choose}
          data={person.data}
          error={person.error}
          onBack={back}
          onAuthoredPage={setAuthoredPage}
          onThread={onThread}
        />
        {dialog}
      </>
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
      onLoadOlderReleases={(before, count) => rpc.call("older_releases", { before, count })}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "contributor-dashboard",
    title: "Contributor Dashboard",
    icon: "ChartColumn",
    path: PANEL_PATH,
    component: ContributorDashboardPage,
    headerContent: SyncHeader,
  });
});
