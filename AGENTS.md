# AGENTS.md

Plugins for [bb](https://getbb.app). Each top-level directory is its own npm
package; `.bb/plugins.json` indexes the ones that are plugins.

## This repository is public

`danielbachhuber/bb-plugins` is public. Before you write a line of it, this is
the rule that outranks the rest:

- **No credentials.** No tokens, keys, or anything read out of `~/.bb`.
- **No real repository, project, board, team, or person names.** Not in source,
  not in comments, not in tests, not in README prose. A private repo name once
  reached this code inside an explanatory comment, which is exactly how it
  happens: the comment was about why a column wraps, and the example it reached
  for was the real thing on screen.
- **No content copied out of a thread.**

Fixtures use invented names: `acme/widgets`, `acme/gadgets`, `octocat`,
`hubber`, `Acme Board`. Reuse those rather than inventing new ones.

Scan the staged diff before committing. `git diff --cached` and read it, rather
than trusting that you did not type anything private.

## Anything personal is a setting, never a constant

The board name, its status order, which statuses count, the repository list:
all plugin settings held in `~/.bb`, set with
`bb plugin config <id> set <key> <value>`. Node ids (project, field, option) are
resolved at runtime from the board's name and never written down.

If you are about to hardcode a value that is true only for one person, that is
the signal to add a setting instead.

## Nothing under `~/.bb` belongs here

Plugin settings, secrets, per-plugin HTTP tokens, and `data.db` all live there
and all stay there. Read from them when you are verifying behavior; never copy
from them into a file in this repository.

## Working on a plugin

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

`./sync.sh --check` reports which plugins have drifted from this checkout;
`./sync.sh` runs the sequence above for each of them.

## A feature is not shipped until the prose matches

Each plugin describes itself in three places, and a change to what it does
changes all three in the same commit:

- `package.json`'s `bb.description`, which is what bb shows in the plugin list
  and the marketplace
- the plugin's own `README.md` — the prose, and its Layout table when the
  change adds a directory
- the root `README.md` table, whose "What it does" column is `bb.description`
  word for word

Those last two are coupled, so editing one and not the other is the usual way
this goes wrong. Add the screenshots to the list when the change is visible in
one of them.

Leaving it for later does not work: the description is the only account of the
plugin that anyone outside this checkout reads, and a plugin whose description
is a release behind is advertising a feature set it no longer has. The pencil
the markdown editor puts on markdown files in the changes panel shipped while
all three still described a plugin that only opened files in tabs.

## Verify against live data, not just tests

Every real bug in these plugins passed its unit tests, because the tests
encoded the same wrong assumption the code did. Before believing a classifier,
pull the real payload, run the real parser over it, and read the plugin's own
database. Quote the real numbers when you report: "0 failing on the live PR" is
worth more than "the tests pass".

When a panel misbehaves, find the error before theorising. bb logs plugin RPC
failures where `bb plugin logs` does not show them:

```sh
grep -h "plugin:<id>" ~/.bb/logs/server*.log | tail -20
```

## Further reading

Two skills carry the rest and are not repeated here:

- `improve-bb` — how these plugins are built, what has gone wrong in them, the
  UI conventions, and how to change a row's shape without the panel silently
  emptying. Read it before touching the code.
- `building-bb-plugins` — authoring preferences for a new plugin.
