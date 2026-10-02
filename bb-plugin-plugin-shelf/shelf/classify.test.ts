import { describe, expect, it } from "vitest";
import {
  buildRow,
  isDocsOnlyFile,
  matchEntry,
  normalizeRepoUrl,
  releaseFor,
  sortRows,
} from "./classify";
import type { Commit, IndexedPlugin, MarketplaceEntry } from "./types";

const REPO = "github.com/acme/widgets";

function plugin(overrides: Partial<IndexedPlugin> = {}): IndexedPlugin {
  return {
    id: "widgets",
    dir: "bb-plugin-widgets",
    name: "Widgets",
    description: "Arranges widgets.",
    version: "0.1.1",
    installed: true,
    ...overrides,
  };
}

function entry(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    pluginId: "widgets",
    entryId: "widgets",
    url: "https://github.com/acme/widgets.git",
    subdir: "bb-plugin-widgets",
    range: "^0.1.0",
    tagPrefix: "widgets/",
    installs: 12,
    ...overrides,
  };
}

function commit(files: string[], subject = "Change widgets"): Commit {
  return { sha: "a".repeat(40), subject, date: "2026-09-01T10:00:00Z", files };
}

describe("normalizeRepoUrl", () => {
  it("treats ssh and https remotes for one repository as equal", () => {
    expect(normalizeRepoUrl("git@github.com:acme/widgets.git")).toBe(REPO);
    expect(normalizeRepoUrl("https://github.com/acme/widgets.git")).toBe(REPO);
    expect(normalizeRepoUrl("https://github.com/Acme/Widgets")).toBe(REPO);
  });
});

describe("matchEntry", () => {
  it("matches on id, repository, and subdir", () => {
    expect(matchEntry(plugin(), [entry()], REPO).entry?.entryId).toBe("widgets");
  });

  it("reports an entry with the same id from another source as taken", () => {
    const other = entry({ url: "https://github.com/octocat/widgets.git" });
    const result = matchEntry(plugin(), [other], REPO);
    expect(result.entry).toBeNull();
    expect(result.takenBy).toBe(other);
  });

  it("does not match an entry in the same repository under another directory", () => {
    const moved = entry({ subdir: "bb-plugin-old-widgets" });
    expect(matchEntry(plugin(), [moved], REPO).entry).toBeNull();
  });
});

describe("releaseFor", () => {
  it("picks the highest tag in range", () => {
    const tags = ["widgets/v0.1.0", "widgets/v0.1.1", "gadgets/v0.9.0"];
    expect(releaseFor(entry(), tags)).toEqual({
      latestTag: "widgets/v0.1.1",
      latestVersion: "0.1.1",
      outside: null,
    });
  });

  it("ignores prerelease and malformed tags", () => {
    const tags = ["widgets/v0.1.0", "widgets/v0.1.2-beta.1", "widgets/vnext"];
    expect(releaseFor(entry(), tags).latestTag).toBe("widgets/v0.1.0");
  });

  it("does not read another plugin's tags when one id prefixes the other", () => {
    const tags = ["widgets/v0.1.0", "widgets-pro/v0.1.5"];
    expect(releaseFor(entry(), tags).latestTag).toBe("widgets/v0.1.0");
  });

  it("reports a newer tag outside the range", () => {
    const tags = ["widgets/v0.1.0", "widgets/v0.2.0"];
    expect(releaseFor(entry(), tags)).toEqual({
      latestTag: "widgets/v0.1.0",
      latestVersion: "0.1.0",
      outside: "widgets/v0.2.0",
    });
  });
});

describe("isDocsOnlyFile", () => {
  it.each([
    "bb-plugin-widgets/README.md",
    "bb-plugin-widgets/PLUGIN_OVERVIEW.md",
    "bb-plugin-widgets/ui/Table.stories.tsx",
    "bb-plugin-widgets/shelf/classify.test.ts",
    "bb-plugin-widgets/ui/Table.test.tsx",
    "bb-plugin-widgets/screenshots/table.png",
    "bb-plugin-widgets/docs/README.md",
  ])("counts %s as docs", (file) => {
    expect(isDocsOnlyFile("bb-plugin-widgets", file)).toBe(true);
  });

  it.each(["bb-plugin-widgets/app.tsx", "bb-plugin-widgets/package.json"])(
    "counts %s as code",
    (file) => {
      expect(isDocsOnlyFile("bb-plugin-widgets", file)).toBe(false);
    },
  );
});

describe("buildRow", () => {
  const tags = ["widgets/v0.1.1"];

  it("is current with no unreleased commits", () => {
    const row = buildRow({ plugin: plugin(), entries: [entry()], repo: REPO, tags, commits: [] });
    expect(row.group).toBe("current");
    expect(row.latestTag).toBe("widgets/v0.1.1");
    expect(row.installs).toBe(12);
    expect(row.flags).toEqual([]);
  });

  it("needs a release when a commit touches code", () => {
    const row = buildRow({
      plugin: plugin(),
      entries: [entry()],
      repo: REPO,
      tags,
      commits: [commit(["bb-plugin-widgets/README.md"]), commit(["bb-plugin-widgets/app.tsx"])],
    });
    expect(row.group).toBe("needs-release");
    expect(row.commits.map((c) => c.docsOnly)).toEqual([true, false]);
    expect(row.docsChangesOnly).toBe(false);
  });

  it("stays current when every unreleased commit is docs only", () => {
    const row = buildRow({
      plugin: plugin(),
      entries: [entry()],
      repo: REPO,
      tags,
      commits: [commit(["bb-plugin-widgets/README.md"])],
    });
    expect(row.group).toBe("current");
    expect(row.docsChangesOnly).toBe(true);
    expect(row.commits).toHaveLength(1);
  });

  it("flags a version bump that was never tagged", () => {
    const row = buildRow({
      plugin: plugin({ version: "0.1.2" }),
      entries: [entry()],
      repo: REPO,
      tags,
      commits: [],
    });
    expect(row.flags).toContainEqual({
      kind: "version-mismatch",
      packageVersion: "0.1.2",
      tagVersion: "0.1.1",
    });
  });

  it("flags a published entry with no release in its range", () => {
    const row = buildRow({ plugin: plugin(), entries: [entry()], repo: REPO, tags: [], commits: [] });
    expect(row.group).toBe("needs-release");
    expect(row.flags).toContainEqual({ kind: "no-release-in-range", range: "^0.1.0" });
  });

  it("is personal when the marketplace has no entry", () => {
    const row = buildRow({ plugin: plugin(), entries: [], repo: REPO, tags, commits: [] });
    expect(row.group).toBe("personal");
    expect(row.entryId).toBeNull();
  });

  it("is personal with a note when another source holds the id", () => {
    const other = entry({ url: "https://github.com/octocat/widgets.git" });
    const row = buildRow({ plugin: plugin(), entries: [other], repo: REPO, tags, commits: [] });
    expect(row.group).toBe("personal");
    expect(row.flags).toContainEqual({ kind: "id-taken", url: other.url });
  });

  it("is unknown, never personal, when the marketplace is unreachable", () => {
    const row = buildRow({ plugin: plugin(), entries: null, repo: REPO, tags, commits: [] });
    expect(row.group).toBe("unknown");
  });
});

describe("sortRows", () => {
  it("orders by group, then name", () => {
    const make = (name: string, group: "needs-release" | "current" | "personal") =>
      ({ ...buildRow({ plugin: plugin({ name }), entries: [], repo: REPO, tags: [], commits: [] }), group });
    const sorted = sortRows([make("Zeta", "personal"), make("Beta", "current"), make("Alpha", "personal"), make("Gamma", "needs-release")]);
    expect(sorted.map((r) => r.name)).toEqual(["Gamma", "Beta", "Alpha", "Zeta"]);
  });
});
