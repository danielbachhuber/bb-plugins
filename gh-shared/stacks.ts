import { REPO_SLUG_PATTERN, type GhRunner } from "./gh.js";

/**
 * Where one pull request sits in a stack: pull requests built on each other's
 * branches, so each merges after the one below it.
 */
export interface StackPosition {
  /** 1 for the bottom of the stack, the one whose base is not another open pull request. */
  index: number;
  /** Every open pull request in the stack, branches included. */
  size: number;
  /** The pull request this one is built on, or null at the bottom. */
  on: number | null;
}

/** One open pull request, as much of it as a stack needs. */
export interface StackNode {
  number: number;
  baseRefName: string;
  headRefName: string;
  /** A fork's branch names can match this repository's, so a fork is never a base. */
  isCrossRepository: boolean;
}

/**
 * Each pull request's place in its stack, for the pull requests that are in
 * one. A pull request on a branch with no open pull request, including the
 * default branch, is the bottom; one alone at the bottom is not in a stack and
 * is left out.
 *
 * With a branch, where two pull requests share one base, both sit at the same
 * index and the size counts the whole tree.
 */
export function stackPositions(nodes: StackNode[], defaultBranch?: string): Map<number, StackPosition> {
  const byHead = new Map<string, StackNode>();
  for (const node of nodes) {
    if (node.isCrossRepository || node.headRefName === defaultBranch) continue;
    byHead.set(node.headRefName, node);
  }

  // Walk down to the bottom, counting steps. A cycle cannot happen on GitHub,
  // but a visited set keeps a malformed payload from looping.
  const walk = (node: StackNode): { root: number; depth: number; on: number | null } => {
    const seen = new Set<number>([node.number]);
    const on = byHead.get(node.baseRefName)?.number ?? null;
    let current = node;
    let depth = 0;
    for (;;) {
      const below = byHead.get(current.baseRefName);
      if (!below || seen.has(below.number)) break;
      seen.add(below.number);
      current = below;
      depth += 1;
    }
    return { root: current.number, depth, on };
  };

  const walked = nodes.map((node) => ({ node, ...walk(node) }));
  const sizes = new Map<number, number>();
  for (const { root } of walked) sizes.set(root, (sizes.get(root) ?? 0) + 1);

  const positions = new Map<number, StackPosition>();
  for (const { node, root, depth, on } of walked) {
    const size = sizes.get(root)!;
    if (size > 1) positions.set(node.number, { index: depth + 1, size, on });
  }
  return positions;
}

/** `repo#number`, the key both sweeps store rows under. */
export function stackKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

/**
 * One query for every repository, each under its own alias. The first 100 open
 * pull requests, most recently updated first, which covers any stack still
 * being worked on.
 */
export function stacksQuery(count: number): string {
  const params = Array.from({ length: count }, (_, i) => `$o${i}: String!, $n${i}: String!`).join(", ");
  const fields = Array.from(
    { length: count },
    (_, i) => `  r${i}: repository(owner: $o${i}, name: $n${i}) {
    nameWithOwner
    defaultBranchRef { name }
    pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number baseRefName headRefName isCrossRepository }
    }
  }`,
  ).join("\n");
  return `query(${params}) {\n${fields}\n}`;
}

interface RawRepository {
  nameWithOwner?: string;
  defaultBranchRef?: { name?: string } | null;
  pullRequests?: { nodes?: Array<Partial<StackNode> | null> | null };
}

/** Positions keyed by `stackKey`, for every repository in the response. */
export function parseStacks(raw: string): Map<string, StackPosition> {
  const parsed = JSON.parse(raw) as { data?: Record<string, RawRepository | null> };
  const positions = new Map<string, StackPosition>();
  for (const repository of Object.values(parsed.data ?? {})) {
    const repo = repository?.nameWithOwner;
    if (!repo) continue;
    const nodes = (repository.pullRequests?.nodes ?? []).flatMap((node) =>
      node && typeof node.number === "number" && node.baseRefName && node.headRefName
        ? [{ number: node.number, baseRefName: node.baseRefName, headRefName: node.headRefName, isCrossRepository: node.isCrossRepository === true }]
        : [],
    );
    for (const [number, position] of stackPositions(nodes, repository.defaultBranchRef?.name ?? undefined)) {
      positions.set(stackKey(repo, number), position);
    }
  }
  return positions;
}

/**
 * Stack positions for every open pull request in these repositories, in one
 * GraphQL call. A stack needs the pull requests on either side of a row, which
 * the sweep's own list often leaves out: a stack's other layers may be someone
 * else's, or not asking you to review. The caller treats a failure as "no
 * stacks" rather than a failed sweep.
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
