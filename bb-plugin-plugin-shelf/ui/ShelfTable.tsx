// Plugin Shelf's table: every plugin in the checkout, grouped by whether it
// needs a release. Display only; ShelfPage loads the data and handles actions.
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GROUP_ORDER } from "../shelf/classify";
import type { Flag, Group, ShelfList, ShelfRow } from "../shelf/types";

export interface ShelfTableProps {
  list: ShelfList;
  providerId: string;
  /** The plugin id whose publish thread is being started, if any. */
  publishing: string | null;
  onPublish: (pluginId: string) => void;
  /**
   * Called only for installed plugins. Without it, names are plain text: the
   * SDK has no route to bb's own plugin detail page yet.
   */
  onOpenPlugin?: (pluginId: string) => void;
  /** Rows whose commits start open. Stories use this. */
  initialExpanded?: string[];
  /** The time relative dates are measured from. Defaults to now. */
  now?: number;
}

const GROUP_TITLES: Record<Group, string> = {
  "needs-release": "Needs a release",
  current: "Published",
  personal: "Personal",
  unknown: "Unknown (marketplace unreachable)",
};

const GROUP_HINTS: Record<Group, string> = {
  "needs-release": "Published, with commits since the latest release tag.",
  current: "Published, and the latest release tag has every code change.",
  personal: "Not in the bb-community marketplace.",
  unknown: "The marketplace could not be read, so these are neither published nor personal yet.",
};

function flagText(flag: Flag): string {
  switch (flag.kind) {
    case "version-mismatch":
      return `package.json says ${flag.packageVersion}`;
    case "tag-outside-range":
      return `${flag.tag.slice(flag.tag.lastIndexOf("/") + 1)} is outside ${flag.range}`;
    case "no-release-in-range":
      return `no release in ${flag.range}`;
    case "id-taken":
      return "id taken by another source";
  }
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function relative(from: number, now: number): string {
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const elapsed = from - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) return format.format(Math.round(elapsed / size), unit);
  }
  return "just now";
}

function releaseLabel(tag: string | null): string {
  return tag === null ? "—" : tag.slice(tag.lastIndexOf("/") + 1);
}

function disclosureLabel(row: ShelfRow): string {
  const count = row.commits.length;
  if (row.docsChangesOnly) return count === 1 ? "1 docs change" : `${count} docs changes`;
  return count === 1 ? "1 commit" : `${count} commits`;
}

function CommitList({ row, repo, now }: { row: ShelfRow; repo: string; now: number }) {
  return (
    <ul aria-label={`Unreleased commits in ${row.name}`} className="space-y-1 py-1">
      {row.commits.map((commit) => (
        <li key={commit.sha} className="flex items-baseline gap-2 text-sm">
          <span className="min-w-0 truncate text-foreground">{commit.subject}</span>
          {commit.docsOnly ? (
            <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[11px] font-normal">
              docs
            </Badge>
          ) : null}
          <a
            href={`https://${repo}/commit/${commit.sha}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {commit.sha.slice(0, 7)}
          </a>
          <span className="shrink-0 text-xs text-muted-foreground">
            {relative(Date.parse(commit.date), now)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NameCell({ row, onOpenPlugin }: { row: ShelfRow; onOpenPlugin?: (id: string) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {row.installed && onOpenPlugin ? (
        <button
          type="button"
          className="w-fit text-left font-medium text-foreground hover:underline"
          onClick={() => onOpenPlugin(row.id)}
        >
          {row.name}
        </button>
      ) : (
        <span className="font-medium text-foreground">
          {row.name}
          {row.installed ? null : (
            <span className="text-xs font-normal text-muted-foreground"> not installed</span>
          )}
        </span>
      )}
      {row.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.flags.map((flag) => (
            <Badge
              key={flag.kind}
              variant="outline"
              className="px-1.5 py-0 text-[11px] font-normal text-muted-foreground"
            >
              {flagText(flag)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GroupSection(props: {
  group: Group;
  rows: ShelfRow[];
  repo: string;
  now: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
} & Pick<ShelfTableProps, "providerId" | "publishing" | "onPublish" | "onOpenPlugin">) {
  const { group, rows, repo, now, expanded, onToggle } = props;
  const withActions = group === "needs-release";
  // Every group's table has the action column, empty where there is no
  // action, so the columns line up from one table to the next.
  const columns = 4;
  return (
    <section className="space-y-2">
      <div>
        <h3 className="flex items-baseline gap-2 text-sm font-medium text-foreground">
          {GROUP_TITLES[group]}
          <span className="text-xs font-normal text-muted-foreground">{rows.length}</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          {GROUP_HINTS[group]}
          {withActions
            ? ` Publish update starts a ${props.providerId} thread running publish-plugin-update.`
            : null}
        </p>
      </div>
      <div className="rounded-md border border-border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[26%]">Name</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-[16%]">Release</TableHead>
              <TableHead className="w-[150px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const open = expanded.has(row.id);
              return (
                <Fragment key={row.id}>
                  <TableRow className="align-top">
                    <TableCell className="whitespace-normal">
                      <NameCell row={row} onOpenPlugin={props.onOpenPlugin} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="block truncate" title={row.description || undefined}>
                        {row.description || "No description"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-mono text-xs">{releaseLabel(row.latestTag)}</span>
                        {row.commits.length > 0 ? (
                          <button
                            type="button"
                            aria-expanded={open}
                            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => onToggle(row.id)}
                          >
                            <Icon
                              name={open ? "ChevronDown" : "ChevronRight"}
                              className="size-3"
                              aria-hidden
                            />
                            {disclosureLabel(row)}
                          </button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {withActions ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={props.publishing === row.id}
                          aria-label={`Publish update for ${row.name}`}
                          onClick={() => props.onPublish(row.id)}
                        >
                          <Icon name="Sent" className="size-3.5" aria-hidden />
                          Publish update
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                  {open ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns} className="bg-muted/30 pl-6">
                        <CommitList row={row} repo={repo} now={now} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function ShelfTable(props: ShelfTableProps) {
  const { list } = props;
  const now = props.now ?? Date.now();
  const [expanded, setExpanded] = useState(() => new Set(props.initialExpanded ?? []));

  if (list.checkout === null) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {list.emptyReason ?? "Plugin Shelf could not find a plugin checkout."}
      </p>
    );
  }

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const warnings = [
    list.fetchError === null ? null : `Could not reach GitHub: ${list.fetchError}`,
    list.marketplaceError === null
      ? null
      : `Could not read the marketplace: ${list.marketplaceError}`,
  ].filter((warning): warning is string => warning !== null);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{list.checkout.repo}</span>
          {list.fetchedAt === null ? null : ` · Checked ${relative(list.fetchedAt, now)}`}
        </p>
        {warnings.map((warning) => (
          <p key={warning} className="flex items-center gap-1.5 text-xs text-destructive">
            <Icon name="AlertTriangle" className="size-3.5" aria-hidden />
            {warning}
          </p>
        ))}
      </div>
      {GROUP_ORDER.map((group) => {
        const rows = list.rows.filter((row) => row.group === group);
        if (rows.length === 0) return null;
        return (
          <GroupSection
            key={group}
            group={group}
            rows={rows}
            repo={list.checkout!.repo}
            now={now}
            expanded={expanded}
            onToggle={toggle}
            providerId={props.providerId}
            publishing={props.publishing}
            onPublish={props.onPublish}
            onOpenPlugin={props.onOpenPlugin}
          />
        );
      })}
    </div>
  );
}
