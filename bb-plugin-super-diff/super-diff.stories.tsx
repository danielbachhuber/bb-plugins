// Super Diff's own pieces, with invented fixtures. In bb the row sits under
// the Diff tab's toolbar and copies the classes of bb's Stacked/Split control
// from the page; here those classes are passed in, copied from that control.
import { NoteCard, NotesBox, type PlacedNote } from "./annotations";
import { ConcernFiles, ViewedCount } from "./concern";
import type { StoredSuperDiff } from "./grouping";
import { SuperDiffRow, type ThreadState } from "./row";

export default {
  title: "super-diff/Super Diff",
};

const SEGMENT_CLASS = "inline-flex items-center gap-1 rounded-lg border border-border p-0.5";
const SEGMENT_BUTTON_CLASS =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 hover:bg-state-hover hover:text-foreground aria-pressed:bg-state-active aria-pressed:text-foreground text-xs h-7 rounded-md px-2.5 text-muted-foreground";

const MINUTE = 60_000;

const STORED: StoredSuperDiff = {
  target: { type: "all", mergeBaseBranch: "origin/main" },
  submission: {
    concerns: [
      { title: "Round prices after discounts and tax", explanation: "…", files: ["src/pricing.ts", "src/pricing.test.ts"] },
      { title: "Show tax in the cart summary", explanation: "…", files: ["src/cart/summary.tsx"] },
      { title: "Document how tax is applied", explanation: "…", files: ["README.md"] },
    ],
    annotations: [
      { path: "src/pricing.ts", anchor: "round(", title: "Rounds once, at the end", body: "…" },
      { path: "src/cart/summary.tsx", anchor: "taxRate", title: "Reads the rate the server sent", body: "…" },
    ],
  },
  paths: ["src/pricing.ts", "src/pricing.test.ts", "src/cart/summary.tsx", "README.md", "package-lock.json"],
  acceptedAt: new Date(Date.now() - 4 * MINUTE).toISOString(),
};

function Row({ state, fileCount = 5 }: { state: ThreadState; fileCount?: number }) {
  return (
    <div data-screenshot-frame className="w-[620px] bg-background px-4 pb-4 pt-1">
      <SuperDiffRow
        state={state}
        fileCount={fileCount}
        segmentClass={SEGMENT_CLASS}
        segmentButtonClass={SEGMENT_BUTTON_CLASS}
        onGenerate={() => {}}
        onShow={() => {}}
      />
    </div>
  );
}

/** Before anything is generated: bb's own diff, with Generate Super Diff on the left of the row. */
export const NotGenerated = () => <Row state={{ phase: "idle" }} />;

/** While the thread's agent reads the diff and writes the Super Diff. */
export const Generating = () => <Row state={{ phase: "generating", requestedAt: new Date(Date.now() - MINUTE).toISOString() }} />;

/** A Super Diff is showing: the toggle switches back to bb's own list, and the line counts what the agent wrote. */
export const ShowingSuperDiff = () => <Row state={{ phase: "ready", showing: "super", stored: STORED, data: null }} />;

/** Two files have joined the diff since the Super Diff was written, so the row turns amber and offers Regenerate. */
export const OutOfDate = () => <Row state={{ phase: "ready", showing: "super", stored: STORED, data: null }} fileCount={7} />;

const NOTES: PlacedNote[] = [
  { id: "n1", n: 1, path: "acme/widgets/src/pricing.ts", anchor: "", line: 14, title: "Rounds once, at the end", body: "" },
  { id: "n2", n: 2, path: "acme/widgets/src/cart/summary.tsx", anchor: "", line: 38, title: "Reads the rate the server sent", body: "" },
  { id: "n3", n: 3, path: "acme/widgets/src/checkout.ts", anchor: "", line: 72, title: "Tax applies after the discount, not before", body: "" },
  { id: "n4", n: 4, path: "acme/widgets/src/legacy-cart.ts", anchor: "", line: null, title: "Kept for orders placed before the change", body: "" },
];

/** The list at the top of a Super Diff: each annotation's number, title, and line, which jumps to its card. One note's line has left the diff. */
export const AnnotationList = () => (
  <div data-screenshot-frame className="w-[620px] bg-background p-4">
    <NotesBox notes={NOTES} onJump={() => {}} />
  </div>
);

/** A note card as it sits under the line it explains, inside the diff. */
export const AnnotationCard = () => (
  <div data-screenshot-frame className="w-[620px] bg-background p-4">
    <NoteCard
      highlighted={false}
      note={{
        id: "n1",
        n: 1,
        path: "acme/widgets/src/pricing.ts",
        anchor: "",
        line: 14,
        title: "Rounds once, at the end",
        body: "`applyDiscount` and `applyTax` no longer round on their own. Rounding twice made a 15% discount on $19.99 come out a cent low, so `round` now runs once on the final amount.",
      }}
    />
  </div>
);

const PRICING_FILES = [
  { path: "acme/widgets/src/pricing.ts", summary: "Rounds once, after the discount and tax are both applied" },
  { path: "acme/widgets/src/pricing.test.ts", summary: "Adds the 15% on $19.99 case that came out a cent low" },
  { path: "acme/widgets/src/cart/summary.tsx", summary: "Shows the tax line from the server's rate" },
  { path: "acme/widgets/src/cart/line-item.tsx" },
  { path: "acme/widgets/src/cart/totals.tsx" },
  { path: "acme/widgets/src/checkout/review.tsx" },
];

/** A concern's heading with Diff Viewed installed: its viewed count, then each file and what its change does. Files that change the same mechanical way share one line. */
export const ConcernFileList = () => (
  <div data-screenshot-frame className="w-[620px] bg-background p-4">
    <h3 className="text-sm font-semibold text-foreground">
      <span className="text-muted-foreground tabular-nums" style={{ marginRight: 8 }}>1</span>
      Round prices after discounts and tax
      <span className="text-xs font-normal text-muted-foreground" style={{ marginLeft: 8 }}>
        6 files · <ViewedCount viewed={3} total={6} />
      </span>
    </h3>
    <p className="mt-0.5 text-xs text-muted-foreground">
      Prices were rounded twice, once per step. They now round once at the end, and the cart reads the tax rate the server sends.
    </p>
    <ConcernFiles
      files={PRICING_FILES}
      others="only the price formatter import moves"
      viewed={new Set(["acme/widgets/src/pricing.ts", "acme/widgets/src/pricing.test.ts", "acme/widgets/src/cart/totals.tsx"])}
      onJump={() => {}}
    />
  </div>
);
