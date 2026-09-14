// Where a file opened in a tab actually lives, as arguments for bb.files.
//
// A `fileOpener` component hands us a `source` describing the file's origin
// and a `path` whose meaning depends on that origin: relative to the
// environment's worktree, relative to the thread's storage root, or absolute
// on a host. bb.files.read/write speak a flatter language — an optional
// hostId, an optional rootPath, and a path. Translating between the two is
// the whole job of this file, and it is pure so the traversal rules can be
// tested without a host.

/** Origin of a file, mirroring the SDK's `PluginFileOpenerSource`. */
export type FileSourceKind = "host" | "thread-storage" | "workspace";

/**
 * The root a rooted source resolves to. The boundary looks this up —
 * `bb.environments.get` for a workspace, `bb.threads.storageLocation` for
 * thread storage — and hands the answer here.
 */
export interface ResolvedRoot {
  hostId: string | null;
  rootPath: string | null;
}

/**
 * Arguments shared by `bb.files.read` and `bb.files.write`.
 *
 * `path` is always absolute — bb refuses a relative one with "Path must be
 * absolute" even when a root is supplied. `rootPath` is not a base to join
 * against; it is a containment guard the host daemon enforces, refusing any
 * path that escapes it with "escapes read root".
 */
export interface FileTarget {
  hostId?: string;
  rootPath?: string;
  path: string;
}

/** Raised when a path or root cannot be trusted; never leaks a stack to the UI. */
export class TargetError extends Error {}

/** `workspace` and `thread-storage` paths are relative to a root; `host` paths are not. */
export function isRooted(kind: FileSourceKind): boolean {
  return kind === "workspace" || kind === "thread-storage";
}

/**
 * A relative path is safe when it stays under its root. Rejecting `..` is the
 * point: a rooted source is a sandbox, and `../../.bb/auth.json` is a
 * perfectly ordinary-looking string until it is joined to a root. Backslashes
 * are rejected too — hosts are POSIX, so a backslash is either a literal
 * filename character we do not want to guess about or an attempt to dodge
 * this check.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false;
  if (path.includes("\0")) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== ".." && segment !== ".");
}

/** An absolute host path is the only shape a `host` source may take. */
export function isSafeAbsolutePath(path: string): boolean {
  if (!path.startsWith("/") || path.includes("\0")) return false;
  return path.split("/").every((segment) => segment !== "..");
}

/**
 * Check a path against its source's shape before anything else happens.
 *
 * Split out from `buildFileTarget` so the boundary can run it first: a
 * rooted source needs a network lookup to find its root, and a path that was
 * never going to be allowed should not cost that round trip, nor report
 * itself as "environment not found".
 */
export function assertPathShape(kind: FileSourceKind, path: string): void {
  if (isRooted(kind)) {
    if (!isSafeRelativePath(path)) {
      throw new TargetError(
        `Refusing to open ${JSON.stringify(path)}: not a path under the root`,
      );
    }
    return;
  }
  if (!isSafeAbsolutePath(path)) {
    throw new TargetError(
      `Refusing to open ${JSON.stringify(path)}: not an absolute path`,
    );
  }
}

/**
 * Build the `bb.files` arguments for one open file.
 *
 * `root` is required for a rooted source and ignored for a host source, whose
 * host comes from the source itself. A host source with no host id at all is
 * still valid: bb resolves it against the primary host, which is what an
 * absolute path typed into a desktop window means.
 */
/** Join a checked relative path onto its root without doubling the slash. */
function joinUnderRoot(rootPath: string, relativePath: string): string {
  return `${rootPath.replace(/\/+$/, "")}/${relativePath}`;
}

export function buildFileTarget(args: {
  kind: FileSourceKind;
  path: string;
  hostId?: string | null;
  root?: ResolvedRoot | null;
}): FileTarget {
  const { kind, path } = args;
  assertPathShape(kind, path);
  if (isRooted(kind)) {
    const root = args.root ?? null;
    if (root === null || root.rootPath === null || root.rootPath === "") {
      throw new TargetError(
        kind === "workspace"
          ? "This file's environment has no workspace path on disk."
          : "This thread has no storage directory yet.",
      );
    }
    // Both fields, deliberately: the absolute path is what bb accepts, and
    // the root is what makes the host refuse anything that climbs out of it.
    const target: FileTarget = {
      rootPath: root.rootPath,
      path: joinUnderRoot(root.rootPath, path),
    };
    const hostId = root.hostId ?? args.hostId ?? null;
    if (hostId !== null) target.hostId = hostId;
    return target;
  }
  const target: FileTarget = { path };
  const hostId = args.hostId ?? args.root?.hostId ?? null;
  if (hostId !== null) target.hostId = hostId;
  return target;
}
