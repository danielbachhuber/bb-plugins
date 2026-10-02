/**
 * The week by workstream and by day, with what it takes to sort what the
 * rules missed: assign an activity, make a rule from it, or accept a theme as
 * a workstream.
 *
 * Display only. Every change goes out through `actions`, so a story renders
 * this with fixture props and no server.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDayShort, fromDay } from "./dates.js";
import type { Suggestion } from "./suggestions.js";
import { describeCell } from "./workstreams-text.js";
import {
  ruleSeeds,
  type Cell,
  type ClassifiedActivity,
  type Rule,
  type RulePreview,
  type RuleType,
  type TableRow,
  type Workstream,
  type WorkstreamTable,
} from "./workstreams.js";

export interface ProposalItem {
  id: number;
  workstream: string;
  type: RuleType;
  value: string;
  reason: string;
  isNew: boolean;
  preview: RulePreview;
}

export interface WorkstreamViewProps {
  table: WorkstreamTable;
  workstreams: Array<Workstream & { rules: Rule[] }>;
  suggestions: Suggestion[];
  proposals: ProposalItem[];
}

export interface WorkstreamActions {
  assign(key: string, workstreamId: number | null): void;
  unassign(key: string): void;
  /** Resolves to the new workstream's id. */
  createWorkstream(name: string): Promise<number>;
  addRule(workstreamId: number, type: RuleType, value: string): void;
  preview(type: RuleType, value: string): Promise<RulePreview>;
  setWeekChoice(workstreamId: number, state: "added" | "hidden" | null): void;
  acceptSuggestion(name: string): void;
  acceptProposal(id: number): void;
  rejectProposal(id: number): void;
  /** Starts the rules agent. */
  suggestRules(): void;
  openThread(threadId: string): void;
}

/** A row, or one day of it. */
export type Selection = { row: number | "unsorted"; day: string | null };

const RULE_LABELS: Record<RuleType, string> = {
  ref: "Issue or PR number",
  task: "Harvest task",
  label: "Label",
  phrase: "Title contains",
};

export function WorkstreamSection({
  view,
  actions,
  initialSelection = null,
  rulesThread,
  suggesting = false,
}: {
  view: WorkstreamViewProps;
  actions: WorkstreamActions;
  /** What starts open, for a story. */
  initialSelection?: Selection | null;
  /** The rules agent's thread, once one has been started for the week. */
  rulesThread?: string;
  suggesting?: boolean;
}) {
  const { table } = view;
  const [selected, setSelected] = useState<Selection | null>(initialSelection);
  const active = view.workstreams.filter((workstream) => workstream.retiredAt === null);
  const inWeek = new Set(table.rows.map((row) => row.workstreamId));
  const addable = active.filter((workstream) => !inWeek.has(workstream.id));
  const rowKey = (row: TableRow): Selection["row"] => row.workstreamId ?? "unsorted";
  const sorted = table.total.keys.length - table.unsorted.total.keys.length;

  const toggle = (row: TableRow, day: string | null) => {
    const next = { row: rowKey(row), day };
    setSelected((current) =>
      current !== null && current.row === next.row && current.day === next.day ? null : next,
    );
  };

  const rows = [...table.rows, table.unsorted];
  // Group labels only once something is planned; before that every row is unplanned.
  const grouped = table.rows.some((row) => row.planned);
  const groupStart = (row: TableRow, index: number): string | null => {
    if (!grouped || row.workstreamId === null) return null;
    const previous = index === 0 ? null : rows[index - 1];
    if (row.planned) return index === 0 ? "Planned" : null;
    return previous === null || previous.planned ? "Unplanned" : null;
  };

  return (
    <section className="mt-6">
      <h2 className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
        Workstreams
        <span className="flex items-center gap-1">
          {rulesThread === undefined ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-normal text-muted-foreground"
              onClick={() => actions.openThread(rulesThread)}
            >
              Open the rules thread
            </Button>
          )}
          {table.unsorted.total.keys.length === 0 ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-normal text-muted-foreground"
              disabled={suggesting}
              onClick={actions.suggestRules}
            >
              {suggesting ? "Starting…" : "Suggest rules"}
            </Button>
          )}
        </span>
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {table.total.hours}h and {table.total.keys.length} pieces of activity this week,{" "}
        {sorted} of them sorted. Select a cell to see what is in it.
      </p>

      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Workstream</th>
              {table.days.map((day) => (
                <th key={day} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                  {fromDay(day).toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                </th>
              ))}
              <th className="px-2 py-2 text-left font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isUnsorted = row.workstreamId === null;
              const open = selected !== null && selected.row === rowKey(row);
              if (isUnsorted && row.total.keys.length === 0) return null;
              const group = groupStart(row, index);
              return (
                <Fragment key={rowKey(row)}>
                  {group === null ? null : (
                    <tr className="border-b border-border">
                      <td
                        colSpan={table.days.length + 3}
                        className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {group}
                      </td>
                    </tr>
                  )}
                  <tr className={cn("border-b border-border last:border-b-0", isUnsorted && "bg-muted/40")}>
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      <button
                        type="button"
                        className={cn(
                          "text-left text-sm hover:underline",
                          isUnsorted ? "text-muted-foreground" : "text-foreground",
                          open && selected?.day === null && "font-medium",
                        )}
                        onClick={() => toggle(row, null)}
                      >
                        {row.name}
                      </button>
                      {row.added ? <span className="ml-1.5 text-muted-foreground">added</span> : null}
                    </th>
                    {table.days.map((day) => (
                      <td key={day} className="px-1 py-1">
                        <CellButton
                          cell={row.cells[day]}
                          selected={open && selected?.day === day}
                          onClick={() => toggle(row, day)}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <CellButton
                        cell={row.total}
                        strong
                        selected={open && selected?.day === null}
                        onClick={() => toggle(row, null)}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {row.share === null || row.total.keys.length === 0 ? "" : `${Math.round(row.share * 100)}%`}
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-border bg-muted/20">
                      <td colSpan={table.days.length + 3} className="px-3 py-2">
                        <Detail
                          row={row}
                          day={selected?.day ?? null}
                          table={table}
                          workstreams={active}
                          actions={actions}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {addable.length === 0 ? null : (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Add to this week:</span>
          <Select value="" onValueChange={(id) => actions.setWeekChoice(Number(id), "added")}>
            <SelectTrigger className="h-7 w-56 text-xs" aria-label="Add a workstream to this week">
              <SelectValue placeholder="Choose a workstream" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((workstream) => (
                <SelectItem key={workstream.id} value={String(workstream.id)}>
                  {workstream.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {view.proposals.length === 0 ? null : (
        <div className="mt-3 rounded-lg border border-border px-3 py-2">
          <div className="text-xs font-medium text-foreground">Proposed rules</div>
          <ul className="mt-1 divide-y divide-border">
            {view.proposals.map((proposal) => (
              <li key={proposal.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground">
                    {RULE_LABELS[proposal.type]} <span className="font-medium">"{proposal.value}"</span>
                    {" → "}
                    {proposal.workstream}
                    {proposal.isNew ? <span className="ml-1 text-muted-foreground">(new)</span> : null}
                  </div>
                  <div className="text-muted-foreground">{proposal.reason}</div>
                  <div className="text-muted-foreground">
                    {proposal.preview.matches === 0
                      ? "Matches nothing in any gathered week."
                      : `Matches ${proposal.preview.matches}, ${proposal.preview.unsorted} unsorted now: ${proposal.preview.examples.slice(0, 3).join("; ")}`}
                  </div>
                </div>
                <span className="flex gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => actions.acceptProposal(proposal.id)}>
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs font-normal"
                    onClick={() => actions.rejectProposal(proposal.id)}
                  >
                    Reject
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.suggestions.length === 0 ? null : (
        <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2">
          <div className="text-xs font-medium text-foreground">Suggested from this week's themes</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {view.suggestions.map((suggestion) => (
              <span
                key={suggestion.name}
                className="max-w-full"
                title={
                  suggestion.rules.length === 0
                    ? "Sorts this week's entries; add a rule to catch later weeks"
                    : `Rules: ${suggestion.rules.map((rule) => `${RULE_LABELS[rule.type]} "${rule.value}"`).join(", ")}`
                }
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 max-w-full text-xs"
                  onClick={() => actions.acceptSuggestion(suggestion.name)}
                >
                  <span className="truncate">+ {suggestion.name}</span>
                  <span className="text-muted-foreground">{suggestion.hours}h</span>
                </Button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CellButton({
  cell,
  strong,
  selected,
  onClick,
}: {
  cell: Cell;
  strong?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  if (cell.keys.length === 0) {
    return <span className="block px-1 py-0.5 text-muted-foreground/50">·</span>;
  }
  const { pr, review, issue, task } = cell.counts;
  const counts = [
    pr > 0 ? `${pr} PR` : null,
    review > 0 ? `${review} rev` : null,
    issue > 0 ? `${issue} iss` : null,
    task > 0 ? `${task} task` : null,
  ].filter((part) => part !== null);
  return (
    <button
      type="button"
      onClick={onClick}
      title={describeCell(cell)}
      className={cn(
        "block w-full rounded px-1 py-0.5 text-left hover:bg-muted",
        selected && "bg-muted ring-1 ring-border",
      )}
    >
      <span className={cn("block tabular-nums text-foreground", strong && "font-medium")}>
        {cell.hours > 0 ? `${cell.hours}h` : "–"}
      </span>
      {counts.length === 0 ? null : (
        <span className="block whitespace-nowrap text-[11px] text-muted-foreground">{counts.join(" · ")}</span>
      )}
    </button>
  );
}

/** What a row, or one day of it, holds, with a picker on each activity. */
function Detail({
  row,
  day,
  table,
  workstreams,
  actions,
}: {
  row: TableRow;
  day: string | null;
  table: WorkstreamTable;
  workstreams: Workstream[];
  actions: WorkstreamActions;
}) {
  const keys = day === null ? row.total.keys : row.cells[day].keys;
  const items = keys.map((key) => table.activities[key]).filter((item) => item !== undefined);
  const [ruleFor, setRuleFor] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {row.name}
          {day === null ? ", the whole week" : `, ${formatDayShort(day)}`}
        </span>
        {row.workstreamId === null ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs font-normal text-muted-foreground"
            onClick={() => actions.setWeekChoice(row.workstreamId as number, row.added ? null : "hidden")}
          >
            {row.added ? "Remove from this week" : "Hide from this week"}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Nothing here yet this week.</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="py-1.5">
              <ActivityRow
                item={item}
                workstreams={workstreams}
                actions={actions}
                onMakeRule={() => setRuleFor((current) => (current === item.key ? null : item.key))}
              />
              {ruleFor === item.key ? (
                <RuleForm
                  item={item}
                  workstreams={workstreams}
                  actions={actions}
                  onDone={() => setRuleFor(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TYPE_LABELS: Record<ClassifiedActivity["type"], string> = {
  time: "time",
  pr: "PR",
  review: "review",
  issue: "issue",
  task: "task",
};

function ActivityRow({
  item,
  workstreams,
  actions,
  onMakeRule,
}: {
  item: ClassifiedActivity;
  workstreams: Workstream[];
  actions: WorkstreamActions;
  onMakeRule: () => void;
}) {
  const why =
    item.by === null
      ? "no rule matched"
      : item.by === "assignment"
        ? "by hand"
        : `${RULE_LABELS[item.by].toLowerCase()} rule`;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="w-12 shrink-0 text-muted-foreground">
        {item.day === null ? "week" : fromDay(item.day).toLocaleDateString("en-US", { weekday: "short" })}
      </span>
      <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
        {item.hours > 0 ? `${item.hours}h` : TYPE_LABELS[item.type]}
      </span>
      <span className="min-w-0 flex-1 text-sm text-foreground">
        {item.url === null ? item.title : (
          <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
            {item.title}
          </a>
        )}
        {item.ref === null ? null : <span className="ml-1 text-muted-foreground">#{item.ref}</span>}
      </span>
      <span className="text-muted-foreground">
        {why}
        {item.by === "assignment" ? (
          <button type="button" className="ml-1 underline" onClick={() => actions.unassign(item.key)}>
            undo
          </button>
        ) : null}
      </span>
      <WorkstreamPicker
        value={item.workstreamId}
        workstreams={workstreams}
        label={`Workstream for ${item.title}`}
        onPick={(id) => actions.assign(item.key, id)}
        onCreate={async (name) => actions.assign(item.key, await actions.createWorkstream(name))}
      />
      <Button variant="ghost" size="sm" className="h-7 text-xs font-normal" onClick={onMakeRule}>
        Make a rule
      </Button>
    </div>
  );
}

const NEW = "__new__";
const NONE = "__none__";

/** A workstream select with "New workstream…" at the end, which turns into a name field. */
function WorkstreamPicker({
  value,
  workstreams,
  label,
  allowNone = true,
  onPick,
  onCreate,
}: {
  value: number | null;
  workstreams: Workstream[];
  label: string;
  allowNone?: boolean;
  onPick: (id: number | null) => void;
  onCreate: (name: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (naming) {
    const submit = () => {
      if (name.trim() === "") return;
      onCreate(name.trim());
      setNaming(false);
      setName("");
    };
    return (
      <span className="flex items-center gap-1">
        <Input
          autoFocus
          value={name}
          placeholder="New workstream"
          aria-label="New workstream name"
          className="h-7 w-44 text-xs"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") setNaming(false);
          }}
        />
        <Button size="sm" className="h-7 text-xs" onClick={submit}>Add</Button>
      </span>
    );
  }

  return (
    <Select
      value={value === null ? (allowNone ? NONE : "") : String(value)}
      onValueChange={(next) => {
        if (next === NEW) setNaming(true);
        else onPick(next === NONE ? null : Number(next));
      }}
    >
      <SelectTrigger className="h-7 w-44 text-xs" aria-label={label}>
        <SelectValue placeholder="Choose a workstream" />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>Unsorted</SelectItem> : null}
        {workstreams.map((workstream) => (
          <SelectItem key={workstream.id} value={String(workstream.id)}>
            {workstream.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={NEW}>New workstream…</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** A rule seeded from one activity, with what it would catch before saving. */
function RuleForm({
  item,
  workstreams,
  actions,
  onDone,
}: {
  item: ClassifiedActivity;
  workstreams: Workstream[];
  actions: WorkstreamActions;
  onDone: () => void;
}) {
  const seeds = useMemo(() => ruleSeeds(item), [item]);
  const [type, setType] = useState<RuleType>(seeds[0].type);
  const [value, setValue] = useState(seeds[0].value);
  const [workstreamId, setWorkstreamId] = useState<number | null>(item.workstreamId);
  const [preview, setPreview] = useState<RulePreview | null>(null);

  // One request per pause in typing, not per keystroke.
  useEffect(() => {
    if (value.trim() === "") {
      setPreview(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      actions.preview(type, value).then((result) => live && setPreview(result), () => undefined);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [actions, type, value]);

  return (
    <div className="mt-2 rounded-md border border-border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Select
          value={type}
          onValueChange={(next) => {
            const nextType = next as RuleType;
            setType(nextType);
            setValue(seeds.find((seed) => seed.type === nextType)?.value ?? "");
          }}
        >
          <SelectTrigger className="h-7 w-40 text-xs" aria-label="Rule type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RULE_LABELS) as RuleType[]).map((ruleType) => (
              <SelectItem key={ruleType} value={ruleType}>{RULE_LABELS[ruleType]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={value}
          aria-label="Rule value"
          className="h-7 min-w-40 flex-1 text-xs"
          onChange={(event) => setValue(event.target.value)}
        />
        <span className="text-muted-foreground">→</span>
        <WorkstreamPicker
          value={workstreamId}
          workstreams={workstreams}
          label="Workstream for the rule"
          allowNone={false}
          onPick={setWorkstreamId}
          onCreate={async (name) => setWorkstreamId(await actions.createWorkstream(name))}
        />
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={workstreamId === null || value.trim() === ""}
          onClick={() => {
            if (workstreamId === null) return;
            actions.addRule(workstreamId, type, value.trim());
            onDone();
          }}
        >
          Save rule
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs font-normal" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {preview === null
          ? " "
          : preview.matches === 0
            ? "Matches nothing in any gathered week."
            : `Matches ${preview.matches} across ${preview.weeks} week${preview.weeks === 1 ? "" : "s"}, ` +
              `${preview.unsorted} of them unsorted now: ${preview.examples.join("; ")}`}
      </p>
    </div>
  );
}
