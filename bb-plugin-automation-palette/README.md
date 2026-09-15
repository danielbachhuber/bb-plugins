# Automation Palette

Every automation gets a row in bb's quick palette (`Mod+Shift+P`), so a
twice-daily sweep can be started by hand without opening the Automations page
or remembering an `auto_...` id.

```
> run automation
  Run automation: Widget sweep · Acme Widgets            Automation Palette
  Run automation: Gadget notes · Acme Gadgets (paused)   Automation Palette
```

Rows are listed in every project's palette, not only in the project that owns
the automation: the run is queued in the owning project either way, and an
automation worth starting by hand is worth reaching from whichever window you
are already in. The project's name is in the title so two projects'
automations stay apart, and so that typing a project name lists its
automations.

Selecting a row runs the automation exactly as its schedule would:
`bb automation run <id> --project <id>`. A paused automation keeps its row —
running one by hand is the case pausing does not cover — and says so in the
title.

## Why there are two steps

bb collects a plugin's palette rows once per app interpretation, from a
synchronous `setup`, and then memoizes them. A row cannot be built while the
palette is open, so the rows for this app load come from a snapshot the plugin
already holds:

- `setup` (app.tsx) reads the snapshot out of `localStorage` and registers one
  row per automation.
- A content script refreshes that snapshot in the background, over the plugin's
  own `automations_list` RPC.

The consequence is worth knowing: **a newly created, renamed, or deleted
automation appears in the palette after the next bb reload.** The content
script logs a line to the console when it notices the rows are stale.

## Settings

| Setting | Default | What it is for |
| --- | --- | --- |
| `bbPath` | empty | Absolute path to the `bb` CLI. Empty uses the path bb injects (`BB_CLI`), then `PATH`, then `/opt/homebrew/bin/bb`, `/usr/local/bin/bb`, `/usr/bin/bb`. |

```sh
bb plugin config automation-palette set bbPath /opt/homebrew/bin/bb
```

The server's `PATH` is not a login shell's, which is why the fallbacks exist.

## How it talks to automations

Automations belong to bb's own automations plugin and the Plugin SDK exposes no
API for them, so the CLI is the seam:

| RPC | CLI it runs |
| --- | --- |
| `automations_list` | `bb project list --json`, then `bb automation list --project <id> --json` per project |
| `automations_run` | `bb automation run <id> --project <id>` |

`automations_list` covers every project, because a row is registered once for
the whole app. That also means the content script never has to work out which
project it is in. The project's name comes from `bb project list`, since
`bb automation list` reports only the id.

A CLI failure is reported through the RPC's `error` field and logged, never
latched into `bb.status.needsConfiguration`: that flag is one-way, and this
plugin's entire surface is those rows.

## Feedback after a run

There isn't much, by design of the surface: palette callbacks have no way to
draw anything, and errors from them are contained and logged by the host. A
started run logs to the browser console, and the run itself shows up where
every other run does, on the Automations page and in
`bb automation runs <id> --project <id>`.

## Layout

| Path | What it holds |
| --- | --- |
| `palette/automations.ts` | The `AutomationSummary` shape, and the tolerant parsers for `bb automation list` and `bb project list` output |
| `palette/rows.ts` | What the palette shows: a row's id, its title, and the order the rows are registered in |
| `palette/snapshot.ts` | The `localStorage` snapshot the rows are built from, and whether a refreshed list has made them stale |
| `palette/cli.ts` | The only place a process is spawned: finding the `bb` CLI and running it with an argument array |
| `server.ts` | The `automations_list` / `automations_run` contract and the `bbPath` setting |
| `app.tsx` | The palette registrations and the content script that refreshes the snapshot |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload automation-palette
```

The palette rows themselves are not covered by the frontend test harness —
`loadPluginApp` does not capture `commandPaletteAction` registrations — which is
why row ids, titles, and ordering live in `palette/rows.ts` as a pure function
with its own tests.
