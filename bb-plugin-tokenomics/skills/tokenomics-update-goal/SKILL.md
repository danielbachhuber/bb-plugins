---
name: tokenomics-update-goal
description: Use when the user invokes /tokenomics-update-goal, with or without a goal or a detail level (high or low) after it, or asks to set, change, refine, or update this thread's goal or stages, or to reassess where the thread stands on its goal (to remove it, use tokenomics-clear-goal), such as "where are we on the goal", "check your progress against the goal", "the goal has changed", "update the goal", "the stages are out of date", "this thread is really about X now", or "set a goal for this thread". Uses the goal the user gave, or drafts one from the thread's work, and records it right away with bb tokenomics goal set or goal refine, without asking for review.
---

# Update this thread's goal

A thread's goal is what the whole thread is for, not its next step.
Tokenomics records it, shows it on the token button in the thread header,
and counts the turns, tokens, and time each goal took. This skill records
the goal straight away. Don't show a draft or ask the user to confirm it;
they can run the skill again to change it. The one question it asks is in
step 3, when it can't tell whether unfinished work still belongs to the goal.

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

## 3. Replace the goal or refine it

When the thread already has an open goal, decide whether the new one
replaces it or refines it. Work it out from the old goal's entries and the
user's words:

- **Replace** when the user names a different end result, not more of the
  same one. "Tracking spreadsheet built" followed by "All accessibility
  issues are addressed" is a new end result, even though the spreadsheet
  helps with it. Close the old goal with `goal close met` (or `partly` when
  some of it is unfinished and no longer wanted) and `goal set` the new one.
  The closed goal keeps what it used in the history, and the new one starts
  from its own entries, not from work that came before it.
- **Refine** when the end result is the same and only the list changes:
  the user adds to it ("also add tests"), asks for a finer or coarser list
  ("list each finding"), or the work turned out bigger or smaller.
- **Each old entry, when refining:** keep it only if it must still be true
  when the new goal is met, and someone could check it then. "Checks
  finished" stays under "nothing left from the sweep"; a finished step the
  new goal no longer needs goes.

Ask only when unfinished work is at stake: the old goal has entries that are
not done, and the user's words don't say whether that work still belongs
(it is neither part of the new end result nor clearly dropped). Then ask one
question naming those entries, such as "Keep 'Export button added' (not
done) in the new goal, or drop it?", with buttons for keep and drop, above
the composer with Impromptu UI when it is available. Record the rest of the
goal first, and change those entries once the user answers. Finished entries
never need a question: they belong to the old goal.

## 4. Record it

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
goal already fits the thread, keep it and bring its progress up to date
instead, as below.

**Bring progress up to date.** Whether or not the goal changed, check each
entry against the work so far and mark what moved: `goal entry done N` for
one that is now true, `goal entry start N` for the one being worked on,
`goal entry drop N` for one no longer needed, and `goal entry count N
DONE/TOTAL` for a grouped one. Mark an entry done only when its end state is
actually true, not when work on it has started.

## 5. Tell the user

Say in one line what the thread's goal is now, how many entries are done, its
level, which entries moved, and, for a change to the goal, why and whether it
replaced the old goal or refined it. For example: "Goal: the widget security issues
are resolved, 1 of 4 done (low detail)." Don't publish a card or ask a
question, apart from the one in step 3.
