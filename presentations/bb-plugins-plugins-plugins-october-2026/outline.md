# Outline

## Ideas

- Just try it. Some things you create might be super useful, and others might be duds.
  - Dud: Thread Overview.
    - The problem: when I load a thread, I want to see what it is, what it is trying to accomplish, and which stage it is at, out of three to seven milestones.
    - First try: thread tasks, in a panel. I never looked at it.
    - Second try: a drawer under the thread header. I still never look at it or interact with it.
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
