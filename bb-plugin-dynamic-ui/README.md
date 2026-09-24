# Dynamic UI

Lets a skill show its results as a list right above the thread's composer,
instead of as a numbered list in chat that the user answers by typing. Each
item opens in the side panel with its details and every button.

## How it works

A skill that produces several items to act on (issues to triage, findings to
fix, pull requests to merge) writes a view file and publishes it from its
thread:

```sh
bb dynamic-ui publish --file view.json [--key <name>]
```

The thread's newest view appears above its composer, one row per item: the
title, up to two badges, a line of summary, and a **Review…** button. Nothing
runs from the list: the button and the row both open the item. The
list collapses to one line from its header. Clicking a row opens that item in
the side panel, with its full summary, its details, and every button; the panel
keeps one tab per view and switches items as rows are clicked. Publishing again
with the same key replaces the view and keeps what the user already did to
each item.

A view is a title, a markdown summary, and cards grouped into sections. A card
has a title, badges, a markdown summary, markdown details behind a toggle, and
up to six buttons:

| Button | What it does |
|---|---|
| `message` | Sends text to the thread that published the view, as if the user typed it. The agent does the work with its own permissions and context. |
| `thread` | Starts a new thread in a named project with a prompt and title. The button then becomes **Go to thread**. |
| `command` | Runs a shell command in the user's login shell. The side panel shows the command and asks before running it, then shows the exit code and the tail of the output. A failed command leaves the item open. |
| `link` | Opens a URL. |

An item can carry a `draft`, such as a comment to post or a new thread's task. The opened item shows it once, with the same Preview/Raw toggle as the Markdown Editor plugin: Preview renders the markdown, and Raw (or a double-click on the preview) edits the source. Once the item is done or dismissed, only the preview shows, greyed to say it can no longer be edited. Every `message` or `thread` button whose text contains `{draft}` sends its own instruction with the draft as the user left it. Commands cannot use `{draft}`, so edited text never reaches a shell.

The first time you look at a thread after it publishes, the side panel opens on the first item still open, whether the publish happened while you were watching or before you arrived. Close the panel and it stays closed until the next publish. When the agent republishes after a button is pressed, the panel moves on to the next open item, unless the one you are reading is still open. With no entry picked, the panel shows the first open one, and once every item is handled it says to click one.

Once one of a card's buttons goes through, the card is done and its other buttons are disabled, so one click cannot be followed by a contradictory second one; links and **Go to thread** stay usable. What the last button did shows as a banner at the top of the item, above its summary: green for done, red for a failure with its output. Every card can be dismissed and restored.

## Visual review

An item with `variations` is a visual review: screenshots of one piece of UI, the original first and then the alternatives, each with a label and a line of description. The opened item shows them side by side, one at a time at the panel's width, with every image in the same place: flip between them with the arrow keys, the ‹ › buttons, or a swipe, and what changed is what moves. Clicking an image shows it full size. A filmstrip of thumbnails stays at the top of the panel: it shows how many variations there are, highlights the one showing, marks the pick and any variation with a note, and flips to a variation when you click it. Under each is **Pick this one** and a note box, and at the bottom an overall note and **Send feedback**, which sends one message to the thread naming the pick and quoting every note. `publish` copies the images into the plugin's database, so the review keeps showing what was proposed after the files move or the code changes. Once feedback is sent, the row above the composer says which variation was picked. The agent reads back what the user
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

Views, item states, and visual review images live in the plugin's own database, which bb keeps under
its data directory. Views quote your work, so none of it is written inside
this checkout.

## Layout

| Path | What |
|---|---|
| `server.ts` | The `bb dynamic-ui` command, RPC, and what each button does |
| `app.tsx` | The list above the composer and the side-panel tab it opens |
| `view/` | The view schema, the SQLite store, the command runner, the list, the panel, the item the panel shows, its draft editor, the visual review and its feedback message, and when the panel opens by itself |
| `view.stories.tsx`, `composer.stories.tsx` | The panel's states, and whole threads with the list above bb's composer, with invented fixtures, for `npm run storybook` at the root |
| `skills/dynamic-ui/` | How an agent publishes a view |

## Development

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload dynamic-ui
```
