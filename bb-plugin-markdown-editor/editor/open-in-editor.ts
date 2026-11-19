// Opening a file in the editor bb is set to use, such as VS Code or Cursor.
//
// The plugin SDK has no call for this. bb's own file preview does it from the
// app: it asks the bb server which local helper ports exist, finds the helper
// serving this bb, asks that helper which apps can open the path, picks the
// one the user chose (kept in the app's localStorage), and posts the open
// request to the helper. This file makes the same four requests.
//
// None of those requests is a public API, so a bb update can change them.
// open-in-editor.live.test.ts runs them against the running bb, and fails
// when one no longer answers the way this file expects.

/** The localStorage key bb's app keeps the chosen file editor under. */
export const FILE_OPEN_TARGET_STORAGE_KEY = "bb.fileOpenTarget";

/** The host bb's local helper listens on. */
export const HELPER_HOST = "127.0.0.1";

/** One app the helper can open a path in, as `/workspace-open-targets` lists it. */
export interface OpenTarget {
  id: string;
  label: string;
  kind?: string;
  capabilities: { openFile?: boolean };
}

function canOpenFile(target: OpenTarget): boolean {
  return target.capabilities.openFile === true;
}

function rank(target: OpenTarget): number {
  const kind = target.kind ?? "editor";
  if (kind === "editor") return 0;
  if (kind === "terminal") return 5;
  if (kind === "default-app" || kind === "native-app") return 10;
  return 20;
}

/**
 * The app bb would open a markdown file in, or null when none can.
 *
 * Mirrors bb's own choice for a local file with no line number: the stored
 * preference when it can open files; the system default app when the stored
 * one is no longer installed; otherwise the first editor, then terminal, then
 * anything else that can open a file.
 */
export function pickOpenTarget(
  targets: readonly OpenTarget[],
  preferredId: string | null,
): OpenTarget | null {
  if (preferredId !== null && preferredId !== "") {
    const preferred = targets.find((target) => target.id === preferredId);
    if (preferred !== undefined && canOpenFile(preferred)) return preferred;
    if (preferred === undefined) {
      const defaultApp = targets.find(
        (target) => target.id === "default-app" && canOpenFile(target),
      );
      if (defaultApp !== undefined) return defaultApp;
    }
  }
  const candidates = targets
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => canOpenFile(target));
  candidates.sort((a, b) => rank(a.target) - rank(b.target) || a.index - b.index);
  return candidates[0]?.target ?? null;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

type Fetch = typeof fetch;

async function readJson(response: Response, what: string): Promise<unknown> {
  if (!response.ok) {
    const text = (await response.text().catch(() => "")).trim();
    throw new Error(text === "" ? `${what} failed: HTTP ${response.status}` : text);
  }
  return response.json();
}

/** The helper ports the bb server at `serverOrigin` knows about. */
export async function fetchHelperPorts(fetchImpl: Fetch, serverOrigin: string): Promise<number[]> {
  const body = await readJson(
    await fetchImpl(`${serverOrigin}/api/v1/system/config`),
    "Reading bb's config",
  );
  const ports = (body as { localHelperPorts?: unknown }).localHelperPorts;
  if (!Array.isArray(ports) || !ports.every((port) => typeof port === "number")) {
    throw new Error("bb's config no longer lists its local helper ports.");
  }
  return ports;
}

/** What `/status` says about one helper. */
export interface HelperStatus {
  port: number;
  hostId: string;
  serverUrl: string;
}

/**
 * The helper serving the bb at `serverOrigin`, or the first that answers.
 * Null when none answers, as when bb is opened from another machine.
 */
export async function findHelper(
  fetchImpl: Fetch,
  serverOrigin: string,
  ports: readonly number[],
): Promise<HelperStatus | null> {
  const answers = await Promise.all(
    ports.map(async (port): Promise<HelperStatus | null> => {
      try {
        const response = await fetchImpl(`http://${HELPER_HOST}:${port}/status`);
        if (!response.ok) return null;
        const body = (await response.json()) as Partial<HelperStatus>;
        if (typeof body.serverUrl !== "string" || typeof body.hostId !== "string") {
          return null;
        }
        return { port, hostId: body.hostId, serverUrl: body.serverUrl };
      } catch {
        return null;
      }
    }),
  );
  const found = answers.filter((answer): answer is HelperStatus => answer !== null);
  return found.find((helper) => originOf(helper.serverUrl) === serverOrigin) ?? found[0] ?? null;
}

/** The apps the helper can open `path` in. */
export async function fetchOpenTargets(
  fetchImpl: Fetch,
  port: number,
  path: string,
): Promise<OpenTarget[]> {
  const url = `http://${HELPER_HOST}:${port}/workspace-open-targets?path=${encodeURIComponent(path)}`;
  const body = await readJson(await fetchImpl(url), "Listing editors");
  const targets = (body as { targets?: unknown }).targets;
  if (!Array.isArray(targets)) {
    throw new Error("bb's helper no longer lists editors the way this plugin expects.");
  }
  return targets as OpenTarget[];
}

/** Asks the helper to open `path` in `targetId`. */
export async function postOpen(
  fetchImpl: Fetch,
  port: number,
  path: string,
  targetId: string,
): Promise<void> {
  const response = await fetchImpl(`http://${HELPER_HOST}:${port}/open-in-target`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      context: { kind: "local" },
      columnNumber: null,
      lineNumber: null,
      path,
      targetId,
    }),
  });
  await readJson(response, "Opening the file");
}

export interface OpenInEditorArgs {
  fetch: Fetch;
  /** The bb server's origin, which is the app's own. */
  serverOrigin: string;
  /** The file's absolute path on the machine the helper runs on. */
  path: string;
  /** The host the file is on, for a host file; the helper must be on it. */
  hostId?: string;
  /** The editor chosen in bb, from localStorage, or null. */
  preferredId: string | null;
}

/** Opens the file and returns the name of the app it opened in. */
export async function openInEditor(args: OpenInEditorArgs): Promise<string> {
  const ports = await fetchHelperPorts(args.fetch, args.serverOrigin);
  const helper = await findHelper(args.fetch, args.serverOrigin, ports);
  if (helper === null) {
    throw new Error("bb's local helper isn't reachable from this window.");
  }
  if (args.hostId !== undefined && args.hostId !== helper.hostId) {
    throw new Error("This file is on another host, so it can't open in a local editor.");
  }
  const targets = await fetchOpenTargets(args.fetch, helper.port, args.path);
  const target = pickOpenTarget(targets, args.preferredId);
  if (target === null) throw new Error("bb found no editor that can open this file.");
  await postOpen(args.fetch, helper.port, args.path, target.id);
  return target.label;
}
