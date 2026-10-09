// The Releases section: one release in full, newest first by default, and
// the period's other minors as rows that open in its place. A release in full
// says how many pull requests its notes list, what kind they are, which
// patches followed it, and who merged and reviewed them.
import { useState } from "react";

import type { MinorRelease, Releases } from "@/dashboard/contract";

type Kinds = MinorRelease["kinds"];
type Person = MinorRelease["people"][number];

// Colours are written out rather than set as Tailwind classes: bb's stylesheet
// is prebuilt, so an arbitrary colour class a plugin invents has no rule.
const PATCH = "#d9820a";

const KINDS: ReadonlyArray<{ key: keyof Kinds; label: string; color: string; from: string }> = [
  { key: "feat", label: "Features", color: "#2a78d6", from: "titles starting feat" },
  { key: "fix", label: "Fixes", color: "#1baf7a", from: "titles starting fix or revert" },
  { key: "refactor", label: "Refactors", color: "#9b6cbf", from: "titles starting refactor or perf" },
  { key: "chore", label: "Chores", color: "#7c8794", from: "titles starting chore, docs, test, ci, build or style" },
  { key: "deps", label: "Dependencies", color: "#b9c2cc", from: "opened by a bot" },
  { key: "none", label: "No type", color: "#e3e6ea", from: "titles with no type it recognises" },
];

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const pct = (part: number, whole: number) => (whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`);
const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/** The kinds in one release as one segmented bar, as long as `scale` allows. */
function KindBar({ kinds, total, scale, height }: { kinds: Kinds; total: number; scale?: number; height: number }) {
  if (total === 0) return null;
  return (
    <span
      className="flex overflow-hidden rounded-sm"
      style={{ width: `${scale === undefined ? 100 : (total / scale) * 100}%`, height }}
    >
      {KINDS.map((kind) =>
        kinds[kind.key] === 0 ? null : (
          <span
            key={kind.key}
            title={`${kinds[kind.key]} ${kind.label.toLowerCase()}`}
            style={{ flex: `${kinds[kind.key]} 0 0`, background: kind.color }}
          />
        ),
      )}
    </span>
  );
}

function KindLegend({ kinds, total }: { kinds: Kinds; total: number }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
      {KINDS.filter((kind) => kinds[kind.key] > 0).map((kind) => (
        <span key={kind.key} className="inline-flex items-center gap-1.5" title={kind.from}>
          <span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: kind.color }} />
          <span className="font-medium tabular-nums">{kinds[kind.key]}</span>
          <span className="text-muted-foreground">
            {kind.label.toLowerCase()} ({pct(kinds[kind.key], total)})
          </span>
        </span>
      ))}
    </div>
  );
}

/** Who merged and who reviewed, as counts and as a share of the release's whole. */
function People({ people, bot, onOpenPerson }: { people: readonly Person[]; bot: number; onOpenPerson: (login: string) => void }) {
  const merged = people.reduce((sum, person) => sum + person.merged, 0);
  const reviews = people.reduce((sum, person) => sum + person.reviews, 0);
  const most = Math.max(1, ...people.map((person) => Math.max(person.merged, person.reviews)));
  return (
    <div className="mt-2">
      <div className="flex items-end gap-3 border-b border-border pb-1 text-[11px] text-muted-foreground">
        <span className="w-32 shrink-0">Person</span>
        <span className="min-w-0 flex-1">Merged</span>
        <span className="w-24 shrink-0 text-right">share of merged</span>
        <span className="min-w-0 flex-1">Reviewed</span>
        <span className="w-24 shrink-0 text-right">share of reviews</span>
      </div>
      {people.map((person) => (
        <div key={person.login} className="flex items-center gap-3 border-b border-border py-1 text-xs">
          <button
            type="button"
            onClick={() => onOpenPerson(person.login)}
            className="w-32 shrink-0 cursor-pointer truncate text-left font-medium hover:underline"
          >
            {person.login}
          </button>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="w-7 shrink-0 text-right tabular-nums">{person.merged}</span>
            <span
              className="block rounded-sm bg-foreground"
              style={{ width: `${(person.merged / most) * 80}%`, height: 7, opacity: 0.35 }}
            />
          </span>
          <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{pct(person.merged, merged)}</span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="w-7 shrink-0 text-right tabular-nums">{person.reviews}</span>
            <span
              className="block rounded-sm bg-foreground"
              style={{ width: `${(person.reviews / most) * 80}%`, height: 7, opacity: 0.2 }}
            />
          </span>
          <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{pct(person.reviews, reviews)}</span>
        </div>
      ))}
      {bot === 0 ? null : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          and {plural(bot, "dependency update", "dependency updates")} opened by a bot, left out of the shares
        </p>
      )}
    </div>
  );
}

function Patched({ release }: { release: MinorRelease }) {
  const count = release.patches.length;
  if (count === 0) return <span className="text-[11px] text-muted-foreground">no patch</span>;
  return (
    <span className="text-[11px]" style={{ color: PATCH }}>
      patched {count === 1 ? "once" : `${count} times`}: {release.patches.map((patch) => patch.tag).join(", ")}
    </span>
  );
}

function InFull({ release, onOpenPerson }: { release: MinorRelease; onOpenPerson: (login: string) => void }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <a href={release.url} target="_blank" rel="noreferrer" className="text-base font-semibold hover:underline">
            {release.tag}
          </a>
          <span className="text-xs text-muted-foreground">published {day(release.publishedAt)}</span>
        </div>
        <Patched release={release} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold leading-none tabular-nums">{release.total}</span>
        <span className="text-sm text-muted-foreground">{release.total === 1 ? "pull request" : "pull requests"}</span>
      </div>
      {release.total === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Its notes list no pull requests the mirror holds.</p>
      ) : (
        <>
          <div className="mt-2">
            <KindBar kinds={release.kinds} total={release.total} height={16} />
          </div>
          <KindLegend kinds={release.kinds} total={release.total} />
        </>
      )}
      {release.missing === 0 ? null : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {plural(release.missing, "more pull request its notes list is", "more pull requests its notes list are")} not in
          the mirror.
        </p>
      )}
      {release.patches.length === 0 ? null : (
        <div className="mt-3 space-y-0.5 text-xs">
          {release.patches.map((patch) => (
            <div key={patch.tag} className="flex min-w-0 gap-1.5">
              <a href={patch.url} target="_blank" rel="noreferrer" className="shrink-0 font-medium hover:underline" style={{ color: PATCH }}>
                {patch.tag}
              </a>
              <span className="min-w-0 truncate text-muted-foreground">
                {day(patch.publishedAt)} · {plural(patch.total, "pull request", "pull requests")}
                {patch.firstLine === null ? "" : ` · ${patch.firstLine}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {release.people.length === 0 ? null : (
        <>
          <h4 className="mt-4 text-sm font-medium">
            Who
            <span className="ml-2 font-normal text-muted-foreground">{plural(release.people.length, "person", "people")}</span>
          </h4>
          <People people={release.people} bot={release.bot} onOpenPerson={onOpenPerson} />
        </>
      )}
    </div>
  );
}

export function ReleasesSection({
  releases,
  periodLabel,
  onOpenPerson,
}: {
  releases: Releases;
  /** How long the period is, such as "six weeks". */
  periodLabel: string;
  onOpenPerson: (login: string) => void;
}) {
  const { minors } = releases;
  const [openTag, setOpenTag] = useState<string | null>(null);
  const open = minors.find((release) => release.tag === openTag) ?? minors[0];
  const longest = Math.max(1, ...minors.map((release) => release.total));

  return (
    <section className="mt-8 border-t border-border pt-4" aria-labelledby="releases">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="releases" className="text-lg font-semibold">
          Releases
        </h2>
        <span className="text-xs text-muted-foreground">
          {plural(releases.published, "release", "releases")} published over {periodLabel}:{" "}
          {plural(releases.published - releases.patches, "minor", "minors")} and{" "}
          {plural(releases.patches, "patch", "patches")}
        </span>
      </div>

      {open === undefined ? (
        <p className="mt-4 text-sm text-muted-foreground">No releases published in this period.</p>
      ) : (
        <>
          <InFull release={open} onOpenPerson={onOpenPerson} />

          {minors.length < 2 ? null : (
            <>
              <h3 className="mt-5 text-sm font-medium">
                Other releases
                <span className="ml-2 font-normal text-muted-foreground">click one to see it in full</span>
              </h3>
              <div className="mt-2">
                {minors
                  .filter((release) => release !== open)
                  .map((release) => (
                    <button
                      key={release.tag}
                      type="button"
                      onClick={() => setOpenTag(release.tag)}
                      className="flex w-full cursor-pointer items-center gap-3 border-b border-border py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="w-20 shrink-0 font-medium">{release.tag}</span>
                      <span className="w-28 shrink-0 text-muted-foreground">{day(release.publishedAt)}</span>
                      <span className="w-8 shrink-0 text-right tabular-nums">{release.total}</span>
                      <span className="min-w-0 flex-1">
                        <KindBar kinds={release.kinds} total={release.total} scale={longest} height={10} />
                      </span>
                      <span className="w-20 shrink-0 text-right text-muted-foreground">
                        {plural(release.people.length, "person", "people")}
                      </span>
                      <span className="w-52 shrink-0 truncate">
                        <Patched release={release} />
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
