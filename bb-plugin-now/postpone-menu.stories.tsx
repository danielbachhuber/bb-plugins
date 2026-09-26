import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { PostponeMenu } from "./now/postpone-menu";

export default {
  title: "now/Postpone menu",
};

/** Thursday morning, as in the Item list stories. */
const now = new Date(2026, 8, 24, 9, 30);
const noop = () => {};

/** The menu Postpone opens on a recurring task: quick picks counted from its date, a box for any later day, and the rule it keeps. */
export function Open() {
  return (
    <StoryCard>
      <StoryRow
        label="Due Monday"
        hint="Every Monday at 9am, next due Monday. Each pick keeps 09:00, and only this occurrence moves."
      >
        <div className="h-72 text-xs text-muted-foreground">
          <PostponeMenu
            defaultOpen
            target={{ kind: "occurrence", due: { date: "2026-09-28T09:00:00", recurring: true, text: "every mon 9am" } }}
            now={now}
            disabled={false}
            working={false}
            onPostpone={noop}
          />
        </div>
      </StoryRow>
    </StoryCard>
  );
}

/** On a one-off task whose due date has passed, Postpone moves that date and keeps its time. Today comes first, since the date has passed. */
export function OverdueDate() {
  return (
    <StoryCard>
      <StoryRow label="Due Tuesday 2pm" hint="A one-off task two days overdue. Each pick keeps 14:00.">
        <div className="h-64 text-xs text-muted-foreground">
          <PostponeMenu
            defaultOpen
            target={{ kind: "due", due: { date: "2026-09-22T14:00:00", recurring: false } }}
            now={now}
            disabled={false}
            working={false}
            onPostpone={noop}
          />
        </div>
      </StoryRow>
    </StoryCard>
  );
}

/** On a task with no due date and a deadline that has passed, Postpone moves the deadline. */
export function PastDeadline() {
  return (
    <StoryCard>
      <StoryRow label="Deadline Sep 20" hint="No due date, and a deadline four days past.">
        <div className="h-72 text-xs text-muted-foreground">
          <PostponeMenu
            defaultOpen
            target={{ kind: "deadline", due: { date: "2026-09-20", recurring: false } }}
            now={now}
            disabled={false}
            working={false}
            onPostpone={noop}
          />
        </div>
      </StoryRow>
    </StoryCard>
  );
}
