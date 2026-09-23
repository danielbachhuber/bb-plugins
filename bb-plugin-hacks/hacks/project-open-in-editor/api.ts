// The network boundary: bb's server for projects, and the machine's host
// daemon for editors and for opening a folder in one.
//
// These are the same endpoints bb's own "Open in" menu uses. The daemon's
// local API answers CORS requests from bb's own origins, and a content script
// runs in that origin, so this reaches it the same way bb does.
import type { OpenTarget, Project } from "./rules";

/** bb's own key for the directory "Open in" target you last chose. */
export const PREFERRED_TARGET_KEY = "bb.workspaceOpenTarget";

const DAEMON_HOST = "127.0.0.1";

export interface Daemon {
  port: number;
  hostId: string;
}

type Fetch = typeof fetch;

async function getJson<T>(fetchFn: Fetch, url: string): Promise<T> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The host daemon on this machine, or null when this window cannot reach one
 * (bb opened in a browser on another machine, or the daemon is down).
 */
export async function findDaemon(
  fetchFn: Fetch,
  serverOrigin: string,
): Promise<Daemon | null> {
  const config = await getJson<{ localHelperPorts?: number[] }>(
    fetchFn,
    `${serverOrigin}/api/v1/system/config`,
  );
  for (const port of config.localHelperPorts ?? []) {
    try {
      const status = await getJson<{ hostId: string }>(
        fetchFn,
        `http://${DAEMON_HOST}:${port}/status`,
      );
      return { port, hostId: status.hostId };
    } catch {
      // Try the next port.
    }
  }
  return null;
}

export async function listProjects(
  fetchFn: Fetch,
  serverOrigin: string,
): Promise<Project[]> {
  return getJson<Project[]>(fetchFn, `${serverOrigin}/api/v1/projects`);
}

export async function listOpenTargets(
  fetchFn: Fetch,
  daemon: Daemon,
): Promise<OpenTarget[]> {
  const body = await getJson<{ targets: OpenTarget[] }>(
    fetchFn,
    `http://${DAEMON_HOST}:${daemon.port}/workspace-open-targets`,
  );
  return body.targets;
}

export async function openInTarget(
  fetchFn: Fetch,
  daemon: Daemon,
  path: string,
  targetId: string,
): Promise<void> {
  const response = await fetchFn(
    `http://${DAEMON_HOST}:${daemon.port}/open-in-target`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: { kind: "local" },
        columnNumber: null,
        lineNumber: null,
        path,
        targetId,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`open-in-target: HTTP ${response.status}`);
  }
}
