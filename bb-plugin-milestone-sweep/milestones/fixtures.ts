// Milestones for the stories. Every name, title, number and count is invented.
import type { StoredIssue, StoredMilestone } from "./github.js";
import type { Listing, MilestonePageData } from "./contract.js";
import { byDue, detail, periodWords, summarize, weekBuckets } from "./summary.js";

const DAY = 86_400_000;

/** Number, title, days from now it is due, open, closed, nobody assigned, added in six weeks, closed in six weeks. */
type Row = [number, string, number | null, number, number, number, number, number];

const WIDGETS: Row[] = [
  [14, "Widget catalog cleanup", -9, 18, 41, 9, 12, 6],
  [17, "Sprocket storage migration", 6, 11, 23, 4, 9, 14],
  [19, "Gadget theming hooks", 30, 16, 4, 12, 14, 3],
  [8, "Backlog to triage", null, 37, 112, 31, 5, 2],
];

const GADGETS: Row[] = [
  [3, "Gizmo onboarding", 12, 7, 15, 2, 3, 8],
  [5, "Sprocket API v2", null, 9, 2, 9, 6, 0],
];

const NAMES = ["octocat", "hubber"];
const STANDINGS = ["approved", "review", "review", "draft", "assigned", "assigned", "nobody"] as const;
const TITLES = [
  "Widget list scrolls past the footer",
  "Sprocket export drops the last row",
  "Gadget settings forget the theme",
  "Add keyboard shortcuts to the widget editor",
  "Gizmo preview flickers on resize",
  "Rename the sprocket toggle",
  "Document the gadget hooks",
  "Widget search ignores accents",
];

/** Issues that add up to the row's counts, spread over the period. */
function issuesFor(repo: string, row: Row, now: number): StoredIssue[] {
  const [number, , , open, closed, nobody, added, closedIn] = row;
  const issues: StoredIssue[] = [];
  for (let i = 0; i < open + closed; i += 1) {
    const isOpen = i < open;
    const fresh = i < added;
    const addedAt = fresh ? now - ((i * 5) % 40) * DAY - DAY : now - (60 + i * 3) * DAY;
    const j = i - open;
    const closedAt = isOpen ? null : j < closedIn ? now - ((j * 4) % 40) * DAY - DAY : addedAt + 10 * DAY;
    const standing = !isOpen ? "nobody" : i < nobody ? "nobody" : STANDINGS[i % (STANDINGS.length - 1)];
    issues.push({
      number: number * 100 + i,
      title: TITLES[i % TITLES.length],
      url: `https://github.com/${repo}/issues/${number * 100 + i}`,
      open: isOpen,
      notDone: !isOpen && j % 7 === 3,
      assignees: standing === "nobody" ? [] : [NAMES[i % NAMES.length]],
      createdAt: addedAt - DAY,
      closedAt,
      addedAt,
      standing,
    });
  }
  return issues;
}

export function storedMilestones(repo: string, rows: Row[], now: number): StoredMilestone[] {
  return rows.map((row) => ({
    repo,
    number: row[0],
    title: row[1],
    url: `https://github.com/${repo}/milestone/${row[0]}`,
    due: row[2] === null ? null : now + row[2] * DAY,
    createdAt: now - 150 * DAY,
    open: row[3],
    closed: row[4],
    issues: issuesFor(repo, row, now),
  }));
}

export function listingFor(now: number): Listing {
  const buckets = weekBuckets(now, 6);
  const repository = (repo: string, rows: Row[]) => ({
    repo,
    error: null,
    milestones: storedMilestones(repo, rows, now)
      .map((m) => summarize(m, buckets))
      .sort(byDue),
  });
  return {
    periodLabel: periodWords(6),
    syncedAt: now - 4 * 60_000,
    lastError: null,
    repositories: [repository("acme/gadgets", GADGETS), { repo: "acme/tools", error: null, milestones: [] }, repository("acme/widgets", WIDGETS)],
  };
}

/** The threads the stories' rows started, by issue number. */
export const THREADS: Record<number, string> = { 1409: "thr_working", 1411: "thr_needs_you" };

export function milestonePageFor(now: number): MilestonePageData {
  const buckets = weekBuckets(now, 6);
  const milestone = storedMilestones("acme/widgets", WIDGETS, now)[0];
  const { open, closed, history } = detail(milestone, now);
  return {
    periodLabel: periodWords(6),
    periodStart: buckets[0].start,
    repo: milestone.repo,
    milestone: summarize(milestone, buckets),
    // Two open issues already have a thread: one working, one waiting on you.
    open: open.map((issue) => ({ ...issue, threadId: THREADS[issue.number] ?? null })),
    closed: closed.map((issue) => ({ ...issue, threadId: null })),
    history,
    lastError: null,
  };
}
