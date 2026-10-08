// When each turn ran, which tools it waited on, and when it waited on you.
// bb records a start and an end for every turn, every item inside one, and
// every question the agent asks you; this reads them into rows. Pure.

/** The events this module reads, listed alongside the usage events. */
export const TIMING_EVENTS = [
  "turn/started",
  "turn/completed",
  "item/started",
  "item/completed",
  "system/interaction/lifecycle",
] as const;

/**
 * Items that are the model working rather than a tool it waits on. A turn's
 * time outside tools and waits is the model's.
 */
const MODEL_ITEMS = new Set(["reasoning", "agentMessage", "userMessage", "plan"]);

/** Labels are kept for grouping slow commands, not for reading in full. */
const MAX_LABEL = 300;

export interface TimingEventLike {
  createdAt: number;
  type: string;
  scope?: { kind: string; turnId?: string } | null;
  data: unknown;
}

export interface TurnTime {
  turnId: string;
  startedAt: number | null;
  completedAt: number | null;
}

export interface ItemTime {
  itemId: string;
  turnId: string | null;
  kind: string;
  /** The command for a shell command, the tool's name for a tool call, the title otherwise. */
  label: string | null;
  startedAt: number | null;
  completedAt: number | null;
}

export interface WaitTime {
  interactionId: string;
  turnId: string | null;
  kind: string;
  startedAt: number;
  resolvedAt: number | null;
}

export interface TimingRows {
  turns: TurnTime[];
  items: ItemTime[];
  waits: WaitTime[];
}

interface ItemPayload {
  item?: {
    id?: string;
    type?: string;
    command?: string | string[];
    tool?: string;
    label?: string;
    background?: boolean;
    presentation?: { title?: string };
  };
}

interface InteractionPayload {
  interaction?: { id?: string; status?: string; payload?: { kind?: string } };
}

const RESOLVED = new Set(["resolved", "cancelled", "canceled", "expired", "failed"]);

function labelOf(item: NonNullable<ItemPayload["item"]>): string | null {
  const raw =
    item.type === "commandExecution"
      ? Array.isArray(item.command)
        ? item.command.join(" ")
        : item.command
      : item.type === "toolCall"
        ? item.tool
        : (item.presentation?.title ?? item.label);
  return typeof raw === "string" && raw !== "" ? raw.slice(0, MAX_LABEL) : null;
}

export function timingRowsOf(events: readonly TimingEventLike[]): TimingRows {
  const turns: TurnTime[] = [];
  const items: ItemTime[] = [];
  const waits: WaitTime[] = [];
  for (const event of events) {
    const turnId = event.scope?.turnId ?? null;
    if (event.type === "turn/started" || event.type === "turn/completed") {
      if (turnId === null) continue;
      const started = event.type === "turn/started";
      turns.push({ turnId, startedAt: started ? event.createdAt : null, completedAt: started ? null : event.createdAt });
    } else if (event.type === "item/started" || event.type === "item/completed") {
      const item = (event.data as ItemPayload | null)?.item;
      if (item?.id === undefined || item.type === undefined) continue;
      // A background task or subagent runs alongside the turn rather than holding it up.
      if (MODEL_ITEMS.has(item.type) || item.type === "backgroundTask" || item.background === true) continue;
      const started = event.type === "item/started";
      items.push({
        itemId: item.id,
        turnId,
        kind: item.type,
        label: labelOf(item),
        startedAt: started ? event.createdAt : null,
        completedAt: started ? null : event.createdAt,
      });
    } else if (event.type === "system/interaction/lifecycle") {
      const interaction = (event.data as InteractionPayload | null)?.interaction;
      if (interaction?.id === undefined) continue;
      waits.push({
        interactionId: interaction.id,
        turnId,
        kind: interaction.payload?.kind ?? "unknown",
        startedAt: event.createdAt,
        resolvedAt: RESOLVED.has(interaction.status ?? "") ? event.createdAt : null,
      });
    }
  }
  return { turns, items, waits };
}

export function isEmpty(rows: TimingRows): boolean {
  return rows.turns.length === 0 && rows.items.length === 0 && rows.waits.length === 0;
}
