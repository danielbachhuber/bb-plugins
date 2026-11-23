// Which account each recorded call's tokens count toward. bb's token usage
// events say nothing about the account, but each reading of the usage limits
// names the account a provider is signed in to. So the ledger stamps every
// row with the account of the readings around it, and keeps that stamp after
// the readings themselves are pruned.
import type { LimitSample } from "./limits.js";

/** The calls a provider made in `(from, to]` count toward `accountKey`. */
export interface AccountStretch {
  providerId: string;
  accountKey: string;
  from: number;
  to: number;
}

/**
 * The stretches of time each account was signed in, from the limit readings.
 * As in `accountSpans`, a call between the last reading of one account and
 * the first of the next counts toward the next. Calls before the first
 * reading or after the latest get no stretch: bb hadn't said yet which
 * account made them. A reading that names no account ends a stretch without
 * starting one.
 */
export function accountStretches(samples: readonly LimitSample[]): AccountStretch[] {
  const byProvider = new Map<string, LimitSample[]>();
  for (const sample of samples) byProvider.set(sample.providerId, [...(byProvider.get(sample.providerId) ?? []), sample]);
  const stretches: AccountStretch[] = [];
  for (const [providerId, readings] of byProvider) {
    readings.sort((a, b) => a.sampledAt - b.sampledAt);
    let current: AccountStretch | null = null;
    let previous: number | null = null;
    for (const reading of readings) {
      if (current !== null && reading.accountKey === current.accountKey) {
        current.to = reading.sampledAt;
      } else {
        if (current !== null && current.to > current.from) stretches.push(current);
        current =
          reading.accountKey === null
            ? null
            : { providerId, accountKey: reading.accountKey, from: previous ?? reading.sampledAt, to: reading.sampledAt };
      }
      previous = reading.sampledAt;
    }
    if (current !== null && current.to > current.from) stretches.push(current);
  }
  return stretches;
}

/** One account's tokens on one day, subagents included. */
export interface AccountDay {
  /** Local date, YYYY-MM-DD. */
  day: string;
  providerId: string;
  /** Null for calls made before Tokenomics knew the account. */
  accountKey: string | null;
  tokens: number;
}

/** The latest weekly limit reading of an account, to tell accounts apart by. */
export interface AccountLimit {
  providerId: string;
  accountKey: string;
  usedPercent: number;
  resetsAt: number;
  sampledAt: number;
}

/** A short name for an account: the last part of its key, which is an id. */
export function accountName(accountKey: string | null): string {
  if (accountKey === null) return "not known";
  const id = accountKey.split(":").at(-1) ?? accountKey;
  return `account ${id.slice(0, 8)}`;
}

function compact(count: number): string {
  if (count >= 1e9) return `${(count / 1e9).toFixed(2)}B`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${Math.round(count / 1e3)}K`;
  return String(count);
}

function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** The table `bb tokenomics accounts` prints without --json. */
export function formatAccounts(days: readonly AccountDay[], limits: readonly AccountLimit[], range: number): string {
  if (days.length === 0) return `No tokens recorded in the past ${range} days.`;
  const key = (providerId: string, accountKey: string | null) => `${providerId}\u0000${accountKey ?? ""}`;
  const totals = new Map<string, { providerId: string; accountKey: string | null; tokens: number }>();
  for (const row of days) {
    const entry = totals.get(key(row.providerId, row.accountKey)) ?? { ...row, tokens: 0 };
    entry.tokens += row.tokens;
    totals.set(key(row.providerId, row.accountKey), entry);
  }
  // Known accounts first, the most used first; calls with no account last.
  const columns = [...totals.values()].sort(
    (a, b) => Number(a.accountKey === null) - Number(b.accountKey === null) || b.tokens - a.tokens,
  );
  const latest = new Map<string, AccountLimit>();
  for (const limit of limits) {
    const previous = latest.get(limit.providerId);
    if (previous === undefined || limit.sampledAt > previous.sampledAt) latest.set(limit.providerId, limit);
  }
  const lines = [`Tokens by account, past ${range} days, subagents included.`, ""];
  for (const column of columns) {
    const limit = limits.find((l) => l.providerId === column.providerId && l.accountKey === column.accountKey);
    const notes = [
      limit === undefined ? null : `weekly limit ${Math.round(limit.usedPercent)}%`,
      latest.get(column.providerId)?.accountKey === column.accountKey && column.accountKey !== null ? "signed in now" : null,
    ].filter((note) => note !== null);
    lines.push(
      `${column.providerId} · ${accountName(column.accountKey)}  ${compact(column.tokens)} tokens${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`,
    );
  }
  lines.push("");
  const providers = new Set(columns.map((column) => column.providerId));
  const header = ["Day", ...columns.map((c) => `${providers.size > 1 ? `${c.providerId} ` : ""}${accountName(c.accountKey)}`)];
  const rows = [...new Set(days.map((row) => row.day))]
    .sort()
    .reverse()
    .map((day) => [
      dayLabel(day),
      ...columns.map((column) => {
        const tokens = days
          .filter((row) => row.day === day && key(row.providerId, row.accountKey) === key(column.providerId, column.accountKey))
          .reduce((sum, row) => sum + row.tokens, 0);
        return tokens === 0 ? "-" : compact(tokens);
      }),
    ]);
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => row[index]!.length)));
  for (const row of [header, ...rows]) lines.push(row.map((cell, index) => cell.padEnd(widths[index]!)).join("  ").trimEnd());
  if (columns.some((column) => column.accountKey === null)) {
    lines.push("", "Not known: calls made before Tokenomics read which account was signed in, or by a provider that reports no limits.");
  }
  return lines.join("\n");
}
