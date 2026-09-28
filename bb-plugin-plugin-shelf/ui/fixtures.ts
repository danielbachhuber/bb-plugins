// Invented shelf data for stories and tests. Every name, subject, and sha
// here is made up; none comes from a real checkout.
import type { Commit, ShelfList, ShelfRow } from "../shelf/types";

/** A fixed "now", so relative dates in stories do not drift. */
export const FIXTURE_NOW = Date.UTC(2026, 8, 24, 14, 20);

function sha(seed: string): string {
  return seed.repeat(Math.ceil(40 / seed.length)).slice(0, 40);
}

function commit(seed: string, subject: string, daysAgo: number, docsOnly = false): Commit & { docsOnly: boolean } {
  return {
    sha: sha(seed),
    subject,
    date: new Date(FIXTURE_NOW - daysAgo * 86_400_000).toISOString(),
    files: [docsOnly ? "bb-plugin-widgets/README.md" : "bb-plugin-widgets/app.tsx"],
    docsOnly,
  };
}

function row(overrides: Partial<ShelfRow> & Pick<ShelfRow, "id" | "name">): ShelfRow {
  return {
    dir: `bb-plugin-${overrides.id}`,
    description: "",
    version: "0.1.0",
    installed: true,
    group: "personal",
    entryId: null,
    latestTag: null,
    latestVersion: null,
    commits: [],
    docsChangesOnly: false,
    flags: [],
    ...overrides,
  };
}

export function fixtureRows(): ShelfRow[] {
  return [
    row({
      id: "widgets",
      name: "Widgets",
      description:
        "Arranges widgets on a grid beside the thread, with a snap-to-grid toggle and a count of widgets placed so far.",
      version: "0.1.3",
      group: "needs-release",
      entryId: "widgets",
      latestTag: "widgets/v0.1.2",
      latestVersion: "0.1.2",
      commits: [
        commit("4f1c", "Add a snap-to-grid toggle to Widgets", 1),
        commit("9a2e", "Describe the snap-to-grid toggle in the Widgets README", 2, true),
        commit("c07b", "Keep a widget's position when the panel resizes", 6),
      ],
      flags: [{ kind: "version-mismatch", packageVersion: "0.1.3", tagVersion: "0.1.2" }],
    }),
    row({
      id: "gadgets",
      name: "Gadgets",
      description: "Lists the gadgets attached to a thread.",
      group: "current",
      entryId: "gadgets",
      latestTag: "gadgets/v0.1.0",
      latestVersion: "0.1.0",
    }),
    row({
      id: "sprockets",
      name: "Sprockets",
      description: "Counts sprockets per project and graphs them over a week.",
      version: "0.2.0",
      group: "current",
      entryId: "sprockets",
      latestTag: "sprockets/v0.2.0",
      latestVersion: "0.2.0",
      commits: [commit("b3d8", "List related plugins in the Sprockets README", 3, true)],
      docsChangesOnly: true,
    }),
    row({
      id: "gizmos",
      name: "Gizmos",
      description: "Local tweaks for one person's gizmo workflow.",
    }),
    row({
      id: "doohickeys",
      name: "Doohickeys",
      description: "An experiment that is not installed on this machine.",
      installed: false,
      flags: [{ kind: "id-taken", url: "https://github.com/octocat/doohickeys.git" }],
    }),
  ];
}

export function fixtureList(overrides: Partial<ShelfList> = {}): ShelfList {
  return {
    checkout: { root: "/Users/octocat/projects/widgets", repo: "github.com/acme/widgets" },
    emptyReason: null,
    rows: fixtureRows(),
    fetchedAt: FIXTURE_NOW - 4 * 60_000,
    fetchError: null,
    marketplaceError: null,
    ...overrides,
  };
}

export function unknownList(): ShelfList {
  return fixtureList({
    rows: fixtureRows().map((r) => ({
      ...r,
      group: "unknown",
      entryId: null,
      latestTag: null,
      latestVersion: null,
      commits: [],
      docsChangesOnly: false,
      flags: [],
    })),
    marketplaceError: "fetch failed",
  });
}

export function emptyList(): ShelfList {
  return {
    checkout: null,
    emptyReason: "/tmp/somewhere is not inside a git checkout.",
    rows: [],
    fetchedAt: null,
    fetchError: null,
    marketplaceError: null,
  };
}
