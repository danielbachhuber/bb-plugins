// Pure classification of the plugins in a checkout against the marketplace.
// No git, no network, no bb API: sources.ts gathers the inputs.
import semver from "semver";
import type {
  Commit,
  Flag,
  Group,
  IndexedPlugin,
  MarketplaceEntry,
  ShelfRow,
} from "./types";

export const GROUP_ORDER: Group[] = ["needs-release", "current", "personal", "unknown"];

/** `host/owner/name`, lowercased, for comparing ssh and https remotes. */
export function normalizeRepoUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const scp = /^[^@\s]+@([^:]+):(.+)$/.exec(trimmed);
  const path = scp
    ? `${scp[1]}/${scp[2]}`
    : trimmed.replace(/^[a-z+]+:\/\//i, "").replace(/^[^@/]+@/, "");
  return path.toLowerCase();
}

export function matchEntry(
  plugin: IndexedPlugin,
  entries: MarketplaceEntry[],
  repo: string,
): { entry: MarketplaceEntry | null; takenBy: MarketplaceEntry | null } {
  const sameId = entries.filter((candidate) => candidate.pluginId === plugin.id);
  const entry =
    sameId.find(
      (candidate) =>
        normalizeRepoUrl(candidate.url) === repo && candidate.subdir === plugin.dir,
    ) ?? null;
  const takenBy =
    entry === null
      ? (sameId.find((candidate) => normalizeRepoUrl(candidate.url) !== repo) ?? null)
      : null;
  return { entry, takenBy };
}

function versionOf(tag: string, prefix: string): string | null {
  if (!tag.startsWith(`${prefix}v`)) return null;
  const version = tag.slice(prefix.length + 1);
  const parsed = semver.valid(version);
  if (parsed === null || semver.prerelease(parsed) !== null) return null;
  return parsed;
}

export function releaseFor(
  entry: MarketplaceEntry,
  tags: string[],
): { latestTag: string | null; latestVersion: string | null; outside: string | null } {
  const prefix = entry.tagPrefix ?? `${entry.pluginId}/`;
  const byVersion = new Map<string, string>();
  for (const tag of tags) {
    const version = versionOf(tag, prefix);
    if (version !== null) byVersion.set(version, tag);
  }
  const versions = [...byVersion.keys()];
  const range = entry.range ?? "*";
  const latestVersion = semver.maxSatisfying(versions, range);
  const newest = semver.rsort([...versions])[0] ?? null;
  const outside =
    newest !== null && !semver.satisfies(newest, range) &&
    (latestVersion === null || semver.gt(newest, latestVersion))
      ? byVersion.get(newest)!
      : null;
  return {
    latestTag: latestVersion === null ? null : byVersion.get(latestVersion)!,
    latestVersion,
    outside,
  };
}

const DOCS_PATTERNS = [
  /(^|\/)README\.md$/,
  /^PLUGIN_OVERVIEW\.md$/,
  /\.stories\.tsx$/,
  /\.test\.tsx?$/,
  /^screenshots\//,
];

export function isDocsOnlyFile(dir: string, file: string): boolean {
  const relative = file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : file;
  return DOCS_PATTERNS.some((pattern) => pattern.test(relative));
}

export function buildRow(input: {
  plugin: IndexedPlugin;
  entries: MarketplaceEntry[] | null;
  repo: string;
  tags: string[];
  commits: Commit[];
}): ShelfRow {
  const { plugin, entries, repo, tags } = input;
  const base = {
    ...plugin,
    entryId: null,
    latestTag: null,
    latestVersion: null,
    commits: [],
    docsChangesOnly: false,
    flags: [] as Flag[],
  };
  if (entries === null) return { ...base, group: "unknown" };

  const { entry, takenBy } = matchEntry(plugin, entries, repo);
  if (entry === null) {
    return {
      ...base,
      group: "personal",
      flags: takenBy ? [{ kind: "id-taken", url: takenBy.url }] : [],
    };
  }

  const release = releaseFor(entry, tags);
  const flags: Flag[] = [];
  if (release.latestVersion === null) {
    flags.push({ kind: "no-release-in-range", range: entry.range ?? "*" });
  } else if (release.latestVersion !== plugin.version) {
    flags.push({
      kind: "version-mismatch",
      packageVersion: plugin.version,
      tagVersion: release.latestVersion,
    });
  }
  if (release.outside !== null) {
    flags.push({ kind: "tag-outside-range", tag: release.outside, range: entry.range ?? "*" });
  }

  const commits = input.commits.map((c) => ({
    ...c,
    docsOnly: c.files.length > 0 && c.files.every((f) => isDocsOnlyFile(plugin.dir, f)),
  }));
  const docsChangesOnly = commits.length > 0 && commits.every((c) => c.docsOnly);
  const needsRelease =
    release.latestVersion === null || commits.some((c) => !c.docsOnly);

  return {
    ...base,
    group: needsRelease ? "needs-release" : "current",
    entryId: entry.entryId,
    latestTag: release.latestTag,
    latestVersion: release.latestVersion,
    commits,
    docsChangesOnly,
    flags,
  };
}

export function sortRows(rows: ShelfRow[]): ShelfRow[] {
  return [...rows].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
      a.name.localeCompare(b.name),
  );
}
