# bb-plugin-thread-overview

A band under each thread's header that says what the thread is for, what has
been done so far, and which step it is on. The agent writes it as it plans and
keeps it current as steps land; you edit it in place. The point is to know what
a thread is doing when you come back to it, without reading the transcript.

## The band

- **Collapsed**, which is how it starts: one line, the summary on the left and
  the step count and current step (`2/4 Write the export`) on the right.
- **Expanded:** the summary on the left, capped at 72 characters a line, with
  when it last changed. The steps are a column on the right, about seven rows
  tall and scrolling past that: unfinished steps in plan order, then
  "+ Add step", then finished steps, most recently finished first. The current
  step is highlighted. In a narrow pane the column wraps below the summary.
- **Nothing to tell you:** a thread with no summary and nothing left to do gets
  one faint line, "No overview yet · 26 steps done earlier", with "Write one".
- **Editing:** click a step to move it from not started, to current, to done.
  Only one step is current at a time. The pencil beside the summary edits it
  in place. "+ Add step" adds one of yours. Steps you added can be removed on
  hover; the agent's steps cannot, only marked done.
- **Open or collapsed:** opening a thread's band is remembered for that thread,
  and so is collapsing it again.

The band's background spans the pane, and its contents sit in a centered column
up to 1040px wide, so on a wide screen the summary and the steps stay near the
transcript.

Changes arrive live: the band re-reads whenever the agent or another window
changes the thread's overview.

## How the band gets there

bb has no slot under the thread header. The plugin registers a thread header
action, which bb draws inside one thread's header and tells which thread it
belongs to. That action finds the `<header>` around itself and inserts a
container directly after it; the band renders into it through a React portal.
bb lays the header and the transcript out as a vertical flex column, so the
band takes its own height and the transcript starts below it. Each pane of a
split view has its own header and its own band.

This depends on bb's page structure, so it degrades rather than disappearing:
when there is no `<header>` around the action, the header shows
`2/4 Write the export` instead, with the whole overview in a popover, and the
console says why.

The container carries `data-bb-plugin-root` and `data-bb-plugin`, because the
plugin's compiled stylesheet only reaches elements inside a plugin root, and
this one lives outside the plugin's own mount.

## What the agent does

Every thread is told about `bb overview` and asked to use it:

```sh
bb overview                               # read the summary and steps
bb overview summary "…"                   # set or replace the summary
bb overview add "step" ["step"]           # append steps
bb overview start "step or id"            # mark the step it is on
bb overview done "step or id"             # mark steps done
bb overview reopen "step or id"           # mark steps not started again
```

The summary is 2 to 4 sentences: what the thread is for, what has been done so
far (the result, not the activity), and any open question. Steps are 3 to 7
high-level parts of the plan, not individual edits. The agent writes both on
its first turn that does real work and rewrites the summary as steps land.

The CLI is the main path because Bash is never deferred. The same actions exist
as tools (`overview_summary`, `overview_add`, `overview_start`,
`overview_done`, `overview_reopen`) for harnesses that list them directly;
through bb's MCP bridge they arrive deferred and a model will not spend a
tool-search round trip on bookkeeping.

The agent can rewrite the summary but cannot remove a step. That is what keeps
your own steps safe from an agent restating its plan. Adding a step already
open on the plan is skipped, matching case- and punctuation-insensitively.

Instructions resolve at `thread.start` and `turn.submit`, and a live session
keeps the ones it started with. A thread that was already running when this
plugin loaded does not hear about `bb overview` until its session restarts.

## Coming from Thread Todos

Thread Overview replaced [Thread Todos](../bb-plugin-thread-todos). The first
time both are running, it imports every Thread Todos item through that plugin's
`todos_export` RPC: open items become not started, finished ones stay done, and
who added each one carries over. Imported steps go after any the thread already
has. The import runs once, records what it copied, and retries a few times if
Thread Todos has not loaded yet.

Thread Todos stays installed as a stub that forwards `bb todo` here, for
threads started before the switch.

## Layout

| Path | What it holds |
| --- | --- |
| `overview/steps.ts` | The pure core: normalizing, de-duplication, reference matching, the one-current-step rule, and every label |
| `overview/store.ts` | The only module that touches SQLite |
| `overview/contract.ts` | The RPC contract the band and the Thread Todos stub call |
| `overview/cli.ts` | Argv parsing for `bb overview`, pure so the grammar is testable |
| `overview/instructions.ts` | What every thread is told about its overview |
| `overview/import.ts` | Thread Todos' exported rows, mapped to steps |
| `overview/attach.ts` | Finding bb's header and inserting the band's container |
| `components/overview-band.tsx` | The band, drawn from props alone |
| `components/header-fallback.tsx` | The header control drawn when the band cannot attach |
| `server.ts` | Tools, CLI, RPC, instructions, and the import |
| `app.tsx` | Loads the overview and puts the band under the header |
| `overview-band.stories.tsx` | Every band state, and the fallback |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload thread-overview
```

`npm run storybook` at the root of this repository renders the band's states.
