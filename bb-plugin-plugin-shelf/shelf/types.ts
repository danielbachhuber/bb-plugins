// Shared shapes for Plugin Shelf's classifier, server, and page.
export interface IndexedPlugin {
  id: string;          // .bb/plugins.json name
  dir: string;         // repo-relative directory, no leading ./
  name: string;        // package.json bb.name, falling back to id
  description: string; // package.json bb.description, "" when absent
  version: string;     // package.json version
  installed: boolean;
}

export interface MarketplaceEntry {
  pluginId: string;
  entryId: string;
  url: string;              // git url from the install plan
  subdir: string | null;
  range: string | null;
  tagPrefix: string | null;
}

export interface Commit {
  sha: string;
  subject: string;
  date: string;     // ISO 8601
  files: string[];  // repo-relative, only those under the plugin dir
}

export type Flag =
  | { kind: "version-mismatch"; packageVersion: string; tagVersion: string }
  | { kind: "tag-outside-range"; tag: string; range: string }
  | { kind: "no-release-in-range"; range: string }
  | { kind: "id-taken"; url: string };

export type Group = "needs-release" | "current" | "personal" | "unknown";

export interface ShelfRow extends IndexedPlugin {
  group: Group;
  entryId: string | null;
  latestTag: string | null;
  latestVersion: string | null;
  commits: (Commit & { docsOnly: boolean })[];
  /** True when every unreleased commit is docs only and there is at least one. */
  docsChangesOnly: boolean;
  flags: Flag[];
}

export interface ShelfList {
  checkout: { root: string; repo: string } | null;
  emptyReason: string | null;
  rows: ShelfRow[];
  fetchedAt: number | null;
  fetchError: string | null;
  marketplaceError: string | null;
}
