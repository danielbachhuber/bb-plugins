import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { StackMenu, type StackMenuStack } from "./stack-menu";

export default {
  title: "component-library/Stack menu",
};

const pull = (number: number, title: string, state: StackMenuStack["entries"][number]["state"]) => ({
  number,
  title,
  url: `https://github.com/acme/widgets/pull/${number}`,
  state,
});

const stack: StackMenuStack = {
  number: 131,
  position: 3,
  size: 4,
  entries: [
    pull(118, "Split the widget registry out of core", "merged"),
    pull(124, "Load widgets from the registry", "open"),
    pull(128, "Promote widgets into core", "open"),
    pull(133, "Drop the old widget loader", "open"),
  ],
};

/** The button as a row draws it: the pull request's place in its stack, as GitHub writes it. */
export const Button = () => (
  <StoryCard>
    <StoryRow label="Middle of a stack" hint="Third of four, counting up from the base branch, merged layers included.">
      <StackMenu stack={stack} current={128} />
    </StoryRow>
    <StoryRow label="Bottom of a stack">
      <StackMenu stack={{ ...stack, position: 1, size: 2, entries: stack.entries.slice(1, 3) }} current={124} />
    </StoryRow>
  </StoryCard>
);

/** Open: every pull request in the stack, top first, this one marked. Hovering one shows its title. */
export const Open = () => (
  <div className="h-64 p-6" data-screenshot-frame>
    <StackMenu stack={stack} current={128} defaultOpen />
  </div>
);
