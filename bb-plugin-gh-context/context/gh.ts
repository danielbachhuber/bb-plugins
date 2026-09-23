import type { GhRunner } from "@danielb/gh-shared/gh";
import type { IssueRef } from "./rules.js";

/**
 * The only module that runs `gh`.
 *
 * The banner asks for the same issue and pull request every time it renders
 * and every time something in the thread changes, so answers are cached. A
 * failure is cached too, for less time: an unauthenticated or missing `gh`
 * would otherwise be asked again on every render, and the banner is useful
 * without titles.
 */

export interface GhIssue {
  title: string;
  state: "open" | "closed";
}

export interface GhPullRequest {
  title: string;
  url: string;
  body: string;
  state: "open" | "draft" | "closed" | "merged";
  closing: IssueRef[];
}

export interface Gh {
  issue(ref: IssueRef): Promise<GhIssue | null>;
  pullRequest(ref: IssueRef): Promise<GhPullRequest | null>;
}

const ANSWER_TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 60_000;

interface IssueJson {
  title?: unknown;
  state?: unknown;
}

interface PullRequestJson {
  title?: unknown;
  url?: unknown;
  body?: unknown;
  state?: unknown;
  isDraft?: unknown;
  closingIssuesReferences?: Array<{
    number?: unknown;
    repository?: { name?: unknown; owner?: { login?: unknown } };
  }>;
}

function parseIssue(json: IssueJson): GhIssue | null {
  if (typeof json.title !== "string" || typeof json.state !== "string") return null;
  return { title: json.title, state: json.state.toUpperCase() === "OPEN" ? "open" : "closed" };
}

function parsePullRequest(json: PullRequestJson): GhPullRequest | null {
  if (typeof json.title !== "string" || typeof json.url !== "string") return null;
  const state = typeof json.state === "string" ? json.state.toUpperCase() : "";
  const closing: IssueRef[] = [];
  for (const ref of json.closingIssuesReferences ?? []) {
    const owner = ref.repository?.owner?.login;
    const name = ref.repository?.name;
    if (typeof ref.number !== "number" || typeof owner !== "string" || typeof name !== "string") {
      continue;
    }
    closing.push({ repo: `${owner}/${name}`.toLowerCase(), number: ref.number });
  }
  return {
    title: json.title,
    url: json.url,
    body: typeof json.body === "string" ? json.body : "",
    state:
      state === "MERGED"
        ? "merged"
        : state === "CLOSED"
          ? "closed"
          : json.isDraft === true
            ? "draft"
            : "open",
    closing,
  };
}

export function createGh(runner: GhRunner, now: () => number = Date.now): Gh {
  const cache = new Map<string, { value: unknown; expiresAt: number }>();

  async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.value as T | null;
    let value: T | null = null;
    try {
      value = await load();
    } catch {
      value = null;
    }
    cache.set(key, { value, expiresAt: now() + (value === null ? FAILURE_TTL_MS : ANSWER_TTL_MS) });
    return value;
  }

  return {
    issue(ref) {
      return cached(`issue:${ref.repo}#${ref.number}`, async () =>
        parseIssue(
          JSON.parse(
            await runner.run([
              "issue",
              "view",
              String(ref.number),
              "--repo",
              ref.repo,
              "--json",
              "title,state",
            ]),
          ) as IssueJson,
        ),
      );
    },
    pullRequest(ref) {
      return cached(`pull:${ref.repo}#${ref.number}`, async () =>
        parsePullRequest(
          JSON.parse(
            await runner.run([
              "pr",
              "view",
              String(ref.number),
              "--repo",
              ref.repo,
              "--json",
              "title,url,body,state,isDraft,closingIssuesReferences",
            ]),
          ) as PullRequestJson,
        ),
      );
    },
  };
}
