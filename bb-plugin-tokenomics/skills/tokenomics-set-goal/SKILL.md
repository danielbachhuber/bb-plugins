---
name: tokenomics-set-goal
description: Use when the user invokes /tokenomics-set-goal, or asks to set, change, revise, or replace this thread's goal, such as "the goal has changed", "update the goal", "this thread is really about X now", or "set a goal for this thread". Drafts the thread's goal from what the user has asked for, shows it above the composer to revise or keep, and records it with bb tokenomics goal set.
---

# Set or revise this thread's goal

A thread's goal is what the whole thread is for, not its next step. Tokenomics
records it, shows it in a band above the conversation, and counts the turns, tokens, and
time each goal took. This skill sets the first goal, or replaces one the
thread has moved past.

## 1. Read where the thread stands

```sh
bb tokenomics goal show
```

It prints the current goal, its stages, its estimate, what it has used, and
any earlier goals. "This thread has no goal yet" means you're setting the
first one.

## 2. Draft the goal

Read the user's prompts since the current goal was set (or since the thread
began) and draft:

- **The goal:** one sentence, under 200 characters, naming the end result.
  "Widget sync decision recorded in an ADR and merged", not "Look into sync options".
- **The shape:**
  - A *task* has 1 to 4 stages, 5 at most. Each stage is an end state someone
    could check ("Alternatives compared", "PR's checks pass", "Merged"),
    never a step to do ("Research polling"). If it needs more than 5, the
    thread should split or become a project: say so instead of listing more.
  - When the user will review what the thread makes, such as a design, a UI,
    or a draft, the last stage is their acceptance ("Refined on your
    feedback"), not "Built".
  - An *exploration* states the question to answer or the decision to make.
    Its stages are fixed (Answer recommended, then You decided), so leave out
    `--stage`.
  - A *project* states its purpose; its workers carry their own goals.
  - *No goal* fits a conversation with nothing to finish.
- **An 80% estimate** of the whole goal from here: turns, tokens, and
  minutes. `goal show` prints how past threads that started the same way
  went; start from that.
- **Why**, for a revision: one sentence on what changed, in the user's terms
  ("Your last prompt widened it from one option to three").

## 3. Show it above the composer

Publish one inline Impromptu UI card, so the user answers with a click:

```sh
cat > /tmp/goal-view.json <<'JSON'
{
  "title": "Revise the goal",
  "layout": "inline",
  "sections": [{ "items": [{
    "id": "goal",
    "title": "From \"Webhook sync ADR merged\" to \"Widget sync decision recorded in an ADR and merged, comparing three options\". 4 stages: alternatives compared, recommendation checked, review answered, merged. About 4–8 turns. Why: your last prompt widened it from one option to three.",
    "actions": [
      { "type": "message", "label": "Revise", "primary": true, "text": "Revise the goal." },
      { "type": "message", "label": "Keep the old goal", "text": "Keep the old goal." }
    ]
  }] }]
}
JSON
bb impromptu-ui publish --key tokenomics-goal --file /tmp/goal-view.json
```

For a first goal, title the card "Goal for this thread", start the item with
"Done when: …", and label the buttons "Set goal" and "No goal". When
Impromptu UI isn't installed, ask the same question in one short message.

Then end the turn and wait.

## 4. Record the answer

On "Revise" or "Set goal", record it. A thread with an open goal needs
`--reason`; the old goal stays in the thread's history with what it used.

```sh
bb tokenomics goal set "Widget sync decision recorded in an ADR and merged, comparing three options" \
  --stage "Alternatives compared" --stage "Recommendation checked" \
  --stage "Review answered" --stage "Merged" \
  --turns 4-8 --tokens 10M-40M --minutes 30-120 \
  --by you --reason "Widened from one option to three"
```

Add `--shape exploration` or `--shape project` for those shapes, and
`--pr <url>` when a pull request is the end result. For "No goal", run
`bb tokenomics goal set --none --by you --reason "No goal"`.

When the old goal was finished rather than replaced, close it first, so its
outcome counts: `bb tokenomics goal close met --note "…"`. A closed goal needs
no `--reason` to be followed by a new one.

On "Keep the old goal", record nothing.

Either way, publish the card again under the same key with the item marked
complete, then tell the user in one line what the thread's goal is now.
