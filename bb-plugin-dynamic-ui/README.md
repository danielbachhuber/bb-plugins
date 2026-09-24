# Dynamic UI

Lets a skill show its results as cards with buttons in a tab beside the
thread, instead of as a numbered list in chat that the user answers by typing.

## How it works

A skill that produces several items to act on (issues to triage, findings to
fix, pull requests to merge) writes a view file and publishes it from its
thread:

```sh
bb dynamic-ui publish --file view.json [--key <name>]
```

The view opens in a tab in that thread's side panel. A **View** button in the
thread header reopens it later, and appears only in threads that have one.
Publishing again with the same key replaces the view and keeps what the user
already did to each item.

A view is a title, a markdown summary, and cards grouped into sections. A card
has a title, badges, a markdown summary, markdown details behind a toggle, and
up to six buttons:

| Button | What it does |
|---|---|
| `message` | Sends text to the thread that published the view, as if the user typed it. The agent does the work with its own permissions and context. |
| `thread` | Starts a new thread in a named project with a prompt and title. The button then becomes **Go to thread**. |
| `command` | Runs a shell command in the user's login shell. The card shows the command and asks before running it, then shows the exit code and the tail of the output. A failed command leaves the card open. |
| `link` | Opens a URL. |

Every card can be dismissed and restored. The agent reads back what the user
did with `bb dynamic-ui state`.

The view file's shape, and when a skill should use it, are in
`skills/dynamic-ui/SKILL.md`, which bb gives to every agent thread.

## Commands run as you

A `command` button runs whatever the view file says, with your permissions,
once you press **Run** on the confirmation that shows it. Read the command
before running it, as you would one an agent proposed in chat.

## CLI

```
bb dynamic-ui publish --file <view.json> [--key <name>]
bb dynamic-ui state [--key <name>]
bb dynamic-ui list
```

Each works only from inside a bb thread, because a view belongs to the thread
that published it.

## Settings

| Setting | Default | |
|---|---|---|
| `providerId` | `claude-code` | Provider for threads a `thread` button starts. |

## Storage

Views and item states live in the plugin's own database, which bb keeps under
its data directory. Views quote your work, so none of it is written inside
this checkout.

## Layout

| Path | What |
|---|---|
| `server.ts` | The `bb dynamic-ui` command, RPC, and what each button does |
| `app.tsx` | The view tab and the header button that opens it |
| `view/` | The view schema, the SQLite store, the command runner, and the tab's view |
| `view.stories.tsx` | The tab's states with invented fixtures, for `npm run storybook` at the root |
| `skills/dynamic-ui/` | How an agent publishes a view |

## Development

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload dynamic-ui
```
