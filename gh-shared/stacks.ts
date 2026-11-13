import { REPO_SLUG_PATTERN, type GhRunner } from "./gh.js";

/**
 * Where one pull request sits in a stack on GitHub: pull requests linked with
 * `gh stack`, which GitHub shows as "stack #N" and numbers from the base
 * branch up.
 */
export interface StackPosition {
  /** The stack's own number in its repository: "stack #N" on GitHub. */
  number: number;
  /** This pull request's place, 1 for the one closest to the base branch. */
  position: number;
  /** Every pull request in the stack, merged ones included, as GitHub counts it. */
  size: number;
  /**
   * Every pull request in the stack, bottom first. `approved` is whether the
   * viewer's latest review of an open one approves it.
   */
  entries: Array<{ number: number; title: string; url: string; state: "open" | "closed" | "merged"; approved: boolean }>;
}

/** `repo#number`, the key both sweeps store rows under. */
export function stackKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

/**
 * One query for every repository, each under its own alias. The first 100 open
 * pull requests, most recently updated first, which covers any stack still
 * being worked on, with each one's stack entry and whether the viewer's
 * latest review approves it. Merged and closed entries are not in that list,
 * and need no approval.
 */
export function stacksQuery(count: number): string {
  const params = Array.from({ length: count }, (_, i) => `$o${i}: String!, $n${i}: String!`).join(", ");
  const fields = Array.from(
    { length: count },
    (_, i) => `  r${i}: repository(owner: $o${i}, name: $n${i}) {
    nameWithOwner
    pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number
        latestOpinionatedReviews(first: 20) { nodes { state viewerDidAuthor } }
        stackEntry {
          position
          stack { number size entries(first: 50) { nodes { position pullRequest { number title url state } } } }
        }
      }
    }
  }`,
  ).join("\n");
  return `query(${params}) {\n${fields}\n}`;
}

interface RawEntry {
  position?: unknown;
  pullRequest?: { number?: unknown; title?: unknown; url?: unknown; state?: unknown } | null;
}

interface RawRepository {
  nameWithOwner?: string;
  pullRequests?: {
    nodes?: Array<{
      number?: unknown;
      latestOpinionatedReviews?: { nodes?: Array<{ state?: unknown; viewerDidAuthor?: unknown } | null> | null } | null;
      stackEntry?: {
        position?: unknown;
        stack?: { number?: unknown; size?: unknown; entries?: { nodes?: Array<RawEntry | null> | null } | null } | null;
      } | null;
    } | null> | null;
  };
}

/** Positions keyed by `stackKey`, for every pull request in a stack, in every repository in the response. */
export function parseStacks(raw: string): Map<string, StackPosition> {
  const parsed = JSON.parse(raw) as { data?: Record<string, RawRepository | null> };
  const positions = new Map<string, StackPosition>();
  for (const repository of Object.values(parsed.data ?? {})) {
    const repo = repository?.nameWithOwner;
    if (!repo) continue;
    const nodes = repository.pullRequests?.nodes ?? [];
    const approved = new Set(
      nodes.flatMap((node) =>
        typeof node?.number === "number" &&
        (node.latestOpinionatedReviews?.nodes ?? []).some((review) => review?.viewerDidAuthor === true && review.state === "APPROVED")
          ? [node.number]
          : [],
      ),
    );
    for (const node of nodes) {
      const entry = node?.stackEntry;
      const stack = entry?.stack;
      if (
        typeof node?.number !== "number" ||
        typeof entry?.position !== "number" ||
        typeof stack?.number !== "number" ||
        typeof stack.size !== "number"
      ) {
        continue;
      }
      const entries = (stack.entries?.nodes ?? [])
        .flatMap((other) => {
          const pr = other?.pullRequest;
          if (typeof other?.position !== "number" || typeof pr?.number !== "number" || typeof pr.url !== "string") return [];
          const state = String(pr.state ?? "").toUpperCase();
          return [
            {
              position: other.position,
              number: pr.number,
              title: typeof pr.title === "string" ? pr.title : "",
              url: pr.url,
              state: state === "MERGED" ? ("merged" as const) : state === "CLOSED" ? ("closed" as const) : ("open" as const),
            },
          ];
        })
        .sort((a, b) => a.position - b.position)
        .map(({ number, title, url, state }) => ({ number, title, url, state, approved: state === "open" && approved.has(number) }));
      positions.set(stackKey(repo, node.number), { number: stack.number, position: entry.position, size: stack.size, entries });
    }
  }
  return positions;
}

/**
 * Stack positions for every open pull request in these repositories, in one
 * GraphQL call. The caller treats a failure as "no stacks" rather than a
 * failed sweep.
 */
export async function fetchStacks(gh: GhRunner, repos: string[]): Promise<Map<string, StackPosition>> {
  const valid = repos.filter((repo) => REPO_SLUG_PATTERN.test(repo));
  if (valid.length === 0) return new Map();
  const args = ["api", "graphql", "-f", `query=${stacksQuery(valid.length)}`];
  valid.forEach((repo, i) => {
    const [owner, name] = repo.split("/");
    args.push("-f", `o${i}=${owner}`, "-f", `n${i}=${name}`);
  });
  return parseStacks(await gh.run(args));
}
