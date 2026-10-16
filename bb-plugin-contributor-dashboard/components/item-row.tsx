// One row of a list of issues or pull requests: who it is assigned to, what
// it is, the facts that list cares about, and the two things worth doing from
// here. Drawn like the sweeps' rows, and the same height as before: an icon
// button is no taller than the line of text beside it.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { writeLinkToClipboard } from "@danielbachhuber/bb-plugin-component-library/copy-link";
import { StartingThreadLine, THREAD_EDGE_INSET, ThreadLine, type ThreadStatus } from "@danielbachhuber/bb-plugin-component-library/thread-status";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** How long the tick stays up before the copy glyph returns. */
const COPIED_MS = 1500;

// Written out rather than set as Tailwind classes: bb's stylesheet is
// prebuilt, so an arbitrary colour class a plugin invents has no rule.
const INITIAL_COLORS = ["#6b4fbb", "#1b7f5a", "#b4530a", "#2a5fb0", "#8a2f6b"];
const UNASSIGNED = "#f08a24";

function Initial({ login }: { login: string }) {
  return (
    <span
      style={{ background: INITIAL_COLORS[login.charCodeAt(0) % INITIAL_COLORS.length] }}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-medium uppercase leading-none text-white"
    >
      {login[0]}
    </span>
  );
}

/**
 * Initials when someone owns it, and the glyph gh-context draws for a pull
 * request nobody has been asked to review when nobody does. Most rows are the
 * second case: on a real repository seven issues in ten have no assignee.
 */
export function Assignees({ logins }: { logins: readonly string[] }) {
  if (logins.length === 0) {
    return (
      <span style={{ color: UNASSIGNED }} title="Nobody assigned" className="inline-flex shrink-0">
        <Icon name="UserRoundPlus" className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 -space-x-1" title={logins.join(", ")}>
      {logins.slice(0, 3).map((login) => (
        <Initial key={login} login={login} />
      ))}
    </span>
  );
}

/**
 * What a row's thread is doing, from bb's sidebar. The page provides it once,
 * from component-library's useThreadStatus, so the views between need not
 * pass it down; the stories provide fixtures.
 */
export const ThreadStatusContext = createContext<(threadId: string | null) => ThreadStatus | null>(() => null);

/**
 * Each row's Start thread box, by its number, while the row's button has it
 * open, and whether its thread is starting. From the page, so the views
 * between need not pass it down. Issues and pull requests share GitHub's
 * numbering, so the number alone names the row.
 */
export interface StartThreadRows {
  /** The box under the row; null for every row without one. */
  boxFor: (number: number) => ReactNode;
  /** The row's thread is being started from its box. */
  isStarting: (number: number) => boolean;
  /** The thread just started from the row, until the page's data lists it. */
  startedThread: (number: number) => string | null;
}

export const StartThreadContext = createContext<StartThreadRows>({
  boxFor: () => null,
  isStarting: () => false,
  startedThread: () => null,
});

function RowAction({
  name,
  label,
  expanded,
  disabled = false,
  onClick,
}: {
  name: string;
  label: string;
  /** Set on a button that opens something under the row; it stays pressed while that is open. */
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
        expanded && "bg-accent text-foreground",
      )}
    >
      <Icon name={name} className="size-3.5" />
    </button>
  );
}

export function ItemRow({
  number,
  title,
  url,
  facts,
  assignees,
  threadId: listedThreadId,
  onThread,
}: {
  number: number;
  title: string;
  url: string;
  /** What this list says about the row, drawn muted before the actions. */
  facts: ReactNode;
  /** Left out where the list is already about one person's own work. */
  assignees?: readonly string[];
  /** The thread this plugin started for the row, if it started one. */
  threadId: string | null;
  /** Opens the thread when there is one, and otherwise offers to start one. */
  onThread: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const threadStatus = useContext(ThreadStatusContext);
  const rows = useContext(StartThreadContext);
  const startThreadBox = rows.boxFor(number);
  const threadId = listedThreadId ?? rows.startedThread(number);
  const starting = threadId === null && rows.isStarting(number);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The list can unmount the row mid-tick.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    if (!(await writeLinkToClipboard(`${title} (#${number})`, url))) return;
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <li className={cn("px-3 py-2", threadId !== null && cn(THREAD_EDGE_INSET, "pl-[10px]"))}>
      <div className="flex items-center justify-between gap-3">
        <a href={url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline">
          <span className="tabular-nums text-muted-foreground">#{number}</span> {title}
        </a>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {assignees === undefined ? null : <Assignees logins={assignees} />}
          {facts}
          <span className="flex items-center gap-0.5">
            <RowAction
              name={threadId === null && !starting ? "MessageSquarePlus" : "MessageSquare"}
              label={starting ? "Starting a thread" : threadId === null ? "Start a thread" : "Open the thread"}
              expanded={threadId === null && !starting ? startThreadBox !== null : undefined}
              disabled={starting}
              onClick={onThread}
            />
            <RowAction
              name={copied ? "Check" : "Copy"}
              label={copied ? "Copied" : "Copy link"}
              onClick={() => void copy()}
            />
          </span>
        </span>
      </div>
      {startThreadBox}
      {starting ? <StartingThreadLine title={`${title} (#${number})`} /> : null}
      {/* Open thread is the icon on the right; what the thread is doing goes under the title. */}
      {threadId === null ? null : <ThreadLine status={threadStatus(threadId)} onOpen={onThread} />}
    </li>
  );
}
