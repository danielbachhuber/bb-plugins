// Milestones for the stories, shaped like a real repository's: 19 open, a few
// with a due date (two already past it), most without one, and one a backlog
// of over 150 issues. Open counts run 0 to 45; one milestone gained 51 issues in
// six weeks while most gained none. Every name is invented.
import type { ClosedMilestoneIssue, IssueStanding, MilestoneDetailResult, MilestoneIssue, MilestoneSummary, SyncStatus } from "./dashboard/contract";
import type { Bucket } from "./dashboard/period";

const DAY = 86_400_000;

/** Spread `n` over `count` buckets, leaning early, late, or evenly. */
function spread(n: number, count: number, lean: "early" | "late" | "even"): number[] {
  const weights = Array.from({ length: count }, (_, i) =>
    lean === "early" ? count - i : lean === "late" ? i + 1 : 2 + (i % 2),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((n * w) / sum));
  let left = n - out.reduce((a, b) => a + b, 0);
  for (let i = count - 1; left > 0; i = (i + count - 1) % count, left--) out[i] += 1;
  return out;
}

type Row = [number, string, number | null, number, number, number, number, number, ("early" | "late" | "even")?, ("early" | "late" | "even")?];

/** Number, title, days from now it is due, total, open, nobody assigned, added in six weeks, closed in six weeks. */
const ROWS: Row[] = [
  [31, "Widget catalog cleanup", -54, 88, 24, 16, 6, 6],
  [36, "Sprocket storage migration", -5, 43, 22, 17, 23, 18, "early", "late"],
  [39, "Gadget theming hooks", 8, 21, 16, 12, 10, 2, "late"],
  [43, "Widget icon refresh", 22, 11, 10, 9, 10, 0, "late"],
  [28, "Review queue for gadget submissions", 44, 33, 14, 6, 8, 1],
  [41, "Sprocket onboarding polish", 44, 8, 6, 2, 1, 2],
  [42, "Public API key rotation", null, 61, 45, 35, 51, 11, "late"],
  [44, "Paginate every widget listing endpoint", null, 15, 7, 5, 12, 8, "early", "late"],
  [19, "Gadget marketplace launch checklist", null, 18, 14, 13, 11, 1],
  [38, "Remove the legacy widget editor", null, 15, 10, 7, 7, 3],
  [33, "Saved filters follow-up", null, 12, 3, 3, 0, 5],
  [26, "Split the sprocket service", null, 20, 9, 6, 0, 4, "even", "early"],
  [5, "Small widget fixes to slot into a later milestone", null, 172, 21, 17, 0, 5],
  [35, "Gadget ranking trial", null, 9, 0, 0, 0, 1, "even", "early"],
  [14, "Widget editor follow-up", null, 37, 6, 4, 0, 0],
  [17, "Translated gadget labels", null, 18, 2, 2, 0, 0],
  [23, "Custom colors per workspace", null, 4, 2, 2, 0, 0],
  [15, "Broken link report", null, 6, 1, 1, 0, 0],
  [34, "Nightly widget import checks", null, 1, 1, 1, 0, 0],
];

const moved = (m: MilestoneSummary) => [...m.added, ...m.closedIn].reduce((a, b) => a + b, 0);

/** The milestones over these buckets, most active first, as the server sorts them; a longer period moves more. */
export function milestonesFor(buckets: readonly Bucket[], now: number): MilestoneSummary[] {
  return unsorted(buckets, now).sort(
    (a, b) => moved(b) - moved(a) || (a.due ?? Infinity) - (b.due ?? Infinity) || b.open - a.open,
  );
}

function unsorted(buckets: readonly Bucket[], now: number): MilestoneSummary[] {
  const span = buckets.length === 0 ? 0 : (buckets.at(-1)!.end - buckets[0].start) / (42 * DAY);
  return ROWS.map(([number, title, dueIn, total, open, nobody, added6, closed6, addLean = "even", closeLean = "even"]) => {
    const added = Math.round(added6 * Math.min(span, 2));
    const closed = Math.min(Math.round(closed6 * Math.min(span, 2)), total - open);
    return {
      number,
      title,
      url: `https://github.com/acme/widgets/milestone/${number}`,
      due: dueIn === null ? null : now + dueIn * DAY,
      open,
      closed: total - open,
      nobody,
      added: spread(added, buckets.length, addLean),
      closedIn: spread(closed, buckets.length, closeLean),
      openAdded: Math.min(open, added),
    };
  });
}

const TITLES = [
  "Run the sprocket migrations against the new store in CI",
  "Sprocket search falls back to a full scan on the new store",
  "Replace the sprocket counter with a generated id",
  "Document connection settings for the new sprocket store",
  "Sprocket export times out with more than 10,000 rows",
  "Store every sprocket date with its time zone",
  "Seed script assumes the old store's numbering",
  "Case-insensitive sprocket name lookup",
  "Move sprocket settings out of the blob column",
  "Deadlock when two imports update the same sprocket",
  "Health check should report which sprocket store is in use",
  "Drop the old store's nightly compaction job",
  "Add the new sprocket store to the local dev setup",
  "Sprocket history query needs an index on its update time",
  "Write sprockets in batches of 500",
  "Send sprocket reports to a read-only copy",
  "Use a fixed list for sprocket status instead of free text",
  "Copy existing sprockets from the old store",
  "Retry with backoff when the sprocket store drops a connection",
  "Compare sprocket listing speed between the two stores",
  "Write the sprocket store upgrade guide",
];

const CLOSED_TITLES = [
  "Pick a client library for the new sprocket store",
  "Put the sprocket store behind an interface",
  "Run the test suite against both sprocket stores",
  "Sprocket ids overflow their column",
  "Store sprocket weights as exact numbers",
  "Port the sprocket search query",
  "Port the sprocket import transaction",
  "Remove old-store settings from the sprocket module",
  "Add a setting for the sprocket store address",
  "Run the new sprocket store in the dev containers",
  "Move the sprocket audit log",
  "Translate date functions in sprocket reports",
  "Rename the reserved sprocket owner column",
  "Schema snapshot for the new sprocket store",
  "Fix true and false defaults in sprocket migrations",
  "Port the sprocket cleanup job",
  "Try a store-specific query plugin",
  "Document the sprocket store address setting",
  "Sprocket counts differ between the stores",
  "Make the sprocket seed data portable",
];

const STANDING_OF: IssueStanding[] = ["approved", "review", "assigned", "assigned", "draft", ...Array<IssueStanding>(16).fill("nobody")];
const ADDED_DAYS = [4, 38, 10, 20, 3, 6, 29, 13, 1, 17, 25, 8, 5, 34, 15, 58, 71, 88, 9, 12, 7];
const PEOPLE = ["octocat", "hubber", "monalisa"];

/** "Sprocket storage migration": past due, mostly unheld, and gaining issues faster than it closes them. */
export function milestoneDetailFor(buckets: readonly Bucket[], now: number, sync: SyncStatus): MilestoneDetailResult {
  const milestone = unsorted(buckets, now).find((m) => m.number === 36)!;
  const open: MilestoneIssue[] = TITLES.map((title, i) => ({
    number: 2104 + i * 6,
    title,
    url: `https://github.com/acme/widgets/issues/${2104 + i * 6}`,
    standing: STANDING_OF[i],
    addedAt: now - ADDED_DAYS[i] * DAY,
    assignees: STANDING_OF[i] === "nobody" ? [] : [PEOPLE[i % 3]],
    threadId: i === 2 ? "thr_demo" : null,
  }));
  const closed: ClosedMilestoneIssue[] = CLOSED_TITLES.map((title, i) => ({
    number: 1911 + i * 8,
    title,
    url: `https://github.com/acme/widgets/issues/${1911 + i * 8}`,
    closedAt: now - (i * 2 + 1) * DAY - (i > 16 ? 60 * DAY : 0),
    notDone: i === 16,
    assignees: [PEOPLE[i % 3]],
    threadId: null,
  }));
  // A point a week since it was created twenty weeks ago: slow, then a rush of issues in the last six.
  const at: number[] = [];
  const total: number[] = [];
  const done: number[] = [];
  for (let w = 0; w <= 20; w++) {
    at.push(now - (20 - w) * 7 * DAY);
    total.push(Math.round(10 + (8 * w) / 20 + (w > 14 ? (w - 14) * 4 : 0)));
    done.push(Math.round(w > 14 ? 1 + (w - 14) * 3.2 : (w / 20) * 1.5));
  }
  total[20] = open.length + closed.length;
  done[20] = closed.length;
  return {
    repository: "acme/widgets",
    buckets: [...buckets],
    milestone,
    open,
    closed,
    history: { at, total, closed: done },
    everyone: ["octocat", "hubber", "monalisa", "mona"],
    everyTeam: ["reviewers"],
    sync,
  };
}
