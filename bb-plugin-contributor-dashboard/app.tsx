// bb-plugin-contributor-dashboard — the Contributor Dashboard page.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useBbNavigate, useRpc, useRealtime, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";

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
import { DEFAULT_PERIOD, PERIOD_LENGTHS, type PeriodId } from "./dashboard/period.js";

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
  const [period, setPeriod] = useState<PeriodId>(DEFAULT_PERIOD);
  const [authoredPage, setAuthoredPage] = useState(0);
  const [waitingPage, setWaitingPage] = useState(0);
  // A shorter period has fewer pages; the server clamps, and this follows it
  // back to the first page rather than leaving a stale number in hand.
  const choosePeriod = useCallback((next: PeriodId) => {
    setAuthoredPage(0);
    setWaitingPage(0);
    setPeriod(next);
  }, []);
  const login = personFrom(subPath);
  const stage = stageFrom(subPath);

  const dashboard = useDashboardData<PeopleActivityResult | null>(
    () => (login === null && stage === null ? rpc.call("people_activity", { period }) : Promise.resolve(null)),
    [rpc, period, login, stage],
  );
  const stageDetail = useDashboardData<StageDetailResult | null>(
    () => (stage === null ? Promise.resolve(null) : rpc.call("stage_detail", { stage, period, waitingPage })),
    [rpc, period, stage, waitingPage],
  );
  const person = useDashboardData<PersonActivityResult | null>(
    () => (login === null ? Promise.resolve(null) : rpc.call("person_activity", { login, period, authoredPage })),
    [rpc, period, login, authoredPage],
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
  if (stage !== null) {
    return (
      <StageView
        period={period}
        onPeriod={choosePeriod}
        data={stageDetail.data}
        error={stageDetail.error}
        onBack={back}
        onWaitingPage={setWaitingPage}
        periodLabel={PERIOD_LENGTHS[period]}
      />
    );
  }
  if (login !== null) {
    return (
      <PersonView
        login={login}
        period={period}
        onPeriod={choosePeriod}
        data={person.data}
        error={person.error}
        onBack={back}
        onAuthoredPage={setAuthoredPage}
      />
    );
  }
  return (
    <DashboardView
      period={period}
      onPeriod={choosePeriod}
      data={dashboard.data}
      error={dashboard.error}
      onOpenPerson={openPerson}
      onOpenStage={openStage}
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
