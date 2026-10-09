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
| [Sync status](#sync-status) | `component-library/sync-status` | How long ago a page last synced, and a Refresh button, for the page's title bar, with what the past hour of syncs cost on GitHub behind the label |
| [Sidebar count](#sidebar-count) | `component-library/sidebar-count` | The counts beside a page's name in bb's sidebar: urgent rows in a red circle, optionally rows due soon in amber beside it as one pill, then the total; or rows past a warning in amber and past an error in red |
| [Segmented](#segmented) | `component-library/segmented` | A row of choices, one always on, and a toggle form for a filter that can be off |
| [Calendar](#calendar) | `component-library/calendar` | A month grid, drawn the way bb draws one, for picking a day or a range |
| [Date range](#date-range) | `component-library/date-range` | A button that opens two months of calendar to pick a span of days |

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

`react-day-picker` is a peer too, for the calendar. A plugin that imports
neither [Calendar](#calendar) nor [Date range](#date-range) does not need it
installed; it appears in that plugin's lockfile as an unmet peer and nothing
more, since the bundle only pulls in what it imports.

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

**What the syncs cost.** Given `usage`, the label becomes a button that opens
a summary under it, kept inside the window: the GitHub points the past hour of
syncs used, one bar per sync placed at the time it ran (hover one for its
points, calls, and time), and how many points the account has left before the
hour resets. A sync that could not be measured draws as a faint stub and is
left out of the total, which says how many it left out. A plugin calling
several services, as Now does, gives each sync its calls by service and lists
the calls made between syncs; the summary then counts calls rather than
points, stacks each bar by service with a legend of the hour's totals, and
keeps GitHub's points beside GitHub's calls. Without `usage`, the label stays
plain text. The shape is what `createSyncUsage` in `gh-shared` reports,
repeated here as `SyncUsage` because this package cannot depend on gh-shared.
PR Sweep, Issue Sweep, Review Sweep, and Now pass it.

**Props.** `syncedAt` is the last sync's time in milliseconds, or null.
`busy` disables the button. `onRefresh` starts a refresh. `usage` is the past
hour's syncs and the account's budget. `now` pins the clock, and
`defaultOpen` and `initialHovered` draw the summary open; all three are for
stories and tests only. `syncedAgo(syncedAt, now)` is exported too.

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

A page that also knows what needs you soon passes `soon` and `soonLabel`,
and that count goes in an amber circle before the total. When both counts
are above zero, the red and amber join into one pill, red then amber, so
they read as one group. Count a row in one of them only. Now passes the
tasks due today.

**Lining up.** bb centers a lone count in a box at least 20px wide, so the
total keeps that box. A row with a circle and a row without one then have
their totals in the same column. A page with nothing urgent still draws its
total through this component, with `urgent={0}`, for that reason.

Now, PR Sweep, Issue Sweep, and Review Sweep use it.

**Don't** draw a bare number in a `<span>`, which drifts out of line with
the rows around it, or count rows the page would not show.

**Warnings and errors.** A page whose total means nothing, such as
Tokenomics, where every thread counts, draws `SidebarLevels` instead:

```tsx
import { SidebarLevels } from "component-library/sidebar-count";

<SidebarLevels warning={3} error={1} warningLabel="3 past the warning" errorLabel="1 past the limit" />
```

Rows past the warning go in an amber circle, then rows past the error in a
red one, the same red as `SidebarCount`'s urgent circle. A row counts in one
circle only, the higher. Each circle is left out at zero, and nothing is
drawn when both are. Tokenomics uses it.

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

## Calendar

```tsx
import { Calendar } from "component-library/calendar";

<Calendar mode="range" numberOfMonths={2} selected={range} onSelect={setRange} />
```

A month grid over `react-day-picker`, with bb's own class names so it looks
like the calendar in bb rather than like a plugin's own. bb's copy lives in
`packages/shared-ui` in the bb repository, which is private to it, and the
plugin SDK exports no calendar, so this is the nearest a plugin can get.

**Props** are react-day-picker's: `mode`, `selected`, `onSelect`,
`numberOfMonths`, `disabled`, `defaultMonth`. It takes the component's whole
API rather than wrapping a smaller one, because what a page needs from a
calendar varies more than a wrapper could guess.

**Don't** reach for it directly to pick a span of days: [Date
range](#date-range) already draws the button, the panel, and Apply around it.

## Date range

```tsx
import { DateRange, type DayRange } from "component-library/date-range";

<DateRange value={range} onChange={setRange} earliest={twoYearsAgo} latest={Date.now()} />
```

A button that reads `Sep 19 to Oct 9`, or a placeholder when nothing is
picked, opening two months of calendar with Cancel and Apply. It closes on
Escape, on a click outside, and on Apply. `earliest` and `latest` grey out the
days there is nothing to show for.

**Whole days.** `value` and `onChange` use `{ from, to }` in epoch
milliseconds, where `from` is midnight on the first day and `to` is midnight
on the day after the last. A caller can hand `to` straight to a range query
without adding a day to it, and the button still names the last day someone
actually chose. `dayRangeLabel` is exported for a caller that wants the same
wording elsewhere.

Contributor Dashboard uses it, beside the presets rather than instead of them.

**Don't** use it as the only way to choose a span. Picking two dates is slower
than pressing a button, so offer the spans people ask for most as presets and
keep this for the rest.

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
```

Run `npm run storybook` at the repository root to see the stories.
