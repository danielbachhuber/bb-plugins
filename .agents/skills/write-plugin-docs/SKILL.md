---
name: write-plugin-docs
description: Use when writing or rewriting a plugin's README.md, PLUGIN_OVERVIEW.md, or bb.description in this repository, or when a plugin has no screenshots, including after a change to what a plugin does, and when a README has grown long or reads as a design document.
---

# Write plugin docs

A plugin has three texts, each for a different reader:

| Text | Reader | Length |
| --- | --- | --- |
| `bb.description` | Someone scanning the plugin list or a marketplace card | One sentence, under 140 characters |
| `PLUGIN_OVERVIEW.md` | Someone on the store page deciding whether to install | 600 to 1500 characters |
| `README.md` | Someone on GitHub who wants to see it and try it | 40 to 120 lines |

All three make the same claim at different lengths. Write `bb.description`
first, then the overview, then the README, and change all three in the same
commit.

## What does not go in any of them

Our READMEs run about 250 lines, against a marketplace median of about 100,
because they document every behavior. A README says what the plugin does
and shows it. It does not explain:

- Edge cases, states, and what happens when something fails. Those go in tests
  and code comments.
- How an agent should use the plugin. That goes in the plugin's
  `skills/<name>/SKILL.md`, which bb gives to every thread.
- Why it was built this way, or what an earlier version did.
- A file-by-file layout. The directory listing shows it.

If a paragraph begins "When…", "If…", or "Once…", it is probably one of the
above. Cut it, or move it to where it belongs.

## bb.description

State what the user gets, not how it works. One sentence. No list of every
feature joined by commas.

- Good: `Find text in the open thread, with every match highlighted in place.`
- Bad: a 90-word sentence naming eight features.

The root `README.md` table repeats it word for word.

## PLUGIN_OVERVIEW.md

The store shows `bb.description` directly above this file, so do not repeat
it. bb's marketplace build enforces these rules and rejects a file that breaks
them:

- No `#` title. Use `##` headings, which render as small uppercase labels.
- No images, tables, raw HTML, footnotes, or task lists.
- Links must be absolute `https` URLs.
- At most 4000 characters. Aim for 600 to 1500, as bb's own plugins do.

Template: [overview-template.md](overview-template.md).

## Screenshots come first

Every plugin has captures in the screenshots repository
(`../bb-plugins-screenshots/<id>/`, or wherever `BB_PLUGINS_SCREENSHOTS_DIR`
points), and the README and the marketplace entry use only those. Before you
write, list that directory and look at the images:

- If it is missing, the plugin has no stories. Write one for each surface
  the README will describe, as the Stories section of AGENTS.md says:
  split the component from its data loading, render it with invented fixture
  props, and import bb's components with `@bb-app/...`.
- If a surface the README describes has no capture, or the capture is
  clipped or does not show the point, add or fix the story. A taller stage,
  a different starting state, or a more realistic fixture usually does it.
- Commit the stories, push, and run `npm run screenshots:isolated`. Read
  every image it lists, then commit them with `screenshots:commit`, before
  you link any of them.

## README.md

Template: [readme-template.md](readme-template.md).

- When the plugin replaces something worse, such as a wall of text in chat,
  open with that problem: one screenshot without the plugin and one with it,
  showing the same content, each introduced by a sentence. The contrast
  explains the plugin faster than a list of features.
- Put a screenshot directly under the one-line description. Every README has
  at least one. Use the images the story capture already published, by URL:
  `https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/<id>/<story>.png`.
  Read the image before linking it, and describe what it shows in the alt
  text.
- Add a second or third screenshot only for a surface the first does not show,
  placed next to the bullet it illustrates. Three at most.
- `## Use` is three to seven bullets, each one thing the user does or sees,
  with UI labels in bold.
- Every README has `## Related plugins`. Search with
  `bb plugin search <keywords>`, trying several phrasings of what the plugin
  does, and list the plugins a reader would weigh against this one, including
  the ones bundled with bb. For each, say in one or two sentences what it does
  and how this plugin is similar or different. Name it by display name and
  entry id, such as **Markdown PRO** (`md-editor`), without its author or
  repository link. When nothing similar exists, say so in one line.
- Include `## For agents`, `## Settings`, and `## Requirements` only when the
  plugin has them. `## For agents` lists
  the commands, one per line, and names the skill. Requirements name every
  account, CLI, and other plugin it needs, and how many API calls it makes and
  when, in one or two sentences.
- `## Develop` is the four commands from AGENTS.md and nothing else.

## Check before you finish

- [ ] `bb.description` is one sentence under 140 characters, and the root
      README table matches it.
- [ ] The screenshots repository has a directory for the plugin, with a
      capture of every surface the README describes.
- [ ] The README is under 120 lines and opens with a screenshot you have
      looked at, and every image URL loads (`curl -sI <url>` returns 200).
- [ ] No paragraph explains an edge case, a failure, or an earlier version.
- [ ] The overview has no `#` title, image, or table, does not repeat
      `bb.description`, and is under 1500 characters
      (`wc -c PLUGIN_OVERVIEW.md`).
- [ ] Every claim matches what the plugin does now.
- [ ] Every name in the text and the screenshots is invented (`acme/widgets`,
      `octocat`), per AGENTS.md.
