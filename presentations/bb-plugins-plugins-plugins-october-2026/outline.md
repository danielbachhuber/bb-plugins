# Outline

## Structure

Every plugin section follows Super Diff's shape: **Problem** (one line, one
screenshot), **New plugin** (what it is), **Behold** (the plugin itself, full
width), **Grade**. Slides marked *draft* need the problem or grade in my own
words. ✓ means the slide exists.

### Opening (01-06)

- 01 ✓ PLUGINS PLUGINS PLUGINS. Subtitle: All I do is bb. October 15, 2026.
- 02 Who am I: I'm Daniel. I used to be a prolific WordPress plugin author.
  Then I lost interest, and didn't write a plugin for years.
- 03 Now I'm a prolific bb plugin author: 21 plugins since my first bb thread
  on August 26, 2026. I love bb.
- 04 Wait, what is bb? A screenshot of bb with a thread, its chat, and a
  plugin panel open, and one sentence on what it is.
- 05 ✓ **Roundtable:** what do you use to work with your LLM? Have you changed
  it to fit how you work?
- 06 Let me talk you through some of the plugins I've created.

### Impromptu UI (10-15)

- 10 ✓ Problem: walls of text. The 13-issue triage, written
  out in chat.
- 11 ✓ New plugin: Impromptu UI. Results as rows above the composer, each
  with its details, a draft I can edit, and buttons.
- 12 ✓ Behold: a Dependabot assessment, before and after.
- 13 ✓ Behold: triaging a 13-issue milestone, before and after.
- 14 ✓ Behold: pick one. The film strip: the agent builds a few directions
  and I pick. Sets up the pick-one rounds later in the talk.
- 15 ✓ Grade: B-

The doc audit is set aside in `unused/`.

### Thread Overview (20-23)

- 20 ✓ Problem: I can't tell what a thread is doing.
- 21 ✓ New plugin: Thread Overview. The agent keeps a summary and steps up to
  date, in a band under the thread header.
- 22 ✓ Behold: the band, expanded.
- 23 ✓ Grade: D. I never look at it.

### Sweeps (30-36)

- 30 ✓ Problem: GitHub is slow. Clicking a GitHub link or bookmark to see my
  issues, pull requests, or reviews means waiting on every page. Text only.
- 31 ✓ New plugin: Issue Sweep. Three plugins that act as one; first, the
  issues assigned to me. Screenshot of the list.
- 32 ✓ New plugin: Review Sweep. The pull requests waiting on my review.
  Screenshot of the list.
- 33 ✓ New plugin: PR Sweep. The pull requests I wrote. Screenshot of the list.
- 34-35 ✓ **Pick one:** how a stack of pull requests shows in Review Sweep.
  I picked C, Chip only.
- 36 ✓ Grade: A-. Works really well; it's delightful to use.

### Super Diff (40-43) ✓

- 40 Problem: large diffs are hard to grok.
- 41 New plugin: Super Diff.
- 42 Behold: Super Diff.
- 43 Grade: C.

### Now (50-55)

- 50 Problem: I spend all day in bb, and forget to look at Todoist and Gmail.
- 51 New plugin: Now. The Now page with an email open beside the list; I talk
  through what it does.
- 52 Knows what's done on GitHub: Archive says "it's merged" or "it's closed".
- 53 The pull request on every row: the pull request's state, reviewers, and a
  merge button under each GitHub row.
- 54 Smart contextual filters: pressing a group of squares filters the list
  to it.
- 55 Grade: A

### Tokenomics (60-65)

- 60 Problem: I accidentally blew through my tokens, and spent a lot of time
  without knowing where it went.
- 61 New plugin: Tokenomics. Token use over the day, three days, or week,
  where turn time went, each thread's share, and a meter when a thread's
  context passes a size I set.
- 62 Behold: the Tokenomics page.
- 63-64 ✓ **Pick one:** which icon. I picked B, Coin stack.
- 65 Grade: C-. It shows me the outliers in token use well, but I haven't
  solved tying threads to business value, or the time-spent part.

### Three tips for working with bb plugins (70-73)

- 70 Three tips for working with bb plugins. **Interactive:** before each tip,
  "who already does this?"
- 71 ✓ Tip 1: iterate on live data. Every real bug here passed its tests; four
  bugs found on the live page.
- 72 ✓ Tip 2: ask for mockups, from live data or every permutation of it. 249
  options across 9 plugins.
- 73 ✓ Tip 3: a component library. 7 components shared by 11 plugins.

The other tips (fix it right away, cards, the 8.5-second page, settings) are
set aside in `unused/`.

### Closing (90)

- 90 Check out my plugins, and how each one looks:
  - https://github.com/danielbachhuber/bb-plugins
  - https://github.com/danielbachhuber/bb-plugins-screenshots

## Plugin sections

Each plugin gets the same slides, numbered in a block of ten (10s for the
first section, 20s for the second, and so on):

1. The problem: what I ran into, as it happened.
2. The idea: what I set out to build to fix it.
3. The demo: screenshots of the plugin doing that.
4. The grade: a letter grade on how well it turned out, and why.

Every plugin, grouped by the job it does. Starred ones already come up in the
Ideas below.

- Seeing what needs me
  - Now
  - PR Sweep
  - Review Sweep *
  - Issue Sweep
- Reviewing code
  - Super Diff *
  - Diff Comment *
  - Diff Viewed
- Understanding a thread
  - Thread Overview *
  - Tokenomics *
  - GitHub Context
- Letting the agent show me things
  - Impromptu UI *
  - Presentations (this deck)
- Plugins about plugins
  - Plugin Shelf
  - Hacks
- Writing
  - Markdown Editor
  - New Issue
  - Weekly Review

## Ideas

- Just try it. Some things you create might be super useful, and others might be duds.
  - Dud: Thread Overview.
    - The problem: when I load a thread, I want to see what it is, what it is trying to accomplish, and which stage it is at, out of three to seven milestones.
    - First try: thread tasks, in a panel. I never looked at it.
    - Second try: a drawer under the thread header. I still never look at it or interact with it.
  - Not quite there: Diff Comments.
- See something wonky, immediately open a thread to fix it.
  - Pro: it gets fixed right away.
  - Con: you lose your chain of thought as you switch context.
- A design library for common components and patterns.
- An anonymized screenshots repo.
- I publish a plugin when I feel it's stable: it works well to solve the problem I'm experiencing. I don't publish plugins I'm still iterating on, or ones closely coupled to my workflow.
- I wish there were a better way to publish artifacts of how a plugin works, so I don't have to install someone else's code but can steal their ideas instead.
- The ergonomics of making a plugin are what make all of this possible. Changing bb feels like changing any other codebase.
  - Describe the change in a thread, and the agent writes the plugin.
  - `bb plugin build . && bb plugin reload <id>` and it's live, no restart.
  - The SDK exports bb's own components, so a plugin looks and works like the rest of bb.
  - Stories render with bb's real stylesheet, so you can see a change without reloading bb.
- Interactive: show a few of the mockups an agent made for one plugin, which I then picked from in Impromptu UI. Ask the audience which they would pick, and why.
  - Review Sweep, stacked pull requests: five options (rail, group card, chip only, folded stack, indented tree). I picked the chip, the simplest one.
  - Tokenomics, the context size warning: I turned down every option, then asked for the orange warning style the Now page already uses.
  - Super Diff, showing that every change is there: several rounds, where the mockups got the details wrong (files instead of hunks) and I had to ask how the pick would scale to 100+ files.
- Building plugins in bb, you can work against live data, and you can also ask bb to consider many different permutations of data.
