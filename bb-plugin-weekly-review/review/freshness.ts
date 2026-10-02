/**
 * How current a week is: when it was last gathered, when the next scheduled
 * gather runs, and which sources are showing older data because their latest
 * run failed. Pure, with the clock passed in, so it is tested without one.
 */
import { CronExpressionParser } from "cron-parser";
import { SOURCE_NAMES, sourceStatus, type GatherRow } from "./db.js";

/** 7am and 1pm, Monday to Friday, in the server's local time. */
export const DEFAULT_GATHER_CRON = "0 7,13 * * 1-5";

export function isValidCron(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}

/** The next time the schedule fires after `now`, or null for an expression that does not parse. */
export function nextRun(expression: string, now: Date): string | null {
  try {
    return CronExpressionParser.parse(expression, { currentDate: now }).next().toDate().toISOString();
  } catch {
    return null;
  }
}

export interface FailingSource {
  name: string;
  error: string;
  /** When its data was last gathered successfully. Null when it never has been. */
  lastOkAt: string | null;
}

/** The sources whose latest gather this week failed, given the week's gathers newest first. */
export function failingSources(gathers: GatherRow[]): FailingSource[] {
  const failing: FailingSource[] = [];
  for (const name of Object.values(SOURCE_NAMES)) {
    const standing = sourceStatus(gathers, name);
    if (standing === null || standing.latest.ok) continue;
    failing.push({
      name,
      error: standing.latest.error ?? "unknown error",
      lastOkAt: standing.lastOkAt,
    });
  }
  return failing;
}
