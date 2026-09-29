# sweep-ui

The list that Issue Sweep, PR Sweep, and Review Sweep draw each tab with. It
takes plain props and holds no data of its own: each plugin decides which run
and tier every row is in, stores its own notes and seen comment counts, and
passes the results in.

A tab is one bordered list. Now rows are open, with their note and a line of
actions. Next rows are closed to their title and number line. Later rows are
one dimmed line each, and fold into "N more" after five. A chevron in the left
column opens or closes a row, and "Expand all" in the header opens every row.
Above the list, one square per row, grouped by run, narrows the list to one
run when pressed. Every row carries a track on the right showing its stage.

## Installing

A plugin depends on it as `"sweep-ui": "file:../sweep-ui"` and installs with
`npm install --install-links`, the same way it installs `bb-plugin-harvest`.
A plain `npm install` links the directory instead of copying it, and the link
resolves React from this package's own `node_modules`, which puts a second
React in the plugin. React, `react-dom`, the Hugeicons packages, `clsx`, and
`tailwind-merge` are peer dependencies here for the same reason: the copy uses
the plugin's.

The package uses relative imports only, since `@/` means the plugin's own
directory once it is installed there.

## Exports

| Path | What it holds |
| --- | --- |
| `sweep-ui/list` | `SweepList`, the whole tab: summary, header, rows, fold, and the run filter |
| `sweep-ui/row` | `SweepRow`, one row, used by `SweepList` |
| `sweep-ui/track` | `Track`, `TrackHeader`, and `TRACK_WIDTH` |
| `sweep-ui/summary` | `SummarySquares` |
| `sweep-ui/note` | `NoteBox` and `NoteField` |
| `sweep-ui/types` | `Tier`, `RunTone`, `Flag`, `Run`, `SweepItem`, and `Stage` |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
```

`sweep.stories.tsx` draws the list with issue-shaped fixtures; run
`npm run storybook` at the repository root to see it.
