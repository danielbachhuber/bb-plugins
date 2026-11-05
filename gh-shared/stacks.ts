import { REPO_SLUG_PATTERN, type GhRunner } from "./gh.js";

/**
 * Where one pull request sits in a stack on GitHub: pull requests linked with
 * `gh stack`, which GitHub shows as "stack #N" and numbers from the base
 * branch up.
 */
export interface StackPosition {
  /** 1 for the pull request closest to the base branch, as GitHub counts it. */
  index: number;
  /** Every pull request in the stack, merged ones included, as GitHub counts it. */
  size: number;
  /** The open pull request directly below this one, or null when the one below has merged or there is none. */
  on: number | null;
}

/** `repo#number`, the key both sweeps store rows under. */
export function stackKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

/**
 * One query for every repository, each under its own alias. The first 100 open
 * pull requests, most recently updated first, which covers any stack still
 * being worked on, with each one's stack entry.
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
        stackEntry {
          position
          stack { size entries(first: 50) { nodes { position pullRequest { number state } } } }
        }
      }
    }
  }`,
  ).join("\n");
  return `query(${params}) {\n${fields}\n}`;
}

interface RawEntry {
  position?: unknown;
  pullRequest?: { number?: unknown; state?: unknown } | null;
}

interface RawRepository {
  nameWithOwner?: string;
  pullRequests?: {
    nodes?: Array<{
      number?: unknown;
      stackEntry?: {
        position?: unknown;
        stack?: { size?: unknown; entries?: { nodes?: Array<RawEntry | null> | null } | null } | null;
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
    for (const node of repository.pullRequests?.nodes ?? []) {
      const entry = node?.stackEntry;
      const size = entry?.stack?.size;
      if (typeof node?.number !== "number" || typeof entry?.position !== "number" || typeof size !== "number") {
        continue;
      }
      const index = entry.position;
      const below = (entry.stack?.entries?.nodes ?? []).find((other) => other?.position === index - 1)?.pullRequest;
      const on =
        typeof below?.number === "number" && String(below.state ?? "").toUpperCase() === "OPEN" ? below.number : null;
      positions.set(stackKey(repo, node.number), { index, size, on });
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
