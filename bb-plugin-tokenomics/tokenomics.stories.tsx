import { useState } from "react";
import type { PermissionMode, PromptTextMention } from "@bb/domain";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import { makeExecutionControlsProps, STORY_CLAUDE_CODE_MODELS, STORY_PROVIDER_OPTIONS } from "@bb-ladle/story-fixtures";
import { AppPageHeader } from "@bb-app/components/layout/AppPageHeader";
import { SidebarProvider } from "@bb-app/components/ui/sidebar";
import { FollowUpPromptBox } from "@bb-app/components/promptbox/FollowUpPromptBox";
import { INERT_TYPEAHEAD_COMMAND_CONFIG } from "@bb-app/components/promptbox/PromptBoxInternal";
import type { PickerOption } from "@bb-app/components/pickers/OptionPicker";

import { ContextMeter, type ContextMeterProps } from "./components/context-meter";
import {
  ThreadTokenCount,
  ThreadTokenSummary,
  type InitialHover,
  type ThreadTokens,
} from "./components/thread-token-count";
import { UsageView, type UsageData } from "./components/usage-view";
import type { ThreadUsage, TurnDetail, TurnTimeBreakdown } from "./usage/contract";
import { fillBars, windowFor, type RangeId } from "./usage/series";

export default {
  title: "tokenomics/Page",
};

const NOW = new Date(2026, 8, 24, 14, 20);
const HOUR = 3_600_000;

/** Invented usage: busy working hours, quiet nights, a deterministic wobble. */
function fixtureHours(since: number) {
  const hours = [];
  for (let hour = since; hour <= NOW.getTime(); hour += HOUR) {
    const local = new Date(hour).getHours();
    const busy = local >= 9 && local <= 18 ? 1 : local >= 7 && local <= 21 ? 0.3 : 0;
    const wobble = 0.5 + ((hour / HOUR) * 7919 % 97) / 97;
    if (busy === 0) continue;
    const scale = busy * wobble;
    hours.push({
      hour,
      input: Math.round(180_000 * scale),
      cacheRead: Math.round(9_000_000 * scale),
      output: Math.round(60_000 * scale),
    });
  }
  return hours;
}

/** The hour that began `hoursAgo` hours before NOW's. */
function hourAgo(hoursAgo: number): number {
  const hour = new Date(NOW);
  hour.setMinutes(0, 0, 0);
  return hour.getTime() - hoursAgo * HOUR;
}

function thread(
  threadId: string,
  title: string | null,
  projectName: string,
  turns: number,
  cacheRead: number,
  /** How many hours before NOW each hour of its use began. */
  busyHoursAgo: number[],
  /** How many hours before NOW it was archived, or null while it is active. */
  archivedHoursAgo: number | null = null,
  /** Its latest context size; past 300K tints its row. */
  context: number | null = null,
): ThreadUsage {
  const input = Math.round(cacheRead * 0.02);
  const output = Math.round(cacheRead * 0.006);
  const total = input + cacheRead + output;
  const weights = busyHoursAgo.map((_, index) => 0.5 + ((index * 7919) % 97) / 97);
  const sum = weights.reduce((a, b) => a + b, 0);
  return {
    threadId,
    title,
    projectId: `prj_${projectName}`,
    projectName,
    providerId: threadId.endsWith("x") ? "codex" : "claude-code",
    archivedAt: archivedHoursAgo === null ? null : hourAgo(archivedHoursAgo),
    turns,
    context,
    // Turn lengths spread from seconds to half an hour, the way real turns do.
    turnTimes: Array.from({ length: Math.min(turns, 40) }, (_, index) => ({
      at: hourAgo(busyHoursAgo[index % busyHoursAgo.length]!) + index * 60_000,
      ms: Math.round(12_000 * 150 ** (((index * 7919 + threadId.length * 31) % 97) / 97)),
    })),
    hours: busyHoursAgo.map((ago, index) => ({ hour: hourAgo(ago), total: Math.round((total * weights[index]!) / sum) })),
    input,
    cacheRead,
    output,
  };
}

const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, index) => from - index);

const THREADS: ThreadUsage[] = [
  // Busy all day and still going in the latest hour.
  // Its context has grown past the 550K error setting, so its row is red.
  thread("thr_a1", "Add a CSV export to the widgets report", "widgets", 42, 58_400_000, [...range(23, 18), ...range(6, 0)], null, 620_000),
  // Past the 300K warning setting, so its row is amber.
  thread("thr_a2", "Fix the flaky gadgets checkout test", "gadgets", 27, 31_900_000, range(5, 2), null, 340_000),
  thread("thr_a3x", "Review the widgets API pagination change", "widgets", 12, 12_700_000, range(22, 19), 2),
  thread("thr_a4", null, "gadgets", 3, 2_100_000, [3]),
  thread("thr_a5", "Rename the gadget sizes enum", "gadgets", 1, 240_000, [20], 18),
  // Archived four days ago, so only the past week lists it, under Older.
  thread("thr_a6", "Bump the widgets lint config", "widgets", 6, 4_800_000, range(110, 104), 100),
];

const MIN = 60_000;

// Shaped like a real day: most of the time in long turns, most of that in shell commands.
const DAY_TIME: TurnTimeBreakdown = {
  turns: 160,
  split: { model: 192 * MIN, tools: 330 * MIN, waiting: 24 * MIN },
  kinds: [
    { kind: "commandExecution", ms: 280 * MIN, count: 1_820 },
    { kind: "toolCall", ms: 40 * MIN, count: 102 },
    { kind: "fileRead", ms: 6 * MIN, count: 211 },
    { kind: "delegation", ms: 4 * MIN, count: 2 },
    { kind: "fileChange", ms: 0.5 * MIN, count: 72 },
  ],
  questions: 9,
  lengths: [
    { turns: 83, split: { model: 22 * MIN, tools: 7 * MIN, waiting: 1 * MIN } },
    { turns: 44, split: { model: 57 * MIN, tools: 45 * MIN, waiting: 5 * MIN } },
    { turns: 27, split: { model: 70 * MIN, tools: 191 * MIN, waiting: 0 } },
    { turns: 6, split: { model: 43 * MIN, tools: 87 * MIN, waiting: 18 * MIN } },
  ],
  commands: [
    { command: "npm run e2e", runs: 12, totalMs: 60 * MIN, medianMs: 8 * MIN, longestMs: 9 * MIN },
    { command: "pnpm test", runs: 41, totalMs: 38 * MIN, medianMs: 50_000, longestMs: 3 * MIN },
    { command: "python3", runs: 231, totalMs: 26 * MIN, medianMs: 1_000, longestMs: 2 * MIN },
  ],
};

// A week with one question left unanswered overnight.
const WEEK_TIME: TurnTimeBreakdown = {
  turns: 884,
  split: { model: 942 * MIN, tools: 1_134 * MIN, waiting: 750 * MIN },
  kinds: [
    { kind: "commandExecution", ms: 1_010 * MIN, count: 8_735 },
    { kind: "toolCall", ms: 102 * MIN, count: 436 },
    { kind: "fileRead", ms: 12 * MIN, count: 883 },
    { kind: "delegation", ms: 10 * MIN, count: 11 },
  ],
  questions: 36,
  lengths: [
    { turns: 470, split: { model: 120 * MIN, tools: 40 * MIN, waiting: 6 * MIN } },
    { turns: 250, split: { model: 290 * MIN, tools: 230 * MIN, waiting: 20 * MIN } },
    { turns: 130, split: { model: 340 * MIN, tools: 610 * MIN, waiting: 10 * MIN } },
    { turns: 34, split: { model: 192 * MIN, tools: 254 * MIN, waiting: 714 * MIN } },
  ],
  commands: [
    { command: "npm run e2e", runs: 23, totalMs: 132 * MIN, medianMs: 6 * MIN, longestMs: 9 * MIN },
    { command: "pnpm test", runs: 101, totalMs: 96 * MIN, medianMs: 11_000, longestMs: 3 * MIN },
    { command: "python3", runs: 1_033, totalMs: 90 * MIN, medianMs: 1_000, longestMs: 4 * MIN },
  ],
};

function dataFor(range: RangeId, recordingSince?: number): UsageData {
  const span = windowFor(range, NOW);
  return {
    since: span.since,
    bars: fillBars(span.bars, fixtureHours(span.since)),
    unit: span.unit,
    threads: THREADS.filter((thread) => thread.hours.some(({ hour }) => hour >= span.since)),
    recordingSince: recordingSince ?? span.since - HOUR,
    contextThresholds: { warning: 300_000, error: 550_000 },
    turnTime: range === "day" ? DAY_TIME : WEEK_TIME,
  };
}

function Page({
  initial,
  recordingSince,
  initialHovered,
}: {
  initial: RangeId;
  recordingSince?: number;
  initialHovered?: number;
}) {
  const [range, setRange] = useState<RangeId>(initial);
  return (
    <UsageView
      range={range}
      onRange={setRange}
      data={dataFor(range, recordingSince)}
      error={null}
      onOpenThread={() => undefined}
      initialHovered={initialHovered}
      now={NOW.getTime()}
    />
  );
}

export const PastDay = () => <Page initial="day" />;

// The plugin's README embeds this one.
/** The past day with a busy hour hovered, so its tooltip shows. */
export const PastDayHovered = () => <Page initial="day" initialHovered={20} />;

export const PastThreeDays = () => <Page initial="three-days" />;

export const PastWeek = () => <Page initial="week" recordingSince={NOW.getTime() - 4 * 24 * HOUR} />;

/** Threads archived in the past three days, dimmed and labeled Archived. */
export const RecentThreads = () => (
  <UsageView
    range="day"
    onRange={() => undefined}
    data={dataFor("day")}
    error={null}
    onOpenThread={() => undefined}
    initialLifecycle="recent"
    now={NOW.getTime()}
  />
);

/** Over the past week, a thread archived more than three days ago lists under Older. */
export const OlderThreads = () => (
  <UsageView
    range="week"
    onRange={() => undefined}
    data={dataFor("week", NOW.getTime() - 7 * 24 * HOUR)}
    error={null}
    onOpenThread={() => undefined}
    initialLifecycle="older"
    now={NOW.getTime()}
  />
);

export const Empty = () => (
  <UsageView
    range="day"
    onRange={() => undefined}
    data={{
      ...dataFor("day"),
      bars: windowFor("day", NOW).bars,
      threads: [],
      turnTime: { turns: 0, split: { model: 0, tools: 0, waiting: 0 }, kinds: [], questions: 0, lengths: [], commands: [] },
    }}
    error={null}
    onOpenThread={() => undefined}
    now={NOW.getTime()}
  />
);

/** Invented messages, one per turn, for the summary's hover and biggest turns. */
const PROMPTS = [
  "Add a CSV export to the widgets report",
  "Run the whole test suite and fix whatever fails",
  "Why is the export slow on big reports?",
  "Rename exportRows to buildExportRows everywhere",
  "Read every file under src/ and summarize the architecture",
  "Looks good, commit it",
  "2 images",
  "Now do the same for the gadgets report",
];

/** Invented turns: a quick start, one heavy stretch after a lunch gap, a quick finish. */
function fixtureTurns(count: number, start: number): TurnDetail[] {
  let at = start;
  return Array.from({ length: count }, (_, index) => {
    const wobble = 0.35 + ((index * 7919) % 97) / 97;
    const heavy = index === Math.floor(count * 0.6) ? 5 : index > count * 0.4 && index < count * 0.8 ? 2 : 1;
    const minutes = heavy >= 2 ? 14 : 4;
    const startedAt = at;
    at += (minutes + (index === Math.floor(count / 3) ? 55 : 3)) * 60_000;
    const cacheRead = Math.round(1_200_000 * wobble * heavy);
    // Heavy turns spend most of their time in tools; one stops to ask a question.
    const length = minutes * 60_000;
    const waiting = index === Math.floor(count * 0.7) ? 3 * 60_000 : 0;
    const tools = Math.round((length - waiting) * (heavy >= 2 ? 0.6 : 0.3) * wobble);
    return {
      turnId: `t${index + 1}`,
      startedAt,
      endedAt: startedAt + minutes * 60_000,
      usageAt: startedAt + minutes * 60_000,
      prompt: index === count - 2 ? null : PROMPTS[index % PROMPTS.length]!,
      time: { model: length - waiting - tools, tools, waiting },
      input: Math.round(cacheRead * 0.013),
      cacheRead,
      output: Math.round(cacheRead * 0.0037),
    };
  });
}

function usageOf(turns: TurnDetail[], pruned = 0): ThreadTokens {
  const sum = turns.reduce(
    (acc, turn) => ({
      input: acc.input + turn.input,
      cacheRead: acc.cacheRead + turn.cacheRead,
      output: acc.output + turn.output,
    }),
    { input: 0, cacheRead: 0, output: 0 },
  );
  return {
    ...sum,
    total: sum.input + sum.cacheRead + sum.output + pruned,
    turns: turns.length,
    recent: turns.map((turn) => ({ at: turn.usageAt, input: turn.input, cacheRead: turn.cacheRead, output: turn.output })),
  };
}

const LONG_TURNS = fixtureTurns(18, NOW.getTime() - 5 * HOUR);
const LONG = usageOf(LONG_TURNS);
// Three subagents whose 9.4M bb never reported; the totals include them.
const WITH_SUBAGENTS: ThreadTokens = {
  ...LONG,
  input: LONG.input + 180_000,
  cacheRead: LONG.cacheRead + 9_180_000,
  output: LONG.output + 40_000,
  total: LONG.total + 9_400_000,
  subagents: { count: 3, tokens: 9_400_000 },
};
const PRUNED_TURNS = fixtureTurns(6, NOW.getTime() - 2 * HOUR);
const PRUNED = usageOf(PRUNED_TURNS, 12_480_000);
const SHORT_TURNS = fixtureTurns(1, NOW.getTime() - 5 * 60_000);
const SHORT = usageOf(SHORT_TURNS);

export const HeaderCount = () => (
  <StoryCard>
    <StoryRow label="a long thread" hint="token use over time; click to open the summary">
      <ThreadTokenCount usage={LONG} turns={LONG_TURNS} onOpenPage={() => undefined} />
    </StoryRow>
    <StoryRow label="a short thread" hint="one turn, a thin bar at the right">
      <ThreadTokenCount usage={SHORT} turns={SHORT_TURNS} onOpenPage={() => undefined} />
    </StoryRow>
    <StoryRow label="compact viewport" hint="the sparkline drops out">
      <ThreadTokenCount usage={LONG} turns={LONG_TURNS} isCompactViewport onOpenPage={() => undefined} />
    </StoryRow>
  </StoryCard>
);

function Summary({
  usage,
  turns,
  initialHovered,
}: {
  usage: ThreadTokens;
  turns: TurnDetail[] | null;
  initialHovered?: InitialHover;
}) {
  return (
    <div className="w-[400px] rounded-md border border-border bg-popover p-4">
      <ThreadTokenSummary usage={usage} turns={turns} onOpenPage={() => undefined} initialHovered={initialHovered} />
    </div>
  );
}

/** The popover's contents, drawn open. */
export const HeaderSummary = () => (
  <StoryCard>
    <StoryRow label="a long thread" hint="hover a bar for the messages behind it">
      <Summary usage={LONG} turns={LONG_TURNS} />
    </StoryRow>
    <StoryRow label="the busiest stretch hovered" hint="the readout names the messages behind it">
      <Summary usage={LONG} turns={LONG_TURNS} initialHovered="largest" />
    </StoryRow>
    <StoryRow label="loading the turns" hint="the chart draws the recorded usage until the messages arrive">
      <Summary usage={LONG} turns={null} />
    </StoryRow>
    <StoryRow label="subagents counted" hint="bb leaves their tokens out; the summary adds them and says so">
      <Summary usage={WITH_SUBAGENTS} turns={LONG_TURNS} />
    </StoryRow>
    <StoryRow label="earlier turns pruned" hint="the provider's running total covers what bb deleted">
      <Summary usage={PRUNED} turns={PRUNED_TURNS} />
    </StoryRow>
  </StoryCard>
);

// The plugin's README embeds this one.
/**
 * The button where bb draws it, in a thread header's action row, with its
 * summary open on the busiest stretch.
 */
export const HeaderOpen = () => (
  <div className="h-[760px] w-full">
    <div className="flex h-12 items-center gap-3 border-b border-border px-4">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">Add a CSV export to the widgets report</span>
      <ThreadTokenCount usage={LONG} turns={LONG_TURNS} onOpenPage={() => undefined} defaultOpen initialHovered="largest" />
    </div>
  </div>
);

const METER: ContextMeterProps = {
  usedTokens: 510_000,
  contextWindow: 1_000_000,
  thresholds: { warning: 300_000, error: 550_000 },
  level: "warning",
  lastTurn: 22_400_000,
  running: false,
  compacting: false,
  error: null,
  onCompact: () => undefined,
};

/**
 * The meter above a thread's composer once its context passes the warning
 * setting, 300K tokens here, and red past the error setting, 550K, with a
 * button that compacts the thread.
 */
export const ContextMeterStates = () => (
  <StoryCard>
    <StoryRow label="past the warning" hint="amber past 300K; the ticks mark both settings">
      <div className="w-[720px]">
        <ContextMeter {...METER} />
      </div>
    </StoryRow>
    <StoryRow label="past the error" hint="red past 550K">
      <div className="w-[720px]">
        <ContextMeter {...METER} usedTokens={620_000} level="error" />
      </div>
    </StoryRow>
    <StoryRow label="a turn running" hint="bb compacts only an idle thread">
      <div className="w-[720px]">
        <ContextMeter {...METER} running />
      </div>
    </StoryRow>
    <StoryRow label="compacting" hint="until the smaller context arrives">
      <div className="w-[720px]">
        <ContextMeter {...METER} running compacting />
      </div>
    </StoryRow>
    <StoryRow label="no usable window" hint="the provider reported a window smaller than the context">
      <div className="w-[720px]">
        <ContextMeter {...METER} usedTokens={347_000} contextWindow={200_000} lastTurn={1_430_000} />
      </div>
    </StoryRow>
    <StoryRow label="compaction refused" hint="bb's reason, under the meter">
      <div className="w-[720px]">
        <ContextMeter {...METER} error="Context can only be compacted while the thread is idle or errored" />
      </div>
    </StoryRow>
    <StoryRow label="narrow composer" hint="the bar and the last turn drop out">
      <div className="w-[320px]">
        <ContextMeter {...METER} compact />
      </div>
    </StoryRow>
  </StoryCard>
);

const noop = () => {};
// bb's own empty mention list. Bare @bb/* packages do not resolve from a
// plugin's stories, only the @bb-app and @bb-ladle aliases do.
const EMPTY_ORDERED_MENTION_SUGGESTIONS = { groups: [], suggestions: [] };
const PERMISSION_OPTIONS: readonly PickerOption<PermissionMode>[] = [
  { value: "accept-edits", label: "Accept Edits" },
  { value: "auto", label: "Approve for me" },
  { value: "full", label: "Full Access", tone: "warning" },
];
const BASE_EXECUTION = makeExecutionControlsProps();
const EXECUTION = makeExecutionControlsProps({
  provider: { ...BASE_EXECUTION.provider, options: STORY_PROVIDER_OPTIONS, selectedId: "claude-code" },
  model: { ...BASE_EXECUTION.model, active: { model: "claude-sonnet-5" }, selected: "claude-sonnet-5", options: STORY_CLAUDE_CODE_MODELS },
});

const CONVERSATION: { from: "user" | "agent"; text: string }[] = [
  { from: "user", text: "Add a CSV export to the widgets report, with the same columns as the table." },
  {
    from: "agent",
    text: "Added an **Export CSV** button to the report toolbar. It streams rows from the same query the table uses, so filters carry over, and quotes any field with a comma. Tests cover an empty report and a 10,000-row one.",
  },
  { from: "user", text: "Can the export include the archived widgets too, behind a checkbox?" },
  {
    from: "agent",
    text: "Done. **Include archived** sits beside the button and is off by default. The export reads the checkbox when you click, and the file name ends in `-with-archived` when it is on.",
  },
];

// The Store's second screenshot. A whole thread, in bb's own header and
// composer, with both of the plugin's thread surfaces showing.
/**
 * A thread whose context has grown past the error setting: the header's
 * sparkline and total, and the meter above the composer with Compact.
 */
export const ThreadWithMeter = () => {
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<PromptTextMention[]>([]);
  return (
    <SidebarProvider>
    <div className="flex h-[600px] w-[1100px] flex-col overflow-hidden border border-border bg-background">
      <AppPageHeader
        ownsWindowTopLeft={false}
        center={<p className="bb-thread-title relative min-w-0 text-sm font-normal">Add a CSV export to the widgets report</p>}
        actions={<ThreadTokenCount usage={LONG} turns={LONG_TURNS} onOpenPage={noop} />}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-6">
          {CONVERSATION.map((turn, index) =>
            turn.from === "user" ? (
              <div key={index} className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
                {turn.text}
              </div>
            ) : (
              <div key={index} className="text-sm leading-relaxed text-foreground">
                <Markdown content={turn.text} />
              </div>
            ),
          )}
        </div>
      </div>
      <div className="chat-prompt-box mx-auto w-full max-w-[760px] px-6 pb-4">
        <FollowUpPromptBox
          attachments={{ items: [], projectId: "proj_demo", isAttaching: false, error: null, onAttachFiles: noop, onRemove: noop }}
          stack={<ContextMeter {...METER} usedTokens={620_000} level="error" />}
          composer={{
            history: { currentDraft: { text: draft, mentions, attachments: [] }, entries: [], onSelectEntry: noop },
            isFollowUpSubmitting: false,
            message: draft,
            mentionRanges: mentions,
            onChangeMessage: (text: string, next: PromptTextMention[]) => {
              setDraft(text);
              setMentions(next);
            },
            onModifierSubmit: noop,
            onSubmit: () => setDraft(""),
            compactPromptPlaceholder: "Ask for a follow-up",
            promptPlaceholder: "Ask for a follow-up. @ to mention files, folders, sections, or threads",
            canModifierSubmit: false,
            steerActiveThreadOnEnter: false,
            submitMode: { kind: "ready" },
            threadRuntimeDisplayStatus: "idle",
          }}
          environmentSummary={null}
          contextWindowUsage={null}
          execution={EXECUTION}
          permission={{ value: "full", options: PERMISSION_OPTIONS, onChange: noop, supported: true }}
          promptActions={[]}
          typeahead={{
            mention: { results: EMPTY_ORDERED_MENTION_SUGGESTIONS, isLoading: false, isError: false, onQueryChange: noop },
            command: INERT_TYPEAHEAD_COMMAND_CONFIG,
          }}
          collapseResetKey="thr_story"
        />
      </div>
    </div>
    </SidebarProvider>
  );
};
