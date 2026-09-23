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
| `bb-plugin-automation-palette` | `automation-palette` | Lists your automations in bb's quick palette, so a scheduled sweep can be run by hand without leaving the keyboard. |
| `bb-plugin-diff-comment` | `diff-comment` | Leave review comments inline on a thread's diff, then have the agent work through them one at a time. |
| `bb-plugin-diff-viewed` | `diff-viewed` | Adds a Viewed checkbox to each file in the changes panel, so a reviewed file collapses, dims, and stays that way until its diff changes. |
| `bb-plugin-gh-context` | `gh-context` | A banner above the composer showing the thread's pull request, the GitHub issues it works on, its changes, and a Harvest timer, in place of bb's own. |
| `bb-plugin-hacks` | `hacks` | Local patches to bb's own UI, standing in for fixes that have not landed upstream. Currently remembers the changes panel's stacked/split view mode and line-wrap toggle across reloads, opens the unread files bb folds away in a large diff, and adds a button to each sidebar project that opens its checkout in your editor. |
| `bb-plugin-harvest` | `harvest` | Track time in Harvest from the thread header. |
| `bb-plugin-issue-sweep` | `issue-sweep` | Open GitHub issues assigned to you, newest activity first. |
| `bb-plugin-markdown-editor` | `markdown-editor` | Edit markdown files in the tab you were reading them in: a Preview/Raw toggle, an editable source pane, Cmd+S saving that refuses to clobber an edit made on disk while you typed, and an Add to chat button on a preview selection. Reachable from a pencil on markdown files in the changes panel. |
| `bb-plugin-new-issue` | `new-issue` | Draft a GitHub issue from a few lines of notes, in a thread that runs the draft-issue-description skill. |
| `bb-plugin-pr-sweep` | `pr-sweep` | Open pull requests you authored, with the ones needing action flagged. Needs gh-context. |
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

`sync.sh` builds with the Node version in `.nvmrc`, loading it through nvm, and
stops if that version is not installed. Different npm versions write
`package-lock.json` differently, so building with another Node leaves every
lockfile modified. It skips a plugin that bb has not installed yet; run
`setup.sh` to install one that arrived in a pull.

`update.sh` keeps a machine current on its own. It fast-forwards `main` from
`origin`, then runs `sync.sh`. If the checkout is on another branch, has
uncommitted changes, or has diverged from `origin`, it changes nothing and says
why. Schedule it on each machine as a bb script automation:

```sh
bb automation create --project <id> --name "Update bb-plugins" \
  --cron "*/15 5-15 * * *" --timezone America/Los_Angeles --interpreter bash \
  --script 'exec ~/projects/bb-plugins/update.sh'
```

Pass the path inline. `--script-file` stores a copy of the script, so later
changes to `update.sh` would not run.

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

## Stories

Plugin UI can be worked on in [Ladle](https://ladle.dev), the story viewer bb
uses for its own components, without building or reloading a plugin:

```sh
npm run storybook          # http://localhost:61000
npm run storybook:build    # static build in build/
```

Stories are `*.stories.tsx` files in any plugin directory. They render inside
bb's own story wrapper, with bb's stylesheet and theme toggle, and can import
bb's components through `@bb-app/...` to show a plugin's UI beside the part of
bb it sits next to.

That requires a bb checkout with its dependencies installed. The scripts look
for it at `~/projects/bb`; set `BB_SOURCE_DIR` in `.env` (see `.env.example`)
if it is somewhere else. They run the Ladle, Vite, and Tailwind bb already has
installed, so nothing is installed here, and a checkout whose `node_modules`
is older than its source fails on whichever package it is missing. Run
`pnpm install` in bb when that happens.
