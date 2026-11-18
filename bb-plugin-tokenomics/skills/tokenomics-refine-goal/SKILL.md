---
name: tokenomics-refine-goal
description: Use when the user invokes /tokenomics-refine-goal, or asks to refine, tidy, or catch up this thread's goal or stages without reviewing a draft, such as "refine the goal", "the stages are out of date", or "update the stages to match what we're doing". Rewrites the goal and its stages to match the thread's work so far, keeping its progress and items, and records it with bb tokenomics goal refine.
---

# Refine this thread's goal

Refining brings an open goal up to date with what the thread is really
doing, without stopping to ask. It keeps the goal's progress and items, and
the old wording stays in the thread's history with what it used. To replace
a goal with a different one, or to let the user review a draft first, use
`/tokenomics-set-goal` instead.

## 1. Read the goal and the thread

```sh
bb tokenomics goal show
```

Then reread the user's prompts since the goal was set. Look for:

- **Scope that moved:** the user asked for something the goal doesn't cover,
  or dropped part of it. "Show goals in a band" became "show goals in the
  token button".
- **Stages that are steps,** not end states: "Fix the test" should be
  "Tests pass".
- **A last stage that doesn't end the thread:** "PR description drafted"
  should be "PR open with checks passing". Work the user reviews ends with
  their acceptance, "Refined on your feedback".
- **Stages already true but not marked,** or marked but no longer true.
- **An estimate the thread has outgrown.** Re-estimate what is left from
  here, not the whole goal again.
- **A list longer than five stages,** such as a review's findings. Move it to
  items with `bb tokenomics goal item add` and keep the stages for the end
  states.

If nothing needs to change, say so in one line and stop.

## 2. Record it

```sh
bb tokenomics goal refine "Goal shown in the token button and its summary" \
  --stage "Designs picked" --stage "Built and verified in bb" \
  --stage "Refined on your feedback" \
  --turns 2-6 --tokens 10M-40M --minutes 15-60 \
  --reason "Moved from a band above the conversation to the token button"
```

- Leave out the goal text, `--stage`, or an estimate flag to keep it as is.
- Stages kept word for word from the old goal keep their progress. Pass
  `--reached N` when the first N of the new stages are already true and the
  wording changed.
- `--reason` is required: one sentence on what changed, in the user's terms.
- Keep to the rules for stages: 1 to 4, 5 at most, each an end state someone
  could check. An exploration keeps its fixed stages, so leave out `--stage`.

## 3. Tell the user

Say in one line what changed and why, for example: "Refined the goal: the
stages now end at the token button instead of the band, 1 of 3 done." Add
that `/tokenomics-set-goal` replaces it if they had something else in mind.
