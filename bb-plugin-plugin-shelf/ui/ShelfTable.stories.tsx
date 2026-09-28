import { ShelfTable, type ShelfTableProps } from "./ShelfTable";
import { FIXTURE_NOW, emptyList, fixtureList, unknownList } from "./fixtures";

export default {
  title: "plugin-shelf/Shelf",
};

const noop = () => {};

function Shelf(props: Partial<ShelfTableProps>) {
  return (
    <div className="mx-auto w-full max-w-5xl p-5">
      <ShelfTable
        list={fixtureList()}
        providerId="claude-code"
        publishing={null}
        onPublish={noop}
        onOpenPlugin={noop}
        now={FIXTURE_NOW}
        {...props}
      />
    </div>
  );
}

/** Every plugin in a checkout, grouped by whether it needs a release. Widgets has three commits since its last release tag, and its package.json was bumped without a tag. */
export const Mixed = () => <Shelf />;

/** A plugin's unreleased commits, opened from its row. The README change is marked as docs, and each short SHA links to the commit. */
export const CommitsOpen = () => <Shelf initialExpanded={["widgets", "sprockets"]} />;

/** The marketplace could not be read, so no plugin is called personal and the page says why. */
export const MarketplaceUnreachable = () => <Shelf list={unknownList()} />;

/** Plugin Shelf installed from a folder that is not a plugin checkout. */
export const NoCheckout = () => <Shelf list={emptyList()} />;
