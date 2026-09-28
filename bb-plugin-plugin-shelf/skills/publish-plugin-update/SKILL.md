---
name: publish-plugin-update
description: Use when publishing, releasing, tagging, or shipping a new version of a bb plugin that is already listed in the bb-community marketplace from a git repository, including when Plugin Shelf's Publish update button started the thread.
---

# Publish a plugin update

A marketplace entry with a git source tracks a semver `range` of tags named
`<tagPrefix>vX.Y.Z`. Installed copies update to the newest tag in that range.
So **pushing a tag inside the range is the release**. A marketplace pull
request is needed only when the entry itself has to change.

## 1. Read the plugin's state

Plugin Shelf reports it. From the checkout:

```sh
BASE=$(node -p "require(process.env.HOME+'/.bb/bb-app-runtime.json').serverUrl")
curl -s -X POST -H "content-type: application/json" -H "origin: $BASE" \
  -d '{"refresh":true}' "$BASE/api/v1/plugins/plugin-shelf/rpc/shelf_list"
```

Find the row whose `id` is the plugin. It gives you:
- `dir`
- `version` (package.json)
- `latestTag`
- `entryId`
- `commits` (unreleased, each marked `docsOnly`)
- `flags`

Stop and say so if `entryId` is null, because the plugin is not published. Also
stop if `group` is `current` and there is no `version-mismatch` flag, because
there is nothing to release.

Then read the entry's `range` and `tagPrefix` from
`https://raw.githubusercontent.com/get-bb/marketplace/main/entries/<entryId>.json`.

## 2. Check the checkout

The release commit goes on `main`. Before you change anything:

```sh
git switch main && git fetch origin
git status --short -- <dir>     # must be empty
git log --oneline origin/main..main  # must be empty: no unpushed commits
git log --oneline main..origin/main  # must be empty, or pull first
```

If any of these fail, stop and report. A release made from a dirty or diverged
checkout ships something other than what the commit list says.

## 3. Choose the version

List the unreleased commits for the user, marking the docs-only ones.

| Situation | Version |
| --- | --- |
| `version-mismatch` flag: package.json was bumped and never tagged | Tag the existing package.json version. Skip the bump. |
| The next patch fits the range | The next patch, such as 0.1.1 → 0.1.2 |
| The user wants a minor or major release | That version, which needs a marketplace PR to widen the range |

A caret range on a `0.x` version stops at the next minor: `^0.1.0` allows
0.1.x and not 0.2.0. A tag outside the range is invisible to installed copies
until the marketplace entry's range changes. Propose the patch, name the
minor as the alternative with that cost, and **wait for the user to choose.**

## 4. Build, bump, commit, tag

```sh
cd <dir>
npm install && npx tsc --noEmit -p tsconfig.json && npm test && bb plugin build .
npm version <version> --no-git-tag-version
cd ..
git add <dir>/package.json <dir>/package-lock.json
git commit -m "Release <id> v<version>"
git tag -a <tagPrefix>v<version> -m "Release <id> v<version>"
```

If the repository's AGENTS.md or CLAUDE.md has steps to run after a commit,
such as capturing screenshots, run them too.

## 5. Push, only after approval

Show the user the exact command and wait for a yes. The push is the release:

```sh
git push origin main <tagPrefix>v<version>
```

Then confirm the release is visible:

```sh
git ls-remote --tags origin <tagPrefix>v<version>   # prints one line
```

Run the `shelf_list` call from step 1 again. The plugin's row should now be
in group `current`, with `latestTag` set to the new tag. If `latestTag` still
names the old tag, the new one is outside the entry's range.

## 6. Does the entry need a pull request?

Compare the entry with the plugin as released:

- `range`: does it include the new version?
- `description`: does it still describe what the plugin does? Compare it with
  `bb.description` and the unreleased commits.
- the overview (`overview/<entryId>.md` in the marketplace): compare it with
  `<dir>/PLUGIN_OVERVIEW.md`
- `screenshots`: do they still show the plugin as it now looks?

If everything still holds, no pull request is needed. Otherwise, use the
`submit-a-plugin` skill for the marketplace pull request. Change only the
fields that are out of date. Follow the user's own instructions for drafting
pull request text, and post nothing until they confirm.

## 7. Report

Report:
- the tag
- the release commit's full SHA (`git rev-parse HEAD`)
- a one-line changelog built from the commit subjects
- the `latestTag` Plugin Shelf now reports
- whether a marketplace pull request is needed, and why

## Common mistakes

| Mistake | Result |
| --- | --- |
| Bumping 0.1.x to 0.2.0 without widening the range | Tag pushed, and no installed copy ever sees it |
| Tagging a branch that is not `main` | The release has commits that `main` does not |
| Pushing the tag and not the commit | The tag points at a commit GitHub does not have |
| Opening a marketplace PR for a patch in range | Unneeded review work for the marketplace maintainers |
| Pushing before the user says yes | A release they did not choose |
