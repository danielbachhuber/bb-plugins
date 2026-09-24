// bb-plugin-next — the Next page: what to do next, from every source.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";

import type { rpcContract } from "./server";
import type { NextList } from "./next/contract.js";
import { ItemListView } from "./next/item-list.js";

function NextPage() {
  const rpc = useRpc<typeof rpcContract>();
  const [list, setList] = useState<NextList | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    rpc
      .call("items_list", null)
      .then(setList, (cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        setList({
          items: [],
          sources: [{ id: "next", name: "Next", state: "error", query: null, message }],
          fetchedAt: new Date().toISOString(),
        });
      })
      .finally(() => setRefreshing(false));
  }, [rpc]);

  useEffect(refresh, [refresh]);

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <ItemListView list={list} now={new Date()} refreshing={refreshing} onRefresh={refresh} />
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "next",
    title: "Next",
    icon: "Target",
    path: "next",
    component: NextPage,
  });
});
