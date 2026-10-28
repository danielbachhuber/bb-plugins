// Review velocity's team rows: for each team asked for reviews in the period,
// how many requests it got, how fast someone on it picked them up, what waits
// on it now, and who on it did the picking up. Display only.
import { useState } from "react";

import type { TeamActivity } from "@/dashboard/contract";

import { days } from "./stage-flow";

const WARN = "text-[#b4530a] dark:text-[#e59a3a]";
/** Darkest first, so the person who picked up most reads first. */
const SHADES = ["#2a78d6", "#5b97e0", "#86b3ea", "#a9c8f0", "#c6daf5", "#dde9f9"];
/** Teams shown before Show all. */
const SHOWN = 6;

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

function TeamRow({
  team,
  organization,
  onOpenPerson,
}: {
  team: TeamActivity;
  organization: string | null;
  onOpenPerson: (login: string) => void;
}) {
  const counted = team.pickups.filter((pickup) => pickup.count > 0);
  const none = team.pickups.filter((pickup) => pickup.count === 0);
  const shade = (index: number) => SHADES[Math.min(index, SHADES.length - 1)];
  const top2 = counted.slice(0, 2).reduce((sum, pickup) => sum + pickup.count, 0);
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">{organization === null ? team.slug : `${organization}/${team.slug}`}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {team.requested} requested · {team.pickedUp} picked up
          {team.pickedUp === 0 ? "" : ` · half within ${days(team.median)}, 1 in 10 over ${days(team.p90)}`}
          {team.waiting === 0 ? null : (
            <>
              {" · "}
              <span className={`font-semibold ${WARN}`}>{team.waiting} waiting, nobody started</span>
            </>
          )}
        </span>
      </div>
      {counted.length === 0 ? null : (
        <>
          <div className="mt-2.5 flex h-3 w-full overflow-hidden rounded-sm">
            {counted.map((pickup, index) => (
              <span
                key={pickup.login}
                title={`${pickup.login}: ${pickup.count}`}
                style={{ width: percent(pickup.count, team.pickedUp), background: shade(index) }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
            {counted.map((pickup, index) => (
              <button
                key={pickup.login}
                type="button"
                onClick={() => onOpenPerson(pickup.login)}
                className="inline-flex cursor-pointer items-center gap-1 hover:underline"
              >
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: shade(index) }} />
                {pickup.login} {pickup.count}
                <span className="text-muted-foreground">({percent(pickup.count, team.pickedUp)})</span>
              </button>
            ))}
          </div>
        </>
      )}
      {counted.length < 3 && none.length === 0 ? null : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {counted.length >= 3 ? `The two who picked up most did ${percent(top2, team.pickedUp)}.` : ""}
          {none.length === 0
            ? ""
            : ` ${none.length} ${none.length === 1 ? "member" : "members"} picked up none: ${none.map((pickup) => pickup.login).join(", ")}.`}
        </p>
      )}
    </div>
  );
}

export function TeamReviews({
  teams,
  organization,
  onOpenPerson,
  initialShowAll = false,
}: {
  teams: readonly TeamActivity[];
  organization: string | null;
  onOpenPerson: (login: string) => void;
  initialShowAll?: boolean;
}) {
  const [showAll, setShowAll] = useState(initialShowAll);
  if (teams.length === 0) return null;
  const shown = showAll ? teams : teams.slice(0, SHOWN);
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium">
        Reviews per team
        <span className="ml-2 font-normal text-muted-foreground">
          requested of a team, and who on it left the first review
        </span>
      </h3>
      <div className="mt-3 space-y-2">
        {shown.map((team) => (
          <TeamRow key={team.slug} team={team} organization={organization} onOpenPerson={onOpenPerson} />
        ))}
      </div>
      {teams.length <= SHOWN ? null : (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-2 cursor-pointer text-xs text-muted-foreground underline hover:text-foreground"
        >
          {showAll ? "Show fewer" : `Show all ${teams.length} teams`}
        </button>
      )}
    </div>
  );
}
