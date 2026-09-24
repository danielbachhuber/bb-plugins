// A self-improve review, shown in a banner right above the composer. Invented
// data; the buttons change local state, and "Discuss" writes into the draft.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface Finding {
  id: string;
  title: string;
  signal: string;
  tone: "warning" | "danger" | "info";
  where: string;
  threads: number;
  cost: string;
  quote: { text: string; who: string; thread: string };
}

export const findings: Finding[] = [
  {
    id: "f1",
    title: "Link local files with absolute paths",
    signal: "correction overhead",
    tone: "warning",
    where: "global instructions",
    threads: 18,
    cost: "a \"where is it?\" turn in most threads that wrote a draft",
    quote: { text: "Give me the full path to the PR description", who: "You", thread: "Refine #412: move the export job" },
  },
  {
    id: "f2",
    title: "Delegate repository surveys to subagents",
    signal: "tokens",
    tone: "warning",
    where: "global instructions",
    threads: 11,
    cost: "214M tokens in threads that never delegated",
    quote: { text: "31.2M tokens, 240 commands, 0 subagents", who: "Tool", thread: "Remove the legacy gadget flag" },
  },
  {
    id: "f3",
    title: "Stop nesting worktrees inside bb worktrees",
    signal: "breakage",
    tone: "danger",
    where: "resolve-merge-conflicts",
    threads: 4,
    cost: "uncommitted work lost twice",
    quote: { text: "The doc edits were only in that working tree, so they are gone.", who: "Agent", thread: "Re-review #377: locale maps" },
  },
  {
    id: "f4",
    title: "One-click post, approve, merge for dependency bumps",
    signal: "non-chat UX",
    tone: "info",
    where: "dependency sweep",
    threads: 19,
    cost: "the same three words typed once per bump",
    quote: { text: "post, approve, merge", who: "You", thread: "Bump widget-core to 7.3.0" },
  },
  {
    id: "f5",
    title: "Say which suites the root test command skips",
    signal: "excess steps",
    tone: "info",
    where: "widgets AGENTS.md",
    threads: 3,
    cost: "rediscovered on every merge",
    quote: { text: "The API suite isn't in the root test run.", who: "Agent", thread: "Merge main into #401" },
  },
];

const TONE: Record<Finding["tone"], string> = {
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-muted-foreground",
};

export interface SelfImproveBannerProps {
  /** Writes into the composer's draft, as a plugin can with `useComposer()`. */
  onDraft: (text: string) => void;
  initialPicked?: string[];
  initialExpanded?: string | null;
  initialCollapsed?: boolean;
  /** Findings that already have a thread, by id. */
  opened?: string[];
}

export function SelfImproveBanner({
  onDraft,
  initialPicked = ["f1", "f2", "f3"],
  initialExpanded = null,
  initialCollapsed = false,
  opened: initialOpened = [],
}: SelfImproveBannerProps) {
  const [picked, setPicked] = useState(initialPicked.filter((id) => !initialOpened.includes(id)));
  const [opened, setOpened] = useState(initialOpened);
  const [expanded, setExpanded] = useState(initialExpanded);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const open = () => {
    setOpened((o) => [...o, ...picked]);
    setPicked([]);
  };
  const left = findings.length - opened.length;

  const header = (
    <div className="flex items-center gap-2 px-3 py-2">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setCollapsed((c) => !c)}>
        <span className="text-xs text-muted-foreground">{collapsed ? "▸" : "▾"}</span>
        <span className="truncate text-sm text-foreground">
          <b className="font-medium">{findings.length} findings</b>
          <span className="text-muted-foreground"> from 94 threads this week</span>
          {opened.length > 0 ? <span className="text-muted-foreground"> · {opened.length} opened</span> : null}
        </span>
      </button>
      {picked.length > 0 ? (
        <Button size="sm" className="h-7 px-2.5 text-xs" onClick={open}>
          Open {picked.length === 1 ? "a thread" : `${picked.length} threads`}
        </Button>
      ) : left === 0 ? (
        <span className="text-xs text-muted-foreground">All opened</span>
      ) : null}
    </div>
  );

  if (collapsed) return header;

  return (
    <div>
      {header}
      <ul className="max-h-72 overflow-y-auto border-t border-border">
        {findings.map((f) => {
          const isOpened = opened.includes(f.id);
          const isExpanded = expanded === f.id;
          return (
            <li key={f.id} className="group border-b border-border last:border-0">
              <div className="flex items-start gap-2.5 px-3 py-2">
                {isOpened ? (
                  <span className="w-4 text-center text-xs text-success">✓</span>
                ) : (
                  <Checkbox
                    className="mt-0.5"
                    checked={picked.includes(f.id)}
                    onCheckedChange={(c) => setPicked((p) => (c === true ? [...p, f.id] : p.filter((x) => x !== f.id)))}
                    aria-label={`Pick ${f.title}`}
                  />
                )}
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isExpanded ? null : f.id)}>
                  <div className={cn("text-sm", isOpened ? "text-muted-foreground" : "text-foreground")}>{f.title}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className={TONE[f.tone]}>{f.signal}</span> · {f.threads} threads · {f.where}
                    {isOpened ? " · thread opened →" : ""}
                  </div>
                </button>
                <button
                  type="button"
                  className="invisible text-xs text-muted-foreground hover:text-foreground group-hover:visible"
                  onClick={() => onDraft(`About "${f.title}": `)}
                >
                  Discuss
                </button>
              </div>
              {isExpanded ? (
                <div className="px-3 pb-2.5 pl-9">
                  <figure className="border-l-2 border-border pl-2.5">
                    <blockquote className={cn("text-sm text-foreground", f.quote.who === "Tool" && "font-mono text-xs")}>“{f.quote.text}”</blockquote>
                    <figcaption className="text-xs text-muted-foreground">
                      {f.quote.who} in {f.quote.thread}, and {f.threads - 1} more threads. Cost: {f.cost}.
                    </figcaption>
                  </figure>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
