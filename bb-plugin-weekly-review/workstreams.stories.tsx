// The Workstreams section of the Weekly Review page. The table is built by
// the real buildTable from invented activity, so the totals are the ones the
// page would show.
import type { Activity } from "./review/activity";
import { PrioritiesSection } from "./review/priorities-section";
import { WorkstreamSection, type WorkstreamActions, type WorkstreamViewProps } from "./review/workstream-section";
import { buildTable, type Rule, type Workstream } from "./review/workstreams";

export default {
  title: "weekly-review/Workstreams",
};

const MONDAY = "2026-09-07";
const day = (offset: number) => `2026-09-${String(7 + offset).padStart(2, "0")}`;

let next = 1;
function time(offset: number, hours: number, title: string, extra: Partial<Activity> = {}): Activity {
  return {
    key: `harvest:entry:${next++}`, type: "time", day: day(offset), title, url: null,
    hours, ref: null, task: "Development", labels: [], ...extra,
  };
}
function github(type: "pr" | "review" | "issue", offset: number, number: number, title: string): Activity {
  return {
    key: `github:${type}:${number}`, type, day: day(offset), title,
    url: `https://github.com/acme/widgets/pull/${number}`, hours: 0, ref: number, task: null, labels: [],
  };
}

const ACTIVITY: Activity[] = [
  time(0, 2.5, "Widget sync API", { ref: 412 }),
  time(1, 3, "Widget sync API", { ref: 412 }),
  github("pr", 1, 412, "feat(widgets): sync widgets between accounts"),
  time(2, 1.25, "Widget sync rollout plan"),
  github("pr", 3, 418, "fix(widgets): retry a sync that times out"),
  time(0, 1, "Gadget launch review w/ Hubber", { task: "Meetings" }),
  time(3, 2, "Gadget launch checklist", { task: "Planning" }),
  github("issue", 3, 420, "Gadget launch: write the announcement"),
  time(1, 0.75, "Review", { task: "Code Review", ref: 405 }),
  github("review", 1, 405, "chore(deps): bump the build tools"),
  github("review", 2, 409, "docs: explain the widget states"),
  time(2, 0.5, "Code review", { task: "Code Review" }),
  time(4, 1.5, "Hiring loop debrief", { task: "Meetings" }),
  time(4, 0.5, "Inbox", { task: "Admin" }),
  { key: "todoist:completed:t1", type: "task", day: null, title: "Send the widget sync notes", url: null,
    hours: 0, ref: null, task: null, labels: ["widgets"] },
];

const WORKSTREAMS: Workstream[] = [
  { id: 1, name: "Widget sync", retiredAt: null },
  { id: 2, name: "Gadget launch", retiredAt: null },
  { id: 3, name: "Code review", retiredAt: null },
  { id: 4, name: "Team rituals", retiredAt: null },
];
const RULES: Rule[] = [
  { id: 1, workstreamId: 1, type: "phrase", value: "widget sync" },
  { id: 2, workstreamId: 1, type: "label", value: "widgets" },
  { id: 3, workstreamId: 1, type: "ref", value: "418" },
  { id: 4, workstreamId: 2, type: "phrase", value: "gadget launch" },
  { id: 5, workstreamId: 3, type: "task", value: "Code Review" },
];

function view(
  choices = new Map<number, "added" | "hidden">(),
  planned = new Set<number>(),
  proposals: WorkstreamViewProps["proposals"] = [],
): WorkstreamViewProps {
  const reviews = new Map<string, number | null>([["github:review:405", 3], ["github:review:409", 3]]);
  return {
    table: buildTable(MONDAY, ACTIVITY, WORKSTREAMS, RULES, reviews, choices, planned),
    proposals,
    workstreams: WORKSTREAMS.map((workstream) => ({
      ...workstream,
      rules: RULES.filter((rule) => rule.workstreamId === workstream.id),
    })),
    suggestions: [
      { name: "Hiring loop debrief", hours: 1.5, rules: [{ type: "phrase", value: "Hiring loop debrief" }], keys: [] },
    ],
  };
}

const actions: WorkstreamActions = {
  assign: () => {},
  unassign: () => {},
  createWorkstream: async () => 99,
  addRule: () => {},
  preview: async () => ({ matches: 4, unsorted: 2, weeks: 2, examples: ["Hiring loop debrief", "Hiring sync"] }),
  setWeekChoice: () => {},
  acceptSuggestion: () => {},
  acceptProposal: () => {},
  rejectProposal: () => {},
  suggestRules: () => {},
  openThread: () => {},
};

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl px-5 pb-8 pt-1">{children}</div>;
}

/** A week sorted into three workstreams, with what the rules missed in Unsorted and a theme suggested as a fourth. */
export const Week = () => (
  <Page>
    <WorkstreamSection view={view()} actions={actions} />
  </Page>
);

/** Tuesday's Widget sync cell, opened to list what is in it and which rule put it there. */
export const CellOpen = () => (
  <Page>
    <WorkstreamSection view={view()} actions={actions} initialSelection={{ row: 1, day: day(1) }} />
  </Page>
);

/** Unsorted opened: each activity can be assigned by hand or turned into a rule. */
export const Unsorted = () => (
  <Page>
    <WorkstreamSection view={view()} actions={actions} initialSelection={{ row: "unsorted", day: null }} />
  </Page>
);

/** Team rituals added to a week it had no activity in, so its empty row shows. */
export const AddedEmpty = () => (
  <Page>
    <WorkstreamSection view={view(new Map([[4, "added"]]))} actions={actions} />
  </Page>
);

const PRIORITIES = {
  heading: "September 4, 2026",
  items: [
    { text: "Ship the widget sync beta.", details: [], links: [1], suggested: [], done: true },
    { text: "Plan the team rituals for the quarter.", details: [], links: [4], suggested: [] },
    { text: "Start the gadget launch checklist.", details: [], links: [], suggested: [2] },
    {
      text: "People:",
      details: ["Check in with Octocat about the widget sync handoff."],
      links: [],
      suggested: [],
    },
  ],
};

/**
 * Last week's Next list above the table. Widget sync got time and is checked
 * off on the Now page; Team rituals was linked and got none; the gadget launch bullet is not linked yet, with
 * a suggested link; the last has nothing to link to.
 */
export const Priorities = () => {
  const planned = view(new Map(), new Set([1, 4]));
  return (
    <Page>
      <PrioritiesSection
        priorities={PRIORITIES}
        table={planned.table}
        workstreams={WORKSTREAMS}
        onLink={() => {}}
        onUnlink={() => {}}
      />
      <WorkstreamSection view={planned} actions={actions} />
    </Page>
  );
};

/** Rules the agent proposed, each with what it would catch, waiting to be accepted or rejected. */
export const Proposals = () => (
  <Page>
    <WorkstreamSection
      view={view(new Map(), new Set(), [
        {
          id: 1, workstream: "Hiring", type: "phrase", value: "hiring loop", isNew: true,
          reason: "Interview debriefs and loop planning, about 1.5h a week.",
          preview: { matches: 3, unsorted: 3, weeks: 2, examples: ["Hiring loop debrief", "Hiring loop schedule"] },
        },
        {
          id: 2, workstream: "Widget sync", type: "ref", value: "412", isNew: false,
          reason: "The sync PR, which the title phrase misses.",
          preview: { matches: 3, unsorted: 1, weeks: 1, examples: ["feat(widgets): sync widgets between accounts"] },
        },
      ])}
      actions={actions}
      rulesThread="thr_example"
    />
  </Page>
);
