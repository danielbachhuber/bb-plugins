import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import { useEffect, useState } from "react";

import type { rpcContract } from "./harvest/contract.js";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;

type Status = {
  configured: boolean;
  user: { name: string; accountName: string } | null;
  error: "unauthenticated" | "rate_limited" | "unreachable" | "invalid_response" | null;
};

function useStatus(rpc: Rpc): Status | null {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStatus((await rpc.call("status", null)) as Status);
      } catch {
        setStatus({ configured: true, user: null, error: "unreachable" });
      }
    })();
  }, [rpc]);

  return status;
}

/**
 * Connection status.
 *
 * A wrong account id and a wrong token both produce a 401, so naming who the
 * credentials actually belong to is the fastest way to tell them apart.
 */
function ConnectionSection() {
  const rpc = useRpc<typeof rpcContract>();
  const status = useStatus(rpc);

  if (status === null) {
    return <p className="text-sm text-muted-foreground">Checking the Harvest connection…</p>;
  }

  if (!status.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Harvest is not configured. Add an account ID and a personal access token above, then
        create the token at{" "}
        <span className="font-mono text-xs">https://id.getharvest.com/developers</span>.
      </p>
    );
  }

  if (status.error !== null) return <p className="text-sm text-destructive">{errorCopy(status.error)}</p>;

  if (status.user !== null) {
    return (
      <p className="text-sm text-muted-foreground">
        Connected as <span className="font-medium text-foreground">{status.user.name}</span> on{" "}
        <span className="font-medium text-foreground">{status.user.accountName}</span>.
      </p>
    );
  }

  return <p className="text-sm text-muted-foreground">Connected.</p>;
}

function errorCopy(error: NonNullable<Status["error"]>): string {
  switch (error) {
    case "unauthenticated":
      return "Harvest rejected these credentials. Check the account ID, then regenerate the token.";
    case "rate_limited":
      return "Harvest is rate limiting requests. Try again shortly.";
    case "invalid_response":
      return "Harvest returned something unexpected. Try again shortly.";
    default:
      return "Harvest could not be reached. Check the network, then try again.";
  }
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "connection",
    title: "Connection",
    description: "Which Harvest account these credentials reach.",
    component: ConnectionSection,
  });
});
