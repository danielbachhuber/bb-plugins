import { describe, expect, it } from "vitest";
import {
  buildRepoFilter,
  loadedRepoSlugs,
  matchProjectForRepo,
  matchProjectTargetForRepo,
  parseRepositorySlugs,
  parseRemoteSlug,
  toProjectCandidates,
} from "./projects.js";

describe("parseRemoteSlug", () => {
  it("parses an SSH remote", () => {
    expect(parseRemoteSlug("git@github.com:acme/widgets.git")).toBe("acme/widgets");
  });

  it("parses an HTTPS remote with and without .git", () => {
    expect(parseRemoteSlug("https://github.com/acme/widgets.git")).toBe("acme/widgets");
    expect(parseRemoteSlug("https://github.com/acme/widgets")).toBe("acme/widgets");
  });

  it("parses an ssh:// URL", () => {
    expect(parseRemoteSlug("ssh://git@github.com/acme/widgets.git")).toBe("acme/widgets");
  });

  it("ignores a trailing slash", () => {
    expect(parseRemoteSlug("https://github.com/acme/widgets/")).toBe("acme/widgets");
  });

  it("returns null for a non-GitHub or unparseable remote", () => {
    expect(parseRemoteSlug("https://gitlab.com/acme/widgets.git")).toBeNull();
    expect(parseRemoteSlug("not a url")).toBeNull();
    expect(parseRemoteSlug("")).toBeNull();
  });
});

describe("matchProjectForRepo", () => {
  const projects = [
    { id: "proj_a", remoteUrls: ["git@github.com:acme/widgets.git"] },
    { id: "proj_b", remoteUrls: ["https://github.com/acme/gadgets"] },
  ];

  it("matches regardless of remote URL form", () => {
    expect(matchProjectForRepo("acme/widgets", projects)).toBe("proj_a");
    expect(matchProjectForRepo("acme/gadgets", projects)).toBe("proj_b");
  });

  it("matches case-insensitively, as GitHub slugs are", () => {
    expect(matchProjectForRepo("ACME/Widgets", projects)).toBe("proj_a");
  });

  it("returns null when nothing matches", () => {
    expect(matchProjectForRepo("acme/unknown", projects)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(matchProjectForRepo("acme/widgets", [])).toBeNull();
  });
});

describe("matchProjectTargetForRepo", () => {
  const candidates = [
    {
      id: "proj_a",
      remoteUrls: ["git@github.com:acme/widgets.git"],
      hostId: "host_1",
    },
    { id: "proj_b", remoteUrls: ["git@github.com:acme/gadgets.git"] },
  ];

  it("carries the host, which a seeded worktree environment is rejected without", () => {
    expect(matchProjectTargetForRepo("acme/widgets", candidates)).toEqual({
      id: "proj_a",
      hostId: "host_1",
      path: null,
    });
  });

  it("still matches a project whose host was not gathered", () => {
    expect(matchProjectTargetForRepo("acme/gadgets", candidates)).toEqual({
      id: "proj_b",
      hostId: null,
      path: null,
    });
  });

  it("returns null for a repository with no project", () => {
    expect(matchProjectTargetForRepo("acme/nothing", candidates)).toBeNull();
  });
});

describe("loadedRepoSlugs", () => {
  it("collects the slugs of projects whose remote parses", () => {
    expect(
      loadedRepoSlugs([
        { id: "p1", remoteUrls: ["git@github.com:Acme/Widgets.git"] },
        { id: "p2", remoteUrls: ["https://gitlab.com/acme/gadgets.git"] },
        { id: "p3", remoteUrls: [] },
      ]),
    ).toEqual(new Set(["acme/widgets"]));
  });
});

describe("parseRepositorySlugs", () => {
  it("splits on commas and newlines and lowercases", () => {
    expect(parseRepositorySlugs("acme/widgets, Acme/Gadgets\nocto/cat")).toEqual([
      "acme/widgets",
      "acme/gadgets",
      "octo/cat",
    ]);
  });

  it("drops entries that are not a valid repository slug", () => {
    // Anything reaching a gh argv is validated here, not at the call site.
    expect(parseRepositorySlugs("acme/widgets, not a repo, acme/gadgets;rm -rf /")).toEqual([
      "acme/widgets",
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(parseRepositorySlugs("")).toEqual([]);
    expect(parseRepositorySlugs("  \n ")).toEqual([]);
  });
});

describe("buildRepoFilter", () => {
  const candidates = [{ id: "p1", remoteUrls: ["git@github.com:acme/widgets.git"] }];

  it("allows only loaded projects when enabled", () => {
    const filter = buildRepoFilter({ enabled: true, candidates, extras: "" });
    expect(filter.scoped).toBe(true);
    expect(filter.allows("acme/widgets")).toBe(true);
    expect(filter.allows("Acme/Widgets")).toBe(true);
    expect(filter.allows("acme/gadgets")).toBe(false);
  });

  it("also allows the extra repositories", () => {
    const filter = buildRepoFilter({ enabled: true, candidates, extras: "acme/gadgets" });
    expect(filter.allows("acme/gadgets")).toBe(true);
  });

  it("allows everything when disabled", () => {
    const filter = buildRepoFilter({ enabled: false, candidates, extras: "" });
    expect(filter.scoped).toBe(false);
    expect(filter.allows("acme/gadgets")).toBe(true);
  });

  it("stays scoped when no project matches, rather than falling back to everything", () => {
    // A silent fallback to "show all" would defeat the setting exactly when it
    // matters most: a machine with nothing checked out.
    const filter = buildRepoFilter({ enabled: true, candidates: [], extras: "" });
    expect(filter.scoped).toBe(true);
    expect(filter.allows("acme/widgets")).toBe(false);
  });

  it("partitions a repository list into kept and skipped", () => {
    const filter = buildRepoFilter({ enabled: true, candidates, extras: "" });
    expect(filter.partition(["acme/widgets", "acme/gadgets", "octo/cat"])).toEqual({
      kept: ["acme/widgets"],
      skipped: ["acme/gadgets", "octo/cat"],
    });
  });
});

describe("toProjectCandidates", () => {
  const fork = {
    id: "proj_a",
    gitRemoteUrl: "git@github.com:octocat/widgets.git",
    sources: [
      { path: "/checkouts/other", hostId: "host_1", isDefault: false },
      { path: "/checkouts/widgets", hostId: "host_1", isDefault: true },
    ],
  };

  const remotes = async (path: string) =>
    path === "/checkouts/widgets"
      ? ["git@github.com:octocat/widgets.git", "git@github.com:acme/widgets.git"]
      : ["git@github.com:acme/gadgets.git"];

  it("matches a fork checkout by its upstream remote", async () => {
    const candidates = await toProjectCandidates([fork], remotes);
    expect(matchProjectForRepo("acme/widgets", candidates)).toBe("proj_a");
    expect(matchProjectForRepo("octocat/widgets", candidates)).toBe("proj_a");
  });

  it("reads remotes from the default checkout", async () => {
    const [candidate] = await toProjectCandidates([fork], remotes);
    expect(candidate!.path).toBe("/checkouts/widgets");
    expect(candidate!.hostId).toBe("host_1");
    expect(matchProjectForRepo("acme/gadgets", [candidate!])).toBeNull();
  });

  it("does not repeat the recorded remote", async () => {
    const [candidate] = await toProjectCandidates([fork], remotes);
    expect(candidate!.remoteUrls).toEqual([
      "git@github.com:octocat/widgets.git",
      "git@github.com:acme/widgets.git",
    ]);
  });

  it("keeps the recorded remote when the checkout cannot be read", async () => {
    const candidates = await toProjectCandidates([fork], async () => []);
    expect(matchProjectForRepo("octocat/widgets", candidates)).toBe("proj_a");
  });

  it("handles a project with no source and no remote", async () => {
    const candidates = await toProjectCandidates([{ id: "proj_b" }], remotes);
    expect(candidates).toEqual([{ id: "proj_b", remoteUrls: [] }]);
  });

  it("carries the path through matchProjectTargetForRepo", async () => {
    const candidates = await toProjectCandidates([fork], remotes);
    expect(matchProjectTargetForRepo("acme/widgets", candidates)).toEqual({
      id: "proj_a",
      hostId: "host_1",
      path: "/checkouts/widgets",
    });
  });
});
