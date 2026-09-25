# bb-plugin-gh-context

A banner above the composer that shows what a thread is about on GitHub: its
pull request, the issues it works on, its committed or uncommitted changes, a
merge button, and a Harvest timer. It takes the place of bb's own prompt
context banner, which it hides.

It is also the one record of which threads belong to which GitHub issues and
pull requests. PR Sweep, Review Sweep, and Issue Sweep read and write their
thread links through it.

## Install on a new machine

```bash
cd ~/projects/bb-plugins/bb-plugin-gh-context
npm install && npm run harvest:sync
bb plugin install . --yes
```

## Requirements

- `gh` on PATH and authenticated as you (`gh auth login`), for issue titles and
  pull request bodies. Without it the banner still shows each issue's number.
- [Harvest](../bb-plugin-harvest), optionally. With it installed and
  configured, the banner draws its clock; without it, the banner has none. A
  timer started there is recorded against the first linked issue assigned to
  you, which is the work being billed; without one, against the pull request,
  and without that, the first linked issue.

## Which issues a thread is about

bb has no notion of an issue attached to a thread, so the link is read from
the thread itself. A thread is linked to an issue when:

1. its first prompt links exactly one GitHub issue (pull request links in the
   same prompt do not count against it);
2. its first prompt's first line names `issue #N`, with the repository taken
   from the checkout's GitHub remotes; or
3. its pull request closes the issue, or its body refers to it after `Fixes`,
   `Closes`, `Resolves`, `Refs`, `See`, or `Part of`. The banner's tooltip says
   "via PR #N" for these.

An issue that only comes up later in a thread, or a first prompt that links two
or more issues, is a mention rather than the work, and is not linked. These
rules came from reading 76 threads whose prompts link an issue: the first two
cover 68 of them, and the other 8 were mentions.

A first prompt never changes, so each is read once. A background pass reads
threads nobody has opened, so the sweeps know about a thread started by hand
before its banner has been drawn.

Once the pull request has merged, the banner suggests **Archive thread** in
place of the merge button, since the thread's work is done. An archived thread
shows Unarchive instead.

When you are a reviewer, the pull request's label says where your review
stands: "Review requested" before your first review, whether the request named
you or a team you are on; "Re-review requested" when someone has asked you
directly to look again; and otherwise your standing review ("You approved",
"You requested changes", "You commented", or "Your review was dismissed"). A
comment after an approval leaves it approved, as on GitHub. Once your review is
in and nobody has asked for another, the banner suggests **Archive thread** too,
since a review thread's work is done. The label drops once the pull request
merges or closes.

The pull request is bb's own lookup for the thread's branch. For a thread that
is not on the branch, such as a review, it is the pull request a sweep linked
the thread to. Its checks come from `gh` instead, counted the same way, and it
cannot be merged from the banner.

## Hiding bb's banner

A content script hides bb's banner (both its cards) inside any prompt box that
also holds this one, while **Hide bb's own banner** is on. Turn it off to see
both, one above the other. The rule matches bb's banner by its accessible
labels, which are the only stable handles it has; a test checks them against
bb's source when a checkout is available.

While a thread's context loads for the first time, the banner draws a
skeleton of the same size, and bb's stays hidden under it rather than showing
and then disappearing. A thread visited earlier in the session shows its last
context straight away and refreshes it in place.

Because the rule depends on this banner being present, a thread whose banner
has not mounted, or has failed, keeps bb's.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Path to the gh CLI | `gh` | Which `gh` to run |
| Hide bb's own banner | `on` | Whether bb's prompt context banner is hidden where this one is drawn |

## For the sweeps

`bb-plugin-gh-context/links` is a bridge over bb's plugin RPC:

```ts
import { createThreadLinksBridge } from "bb-plugin-gh-context/links";

const links = createThreadLinksBridge(bb);
await links.linkThread({ threadId, repo, kind: "pull", number, source: "spawned:pr-sweep" });
const rows = await links.threadsForItems([{ repo, kind: "pull", number }]);
```

Each link records why it exists (`prompt`, `opening-line`, `via-pr`,
`spawned:<plugin>`, `adopted:<plugin>`), so a sweep can ask for the threads it
started without depending on how a prompt happened to read. The bridge throws
when gh-context is missing rather than answering empty: a sweep without its
links would offer "Start thread" on work already underway.

## Not yet

bb's banner also shows the parent thread, active child threads, an expandable
list of changed files, and a merge-base picker. This one does not yet, and bb
offers plugins no way to open its changes panel, so the changes summary is
display-only.

## Layout

| Path | What it holds |
| --- | --- |
| `context/rules.ts` | The three linking rules, as pure functions over prompt text and pull request data |
| `context/store.ts` | `thread_links` and `prompt_scan` |
| `context/gh.ts` | The only place `gh` runs, with its cache |
| `context/checks.ts` | Counts a pull request's checks from `gh`'s rollup the way bb does |
| `context/contract.ts` | The RPC contract, including the bridge's methods and Harvest's relayed ones |
| `context/hide.ts` | The content script that hides bb's banner |
| `context/harvest-item.ts` | Which issue or pull request a Harvest timer is recorded against |
| `components/context-banner.tsx` | The banner, drawn from props alone |
| `links.ts` | The bridge the sweeps import |
| `server.ts` | Assembles a thread's context, scans prompts, and serves the links |
| `app.tsx` | Loads the context and registers the banner and the content script |
| `banner.stories.tsx` | bb's banner and this one side by side, and one row per state |

## Working on it

```sh
npm install && npm run harvest:sync
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload gh-context
```

`npm run storybook` at the root of this repository renders the banner's states
beside bb's own.
