// A before and an after stacked in one image, each under a tinted band.
import type { ReactNode } from "react";

function Band({ word, caption, tone }: { word: string; caption: string; tone: string }) {
  return (
    <div className={`-mb-3 flex items-baseline gap-3 border border-b-0 border-border px-6 py-4 ${tone}`}>
      <span className="text-3xl font-semibold text-foreground">{word}</span>
      <span className="text-xl text-muted-foreground">{caption}</span>
    </div>
  );
}

export function Stacked({ before, after }: { before: ReactNode; after: ReactNode }) {
  return (
    <div data-screenshot-frame className="flex w-fit flex-col gap-3 bg-background p-6">
      <Band word="Before" caption="A wall of text" tone="bg-muted" />
      {before}
      <div className="pt-5">
        <Band word="After" caption="With Impromptu UI" tone="bg-success/15" />
      </div>
      {after}
    </div>
  );
}
