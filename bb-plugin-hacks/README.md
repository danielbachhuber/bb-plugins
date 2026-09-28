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

### Large diffs open their unread files

bb folds every file in a diff of more than ten, and folds deleted files
whatever the count: `resolveDiffFileCardInitialState` in `diffFilesStore.ts`
collapses on `fileCount > GIT_DIFF_AUTO_COLLAPSE_FILE_THRESHOLD`, a hardcoded
`10` with no setting behind it. On a forty-file review that folds away the files
you have not read along with the ones you have, which is the one distinction
worth keeping.

This hack opens them again. A file is opened only if it is folded, not marked
read by [Diff Viewed](../bb-plugin-diff-viewed), and not a deletion — bb's
reason for folding those is its own and worth keeping. Nothing happens at ten
files or fewer, because bb folded nothing there and a folded file is something
you did.

Each file is opened at most once per path and stat count. Collapse one by hand
and it stays collapsed; collapse them all and they stay that way. A file whose
diff has changed since is a different card, and gets one more chance to open.

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
existing app-shell DOM. There is no panel and no React slot, and `server.ts`
holds no behavior at all — bb requires a backend entry, and each hack keeps its
state in the browser.

The view-preferences hack anchors only on things bb emits deliberately:

| Anchor | Used for |
| --- | --- |
| `[data-testid="git-diff-toolbar-actions"]` | Finding the toolbar, and knowing the changes panel is open |
| `aria-label="Wrap diff lines"` and `"Disable diff line wrap"` | The wrap button, whose label flips with its state |
| `aria-label="Stacked diff view"` / `"Split diff view"` | The view-mode pair |
| `aria-pressed` | Reading every toolbar control's state |
| A capture-phase `click` on the document | Knowing the user chose something, rather than bb moving a control itself |

The expand-unviewed hack anchors on the card headers instead:

| Anchor | Used for |
| --- | --- |
| `aria-label="Collapse <path>"` / `"Expand <path>"` | Reading each card's file path |
| `aria-expanded` | Reading and driving collapse |
| `[data-timeline-file-diff]` | Skipping timeline diffs |
| `data-diff-viewed="true"` | Leaving a file Diff Viewed has marked read folded |
| `data-diff-viewed-owned` | Keeping Diff Viewed's own checkbox out of the stat reading |

The open-in-editor hack anchors on the sidebar project row:

| Anchor | Used for |
| --- | --- |
| `data-sidebar-project-id` | Finding each project row, and which project it is |
| `data-sidebar-row-controls` | The row's hover controls, which the button joins |
| `aria-label="New thread in <project>"` | Telling the project header's controls apart from a nested environment group's, and where the button goes |

The button copies its classes from the New thread button beside it, so it
picks up bb's hover reveal and sizing without naming a class itself.

That card parsing is a trimmed copy of the same code in Diff Viewed. The two
plugins ship separately, so sharing it would mean publishing and versioning a
package for the benefit of two callers; the copy is the cheaper trade until a
third one needs it.

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
| `hacks/project-open-in-editor/rules.ts` | Pure logic: which editor, and which folder |
| `hacks/project-open-in-editor/sidebar.ts` | Reading bb's project headers and building the button |
| `hacks/project-open-in-editor/api.ts` | The network boundary: bb's projects and the host daemon |
| `hacks/project-open-in-editor/engine.ts` | The sync loop: passes, observers, cleanup |
| `app.tsx` | Wiring only: registers each hack's content script |
| `server.ts` | Required backend entry, deliberately empty |

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
