// The Goals section of the Tokenomics page: what each outcome cost, whether
// threads with a goal finish in fewer turns than threads without, by how they
// started, and how often goal estimates held.
import type { OutcomeGroup } from "@/usage/contract";
import { formatTokens } from "@/usage/series";

export interface GoalOutcomesData {
  outcomes: Array<{ outcome: "met" | "partly" | "not"; count: number; medianTokens: number | null; medianMinutes: number | null }>;
  open: number;
  byStart: Array<{ origin: string; withGoal: OutcomeGroup; withoutGoal: OutcomeGroup }>;
  estimates: Record<"turns" | "tokens" | "minutes", { inside: number; of: number }>;
}

const OUTCOME_LABEL = { met: "Met", partly: "Partly met", not: "Not met" } as const;

function Medians({ group }: { group: OutcomeGroup }) {
  if (group.count === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {group.medianTurns === null ? "—" : Math.round(group.medianTurns)} turns
      <span className="text-muted-foreground">
        {" · "}
        {group.medianTokens === null ? "—" : formatTokens(group.medianTokens)}
        {" · "}
        {group.medianMinutes === null ? "—" : `${Math.round(group.medianMinutes)} min`}
        {` · ${group.count}`}
      </span>
    </span>
  );
}

export function GoalOutcomes({ data }: { data: GoalOutcomesData }) {
  const closed = data.outcomes.reduce((sum, outcome) => sum + outcome.count, 0);
  const record = (["turns", "tokens", "minutes"] as const)
    .filter((key) => data.estimates[key].of > 0)
    .map((key) => `${key === "minutes" ? "time" : key} ${data.estimates[key].inside} of ${data.estimates[key].of}`);
  const rows = data.byStart.filter((row) => row.withGoal.count + row.withoutGoal.count > 0);
  return (
    <section aria-label="Goals" className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Goals</h2>
        <p className="text-xs text-muted-foreground">Past 30 days · medians</p>
      </div>
      <div className="rounded-lg border border-border bg-card px-3 py-3 text-xs">
        {closed === 0 && data.open === 0 ? (
          <p className="text-muted-foreground">
            No goals yet. Threads record one with bb tokenomics goal set, and close it with an outcome.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {data.outcomes.map((outcome) => (
              <div key={outcome.outcome} className="flex flex-col">
                <span className="text-muted-foreground">{OUTCOME_LABEL[outcome.outcome]}</span>
                <span className="tabular-nums">
                  <span className="text-base font-semibold">{outcome.count}</span>
                  {outcome.count === 0 ? null : (
                    <span className="ml-1.5 text-muted-foreground">
                      {outcome.medianTokens === null ? "" : `${formatTokens(outcome.medianTokens)} · `}
                      {outcome.medianMinutes === null ? "" : `${Math.round(outcome.medianMinutes)} min each`}
                    </span>
                  )}
                </span>
              </div>
            ))}
            <div className="flex flex-col">
              <span className="text-muted-foreground">Open</span>
              <span className="text-base font-semibold tabular-nums">{data.open}</span>
            </div>
          </div>
        )}
        {record.length === 0 ? null : <p className="mt-3 text-muted-foreground">Goal estimates held: {record.join(" · ")}</p>}
        {rows.length === 0 ? null : (
          <table className="mt-3 w-full border-t border-border text-left">
            <caption className="sr-only">Archived threads with a goal against without, by how they started</caption>
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1.5 pr-3 font-normal">Archived threads, by start</th>
                <th className="py-1.5 pr-3 font-normal">With a goal</th>
                <th className="py-1.5 font-normal">Without</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.origin} className="border-t border-border/60">
                  <td className="py-1.5 pr-3">{row.origin}</td>
                  <td className="py-1.5 pr-3">
                    <Medians group={row.withGoal} />
                  </td>
                  <td className="py-1.5">
                    <Medians group={row.withoutGoal} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
