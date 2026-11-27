// The session in bb's title bar: its tokens per 15 minutes from its start to
// its reset, with a dot for each 15 minutes still to come, and two rings for
// the percent used: the session outside, the week inside. Between sessions,
// the weekly limit's ring and the past five hours' tokens. With more than one
// subscription, each gets its own half-width chart and rings. Hovering shows
// every subscription's meters and one chart of the past day's tokens across
// all of them. Display only; app.tsx loads the limits and the bars.
import { useEffect, useRef, useState } from "react";

import { TopBarButton } from "@danielbachhuber/bb-plugin-component-library/top-bar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { Limit, SessionThread } from "@/usage/contract";
import { SLOT_MS } from "@/usage/limits";
import type { Bar } from "@/usage/series";

import { LimitMeters, paceText } from "./limit-meters";
import { SessionThreads } from "./session-threads";
import { UsageChart, UsageLegend } from "./usage-chart";
import { withProjection } from "./usage-view";

/** A session lasts five hours: 20 slots of 15 minutes. */
const SLOTS = 20;
const WIDTH = 80;
const HEIGHT = 18;
const AMBER = "#d97706";

function toneColor(limit: Limit): string | undefined {
  return limit.tone === "error" ? "var(--destructive)" : limit.tone === "warning" ? AMBER : undefined;
}

/**
 * The session's tokens per 15 minutes from its start to its reset, with a dot
 * for each slot still to come. For a weekly limit, the past five hours'.
 */
export function SessionSpark({ limit, now, width = WIDTH }: { limit: Limit; now: number; width?: number }) {
  const WIDTH = width;
  const slots = (limit.slots ?? []).slice(0, SLOTS);
  const most = Math.max(1, ...slots);
  const slot = WIDTH / SLOTS;
  // Half-width bars lose their gap rather than shrinking to nothing.
  const bar = Math.max(1, slot - (slot >= 3 ? 1 : 0.5));
  const color = toneColor(limit) ?? "currentColor";
  const height = (tokens: number) => (tokens === 0 ? 0 : Math.max(1, (tokens / most) * HEIGHT));
  // The baseline runs to now; each slot still to come is a dot, so the empty
  // right side reads as time not yet reached rather than missing usage.
  const start = (limit.kind === "five-hour" ? limit.resetsAt : now) - SLOTS * SLOT_MS;
  const nowX = Math.min(WIDTH, Math.max(0, ((now - start) / (SLOTS * SLOT_MS)) * WIDTH));
  return (
    // Inline, because the top-bar button sizes every svg inside it as a 16px icon.
    <svg width={WIDTH} height={HEIGHT} aria-hidden className="shrink-0" style={{ width: WIDTH, height: HEIGHT }}>
      <line x1={0} x2={nowX} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="currentColor" opacity={0.2} />
      {Array.from({ length: Math.max(0, SLOTS - slots.length) }, (_, k) => (
        <rect
          key={`dot-${k}`}
          x={(slots.length + k) * slot + bar / 2 - 0.75}
          y={HEIGHT - 1.5}
          width={1.5}
          height={1.5}
          fill="currentColor"
          opacity={0.35}
        />
      ))}
      {slots.map((tokens, index) =>
        tokens === 0 ? null : (
          <rect key={index} x={index * slot} y={HEIGHT - height(tokens)} width={bar} height={height(tokens)} rx={0.5} style={{ fill: color }} />
        ),
      )}
    </svg>
  );
}

const RING_SIZE = 18;
const NONE_HIDDEN: ReadonlySet<never> = new Set();

/** One ring of the donut: a faint track, then an arc clockwise from the top for the percent used. */
function Ring({ limit, radius }: { limit: Limit; radius: number }) {
  const center = RING_SIZE / 2;
  const circumference = 2 * Math.PI * radius;
  const used = Math.max(0, Math.min(100, limit.usedPercent)) / 100;
  const color = toneColor(limit) ?? "currentColor";
  return (
    <>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={2.5} opacity={0.15} />
      {used === 0 ? null : (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={2.5}
          strokeDasharray={`${used * circumference} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ stroke: color }}
        />
      )}
    </>
  );
}

/** The percent used as two rings: the session outside, the weekly limit inside when there is one. */
export function LimitDonut({ session, weekly }: { session: Limit; weekly: Limit | null }) {
  return (
    // Inline, because the top-bar button sizes every svg inside it as a 16px icon.
    <svg width={RING_SIZE} height={RING_SIZE} aria-hidden className="shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Ring limit={session} radius={7.75} />
      {weekly === null ? null : <Ring limit={weekly} radius={4.25} />}
    </svg>
  );
}

/** The weekly limit beside a session: the account's limit named "weekly", else its first other one. */
export function weeklyLimit(limits: readonly Limit[]): Limit | null {
  const others = limits.filter((limit) => limit.kind !== "five-hour");
  return others.find((limit) => limit.kind === "weekly") ?? others[0] ?? null;
}

/** Each subscription's spark chart is half as wide once there is more than one. */
const SHARED_WIDTH = WIDTH / 2;
/** The space between one subscription's rings and the next one's chart. */
const ACCOUNT_GAP = 10;

/**
 * The title bar button's width with its spark charts, for `accounts`
 * subscriptions: padding, then each one's chart, the gap, and its rings.
 */
export function topBarLimitsWidth(accounts: number): number {
  const each = (accounts > 1 ? SHARED_WIDTH : WIDTH) + 6 + RING_SIZE;
  return 8 + accounts * each + Math.max(0, accounts - 1) * ACCOUNT_GAP + 8;
}

const accountOf = (limit: Limit) => `${limit.providerId}\n${limit.accountKey ?? ""}`;

/** What the title bar shows for one subscription: its session, or its weekly limit between sessions, and the week beside it. */
export interface Headline {
  limit: Limit;
  weekly: Limit | null;
}

/**
 * One headline per subscription in `limits`, in provider order so they keep
 * their places as one or the other gets busier. `session` stands in for its
 * own subscription's, since app.tsx gives it the spark's slots. A
 * subscription with no session and no weekly spark has none.
 */
export function headlines(session: Limit, limits: readonly Limit[]): Headline[] {
  const accounts = new Map<string, Limit[]>();
  for (const limit of limits) accounts.set(accountOf(limit), [...(accounts.get(accountOf(limit)) ?? []), limit]);
  if (!accounts.has(accountOf(session))) accounts.set(accountOf(session), [session]);
  return [...accounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, group]) => {
      const limit = key === accountOf(session) ? session : urgentSession(group);
      if (limit === null) return [];
      return [{ limit, weekly: limit.kind === "five-hour" ? weeklyLimit(group) : null }];
    });
}

/**
 * The title bar's button: the session's spark chart and the rings for the
 * session's and the week's percent used, or the rings alone when `compact`. Hovering
 * opens the meters for every limit of the session's subscription and the
 * past day's tokens per hour; clicking opens the Tokenomics page.
 */
export function TopBarLimits({
  session,
  limits,
  now,
  providerName,
  onOpen,
  bars = null,
  onHover,
  initialOpen = false,
  compact = false,
  threads = null,
  onOpenThread,
}: {
  session: Limit;
  /** Every subscription's limits, for the other subscriptions' charts and the popover's meters. */
  limits: readonly Limit[];
  now: number;
  providerName: (providerId: string) => string;
  onOpen: () => void;
  /** The past day's hourly bars for the popover's chart; null until loaded. */
  bars?: readonly Bar[] | null;
  /** Called each time the popover opens, so app.tsx can load the bars then. */
  onHover?: () => void;
  /** Opens the popover on first render, so a story can draw it. */
  initialOpen?: boolean;
  /** Leaves the spark chart out, for a sidebar too narrow for the whole button. */
  compact?: boolean;
  /** The session's top threads for the list below the chart; null until loaded. */
  threads?: { threads: readonly SessionThread[]; more: { count: number; tokens: number } } | null;
  onOpenThread?: (threadId: string) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  // The pointer crosses a gap between the button and the popover, so leaving
  // either closes it a moment later, and entering the popover keeps it open
  // so its rows can be clicked.
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepOpen = () => {
    if (closing.current !== null) clearTimeout(closing.current);
    closing.current = null;
  };
  const closeSoon = () => {
    keepOpen();
    closing.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => keepOpen, []);
  const openThread = (threadId: string) => {
    keepOpen();
    setOpen(false);
    onOpenThread?.(threadId);
  };
  const shown = headlines(session, limits);
  const shared = shown.length > 1;
  // The chart sums every provider's tokens, so one subscription's pace can't
  // be drawn on it once there are two.
  const chart =
    bars === null
      ? null
      : shared
        ? { bars, projection: null }
        : withProjection(bars, "hour", limits.filter((limit) => accountOf(limit) === accountOf(session)), now);
  const label = shown
    .map(({ limit, weekly }) => {
      const who = shared ? `${providerName(limit.providerId)} ` : "";
      const week = weekly === null ? "" : ` ${weekly.label}: ${Math.round(weekly.usedPercent)}% used.`;
      return `${who}${limit.label}: ${Math.round(limit.usedPercent)}% used. ${paceText(limit)}.${week}`;
    })
    .join(" ");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <TopBarButton
          label={`${label} Open Tokenomics`}
          onClick={() => {
            setOpen(false);
            onOpen();
          }}
          onPointerEnter={() => {
            keepOpen();
            setOpen(true);
            onHover?.();
          }}
          onPointerLeave={closeSoon}
          className="pr-2"
        >
          {shown.map(({ limit, weekly }, index) => (
            <span
              key={accountOf(limit)}
              className="flex items-center gap-1.5"
              style={index === 0 ? undefined : { marginLeft: ACCOUNT_GAP - 6 }}
            >
              {compact ? null : <SessionSpark limit={limit} now={now} width={shared ? SHARED_WIDTH : WIDTH} />}
              <LimitDonut session={limit} weekly={weekly} />
            </span>
          ))}
        </TopBarButton>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[440px] p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={keepOpen}
        onPointerLeave={closeSoon}
      >
        <LimitMeters
          limits={[...limits].sort((a, b) => accountOf(a).localeCompare(accountOf(b)))}
          providerName={providerName}
          className=""
        />
        {chart === null ? null : (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-xs font-medium">Past day</p>
            <UsageChart bars={chart.bars} unit="hour" hidden={NONE_HIDDEN} projection={chart.projection} plotHeight={96} />
            <div className="pl-[44px]">
              <UsageLegend hidden={NONE_HIDDEN} onToggle={() => undefined} pace={chart.projection !== null} />
            </div>
          </div>
        )}
        {threads === null ? null : (
          <SessionThreads
            threads={threads.threads}
            more={threads.more}
            onOpenThread={openThread}
            onOpenAll={() => {
              keepOpen();
              setOpen(false);
              onOpen();
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The session the title bar shows: the most urgent one, then the most used,
 * so with two subscriptions the one closer to its limit wins. Between
 * sessions, when a provider reports none, the weekly limit the server gave a
 * spark to, picked the same way.
 */
export function urgentSession(limits: readonly Limit[]): Limit | null {
  const rank = { error: 0, warning: 1, ok: 2 } as const;
  const sessions = limits.filter((limit) => limit.kind === "five-hour");
  const candidates = sessions.length > 0 ? sessions : limits.filter((limit) => limit.kind === "weekly" && limit.slots !== undefined);
  return [...candidates].sort((a, b) => rank[a.tone] - rank[b.tone] || b.usedPercent - a.usedPercent)[0] ?? null;
}
