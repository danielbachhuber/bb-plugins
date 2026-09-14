# bb-plugins

Plugins for [bb](https://getbb.app), the agentic IDE.

## ⚠️ This repository is public

Nothing here may contain a credential, a real private repository or project
name, or any content copied out of a thread. Anything personal is a plugin
setting held in `~/.bb`, never a constant in the source. Test fixtures use
invented names (`acme/widgets`, `octocat`, `Acme Board`) for the same reason.

Nothing under `~/.bb` belongs in this repository either: plugin settings,
secrets, HTTP tokens, and `data.db` all live there and all stay there.

## The plugins

| Directory | bb id | What it does |
| --- | --- | --- |
| `bb-plugin-diff-viewed` | `diff-viewed` | Adds a Viewed checkbox to each file in the changes panel, so a reviewed file collapses, dims, and stays that way until its diff changes. |
| `bb-plugin-harvest` | `harvest` | Track time in Harvest from the thread header. |
| `bb-plugin-issue-sweep` | `issue-sweep` | Open GitHub issues assigned to you, newest activity first. |
| `bb-plugin-markdown-editor` | `markdown-editor` | Edit markdown files in the tab you were reading them in: a Preview/Raw toggle, an editable source pane, and Cmd+S saving that refuses to clobber an edit made on disk while you typed. |
| `bb-plugin-new-issue` | `new-issue` | Draft a GitHub issue from a few lines of notes, in a thread that runs the draft-issue-description skill. |
| `bb-plugin-pr-sweep` | `pr-sweep` | Open pull requests you authored, with the ones needing action flagged. |
| `bb-plugin-review-sweep` | `review-sweep` | Open pull requests waiting on a review from you, oldest request first. |
| `bb-plugin-thread-todos` | `thread-todos` | A shared per-thread checklist the agent builds as it plans and you edit as you go, with a count in the thread header and a glyph on the sidebar row. |
| `bb-plugin-weekly-review` | `weekly-review` | One page of what you actually did this week, to write the journal entry from. |

`gh-shared` is not a plugin. It is the `gh` runner and project matching that
the three sweeps share, pulled in as a `file:` dependency and bundled at build
time, so an edit there needs all three rebuilt. The sweeps deliberately do not
share their classifiers or fetch strategies: those genuinely differ, and an
earlier attempt to merge the three into one plugin was reverted.

`bb-plugin-harvest` is also a `file:` dependency of the three sweeps, which use
its timer components to draw a clock on each row.

## Setting up

`.bb/plugins.json` indexes the plugin directories so one checkout can serve
them all. `setup.sh` installs every one of them:

```sh
./setup.sh
```

bb loads them as `path:` sources pointing straight at the directories here, so
an edit is live after a rebuild. `sync.sh` does that rebuild for whatever has
drifted:

```sh
./sync.sh --check   # report what is stale, change nothing
./sync.sh           # install, typecheck, build, and reload it
```

`sync.sh --check` is fast and offline, which makes it suitable for a
`post-merge` hook.

## Working on one plugin

```sh
cd bb-plugin-<name>
npm install && npm run harvest:sync   # harvest:sync only where the script exists
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload <id>
```

The order is not interchangeable. `npm install` refreshes the `gh-shared` copy
but replaces the harvest copy with a symlink, which puts a second React in the
tree and breaks every clock test; `harvest:sync` reinstates the copy with
`--install-links`. `tsc --noEmit` is what catches a `file:` dependency that is
still stale, a failure that otherwise reaches the panel as a runtime
"is not a function".
