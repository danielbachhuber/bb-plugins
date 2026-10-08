# component-library

UI that several plugins draw the same way. A plugin imports it from here
rather than keeping its own copy in `components/ui/`, so a fix lands in every
plugin at once and the plugins cannot drift apart.

Something belongs here once two plugins draw it the same way. Each entry is a
directory holding the component, its tests, and a story for each of its
states, and has a section below saying what it is for, where it goes, and
what not to do with it.

| Entry | Import | What it is |
| --- | --- | --- |
| [Sync status](#sync-status) | `component-library/sync-status` | How long ago a page last synced, and a Refresh button, for the page's title bar |
| [Sidebar count](#sidebar-count) | `component-library/sidebar-count` | The counts beside a page's name in bb's sidebar: urgent rows in a red circle, then the total |
| [Segmented](#segmented) | `component-library/segmented` | A row of choices, one always on, and a toggle form for a filter that can be off |

`sweep-ui`, the list the three sweeps draw, is a separate package because only
the sweeps use it.

## Installing

A plugin depends on it as `"component-library": "file:../component-library"`
and installs with `npm install --install-links`, through its `harvest:sync`
script. A plain `npm install` links the directory instead of copying it, and
the link resolves React from this package's own `node_modules`, which puts a
second React in the plugin. React, `react-dom`, the Hugeicons packages,
`clsx`, and `tailwind-merge` are peer dependencies for the same reason: the
copy uses the plugin's.

The package uses relative imports only, since `@/` means the plugin's own
directory once it is installed there. For the same reason it cannot use a
plugin's vendored `Button` or `Icon`, and `@get-bb/plugin-sdk/app` exports
neither, so an entry draws them itself with the same classes and Hugeicons
glyphs.

`bb.pluginTailwindContent` in `package.json` lists the components for
Tailwind. `bb plugin build` generates only the classes it finds in the plugin
and in dependencies that list files this way. A `bb` block with no `name` does
not make this a plugin: `sync.sh` and `setup.sh` look for `bb.name`.

An edit here does nothing in bb until every plugin that uses it is rebuilt.
`./sync.sh` at the repository root does that, since it counts a plugin's
`file:` dependencies as part of its source.

## Sync status

```tsx
import { SyncStatus } from "component-library/sync-status";

<SyncStatus syncedAt={listing?.syncedAt ?? null} busy={busy} onRefresh={refresh} />
```

It answers "is this page current?", so it shows how long ago the last sync
landed ("synced 4m ago") rather than a clock time, which would leave the
reader to do the subtraction.

**Where it goes.** The right end of the page's title bar, through the
route's `headerContent` slot. Each plugin keeps a small `SyncHeader` in its
`app.tsx` that subscribes to its own listing, calls its own refresh RPC,
shows a failure with `toast.error`, and passes the result in. That wiring
stays in the plugin because the RPC and realtime channel differ per plugin.
Now, PR Sweep, Issue Sweep, Review Sweep, and Contributor Dashboard use it.

**What it draws.** A small muted label, then an outline Refresh button:

| State | Label | Button |
| --- | --- | --- |
| No sync has finished | not synced yet | Refresh |
| Under a minute | synced just now | Refresh |
| Under an hour | synced 4m ago | Refresh |
| Under a day | synced 3h ago | Refresh |
| A day or more | synced 2d ago | Refresh |
| A refresh is running | unchanged | Refreshing…, disabled |

The label is lowercase because it sits mid-header. It re-reads the clock
every 30 seconds, so it ages between syncs instead of sitting on "just now"
until the next one.

**Props.** `syncedAt` is the last sync's time in milliseconds, or null.
`busy` disables the button. `onRefresh` starts a refresh. `now` pins the
clock and is for stories and tests only. `syncedAgo(syncedAt, now)` is
exported too.

**Don't** show an absolute time, put the control in the page body, call the
button anything but Refresh, or write another formatter for the same label.

## Sidebar count

```tsx
import { SidebarCount } from "component-library/sidebar-count";

<SidebarCount urgent={2} total={5} urgentLabel="2 need you" totalLabel="5 to review" />
```

It answers "how much is on me here?" from the sidebar, without opening the
page. Pass it to the route as `experimental_sidebarAccessory`, in a small
component that reads the same listing as the page, so completing or archiving
a row lowers the count at once.

**What it draws.** The rows that need you most in a red circle, then every
row in muted text. The circle is left out at zero, and nothing is drawn at a
total of zero. Each number has a tooltip naming what it counts, such as
"2 need you" and "5 to review".

**Lining up.** bb centers a lone count in a box at least 20px wide, so the
total keeps that box. A row with a circle and a row without one then have
their totals in the same column. A page with nothing urgent still draws its
total through this component, with `urgent={0}`, for that reason.

Now, PR Sweep, Issue Sweep, and Review Sweep use it.

**Don't** draw a bare number in a `<span>`, which drifts out of line with
the rows around it, or count rows the page would not show.

## Segmented

```tsx
import { Segmented, SegmentedToggle } from "component-library/segmented";

<Segmented label="Period" options={periods} value={period} onChange={setPeriod} />
<SegmentedToggle label="Source" options={sources} value={source} onChange={setSource} />
```

A row of a few short choices in one bordered group, drawn like bb's own
segmented controls.

**Which one.** `Segmented` is for a choice that always has an answer, such as
the period a page charts. It is a `radiogroup`, and one option is always on.
`SegmentedToggle` is for a filter that can also be off: pressing an option
shows only it, and pressing it again passes `null` and shows everything. It is
a group of `aria-pressed` buttons.

**Options.** Each has an `id` and a `label`, an optional `count` drawn muted
after the label, and an optional `title` for a tooltip that says what the
option holds. `label` names the whole group for assistive technology.

Now, Tokenomics, and Contributor Dashboard use it.

**Don't** use it for more than about five options, or for options whose
labels need more than a word or two. A select fits those better.

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
```

Run `npm run storybook` at the repository root to see the stories.
