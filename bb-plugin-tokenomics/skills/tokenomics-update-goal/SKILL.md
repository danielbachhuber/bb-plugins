---
name: tokenomics-update-goal
description: Use when the user invokes /tokenomics-update-goal, with or without a goal after it, or asks to set, change, refine, or update this thread's goal or stages (to remove it, use tokenomics-clear-goal), such as "the goal has changed", "update the goal", "the stages are out of date", "this thread is really about X now", or "set a goal for this thread". Uses the goal the user gave, or drafts one from the thread's work, and records it right away with bb tokenomics goal set or goal refine, without asking for review.
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

It prints the current goal, its stages and items, its estimate, what it has
used, and any earlier goals. "This thread has no goal yet" means you're
setting the first one.

## 2. Decide the goal

- **The user gave one** after the command, such as `/tokenomics-update-goal
  Address review feedback`: use it as the goal's subject. Phrase it as an end
  result if it isn't one ("Both review comments fixed, pushed, and answered").
- **The user gave none:** draft it from their prompts since the current goal
  was set, or since the thread began, and from the work done so far.

Then work out:

- **The goal:** one sentence, under 200 characters, naming the end result.
  "Widget sync decision recorded in an ADR and merged", not "Look into sync
  options".
- **The shape:**
  - A *task* has 1 to 4 stages, 5 at most. Each stage is an end state someone
    could check ("Alternatives compared", "PR's checks pass", "Merged"),
    never a step to do ("Research polling"). The last stage is what ends the
    thread. When the user will review what the thread makes, such as a
    design, a UI, or a draft, the last stage is their acceptance ("Refined on
    your feedback").
  - A list of similar things to work through, such as a review's findings,
    goes in the goal's items (`bb tokenomics goal item add "…"`), which have
    no limit, rather than in more stages.
  - An *exploration* states the question to answer or the decision to make.
    Its stages are fixed (Answer recommended, then You decided), so leave out
    `--stage`.
  - A *project* states its purpose; its workers carry their own goals.
  - *No goal* fits a conversation with nothing to finish.
- **Which stages are already true** from the work so far.
- **An 80% estimate** of what is left: turns, tokens, and minutes. `goal show`
  prints how past threads that started the same way went; start from that.
- **Why**, when the thread already has a goal: one sentence on what changed,
  in the user's terms ("Your last prompt widened it from one option to three").

## 3. Record it

**No goal yet, or the current one is closed:**

```sh
bb tokenomics goal set "Both review comments fixed, pushed, and answered" \
  --stage "First comment fixed" --stage "Second comment fixed" \
  --stage "Pushed with checks passing" --stage "Replies posted" \
  --turns 2-5 --tokens 5M-20M --minutes 15-45 --by you
bb tokenomics goal stage 1   # when the first stage is already true
```

Add `--shape exploration` or `--shape project` for those shapes, and
`--pr <url>` when a pull request is the end result. For no goal, run
`bb tokenomics goal set --none --by you`. When the closed goal was finished
rather than dropped, it already counts; setting a new one needs no
`--reason`.

**An open goal:** refine it, which keeps the progress of stages you keep word
for word, and its items, and leaves the old wording in the history:

```sh
bb tokenomics goal refine "Widget sync decision recorded in an ADR and merged" \
  --stage "Alternatives compared" --stage "Recommendation checked" \
  --stage "Review answered" --stage "Merged" \
  --turns 2-6 --tokens 10M-40M --minutes 15-60 \
  --reason "Widened from one option to three"
```

Leave out the goal text, `--stage`, or an estimate flag to keep it as it is.
Pass `--reached N` when the first N of the new stages are already true and
their wording changed. If the open goal already fits the thread, record
nothing.

## 4. Tell the user

Say in one line what the thread's goal is now, how many stages are done, and,
for a change, why. For example: "Goal: both review comments fixed, pushed,
and answered, 1 of 4 done." Don't publish a card or ask a question.
