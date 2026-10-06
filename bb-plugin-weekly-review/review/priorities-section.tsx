/**
 * What last week's entry said would matter this week, and where the time
 * went for each. A priority links to the workstreams it is about; one with
 * no link, or with links and no time, is the gap the page exists to show.
 *
 * Display only, like the table: changes go out through the props.
 */
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { describeCell } from "./workstreams-text.js";
import type { TableRow, Workstream, WorkstreamTable } from "./workstreams.js";

export interface PriorityItem {
  text: string;
  details: string[];
  links: number[];
  suggested: number[];
  /** Checked off on the Now page. */
  done?: boolean;
}

export function PrioritiesSection({
  priorities,
  table,
  workstreams,
  onLink,
  onUnlink,
}: {
  priorities: { heading: string; items: PriorityItem[] };
  table: WorkstreamTable;
  workstreams: Workstream[];
  onLink: (priority: string, workstreamId: number) => void;
  onUnlink: (priority: string, workstreamId: number) => void;
}) {
  const rows = new Map<number, TableRow>();
  for (const row of table.rows) if (row.workstreamId !== null) rows.set(row.workstreamId, row);
  const names = new Map(workstreams.map((workstream) => [workstream.id, workstream.name]));
  const active = workstreams.filter((workstream) => workstream.retiredAt === null);

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-foreground">Priorities</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The Next list from {priorities.heading}. Link each one to its workstreams to see where its time went.
      </p>
      {priorities.items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">That entry has no Next list.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {priorities.items.map((priority, index) => {
            const linked = priority.links.map((id) => rows.get(id));
            const spent = linked.some((row) => row !== undefined && row.total.keys.length > 0);
            const unlinkedOptions = active.filter((workstream) => !priority.links.includes(workstream.id));
            return (
              <li key={priority.text} className="rounded-lg border border-border px-3 py-2">
                <div className="flex gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-sm text-foreground">
                      <span className={priority.done === true ? "text-muted-foreground line-through" : undefined}>{priority.text}</span>
                      {priority.done === true ? <span className="shrink-0 text-xs text-muted-foreground">Done in Now</span> : null}
                    </div>
                    {priority.details.length === 0 ? null : (
                      <ul className="mt-0.5 text-xs text-muted-foreground">
                        {priority.details.map((detail) => <li key={detail}>{detail}</li>)}
                      </ul>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {priority.links.length === 0 ? (
                        <span className="text-destructive">Not linked to a workstream</span>
                      ) : !spent ? (
                        <span className="text-destructive">No time this week</span>
                      ) : null}
                      {priority.links.map((id) => {
                        const row = rows.get(id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5"
                          >
                            <span className="text-foreground">{names.get(id) ?? `#${id}`}</span>
                            <span className="text-muted-foreground">
                              {row === undefined || row.total.keys.length === 0 ? "nothing yet" : describeCell(row.total)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Unlink ${names.get(id) ?? id}`}
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => onUnlink(priority.text, id)}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                      {priority.suggested.map((id) => (
                        <Button
                          key={id}
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs font-normal text-muted-foreground"
                          onClick={() => onLink(priority.text, id)}
                        >
                          Link {names.get(id) ?? `#${id}`}?
                        </Button>
                      ))}
                      {unlinkedOptions.length === 0 ? null : (
                        <Select value="" onValueChange={(id) => onLink(priority.text, Number(id))}>
                          <SelectTrigger className="h-6 w-40 text-xs" aria-label={`Link a workstream to ${priority.text}`}>
                            <SelectValue placeholder="Link a workstream" />
                          </SelectTrigger>
                          <SelectContent>
                            {unlinkedOptions.map((workstream) => (
                              <SelectItem key={workstream.id} value={String(workstream.id)}>
                                {workstream.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
