---
name: tokenomics-clear-goal
description: Use when the user invokes /tokenomics-clear-goal, or asks to clear, remove, or drop this thread's goal, such as "this thread doesn't need a goal" or "take the goal off". Takes the goal off the thread with bb tokenomics goal clear, without asking for confirmation.
---

# Clear this thread's goal

Take the goal off this thread, so it has none: the token button and the
sidebar stop showing a donut for it. The goal and what it used stay in the
thread's goal history.

```sh
bb tokenomics goal clear --reason "No longer a goal-shaped thread"
```

Give `--reason` in the user's terms when they said why; leave it out
otherwise. Don't ask for confirmation.

Then say in one line which goal was cleared, for example: "Cleared the goal
'Widget export merged'; this thread has no goal now." To set a new one later,
the user runs /tokenomics-update-goal.
