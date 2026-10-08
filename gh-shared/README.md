# @danielb/gh-shared

The code the GitHub plugins genuinely share. Consumed as a local `file:`
dependency, so each plugin stays a separate plugin with its own identity,
settings, database and panel header icon.

## What is in here, and why only this

The four plugins were merged into one and then split apart again. Measuring
the overlap afterwards showed how little of it was real. Between `pr-sweep`
and `review-sweep`:

| File | Differing lines |
| --- | --- |
| `spawn-target.ts` | 0 |
| `store.ts` | 109 |
| `gh.ts` | 170 |
| `classify.ts` | 247 |

So this package holds the parts that were byte-identical across every plugin,
and nothing else:

- **`gh`** — `createGhRunner`, `GhUnavailableError`, `REPO_SLUG_PATTERN`,
  `readGitRemoteUrls`. The one place any plugin spawns a process, and the slug
  validation that keeps a repository name from reaching a shell. Each plugin keeps its own fetching:
  pull requests fan out per repository, reviews run one GraphQL search, issues
  run a different one.
- **`stacks`**, served from the `gh` path — `fetchStacks`, one GraphQL call
  reading every open pull request in the swept repositories, and the pure
  `stackPositions`, which places each in its stack of pull requests built on
  each other's branches. PR Sweep and Review Sweep both draw the result as a
  chip. It is re-exported from `gh` rather than given a subpath of its own
  because bb caches a package's exports map for as long as its server runs.
- **`projects`** — matching a repository to a bb project by its git remotes,
  and `buildRepoFilter`, which turns that matching into the sweep scope.
  `toProjectCandidates` reads every remote out of a project's checkout rather
  than trusting the single `gitRemoteUrl` bb recorded, which is the fork on a
  fork-and-upstream checkout and so never matches the repository the pull
  requests are against. bb's
  project list is per-installation, so "has a project here" is what separates
  the computer a repository is checked out on from every other one. Each plugin
  applies the filter where its own fetching allows: pr-sweep and issue-sweep
  before the per-repository fan-out, review-sweep to the rows of its single
  search.
- **`bots`** and **`feedback`**, both served from the `gh` path for the same
  reason as `stacks`. `isBotLogin` matches the logins whose comments are not a
  question waiting on anyone. `fetchFeedback` reads what people left on one
  pull request in one GraphQL call: reviews, inline threads, and general
  comments, in reading order, bots left out. PR Sweep leaves your own out too,
  since on your own pull request they are not feedback for you; Review Sweep
  passes `includeViewer`, since on one you are reviewing they are half the
  conversation. Both draw the result with `sweep-ui/feedback`.

Deliberately **not** here: the classifiers, the row types, or the stores. They
look alike and encode different rules; sharing them would couple things that
have already drifted apart once.

## Using it

```json
{ "dependencies": { "@danielb/gh-shared": "file:../gh-shared" } }
```

The code is bundled into each plugin at build time, not resolved at runtime.
So a change here reaches a plugin only when that plugin is rebuilt:

```sh
cd ~/.dotfiles/bb/plugins
for p in bb-plugin-pr-sweep bb-plugin-review-sweep bb-plugin-issue-sweep; do
  (cd $p && npm install && bb plugin build . && bb plugin reload ${p#bb-plugin-})
done
```

Until then the plugins run different vintages of this library, which is the
main cost of sharing it this way.
