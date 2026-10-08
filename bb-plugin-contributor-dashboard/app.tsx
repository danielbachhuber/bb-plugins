// bb-plugin-contributor-dashboard — the Contributor Dashboard page.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useBbNavigate, useRpc, useRealtime, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";

import { DashboardView } from "@/components/dashboard-view";
import { PersonView } from "@/components/person-view";

import type { rpcContract } from "./server";
import {
  DASHBOARD_CHANNEL,
  type PeopleActivityResult,
  type PersonActivityResult,
} from "./dashboard/contract.js";
import { DEFAULT_PERIOD, type PeriodId } from "./dashboard/period.js";

const PANEL_PATH = "contributor-dashboard";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** `person/<login>` is the only sub-path; anything else is the dashboard. */
function personFrom(subPath: string): string | null {
  const match = /^person\/([^/]+)\/?$/.exec(subPath);
  return match === null ? null : decodeURIComponent(match[1]);
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

function ContributorDashboardPage({ subPath }: PluginNavPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [period, setPeriod] = useState<PeriodId>(DEFAULT_PERIOD);
  const [authoredPage, setAuthoredPage] = useState(0);
  // A shorter period has fewer pages; the server clamps, and this follows it
  // back to the first page rather than leaving a stale number in hand.
  const choosePeriod = useCallback((next: PeriodId) => {
    setAuthoredPage(0);
    setPeriod(next);
  }, []);
  const login = personFrom(subPath);

  const dashboard = useDashboardData<PeopleActivityResult | null>(
    () => (login === null ? rpc.call("people_activity", { period }) : Promise.resolve(null)),
    [rpc, period, login],
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
  const back = useCallback(() => navigate.toPluginPanel(PANEL_PATH), [navigate]);
  const sync = useCallback(() => {
    rpc.call("sync_now", null).then(dashboard.reload, () => undefined);
  }, [rpc, dashboard.reload]);

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
      onSync={sync}
      onOpenPerson={openPerson}
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
  });
});
