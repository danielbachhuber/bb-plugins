---
name: tokenomics-update-goal
description: Use when the user invokes /tokenomics-update-goal, with or without a goal or a detail level (high or low) after it, or asks to set, change, refine, or update this thread's goal or stages (to remove it, use tokenomics-clear-goal), such as "the goal has changed", "update the goal", "the stages are out of date", "this thread is really about X now", or "set a goal for this thread". Uses the goal the user gave, or drafts one from the thread's work, and records it right away with bb tokenomics goal set or goal refine, without asking for review.
---

# Update this thread's goal

A thread's goal is what the whole thread is for, not its next step.
Tokenomics records it, shows it on the token button in the thread header,
and counts the turns, tokens, and time each goal took. This skill records
the goal straight away. Don't show a draft or ask the user to confirm it;
they can run the skill again to change it.

## 1. Read where the thread stands

```sh
bb tokenomics goal show
```

It prints the current goal, its "Done is" list and detail level, its
estimate, what it has used, and any earlier goals. "This thread has no goal yet" means you're
setting the first one.

## 2. Decide the goal

- **The user gave one** after the command, such as `/tokenomics-update-goal
  Address review feedback`: use it as the goal's subject. Phrase it as an end
  result if it isn't one ("Both review comments fixed, pushed, and answered").
- **The user gave none:** draft it from their prompts since the current goal
  was set, or since the thread began, and from the work done so far.
- **The level of detail:** `high` or `low` after the goal, or words that say
  the same, such as "high fidelity", "in detail", or "list each one" for
  high, and "low fidelity", "keep it short", or "summarise" for low. These
  words set how many entries the goal lists, not when an entry counts as
  done. Without one,
  keep the current goal's level, or use low for a first goal.

Then work out:

- **The goal:** one sentence, under 200 characters, naming the end result.
  "The widget security issues are resolved", not "Look into the findings".
- **The "Done is" list.** Each entry is an end state someone could check
  ("PR's checks pass", "H2 addressed"), never a step to do ("Research
  polling"). The last one is what ends the thread; when the user will review
  what the thread makes, it is their acceptance ("Refined on your feedback").
  - **low** (`--detail low`): up to 5 entries. When the work has more pieces,
    such as a review's 17 findings, group them by what they share and keep a
    count on each group: "Critical and high findings addressed · 4 of 6".
  - **high** (`--detail high`): up to 25 entries, each piece its own entry,
    such as one per finding. Past 25, keep the pieces that matter most as
    their own entries and group the rest with counts.
- **The shape:** a *task* has the list above. An *exploration* states the
  question to answer or the decision to make; its entries are fixed (Answer
  recommended, then You decided), so leave out `--stage`. A *project* states
  its purpose; its workers carry their own goals. *No goal* fits a
  conversation with nothing to finish.
- **Which entries are already done**, and the count on each grouped one, from the work so far.
- **An 80% estimate** of what is left: turns, tokens, and minutes. `goal show`
  prints how past threads that started the same way went; start from that.
- **Why**, when the thread already has a goal: one sentence on what changed,
  in the user's terms ("Your last prompt widened it from one option to three").

## 3. Record it

**No goal yet, or the current one is closed:**

```sh
bb tokenomics goal set "The widget security issues are resolved" --detail low \
  --stage "Critical and high findings addressed" --stage "Medium findings addressed" \
  --stage "Low findings addressed" --stage "You approved each action" \
  --turns 3-10 --tokens 5M-25M --minutes 30-120 --by you
bb tokenomics goal entry count 1 4/6   # a grouped entry's count
bb tokenomics goal entry done 3        # an entry already true
```

Add `--shape exploration` or `--shape project` for those shapes, and
`--pr <url>` when a pull request is the end result. For no goal, run
`bb tokenomics goal set --none --by you`. When the closed goal was finished
rather than dropped, it already counts; setting a new one needs no
`--reason`.

**An open goal:** refine it. Entries kept word for word keep their state and
count, and the old wording stays in the history:

```sh
bb tokenomics goal refine "The widget security issues are resolved" --detail high \
  --stage "C1 addressed" --stage "H1 addressed" ... --stage "You approved each action" \
  --turns 3-10 --tokens 5M-25M --minutes 30-120 \
  --reason "You asked for each finding listed"
```

Leave out the goal text, `--stage`, `--detail`, or an estimate flag to keep
it as it is. Pass `--reached N` when the first N of the new entries are
already done and their wording changed, then mark any others with
`goal entry done|drop N` and `goal entry count N DONE/TOTAL`. If the open
goal already fits the thread, record nothing.

## 4. Tell the user

Say in one line what the thread's goal is now, how many entries are done, its
level, and, for a change, why. For example: "Goal: the widget security issues
are resolved, 1 of 4 done (low detail)." Don't publish a card or ask a question.
