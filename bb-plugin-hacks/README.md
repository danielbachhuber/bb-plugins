# Hacks

Local patches to bb's own UI. Each one stands in for a fix that has not landed
upstream yet, so a hack arrives when something in bb annoys me and leaves again
when bb fixes it properly.

This plugin is built for one person's install. It is public because the
repository is, not because it is meant to be broadly useful.

## Hacks

### Changes-panel view preferences

The changes panel's stacked/split view mode and its line-wrap toggle are
remembered across reloads. bb keeps both in React state, so they reset every
time the panel remounts, and the view mode additionally reverts to a
width-driven default.

A stored choice wins at every panel width. Until you pick a view mode yourself,
bb's width-driven default stays in charge, which is why "never chosen" is stored
separately from "stacked". A phone-width window is left alone entirely: it
neither restores the stored choice nor overwrites it, so a desktop `split` never
follows you onto a drawer and a choice made there never comes back to the
desktop.

Collapse all is deliberately untouched. It is an action, not a setting.

Preferences are restored by clicking bb's own buttons, because the state lives
in React and there is nothing else to set. The click is also what tells bb that
its width-driven default no longer applies.

A preference is only ever recorded from a click. bb moves these controls on its
own — it re-applies the width-driven default whenever the panel crosses 760px —
and a change noticed after the fact cannot be told apart from a choice. So the
hack watches for clicks to decide what you want, and watches the DOM only to
decide what needs correcting. Inferring intent from the DOM instead is what let
a panel resize overwrite a stored choice with bb's default.

They are stored in `localStorage` under `bb.thread.gitDiff.displayMode` and
`bb.thread.gitDiff.lineOverflowMode` — the keys and values from
[get-bb/bb#3271](https://github.com/get-bb/bb/pull/3271), which adds these same
preferences to bb proper. If that lands, bb reads what this hack has been
writing and the hack can be deleted. Because `localStorage` is per origin, the
packaged app and a checkout's dev app on another port keep separate
preferences.

### Each thread keeps its changes range

The range dropdown at the top of the changes panel ("All changes",
"Committed changes", "Uncommitted changes", or a single commit) is
remembered per thread. bb keeps the range in React state and clears it to
All changes whenever the panel moves to another environment, so switching
to another thread and back loses it.

A range is recorded only when you pick it from the dropdown. Picking All
changes forgets the thread, since that is bb's default. The last 200 threads
are kept, in `localStorage` under `bb-plugin-hacks.gitDiffRange.byThread`.

The range is put back once each time you arrive at the thread or the
dropdown mounts, and then left alone, so bb can still move it. A file link in
the transcript, for example, sends the panel to All changes to scroll to that
file. The hack waits until the stored range is listed, because bb lists only
All changes until the thread's status has loaded and drops a range that is
not listed. If the status loads without it, such as Uncommitted after
everything was committed, the thread stays on All changes for that visit.

### Large diffs open their unread files

bb folds every file in a diff of more than ten, and folds deleted files
whatever the count: `resolveDiffFileCardInitialState` in `diffFilesStore.ts`
collapses on `fileCount > GIT_DIFF_AUTO_COLLAPSE_FILE_THRESHOLD`, a hardcoded
`10` with no setting behind it. On a forty-file review that folds away the files
you have not read along with the ones you have, which is the one distinction
worth keeping.

This hack opens them again. A file is opened only if it is folded, its Viewed
box is not checked (bb's own, or Super Diff's on its cards), it is not marked
read by [Diff Viewed](../bb-plugin-diff-viewed), and it is not a deletion. bb's
reason for folding deletions is its own and worth keeping.

Each file is opened at most once per path and stat count. A file already seen
open, whether bb or this hack opened it, is left alone, so a file you collapse
by hand stays collapsed, and in a diff of ten files or fewer, where bb opens
everything, nothing is touched. Clicking Collapse all files stops the hack
until the diff changes or you click Expand all files. A file whose diff has
changed since is a different card, and gets one more chance to open.

bb throws its fold state away and folds every file again whenever the diff
changes: another thread, another range such as Uncommitted changes, or a new
merge base. The hack forgets what it has seen at the same moments, reading the
diff from the page path and the range dropdown's label, so the files open
again each time. A new merge base on the same range is the one change it
cannot see.

There is no file-count check. bb renders only the cards near the viewport, so
the number of cards on the page says nothing about the size of the diff.

Whether a card is a deletion is inferred rather than declared: bb hides the zero
side of the tally only for added and deleted files, so a deletion reads as `-12`
where a file that merely removed every line still reads `+0 -12`. A header this
cannot parse counts as not-a-deletion and opens, because that is the mistake you
can undo with one click.

### Open a project in your editor

Each project header in the sidebar gets a button beside New thread that opens
the project's checkout in your editor.

The editor is the one you chose in bb's own "Open in" menu, read from bb's
`bb.workspaceOpenTarget` key in `localStorage`, when that choice is an editor.
When it is Finder, a terminal, or nothing yet, the first editor the host
daemon found is used, so the button always opens an editor. The button's
tooltip names the editor it will use.

The folder is the project's local path on the machine running this window's
host daemon. A project with no checkout on that machine gets no button, and
neither does the Personal project. A project whose folder is missing gets
none either: bb hides New thread there, and this button is placed relative
to that one.

Opening goes through the host daemon's `/open-in-target` endpoint, the same
one bb's own "Open in" menu calls, with project paths read from bb's
`/api/v1/projects`. The daemon's local API accepts requests from bb's own
origin, which is where a content script runs. A window that cannot reach a
daemon, such as bb opened in a browser on another machine, shows no buttons.

The daemon and the project list are looked up once when the window loads.
bb's window can load before its daemon is listening, as it does when bb
starts, so a failed lookup is tried again after 1 second, then 2, 4, 8, and
16, then every 30 seconds, and the buttons appear once it succeeds. After ten
minutes without a daemon it stops trying.

### Is the checkout behind origin

Hovering a project header in the sidebar shows a sync icon beside bb's own
buttons, telling you whether the project's checkout is behind the branch it
tracks on its remote, usually `origin/main`. An amber dot on the icon's
corner marks a checkout that is behind, has diverged, or failed to pull when
you clicked, and the tooltip says how far behind or ahead the branch is.
Nothing shows until you hover.
Clicking it fetches, and pulls when that is safe:

| State | Dot | A click |
| --- | --- | --- |
| Behind | Yes | Fetches, then fast-forwards |
| Diverged | Yes | Fetches; merging or rebasing is left to you |
| Your last click failed to fetch or pull | Yes, and the icon is a warning triangle with git's message in the tooltip | Tries again |
| Ahead, not pushed | No | Fetches |
| Up to date | No | Fetches |

While a click is fetching, the icon spins without hovering.

The pull is `git merge --ff-only`, so it never creates a merge commit, and
git refuses it when an uncommitted change would be overwritten. That refusal
shows as the warning until a later fetch or pull succeeds.

#### Running the project's sync script

When a click pulls new commits, the hack runs the project's sync script, so a
checkout whose source changed can rebuild what it serves. bb-plugins' own
`sync.sh` rebuilds and reloads each plugin the pull changed. The hack looks in
these places, in order, and runs the first one that exists, from the
checkout's root:

1. `.bb/sync`
2. `sync.sh`
3. `scripts/sync.sh`

A project with none of them behaves as above. A script that is not executable
runs under bash.

The script runs only after a pull that moved the branch. A click that pulls
nothing leaves it alone, unless its last run failed, when the click runs it
again. While it runs, the icon spins without hovering, and a click does not
start a second copy. When it exits with an error, the icon is the warning
triangle and the tooltip gives the exit code and where its output is. A run
that succeeds changes nothing on the sidebar.

Any project with a script in one of those places runs it after a pull, so a
pull runs whatever its upstream put there.

The script runs apart from the plugin's server, so it keeps going when it
reloads Hacks itself, as `sync.sh` does after a pull that changes Hacks. Its
output goes to one log per checkout under `bb-hacks-checkout-sync/` in the
system's temporary directory, replaced on each run, next to a small file
recording whether it is still running and how it exited. It runs with the
environment of bb's server.

A project whose checkout is on a detached HEAD, or on a branch that tracks
nothing, shows nothing, and so does a project with no checkout on the machine
running bb's server.

Every window reads each project's status every minute while it is visible,
or every 3 seconds while a sync script is running, in one request for all the
projects in the sidebar. The server answers with
three local git commands per project. It runs `git fetch` for a checkout at
most every five minutes, shared between windows, so most reads compare only
the refs already on disk, and a push to origin from somewhere else shows up
within about six minutes. A push from the checkout itself updates its
`origin/main` straight away. A fetch that would ask for a password fails
instead of waiting.

A background fetch that fails, such as one that runs into another process's
push in the same checkout, is logged to bb's server log and tried again five
minutes later. It never draws the dot. Only a fetch or pull you started by
clicking shows as a failure.

### Diff code blocks start wrapped

A fenced `diff` block in a chat message starts with long lines wrapped,
instead of scrolling sideways. bb keeps each block's wrap toggle in React
state and starts it off, so the hack clicks the toggle once when the block
appears. Click it again to unwrap that block; it stays unwrapped until it
remounts. Blocks in other languages are left alone.

## Install

This repository holds several plugins, so the install names which one and where
its release tags live:

```sh
bb plugin install git:https://github.com/danielbachhuber/bb-plugins.git@^0.1.0 \
  --plugin hacks --tag-prefix hacks/
```

Needs bb 0.43 or later. No account, external service, or separate install.

## How it works

Every hack is a content script, which is what the SDK sanctions for decorating
existing app-shell DOM. There is no panel and no React slot. Each hack keeps
its state in the browser, except the checkout indicator, which needs git:
`server.ts` serves its two RPC methods, `checkout_status` and
`checkout_pull`, and the content script calls them the way `useRpc` would.

The view-preferences hack anchors only on things bb emits deliberately:

| Anchor | Used for |
| --- | --- |
| `[data-testid="git-diff-toolbar-actions"]` | Finding the toolbar, and knowing the changes panel is open |
| `aria-label="Wrap diff lines"` and `"Disable diff line wrap"` | The wrap button, whose label flips with its state |
| `aria-label="Stacked diff view"` / `"Split diff view"` | The view-mode pair |
| `aria-pressed` | Reading every toolbar control's state |
| A capture-phase `click` on the document | Knowing the user chose something, rather than bb moving a control itself |

The range-memory hack is the exception to clicking bb's own controls. It
reads `GitDiffSelector`'s props through the React fiber on the dropdown's
trigger, because selecting a range by clicking would open the menu on every
thread switch and take focus from the composer, and the closed menu cannot
say which ranges exist:

| Anchor | Used for |
| --- | --- |
| `[data-testid="git-diff-toolbar-selector-slot"] button` | The dropdown's trigger |
| `__reactFiber$…` on the trigger, walked up to props with `value`, `options`, and `onChange` | Reading the range and the ranges listed, and selecting one |
| `aria-expanded` and `aria-controls` on the trigger | Finding the open menu, to record a pick |
| `role="menuitem"` text, matched to an option's short SHA and label | Which range was picked |
| `/threads/<id>` in the URL | Which thread the range belongs to |

The expand-unviewed hack anchors on the card headers instead:

| Anchor | Used for |
| --- | --- |
| `aria-label="Collapse <path>"` / `"Expand <path>"` | Reading each card's file path |
| `aria-expanded` | Reading and driving collapse |
| `[data-timeline-file-diff]` | Skipping timeline diffs |
| `[role="checkbox"][aria-label^="Viewed "][data-state="checked"]` in the header | Leaving a file whose Viewed box is checked folded |
| `data-diff-viewed="true"` | Leaving a file Diff Viewed has marked read folded |
| `data-diff-viewed-owned` | Keeping Diff Viewed's own checkbox out of the stat reading |
| `[data-testid="git-diff-toolbar-selector-slot"] button` text, and the page path | Which diff is showing, to forget what was seen open when bb resets |
| `aria-label="Collapse all files"` / `"Expand all files"` | Pausing and resuming after you fold everything |

The open-in-editor hack anchors on the sidebar project row:

| Anchor | Used for |
| --- | --- |
| `data-sidebar-project-id` | Finding each project row, and which project it is |
| `data-sidebar-row-controls` | The row's hover controls, which the button joins |
| `aria-label="New thread in <project>"` | Telling the project header's controls apart from a nested environment group's, and where the button goes |

The button copies its classes from the New thread button beside it, so it
picks up bb's hover reveal and sizing without naming a class itself.

The checkout indicator finds the same project headers the same way, then:

| Anchor | Used for |
| --- | --- |
| `data-sidebar-trailing-controls` | The header's trailing controls. The indicator goes before the hover actions inside them, so the spinner can show without hovering |
| `bb-sidebar-hover-actions` | bb's hover-reveal class, on the whole indicator except while a click is fetching |
| `--warning`, `--warning-text`, `--sidebar` | bb's theme colors for the dot, the failure icon, and the ring around the dot |

That card parsing is a trimmed copy of the same code in Diff Viewed. The two
plugins ship separately, so sharing it would mean publishing and versioning a
package for the benefit of two callers; the copy is the cheaper trade until a
third one needs it.

The diff-wrap hack anchors on the code block's own controls:

| Anchor | Used for |
| --- | --- |
| `aria-label="Wrap long lines"` with `aria-pressed="false"` | Finding an unwrapped block's toggle |
| The first `span` in the toggle's header | The block's language label |

No minified class names. If bb changes the toolbar and the anchors stop
matching, the hack does nothing and bb behaves exactly as it does without it.

## Layout

| Path | Holds |
| --- | --- |
| `hacks/<hack>/` | One directory per hack, each exporting its own `id` and `mount` |
| `hacks/git-diff-view-preferences/prefs.ts` | Pure logic: which buttons to click, and what to record |
| `hacks/git-diff-view-preferences/storage.ts` | The `localStorage` boundary, in bb's own key format |
| `hacks/git-diff-view-preferences/toolbar.ts` | Reading and driving bb's toolbar |
| `hacks/git-diff-view-preferences/engine.ts` | The sync loop: passes, observers, cleanup |
| `hacks/git-diff-expand-unviewed/cards.ts` | Reading bb's diff card headers |
| `hacks/git-diff-expand-unviewed/rules.ts` | Pure logic: which cards to open, and which to leave folded |
| `hacks/git-diff-expand-unviewed/engine.ts` | The sync loop: passes, observers, cleanup |
| `hacks/git-diff-range-memory/rules.ts` | Pure logic: whether to put a thread's range back yet |
| `hacks/git-diff-range-memory/selector.ts` | Reading bb's range dropdown and its React props |
| `hacks/git-diff-range-memory/storage.ts` | The `localStorage` boundary: one range per thread |
| `hacks/git-diff-range-memory/engine.ts` | The sync loop: arrivals, recording, cleanup |
| `hacks/project-open-in-editor/rules.ts` | Pure logic: which editor, and which folder |
| `hacks/project-open-in-editor/sidebar.ts` | Reading bb's project headers and building the button |
| `hacks/project-open-in-editor/api.ts` | The network boundary: bb's projects and the host daemon |
| `hacks/project-open-in-editor/engine.ts` | The sync loop: passes, observers, cleanup |
| `hacks/checkout-sync/rules.ts` | Pure logic: what a checkout's position looks like, and whether a click pulls |
| `hacks/checkout-sync/git.ts` | The git boundary, run by the server: status, a shared fetch, and the fast-forward |
| `hacks/checkout-sync/script.ts` | The sync script boundary, run by the server: finding, starting, and reading back a run |
| `hacks/checkout-sync/contract.ts` | The RPC contract, imported by the server only |
| `hacks/checkout-sync/sidebar.ts` | Placing and drawing the indicator in bb's project headers |
| `hacks/checkout-sync/engine.ts` | The sync loop: polling, passes, observers, cleanup |
| `hacks/code-block-wrap-diffs/engine.ts` | The sync loop: finding diff blocks and wrapping each once |
| `app.tsx` | Wiring only: registers each hack's content script |
| `server.ts` | The checkout indicator's RPC, which finds each project's checkout on this machine and runs its sync script after a pull |

## Development

```sh
npm install
npm test
npm run typecheck
bb plugin build && bb plugin reload hacks
```

`hacks/git-diff-view-preferences/engine.test.ts` drives the whole loop against a
DOM shaped like bb's, with a stand-in for React that flips `aria-pressed` on
click. The engine is split out of `app.tsx` precisely so it can be tested: the
version of this loop that shipped inside another plugin had every one of its
bugs in the wiring, not in the pure functions underneath it.

`toolbar.test.ts` holds a fixture of the toolbar DOM as bb renders it. After a
bb upgrade, that is the test that fails first; re-read
`ThreadSecondaryPanel-*.js` in bb's `app/dist/assets` and update the fixture and
`toolbar.ts` together.

Under Node 26, Node's own unavailable `localStorage` global shadows jsdom's, so
`window.localStorage` reads as `undefined` inside a jsdom test. That is why
`storage.ts` takes the storage it uses as a parameter rather than reaching for
`window`.
