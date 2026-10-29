import type { ReactNode } from "react";
import { CommentCard } from "./comment/cards";
import type { Comment } from "./comment/types";

export default { title: "diff-comment/Comments" };

const NOW = Date.parse("2026-09-17T12:00:00Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const noop = () => {};

function Frame({ children }: { children: ReactNode }) {
  return (
    <div data-screenshot-frame style={{ width: 640, padding: 16 }}>
      {children}
    </div>
  );
}

const conversation: Comment = {
  id: "c1",
  threadId: "thr_1",
  path: "src/sprocket.ts",
  side: "new",
  line: 18,
  anchor: { text: "  return gear.teeth * ratio;", before: null, after: null },
  body: "Does `ratio` need clamping here too?",
  state: "addressed",
  reply: "They can pass `0`, because they skip `gearFor()`. I added `Math.max(1, ratio)` here and a test for a zero ratio.",
  messages: [
    {
      author: "agent",
      body: "No: `gearFor()` already clamps it to at least `1`, and this is its only caller.",
      at: at(3),
    },
    { author: "you", body: "What about the tests that build a `Gear` by hand?", at: at(2) },
    {
      author: "agent",
      body: "They can pass `0`, because they skip `gearFor()`. I added `Math.max(1, ratio)` here and a test for a zero ratio.",
      at: at(1),
    },
  ],
  seq: 3,
  createdAt: at(4),
  updatedAt: at(1),
};

/** An answered comment shows the whole exchange in order, and Reply answers the agent back in the same subthread. */
export const ConversationWithTheAgent = () => (
  <Frame>
    <CommentCard
      comment={conversation}
      onSetState={noop}
      onEdit={noop}
      onRemove={noop}
      onFollowUp={async () => {}}
    />
  </Frame>
);
