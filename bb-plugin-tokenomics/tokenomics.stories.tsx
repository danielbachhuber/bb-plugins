import { useState } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { ThreadTokenCount, ThreadTokenSummary, type ThreadTokens } from "./components/thread-token-count";
import { UsageView, type UsageData } from "./components/usage-view";
import type { ThreadUsage, TurnDetail } from "./usage/contract";
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

function thread(threadId: string, title: string | null, projectName: string, turns: number, cacheRead: number): ThreadUsage {
  return {
    threadId,
    title,
    projectId: `prj_${projectName}`,
    projectName,
    providerId: threadId.endsWith("x") ? "codex" : "claude-code",
    turns,
    input: Math.round(cacheRead * 0.02),
    cacheRead,
    output: Math.round(cacheRead * 0.006),
  };
}

const THREADS: ThreadUsage[] = [
  thread("thr_a1", "Add a CSV export to the widgets report", "widgets", 42, 58_400_000),
  thread("thr_a2", "Fix the flaky gadgets checkout test", "gadgets", 27, 31_900_000),
  thread("thr_a3x", "Review the widgets API pagination change", "widgets", 12, 12_700_000),
  thread("thr_a4", null, "gadgets", 3, 2_100_000),
  thread("thr_a5", "Rename the gadget sizes enum", "gadgets", 1, 240_000),
];

function dataFor(range: RangeId, recordingSince?: number): UsageData {
  const span = windowFor(range, NOW);
  return {
    since: span.since,
    bars: fillBars(span.bars, fixtureHours(span.since)),
    unit: span.unit,
    threads: THREADS,
    recordingSince: recordingSince ?? span.since - HOUR,
  };
}

function Page({ initial, recordingSince }: { initial: RangeId; recordingSince?: number }) {
  const [range, setRange] = useState<RangeId>(initial);
  return (
    <UsageView
      range={range}
      onRange={setRange}
      data={dataFor(range, recordingSince)}
      error={null}
      onOpenThread={() => undefined}
    />
  );
}

export const PastDay = () => <Page initial="day" />;

export const PastThreeDays = () => <Page initial="three-days" />;

export const PastWeek = () => <Page initial="week" recordingSince={NOW.getTime() - 4 * 24 * HOUR} />;

export const Empty = () => (
  <UsageView
    range="day"
    onRange={() => undefined}
    data={{ ...dataFor("day"), bars: windowFor("day", NOW).bars, threads: [] }}
    error={null}
    onOpenThread={() => undefined}
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
    return {
      turnId: `t${index + 1}`,
      startedAt,
      endedAt: startedAt + minutes * 60_000,
      usageAt: startedAt + minutes * 60_000,
      prompt: index === count - 2 ? null : PROMPTS[index % PROMPTS.length]!,
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

function Summary({ usage, turns }: { usage: ThreadTokens; turns: TurnDetail[] | null }) {
  return (
    <div className="w-[400px] rounded-md border border-border bg-popover p-4">
      <ThreadTokenSummary usage={usage} turns={turns} onOpenPage={() => undefined} />
    </div>
  );
}

/** The popover's contents, drawn open. */
export const HeaderSummary = () => (
  <StoryCard>
    <StoryRow label="a long thread" hint="hover a bar for the messages behind it">
      <Summary usage={LONG} turns={LONG_TURNS} />
    </StoryRow>
    <StoryRow label="loading the turns" hint="the chart draws the recorded usage until the messages arrive">
      <Summary usage={LONG} turns={null} />
    </StoryRow>
    <StoryRow label="earlier turns pruned" hint="the provider's running total covers what bb deleted">
      <Summary usage={PRUNED} turns={PRUNED_TURNS} />
    </StoryRow>
  </StoryCard>
);
