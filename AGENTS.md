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

## Push after you commit

A commit stays local until it is pushed, so work that looks finished in this
checkout is still invisible everywhere else. When you have been asked to
commit, push the branch in the same step rather than leaving the commit sitting
here.

Commit one logical change at a time rather than one commit at the end.

## Screenshot the stories after you commit

Every story is photographed into a separate repository,
`danielbachhuber/bb-plugins-screenshots`, so the history of how each plugin
looks lives there instead of bloating this one. After you push a commit here:

```sh
npm run screenshots          # build, capture, list the images that changed
npm run screenshots:commit   # after reading them: commit there and push
```

Run it after every commit, not only visual ones: a change to a shared
component alters stories that its commit never touched. When nothing looks
different, the capture says so and there is nothing to commit.

The capture does not commit, because that repository is public too, and an
image can carry what a text scan of the diff misses. Read every image it
lists, with the same rule as the top of this file, while it is still only in
the working tree there. If one shows something private, throw the capture away
with the `checkout` and `clean` command it prints, fix the fixture here, and
capture again. Nothing reaches that repository's history until
`screenshots:commit`, which commits with a message naming this repository's
commit and pushes. That repository's AGENTS.md says the same.

It expects that checkout at `../bb-plugins-screenshots`, or wherever
`BB_PLUGINS_SCREENSHOTS_DIR` in `.env` points. Clone it there on a new
machine. A story that throws stops the capture, so fix the story rather than
working around it.

Do not add a `screenshots/` directory to a plugin for design history. The
screenshots a README embeds are the exception, because the README needs them.

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

## Search the marketplace before starting a new plugin

Before running `bb plugin new`, check whether a plugin that does the same job
already exists:

```sh
bb plugin search <keywords>
```

That searches the plugins bundled with bb, the bb-community marketplace, and
any other marketplace added on this machine. Try a few phrasings of what the
plugin would do, not only the name you have in mind. Report what you find
before writing any code: a close match may be worth installing, extending, or
borrowing from instead of building from scratch.

A plugin listed in the marketplace keeps a **Related plugins** section in its
README, after the sections on using it and before the ones on how it works.
List each similar plugin, including the ones bundled with bb, and say in a
sentence or two how this one differs. Name a plugin by its marketplace display
name and entry id, such as **Markdown PRO** (`md-editor`), and leave out its
author and repository link, following the public-repository rule above. Search again when you change what a published plugin does, since
the list of similar plugins changes too.

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

For visual work, run `npm run storybook` at the root instead of rebuilding and
reloading after every change. It renders a plugin's stories with bb's own
stylesheet and components, and an edit to a component shows up without a
reload. The Stories section below covers what a story needs.

Run npm with the Node version in `.nvmrc` (`nvm use`). Another npm version
rewrites every `package-lock.json`. A scheduled `update.sh` keeps each machine's
checkout current by pulling `main` and running `sync.sh`, and it skips a
checkout that has uncommitted changes. So a lockfile left modified on `main`
stops that machine from updating until someone notices.

## A feature is not shipped until the prose matches

Each plugin describes itself in three places, and a change to what it does
changes all three in the same commit:

- `package.json`'s `bb.description`, which is what bb shows in the plugin list
  and the marketplace
- the plugin's own `README.md` — the prose, and its Layout table when the
  change adds a directory
- the root `README.md` table, whose "What it does" column is `bb.description`
  word for word where that description is one sentence, and a condensed
  sentence of its own where it runs to a paragraph

Those last two are coupled, so editing one and not the other is the usual way
this goes wrong. Match whichever shape the row already has rather than pasting
a four-sentence description into a table cell. Add the screenshots to the list
when the change is visible in one of them.

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

To call an RPC method directly, without the panel in between:

```sh
BASE=$(node -p "require(process.env.HOME+'/.bb/bb-app-runtime.json').serverUrl")
curl -s -X POST -H "content-type: application/json" -H "origin: $BASE" \
  -d 'null' "$BASE/api/v1/plugins/<id>/rpc/<method>"
```

## Use bb's components before building your own

`@get-bb/plugin-sdk/app` exports bb's own version of most surfaces a plugin
needs. A hand-built copy looks different, behaves differently, and gets
replaced later. That has already happened once here.

| Instead of building | Use |
| --- | --- |
| A textarea plus a "Start thread" button | `experimental_NewThreadComposer` |
| A chat transcript or reply box | `ThreadChat` |
| A provider, model, or reasoning picker | `experimental_ProviderModelPicker` |
| A permission-mode dropdown | `experimental_PermissionModePicker` |
| A syntax highlighter or diff view | `experimental_SourceCode`, `experimental_Diff` |
| A markdown renderer | `Markdown` |
| A provider name lookup | `experimental_useProviders()` |

`NewThreadComposer` includes @-mentions, attachments, voice, the environment
and branch pickers, permission mode, saved drafts, and the project's
remembered defaults. A custom form has none of them. Its `onSubmit` returns a
`NewThreadRequest` whose fields match `threads.spawn`, so pass it through
unchanged and add only `title`, `sectionId`, `parentThreadId`, or
`visibility`.

Use a vendored shadcn component only for UI that bb does not provide.

## Pin the provider for threads a plugin spawns

Skills belong to one provider. A Claude Code skill in `~/.claude/skills/` is
invisible to a thread running on Codex, and that thread reports the skill as
missing and improvises the work instead, which is worse than failing.

So a spawned thread must not quietly inherit bb's default provider. Either pin
it with a setting, as pr-sweep's "Provider for spawned threads" does with a
`claude-code` default, or let the user choose and say in the UI which provider
the skill needs.

## Show a plugin only in its own threads

`threads.spawn` sets `originPluginId` on every thread a plugin starts. A
composer action, thread-header action, or message action should check it and
render nothing in other threads. Check it again in the handler, because what
the frontend draws is not an authorization check.

## Where code goes

- Plugin logic goes in a directory named for the plugin's domain (`sweep/`,
  `review/`, `todos/`), not `lib/`. The scaffold puts vendored shadcn support
  files in `lib/`, and mixing owned code in there makes it unclear which files
  are safe to regenerate.
- Keep a core with no network, filesystem, bb API, or model calls, so it can be
  tested alone, and put all I/O in one named module. Do not spend model tokens
  on work a pure function can do.
- Once the RPC contract has more than a few methods, move it to its own file
  that `app.tsx` imports as a type.

## Testing traps

The authoring reference covers the harness API. These are the problems it
does not mention:

- Call `cleanup()` in `afterEach`. Otherwise slots from earlier tests stay
  mounted and queries match twice.
- Radix `Select` copies its value into a hidden native `<select>`, so its text
  appears twice. Query the `combobox` role by its accessible name instead.
- Radix opens on `pointerdown`, which jsdom does not send. Assert which RPC
  fired for which id rather than trying to open the popup.

## Further reading

`bb-plugin-authoring`, which ships with bb, covers the plugin API surface,
the harness, and dependency placement. This file covers only the preferences
for this repository.

The bb source is checked out at `~/projects/bb`. When a question is about how
bb itself behaves (a UI element, a CLI command, the plugin SDK), read it there
rather than guessing from `bb guide` or the minified bundle inside `bb.app`.

## Stories

`npm run storybook` at the root serves every `*.stories.tsx` in the checkout
through bb's own Ladle, so a plugin's UI renders with bb's real stylesheet and
components. The root README covers the setup. What costs time:

- A story shows bb's look only if it renders through the wrapper: import bb
  components with `@bb-app/...` and bb's story helpers with `@bb-ladle/...`.
  A plugin's own `@/` imports resolve to that plugin's directory as usual.
- Stories render display components with fixture props. A component that
  calls `useRpc` reaches for a server a story does not have, so split the
  data loading from what it draws before writing the story.
- Editing a story file reloads the page; editing a component it imports
  updates in place.
- Fixtures follow the public-repository rule above: `acme/widgets`, never a
  real repository or PR. When a fixture copies the layout of a real screen,
  invent every field: titles, PR numbers, line counts, and ages as well as
  the names. Swapping the names and lightly rewording a real title still
  identifies the real pull request.
- The capture also writes a README for each plugin in the screenshots
  repository: the plugin's `bb.description`, then each story under a heading
  for its title's component, in the order the file declares them. The
  `/** ... */` comment directly above a story's export is its caption there,
  so write it for someone looking at the picture, and put a note meant only
  for this repository in a `//` comment above it instead.
