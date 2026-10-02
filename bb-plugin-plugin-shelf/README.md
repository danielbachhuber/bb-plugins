# Plugin Shelf

A **My plugins** page that lists every plugin in the bb-plugins checkout it was
installed from, grouped by where each one stands in the bb-community
marketplace. It opens from a My plugins row under Installed plugins in bb's
Plugins screen:

- **Needs a release**: published, with code commits since the latest release
  tag. The row expands to those commits, and a Publish update button starts a
  thread that releases it.
- **Published**: published, and the latest release tag has every code change.
  A plugin whose only unreleased commits are docs changes stays here, with
  those changes listed.
- **Personal**: not in the marketplace.
- **Unknown**: shown only when the marketplace or GitHub could not be reached,
  so a network failure never calls a published plugin personal.

Each row shows the plugin's name, its `bb.description`, its latest release,
and its install count. The count is the one bb's Browse page shows for the
marketplace entry, and arrives with the catalog search Plugin Shelf already
makes for each plugin, so it costs no extra requests. A personal plugin, or a
published one bb has no count for yet, shows a dash.
Small tags under the name point out:
- a package.json version that was bumped and never tagged
- a newer tag outside the entry's range
- a published entry with no release in its range
- an id that another source holds in the marketplace

This plugin is built for one person's plugin repository. It is public because
the repository is, not because it is meant to be broadly useful.

## How "needs a release" is decided

A marketplace entry with a git source tracks a semver range of tags named
`<tagPrefix>vX.Y.Z`, and installed copies follow the newest tag in that range.
So a published plugin needs a release when commits have touched its directory
since that tag:

- Tags are read with `git ls-remote --tags origin`, so a tag that was created
  and never pushed does not count as a release.
- Commits are `git log --no-merges <tag>..origin/main -- <dir>`, after a
  `git fetch origin main` that runs on refresh at most once a minute.
- A commit is docs only when every file it touches is a README,
  `PLUGIN_OVERVIEW.md`, a story, a test, or a file under `screenshots/`.
- The marketplace entry for each plugin comes from bb's own catalog. It counts
  only when its id matches exactly, it is in `bb-community`, and its source is
  this checkout's `origin` and the plugin's directory.

## Starting a thread on a plugin

Every row has a Start thread button. It opens bb's own new-thread composer in
a dialog, under a card naming the plugin and its directory, with the project
set to the one whose folder is the checkout. Everything else is the
composer's: the provider, model, environment, branch, and permission mode
start from that project's remembered defaults, and each plugin keeps its own
saved draft.

The thread's prompt starts with a line saying which plugin it is for and
where it lives, ahead of what you typed. Its title is the plugin's name and
your first line.

## Publishing an update

Publish update starts a thread in the bb project whose folder is the checkout.
The thread works in that folder rather than a new worktree, because the release
commit belongs on `main`. It runs the `publish-plugin-update` skill, which ships
with this plugin. The skill:

1. lists the unreleased commits and proposes a version
2. bumps, commits, and tags
3. pushes only after you say yes
4. works out whether the marketplace entry needs a pull request

A patch inside the range needs no marketplace pull request. A minor release of
a `0.x` plugin does, because `^0.1.0` does not include 0.2.0.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Provider for spawned threads | `claude-code` | The provider Publish update starts its thread on. The skill was written and tested on Claude Code, so the thread does not inherit bb's default provider. |

## Install

Plugin Shelf reads the checkout it was installed from, so install it from the
checkout itself:

```sh
bb plugin install path:/path/to/bb-plugins/bb-plugin-plugin-shelf
```

`./setup.sh` at the repository root does this along with every other plugin.
Needs bb 0.43 or later and `git` on the machine running the bb server. No
account or external service.

## How it works

`shelf/classify.ts` is a pure function from the plugin index, the pushed tags,
the commits, and the marketplace entries to the rows. Everything it needs is
gathered in two places: `shelf/git.ts` runs git and reads the files, and
`server.ts` asks bb's catalog. The server keeps the last good result, so a
refresh that cannot reach GitHub shows that result with the error and when it
was taken, rather than an empty page.

The Publish button is refused on the server for a plugin that is not
published, whatever the page drew.

### Inside bb's Plugins screen

bb's Plugins screen has a fixed list of pages and no slot for a plugin to add
one. So an app overlay, which bb mounts once per window inside its own React
tree, draws the page there with a React portal, and `screen/engine.ts` does
the DOM work around it:

- It adds a My plugins row under Installed plugins, copied from whichever of
  bb's rows is not the current page so it has bb's idle styling. A plain click
  goes to `/plugins?view=mine` inside bb, without a reload.
- On `/plugins?view=mine`, bb falls back to drawing Browse, so the engine hides
  bb's content in the screen's main panel with a stylesheet rule and gives the
  overlay a container there for the page. Because it is a rule, content bb
  draws later is hidden too.
- It marks My plugins as the current row and takes the highlight off Browse,
  then gives it back on leaving, because bb never re-renders a row whose state
  it thinks has not changed.

| Anchor | Used for |
| --- | --- |
| `a[href="/plugins?view=installed"]` beside `a[href="/plugins"]` | Finding bb's Plugins sidebar, and where the row goes |
| `aria-current` and `bg-sidebar-accent` | Reading and setting which row is the current page |
| `#extensions-main-panel` | The screen's main panel, where the page is drawn |

If bb changes those, the row or the page stops appearing, and bb's own
Plugins screen is left as it was. `experimental_appOverlay` is an experimental
slot, so a bb upgrade can change it too.

## Layout

| Path | Holds |
| --- | --- |
| `shelf/types.ts` | The shapes shared by the classifier, the server, and the page |
| `shelf/classify.ts` | Pure: which group each plugin is in, its latest release, and its flags |
| `shelf/git.ts` | The git and filesystem boundary: checkout, index, pushed tags, commits |
| `shelf/contract.ts` | The RPC contract, which `ui/ShelfPage.tsx` imports as a type |
| `shelf/test-repo.ts` | A throwaway checkout with a bare origin, for the git and server tests |
| `screen/dom.ts` | Reading and marking up bb's Plugins screen: its sidebar and main panel |
| `screen/engine.ts` | The sync loop for the Plugins screen: the row, the panel, cleanup |
| `skills/publish-plugin-update/` | The skill Publish update runs |
| `ui/ShelfTable.tsx` | The grouped tables, display only |
| `ui/ShelfPage.tsx` | The page, its title, and its Refresh button, loading over RPC |
| `ui/PluginsScreenOverlay.tsx` | The app overlay that portals the page into bb's Plugins screen |
| `ui/StartThreadDialog.tsx` | The Start thread dialog around bb's new-thread composer |
| `ui/shelf-store.ts` | One load shared by the page and the Refresh button |
| `ui/fixtures.ts` | Invented rows for the stories and tests |
| `server.ts` | Gathers the inputs, caches the result, and starts publish and plugin threads |
| `app.tsx` | Registers the Plugins screen overlay |

## Development

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload plugin-shelf
```

`npm run storybook` at the repository root renders `ui/ShelfTable.stories.tsx`
with bb's stylesheet.

