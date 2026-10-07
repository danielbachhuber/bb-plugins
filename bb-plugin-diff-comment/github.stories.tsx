import type { ReactNode } from "react";
import { GithubThreadCard } from "./github/card";
import { GithubSection } from "./github/section";
import type { GithubComment, GithubReview, GithubThread } from "./github/threads";

export default { title: "diff-comment/GitHub review threads" };

const NOW = Date.parse("2026-09-17T12:00:00Z");
const PR = "https://github.com/acme/widgets/pull/42";

function comment(id: number, author: string, body: string, hoursAgo: number, pending = false): GithubComment {
  return {
    id: `PRRC_${id}`,
    url: `${PR}#discussion_r${id}`,
    author,
    body,
    createdAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    pending,
  };
}

function thread(overrides: Partial<GithubThread> & Pick<GithubThread, "id" | "comments">): GithubThread {
  return {
    path: "src/sprocket.ts",
    side: "new",
    line: 18,
    anchor: { text: "  return gear.teeth * ratio;", before: null, after: null },
    resolved: false,
    outdated: false,
    ...overrides,
  };
}

const conversation = thread({
  id: "PRRT_1",
  comments: [
    comment(1, "octocat", "Can `ratio` be zero here? A sprocket with no teeth would divide by it later.", 30),
    comment(2, "hubber", "It can't: `ratio` is clamped to `1` in `gearFor()`. I'll add a comment saying so.", 26),
  ],
});

const draft = thread({
  id: "PRRT_2",
  comments: [comment(3, "hubber", "Nit: `teethCount` would match the other getters.", 0.1, true)],
});

const review: GithubReview = {
  number: 42,
  url: PR,
  threads: [
    conversation,
    draft,
    thread({
      id: "PRRT_3",
      path: "src/gadget.ts",
      line: 7,
      outdated: true,
      comments: [comment(4, "octocat", "This import is unused now.", 50)],
    }),
    thread({
      id: "PRRT_4",
      path: "README.md",
      line: null,
      anchor: null,
      comments: [comment(5, "octocat", "Worth a sentence on sprockets in the usage section.", 48)],
    }),
    thread({
      id: "PRRT_5",
      resolved: true,
      comments: [comment(6, "octocat", "Typo in the docstring.", 72)],
    }),
  ],
};

function Frame({ children, width = 640 }: { children: ReactNode; width?: number }) {
  return <div style={{ width, padding: 16 }}>{children}</div>;
}

/** A review thread on the diff: the comment and its reply, with a link to answer on GitHub. */
export const ThreadOnTheDiff = () => (
  <Frame>
    <GithubThreadCard thread={conversation} number={42} now={NOW} />
  </Frame>
);

/** A draft on your own unsubmitted review is marked Pending, since only you can see it. */
export const PendingDraft = () => (
  <Frame>
    <GithubThreadCard thread={draft} number={42} now={NOW} />
  </Frame>
);

/**
 * The Diff comments panel lists every unresolved thread on the pull request,
 * including ones the diff cannot show: outdated threads and comments on a whole file.
 */
export const PanelSection = () => (
  <Frame width={380}>
    <div className="bg-background rounded-md border">
      <GithubSection review={review} />
    </div>
  </Frame>
);
