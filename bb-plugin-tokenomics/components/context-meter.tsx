// The meter above a thread's composer once its context passes the warning
// setting, or once its prompt cache has expired: the context size against the
// model's window, amber past the warning and red past the error, the last
// turn's tokens or how long ago the cache expired, and a button that compacts
// the thread. Display only.
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { formatAgo, type ContextLevel, type ContextThresholds } from "@/usage/context";
import { formatTokens } from "@/usage/series";

/** Tailwind's amber-600, which reads on both light and dark backgrounds. */
const AMBER = "#d97706";

export interface ContextMeterProps {
  usedTokens: number;
  /** The model's window; without it the bar is left out. */
  contextWindow: number | null;
  thresholds: ContextThresholds;
  /** Which setting the context has passed, or null when only the cache brings the meter up. */
  level: ContextLevel | null;
  /** When the prompt cache expired, or null while it is warm. */
  cacheExpiredAt?: number | null;
  /** The current time, for how long ago the cache expired. */
  now?: number;
  lastTurn: number | null;
  /** A turn is running, so bb would refuse to compact. */
  running: boolean;
  /** The compact request is on its way or its turn is running. */
  compacting: boolean;
  error: string | null;
  /** Narrow composer: the bar and the last turn drop out. */
  compact?: boolean;
  onCompact: () => void;
}

export function ContextMeter({
  usedTokens,
  contextWindow,
  thresholds,
  level,
  cacheExpiredAt = null,
  now = Date.now(),
  lastTurn,
  running,
  compacting,
  error,
  compact = false,
  onCompact,
}: ContextMeterProps) {
  // Claude Code sometimes reports a 200K window for a thread already past it,
  // so a window smaller than the context is left out rather than drawn full.
  const window = contextWindow !== null && contextWindow >= usedTokens ? contextWindow : null;
  const showBar = !compact && window !== null;
  const fill = window === null ? 0 : usedTokens / window;
  const ticks = [thresholds.warning, thresholds.error].filter(
    (at): at is number => at !== null && window !== null && at < window,
  );
  const expired = cacheExpiredAt !== null;
  // Red is bb's destructive color, so it follows the theme. Under the warning
  // the bar is grey and only the expired cache is amber.
  const color = level === "error" ? undefined : AMBER;
  const barColor = level === null ? "var(--muted-foreground)" : color;
  const passed = level === "error" ? thresholds.error : thresholds.warning;
  const details = expired
    ? []
    : [
        !compact && lastTurn !== null ? `${formatTokens(lastTurn)} last turn` : null,
        window !== null ? `${formatTokens(window)} max` : null,
      ].filter((part) => part !== null);
  const ago = expired ? formatAgo(now - cacheExpiredAt) : null;
  const sizeSays =
    level === null ? "" : ` past the ${formatTokens(passed ?? 0)} ${level === "error" ? "limit" : "warning"}`;
  const cacheSays = ago === null ? "" : ` Its prompt cache expired ${ago} ago, so the next message re-reads all of it.`;
  const label = compacting ? "Compacting…" : "Compact";
  const why = running && !compacting ? "A thread can be compacted once its turn ends." : undefined;
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs",
        expired ? "border-warning/30 bg-warning/5" : "border-border bg-card",
      )}
      // bb stacks composer banners in a grid, in plugin order, and wraps each
      // plugin's banner in a display: contents root. So this is a grid item,
      // and order puts it above the other plugins' banners, such as the
      // GitHub context one.
      style={{ order: -1 }}
      aria-label={`This thread's context is ${formatTokens(usedTokens)} tokens${sizeSays}.${cacheSays}`}
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0 tabular-nums">
          <span className={cn("font-medium", level === "error" && "text-destructive")} style={{ color }}>
            {formatTokens(usedTokens)}
          </span>
          <span className="text-muted-foreground"> context</span>
        </span>
        {showBar ? (
          <span className="relative h-1.5 min-w-0 flex-1 rounded-full bg-muted" aria-hidden>
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", level === "error" && "bg-destructive")}
              style={{ width: `${fill * 100}%`, background: barColor }}
            />
            {ticks.map((at) => (
              <span
                key={at}
                className="absolute bg-foreground/50"
                style={{ left: `${(at / window!) * 100}%`, top: -3, bottom: -3, width: 1 }}
              />
            ))}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {details.length === 0 ? null : (
          <span className="shrink-0 tabular-nums text-muted-foreground">{details.join(" · ")}</span>
        )}
        {ago === null ? null : (
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-warning-text">
            <Icon name="Clock" className="size-3.5" aria-hidden />
            {compact ? `expired ${ago} ago` : `Cache expired ${ago} ago`}
          </span>
        )}
        <span
          className="shrink-0"
          title={why ?? "Replace the conversation so far with a summary, so each model call reads less"}
        >
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-6 px-2 text-xs",
              expired && "border-warning/40 text-warning-text hover:bg-warning/10 hover:text-warning-text",
            )}
            disabled={running || compacting}
            onClick={onCompact}
          >
            {label}
          </Button>
        </span>
      </div>
      {error === null ? null : <p className="mt-1 text-destructive">Couldn't compact: {error}</p>}
    </div>
  );
}
