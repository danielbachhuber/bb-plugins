// The thread header's token count. Display only.
import { formatTokens } from "@/usage/series";

export interface ThreadTokens {
  input: number;
  cacheRead: number;
  output: number;
  total: number;
  turns: number;
}

export function ThreadTokenCount({ usage }: { usage: ThreadTokens }) {
  const detail = [
    `${usage.total.toLocaleString()} tokens over ${usage.turns} ${usage.turns === 1 ? "turn" : "turns"}`,
    `New input: ${usage.input.toLocaleString()}`,
    `Cache reads: ${usage.cacheRead.toLocaleString()}`,
    `Output: ${usage.output.toLocaleString()}`,
  ].join("\n");
  return (
    <span
      className="inline-flex h-7 items-center whitespace-nowrap px-1.5 text-xs tabular-nums text-muted-foreground"
      title={detail}
      aria-label={`${formatTokens(usage.total)} tokens used by this thread`}
    >
      {formatTokens(usage.total)} tokens
    </span>
  );
}
