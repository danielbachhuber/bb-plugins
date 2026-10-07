// bb-plugin-review-velocity — the Review Velocity page.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";

import { PeopleView } from "@/components/people-view";

import type { rpcContract } from "./server";
import { VELOCITY_CHANNEL, type PeopleActivityResult } from "./velocity/contract.js";
import { DEFAULT_PERIOD, type PeriodId } from "./velocity/period.js";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function ReviewVelocityPage() {
  const rpc = useRpc<typeof rpcContract>();
  const [period, setPeriod] = useState<PeriodId>(DEFAULT_PERIOD);
  const [data, setData] = useState<PeopleActivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reads only the local mirror; the server decides whether GitHub needs asking.
  const load = useCallback(() => {
    rpc.call("people_activity", { period }).then(
      (result) => {
        setData(result);
        setError(null);
      },
      (cause) => setError(messageOf(cause)),
    );
  }, [rpc, period]);

  useEffect(load, [load]);
  useRealtime(VELOCITY_CHANNEL, load);

  const sync = useCallback(() => {
    rpc.call("sync_now", null).then(load, (cause) => setError(messageOf(cause)));
  }, [rpc, load]);

  return <PeopleView period={period} onPeriod={setPeriod} data={data} error={error} onSync={sync} />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "review-velocity",
    title: "Review Velocity",
    icon: "ChartColumn",
    path: "review-velocity",
    component: ReviewVelocityPage,
  });
});
