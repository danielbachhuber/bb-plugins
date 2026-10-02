# Presentations

Give a talk from a bb thread. The thread's agent writes the slides as
markdown files, you edit them beside the chat, and the same panel presents
them.

## Starting a presentation

The **Presentations** page in the sidebar has a **Deck folder** field above
bb's own new-thread composer. Name the folder, say what the talk is about, and
submit. The plugin starts a thread titled "Presentation: <folder>" and puts a
short paragraph ahead of your prompt telling the agent where the slides go and
how they are named. The agent creates the folder if it does not exist.

The folder can be:

- relative, such as `presentations/my-talk`, which resolves against the
  thread's workspace, so a deck kept in a repository follows the thread into
  its worktree
- absolute, or under `~/`, for a deck kept outside any project

To present from a thread that already exists, run this in it:

```sh
bb presentations attach presentations/my-talk
bb presentations            # which folder this thread presents
```

## The deck format

- One folder per deck.
- Every `.md` file directly in the folder whose name starts with a number is a
  slide, shown in numeric order: `01-title.md`, `02-why.md`, `10-thanks.md`.
  `10` follows `9`. Other files, such as a `README.md`, are ignored, and so are
  files in subfolders.
- A slide is ordinary markdown, drawn with bb's own renderer on a 16:9 canvas
  that scales to fit, so a slide that fits in the panel fits on a projector.
- Images use paths relative to the deck folder, such as
  `![Diagram](images/diagram.png)`. png, jpg, gif, webp, avif, and svg work.
  A path that leaves the folder is not served.

## Presenting

Presentation threads have a **Present** button in the thread header. It opens
the **Slides** panel beside the chat:

- The current slide, with a counter and previous and next buttons.
- Every slide file, by number and first heading. Clicking a row jumps to that
  slide; the pencil opens the file in a tab, where Markdown Editor (if
  installed) edits it. In a narrow panel the list sits below the slide.
- **Full screen** shows the slide alone on the screen. Esc leaves.
- **New window** opens the deck by itself at
  `/plugins/presentations/presentations/present/<thread id>`. In the desktop
  app that opens in your default browser, which you can move to a projector;
  its **Present** button goes full screen. The URL carries the thread id, not
  the folder.

Keys, once the slide has focus: → ↓ Space Page Down for next, ← ↑ Page Up
for previous, Home and End for the first and last slide. A presentation
clicker sends Page Up and Page Down, so it works without setup. Clicking the
right half of the slide moves forward and the left half moves back.

## Live reload

An open panel or window rereads the deck every two seconds while it is
visible, and stops while it is hidden. Each read lists the folder once and
reads each slide file once, all on the machine the thread runs on: a 12-slide
deck is 13 local file calls every two seconds, which took 10 to 20 ms on a
5-slide deck. Only one read runs at a time. A slide whose contents did not
change does not re-render, and you stay on the slide you are on. An agent's
edit shows up within about two seconds.

Images come from `/api/v1/plugins/presentations/http/asset`. Every image in
the deck is requested once when the deck opens, so a slide shows its image as
soon as you reach it. After that the browser asks again each time a slide shows
an image, and the route answers 304 unless the file changed, using the file's
hash as its ETag.

## What it stores

One row per presentation thread in the plugin's own storage, mapping the
thread to the folder you typed. There is no list of past decks.

## Layout

| Path | What it holds |
| --- | --- |
| `deck/slides.ts` | Which files are slides, their order and titles, resolving the deck folder, and the containment check for paths inside it |
| `deck/images.ts` | Finding a slide's image references and pointing them at the asset route |
| `deck/keys.ts` | Which key moves which way |
| `deck/view.tsx` | The panel, the window, the stage, and the slide list, as display components |
| `deck/deck.stories.tsx` | Stories for the panel and the window |
| `server.ts` | The RPC contract, spawning the thread, reading the deck, the asset route, and the `bb presentations` command |
| `app.tsx` | The Presentations page, the Present button, the Slides panel, and polling |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload presentations
```

`presentations/bb-flash-talk/` at the root of this repository is a deck to try
it on.
