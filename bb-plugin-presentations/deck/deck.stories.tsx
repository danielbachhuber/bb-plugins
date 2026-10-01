import { useState, type ReactNode } from "react";
import type { Deck } from "../server";
import { DeckPanelView, DeckWindowView } from "./view";

export default {
  title: "presentations/Deck",
};

const deck: Deck = {
  name: "widgets-launch",
  path: "presentations/widgets-launch",
  problem: null,
  fileRoot: { kind: "workspace", environmentId: "env_story", dir: "presentations/widgets-launch" },
  slides: [
    {
      file: "01-title.md",
      title: "Widgets 2.0",
      sha256: "a",
      content: "# Widgets 2.0\n\nWhat changed, and why it matters to the gadgets team\n\n_Acme all-hands_",
    },
    {
      file: "02-why.md",
      title: "Why now",
      sha256: "b",
      content:
        "## Why now\n\n- Orders doubled since spring\n- The old widget queue drops one in fifty\n- Gadgets depends on it for every release",
    },
    {
      file: "03-diagram.md",
      title: "How it fits together",
      sha256: "c",
      content: "## How it fits together\n\n![Diagram](images/diagram.svg)",
    },
    {
      file: "04-thanks.md",
      title: "Thanks",
      sha256: "d",
      content: "# Thanks\n\nQuestions go in #widgets",
    },
  ],
};

const diagram = new URL("./fixtures/diagram.svg", import.meta.url).href;

// Stories load the image from a fixture file; the real panel uses the asset route.
const imageUrl = (file: string) => (file === "images/diagram.svg" ? diagram : file);

function Frame({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border" style={{ width, height }}>
      {children}
    </div>
  );
}

function Panel({ initial = 0, value = deck, width = 760 }: { initial?: number; value?: Deck | null; width?: number }) {
  const [index, setIndex] = useState(initial);
  return (
    <Frame width={width} height={560}>
      <DeckPanelView
        deck={value}
        error={null}
        index={index}
        onIndexChange={setIndex}
        imageUrl={imageUrl}
        onOpenWindow={() => {}}
      />
    </Frame>
  );
}

/** The Slides panel beside a thread: the slide files on the left, the current slide on the right. */
export const PanelWide = () => <Panel initial={1} />;

/** In a narrow panel the slide files move below the slide. */
export const PanelNarrow = () => <Panel width={480} />;

/** A slide with an image from the deck folder. */
export const PanelImage = () => <Panel initial={2} />;

/** A deck whose folder has no numbered slides yet. */
export const PanelEmpty = () => <Panel value={{ ...deck, slides: [] }} />;

/** A deck folder that could not be read. */
export const PanelProblem = () => (
  <Panel value={{ ...deck, slides: [], problem: "Permission denied" }} />
);

/** The deck alone, as the New window button opens it. Present takes it full screen. */
export const Window = () => {
  const [index, setIndex] = useState(0);
  return (
    <Frame width={960} height={600}>
      <DeckWindowView deck={deck} error={null} index={index} onIndexChange={setIndex} imageUrl={imageUrl} />
    </Frame>
  );
};
