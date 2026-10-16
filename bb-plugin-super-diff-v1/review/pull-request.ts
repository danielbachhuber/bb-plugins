// Every GitHub call Super Diff makes, through `gh`. Reading a pull request's
// files with the viewer's Viewed state is one GraphQL query per 100 files;
// marking a file viewed or not is one mutation.
import type { GhRunner } from "@danielb/gh-shared/gh";
import type { GithubFile } from "./github";

/** `owner/name` and number from a GitHub pull request URL. */
export function pullRequestRef(url: string): { owner: string; name: string; number: number } | null {
  const match = /github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/.exec(url);
  if (match === null) return null;
  return { owner: match[1]!, name: match[2]!, number: Number(match[3]) };
}

export interface PullRequestFiles {
  /** The pull request's node id, which the mutations need. */
  id: string;
  url: string;
  files: GithubFile[];
}

const FILES_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      files(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { path additions deletions viewerViewedState }
      }
    }
  }
}`;

/** Stops a pull request with an enormous file list from paging forever. */
const MAX_PAGES = 30;

interface FilesPage {
  data?: {
    repository?: {
      pullRequest?: {
        id: string;
        files: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ path: string; additions: number; deletions: number; viewerViewedState: string }>;
        };
      } | null;
    } | null;
  };
}

export async function fetchPullRequestFiles(gh: GhRunner, url: string): Promise<PullRequestFiles | null> {
  const ref = pullRequestRef(url);
  if (ref === null) return null;
  const files: GithubFile[] = [];
  let id: string | null = null;
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const args = ["api", "graphql", "-f", `query=${FILES_QUERY}`, "-f", `owner=${ref.owner}`, "-f", `name=${ref.name}`, "-F", `number=${ref.number}`];
    if (after !== null) args.push("-f", `after=${after}`);
    const body = JSON.parse(await gh.run(args)) as FilesPage;
    const pull = body.data?.repository?.pullRequest;
    if (pull === null || pull === undefined) return null;
    id = pull.id;
    for (const node of pull.files.nodes) {
      files.push({ path: node.path, additions: node.additions, deletions: node.deletions, viewed: node.viewerViewedState === "VIEWED" });
    }
    if (!pull.files.pageInfo.hasNextPage) break;
    after = pull.files.pageInfo.endCursor;
  }
  return id === null ? null : { id, url, files };
}

const MARK = `mutation($id: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;
const UNMARK = `mutation($id: ID!, $path: String!) {
  unmarkFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;

export async function setFileViewed(gh: GhRunner, pullRequestId: string, path: string, viewed: boolean): Promise<void> {
  await gh.run(["api", "graphql", "-f", `query=${viewed ? MARK : UNMARK}`, "-f", `id=${pullRequestId}`, "-f", `path=${path}`]);
}
