# Outline

## Structure

1. Title: PLUGINS PLUGINS PLUGINS. Subtitle: All I do is bb. October 15, 2026.
2. Who am I: I'm Daniel. I used to be a prolific WordPress plugin author. Then
   I lost interest in writing plugins, and didn't work on any for years.
3. Now I'm a prolific bb plugin author: 21 plugins and counting, since my first
   bb thread on August 26, 2026. I love bb.
4. Wait, what is bb? A visual and a short explanation.
5. **Interactive, roundtable:** what do you use to work with your LLM, and have
   you modified it? Anyone can weigh in.
6. Section title: let me talk you through some of the plugins I've created.
7. One section per plugin, with the three Sweeps as one section. Each section: problem, idea,
   demo, **"Your grade?"** (interactive), my grade. Slides are numbered in
   blocks of ten, one block per section.
   - Impromptu UI (10-16), first, so the later sections can show it in use.
     **Guess the fix** (interactive) after the problem slide, then the three
     before-and-afters, then the film strip: the agent builds a few directions
     and I pick one. Each later section with a **pick one** round reuses it.
   - Thread Overview (20-23), the dud
   - Sweeps (30s): Issue Sweep, PR Sweep, and Review Sweep, as one group.
     They're the same list on three screens: issues, pull requests, and
     reviews. **Pick one** (36-37): how a stack of pull requests shows in
     Review Sweep. I picked C, Chip only.
   - Super Diff (40s). **Pick one** (43-44): how a fully reviewed concern
     looks. I picked D, Progress ring.
   - Now (50s)
   - Tokenomics (60s). **Pick one** (63-64): which icon. I picked B, Coin
     stack.

   **Pick one** rounds: show the options, let people talk through which they'd
   pick and why, then show mine.
8. Tips and tricks (see below). **Interactive:** before each tip, ask "who
   already does this?"
9. Closing: check out my plugins, and how each one looks.
   - Plugins: https://github.com/danielbachhuber/bb-plugins
   - Screenshots of every story: https://github.com/danielbachhuber/bb-plugins-screenshots

## Tips and tricks

Candidates, from how this repository works. Pick four to six.

- See something wonky, open a thread to fix it right away. (Con: you lose your
  train of thought.)
- Ask the agent for several mockups and pick one, instead of describing the
  design up front.
- Have the agent show results as cards, not paragraphs (Impromptu UI).
- Render stories with bb's real stylesheet, so you see a change without
  reloading bb.
- Use bb's own components before building your own. A hand-built copy looks
  different and gets replaced.
- Verify against live data, not just tests. Every real bug passed its tests.
- Time the real page with real data. A story with three fixture rows hides
  the 8.5-second page.
- Keep a shared component library, so two plugins don't each grow a copy.
- Photograph every story into a separate, anonymized screenshots repo.
- Anything personal is a setting, never a constant.
- Several agents in one checkout: stage files by name, never `git add -A`.
- Build and reload after every commit; bb runs the plugin's `dist/`, not its
  source.


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
