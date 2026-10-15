import { useState } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { PreviewCard, SkillChips, WorkspaceBanner } from "./start-thread";
import type { SuggestedSkill } from "./keys";

export default {
  title: "component-library/Start thread",
};

/**
 * The card above the composer in every start-thread dialog, saying which row
 * the thread is for. bb's composer itself sits below it.
 */
export const Preview = () => (
  <StoryCard>
    <StoryRow label="Pull request" hint="Linked, with its number">
      <PreviewCard
        preview={{
          title: "Cache the widget index between syncs",
          number: 42,
          url: "https://github.com/acme/widgets/pull/42",
          meta: "acme/widgets · octocat · 2 failing checks",
        }}
      />
    </StoryRow>
    <StoryRow label="No page of its own" hint="Such as a priority">
      <PreviewCard preview={{ title: "Ship the gadget importer", meta: "Priority this week" }} />
    </StoryRow>
    <StoryRow label="With a tag" hint="Such as a plugin's directory">
      <PreviewCard
        preview={{ title: "Acme Board", tag: "bb-plugin-acme-board/", meta: "Shows the Acme Board in a panel." }}
      />
    </StoryRow>
  </StoryCard>
);

/**
 * Where the thread runs, when the plugin decides that itself and hides the
 * composer's project, environment and branch pickers.
 */
export const Workspace = () => (
  <StoryCard>
    <StoryRow label="On the pull request's branch">
      <WorkspaceBanner branch="octocat/cache-widget-index" note={null} />
    </StoryRow>
    <StoryRow label="On a new branch" hint="The plugin could not use the pull request's own">
      <WorkspaceBanner branch={null} note="it comes from a fork." />
    </StoryRow>
  </StoryCard>
);

const SKILLS: SuggestedSkill[] = [
  { name: "resolve-merge-conflicts", reason: "It conflicts with its base branch.", instruction: "", selected: true },
  { name: "address-code-review", reason: "There is live reviewer feedback from hubber.", instruction: "", selected: true },
  { name: "pr-sweep", reason: "Check the pull request for anything else that needs doing", instruction: "" },
];

function Chips({ initial }: { initial: string[] }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(initial));
  return (
    <SkillChips
      skills={SKILLS}
      picked={picked}
      onToggle={(name) =>
        setPicked((current) => {
          const next = new Set(current);
          if (!next.delete(name)) next.add(name);
          return next;
        })
      }
    />
  );
}

/**
 * The skills a plugin suggests for a row, above the composer. A picked chip
 * is filled and ticked, and puts a line naming its skill in the prompt.
 */
export const SuggestedSkills = () => (
  <StoryCard>
    <StoryRow label="As the box opens" hint="The skills the findings name are picked; pr-sweep is offered for the rest">
      <Chips initial={["resolve-merge-conflicts", "address-code-review"]} />
    </StoryRow>
    <StoryRow label="Nothing picked">
      <Chips initial={[]} />
    </StoryRow>
  </StoryCard>
);
