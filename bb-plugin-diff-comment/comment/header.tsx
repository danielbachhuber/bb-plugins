// The thread-header button: how the comments reach the agent.
//
// It lives in the header rather than only in the panel because that is where
// you are when you are reading a diff and leaving comments. The panel tab is a
// place you have to know to open; the header is in front of you.
//
// Like the panel's button, it fills the composer and stops there. The SDK has
// no unconditional submit — `experimental_submit` only schedules — and that is
// a deliberate limit: sending a message on your behalf is your affordance, not
// a plugin's.
import { useState } from "react";
import { useComposer } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { agentPrompt } from "./prompt";
import { useThreadComments } from "./useComments";

export function CommentHeaderAction({
  threadId,
  isCompactViewport,
}: {
  threadId: string;
  projectId: string;
  isCompactViewport: boolean;
}) {
  const { counts } = useThreadComments(threadId);
  const composer = useComposer();
  const [sent, setSent] = useState(false);

  // Nothing to hand over means no control at all: this slot renders in every
  // thread, and a dead button in all of them is worse than an absent one.
  if (counts.open === 0) return null;

  const label = `Send ${counts.open} diff comment${counts.open === 1 ? "" : "s"} to the agent`;

  return (
    // The tooltip sits on a wrapper: the shared Button does not take `title`.
    <span title={sent ? "In the composer — press Enter to send" : label}>
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5"
        aria-label={label}
        onClick={() => {
          composer.setText(agentPrompt(counts.open));
          setSent(true);
        }}
      >
        <Icon name="MessageSquare" className="size-4" />
        <span className="tabular-nums">{counts.open}</span>
        {/* The row is short on a phone; the count and glyph carry it there. */}
        {isCompactViewport ? null : <span>{sent ? "In composer" : "Send to agent"}</span>}
      </Button>
    </span>
  );
}
