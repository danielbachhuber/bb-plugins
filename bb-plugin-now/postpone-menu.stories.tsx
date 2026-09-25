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
            due={{ date: "2026-09-28T09:00:00", recurring: true, text: "every mon 9am" }}
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
