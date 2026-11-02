// `bb contributor-dashboard`: one person's activity over a period, read from
// the mirror, so a skill can ask without knowing the tables. It reads only
// the mirror and never starts a sync. The store comes in through `CliDeps`.
import { PluginCliError, cliCommand, defineCli, type PluginCliRegistration } from "@get-bb/plugin-sdk";

import type { IssueWithActivity, PullRequestWithActivity } from "../mirror/github.js";
import { activityReport, type ActivityReport } from "../review/activity-report.js";
import type { TeamMembers } from "../review/teams.js";

export interface CliDeps {
  /** The configured repository, or null when the setting is empty or not owner/name. */
  repository: string | null;
  pullRequests: () => PullRequestWithActivity[];
  issues: () => IssueWithActivity[];
  teams: () => TeamMembers;
  sync: () => { syncedAt: number | null; backfillDone: boolean };
  staleAfterMs: number;
  now: () => number;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local midnight at the start of a YYYY-MM-DD day, or null when it is not one. */
export function parseDay(text: string): number | null {
  const match = DAY.exec(text);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(year, month - 1, day);
  // 2026-02-31 rolls over into March; refuse it rather than read another day.
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null;
  return at.getTime();
}

/** The period from the first day's midnight to the midnight after the last, both local. */
export function periodOf(from: string, to: string): { from: string; to: string; start: number; end: number } {
  const start = parseDay(from);
  const last = parseDay(to);
  for (const [flag, value, at] of [["--from", from, start], ["--to", to, last]] as const) {
    if (at === null) {
      throw new PluginCliError(`${flag} ${value} is not a date`, { code: "invalid_date", hint: "Give the day as YYYY-MM-DD." });
    }
  }
  if (last! < start!) {
    throw new PluginCliError(`--to ${to} is before --from ${from}`, { code: "invalid_date" });
  }
  const end = new Date(last!);
  end.setDate(end.getDate() + 1);
  return { from, to, start: start!, end: end.getTime() };
}

/** A few lines for a person reading the terminal; `--json` has the rest. */
export function formatReport(report: ActivityReport): string {
  const { summary: s, mirror } = report;
  const lines = [
    `${report.login} in ${report.repository}, ${report.period.from} to ${report.period.to}`,
    `Pull requests: ${s.pullRequestsOpened} opened, ${s.pullRequestsMerged} merged, ${s.pullRequestsClosedUnmerged} closed unmerged`,
    `Reviews: ${s.reviewsGiven} given on ${s.pullRequestsReviewed} pull requests, ${s.reviewRequests} requested, ` +
      `${s.reviewsReceived} received, ${s.awaitingReview} waiting on them now`,
    `Issues: ${s.issuesOpened} opened, ${s.issuesAssigned} assigned, ${s.assignedIssuesClosed} assigned and closed`,
    `Mirror synced ${mirror.syncedAt ?? "never"}${mirror.stale ? " (stale)" : ""}` +
      `${mirror.backfillDone ? "" : ", backfill still running"}`,
  ];
  if (!report.known) lines.push(`${report.login} appears nowhere in the mirror. Check the spelling.`);
  return `${lines.join("\n")}\n`;
}

export function contributorDashboardCli(deps: CliDeps): PluginCliRegistration {
  return defineCli({
    name: "contributor-dashboard",
    summary: "Read one person's GitHub activity from Contributor Dashboard's local mirror.",
    commands: {
      activity: cliCommand({
        summary:
          "One person's pull requests, reviews given and received, review requests, and issues over a period, " +
          "from the mirror, with no GitHub calls.",
        positionals: [{ name: "login", description: "Their GitHub login", required: true }],
        options: {
          from: { type: "string", required: true, aliases: ["since", "start"], description: "First day, YYYY-MM-DD, local time" },
          to: { type: "string", required: true, aliases: ["until", "end"], description: "Last day, YYYY-MM-DD, included" },
          json: { type: "boolean", description: "Print the whole report as JSON instead of a summary" },
        },
        run: ({ positionals, options }) => {
          if (deps.repository === null) {
            throw new PluginCliError("No repository is set.", {
              code: "not_configured",
              hint: "Run `bb plugin config contributor-dashboard set repository owner/name`, then reload the plugin.",
            });
          }
          const period = periodOf(options.from, options.to);
          const sync = deps.sync();
          const report = activityReport({
            repository: deps.repository,
            login: positionals.login.replace(/^@/, ""),
            period,
            pullRequests: deps.pullRequests(),
            issues: deps.issues(),
            teams: deps.teams(),
            sync: { ...sync, staleAfterMs: deps.staleAfterMs },
            now: deps.now(),
          });
          return {
            exitCode: 0,
            stdout: options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report),
          };
        },
      }),
    },
  });
}
