# Scan prompt

Fill in the threads and paste this into a subagent.

---

Read these bb threads and find the moments where Impromptu UI should have
run, or where the view a thread published could have been better. Do not
change anything or message any thread; only read and report.

Threads (id, title, status):

<threads>

For each thread, read its transcript:

```bash
bb thread log <id> --format minimal --all
```

Impromptu UI shows a small interface above a thread's composer with buttons
that act on what the agent found, instead of a reply the user reads and then
answers by typing. An agent publishes one with `bb impromptu-ui publish`.

Look for three kinds of moment:

- **Missed**: the agent ended a reply on something the user then had to type
  a reply to act on, and published no view for it. Examples: a numbered list
  of findings, PRs, or issues the user then picked from by number; a draft
  the user then approved or edited by typing; "Shall I go ahead?" or "A or
  B?" answered in chat; two versions to compare. A plain answer that asks
  nothing of the user is not a missed moment, and neither is a question that
  needs a long free-text answer.
- **Weaker view**: the agent published a view, but the user worked around
  it: typed what a button should have done, asked for something the view
  could not show, or ignored it and replied in chat. Or the layout did not
  suit the work, such as a card list for one yes-or-no question.
- **Broke**: a `publish` error, a view the user said did not show, or a
  button that failed.

For each moment, note which skill, if any, the agent was following when it
wrote that reply (look for a skill being loaded or named earlier in the
turn), and whether that skill's own steps told it to end in chat.

The minimal log has no times. To date a moment, list when each user message
arrived, in order, and take the time of the user message that answered it:

```bash
bb thread log <id> --json --all | jq -r '.[] | select(.type=="turn/input/accepted") | (.createdAt/1000|floor|todate)'
```

A moment is **open** when it is the thread's last reply, the thread's status
is `idle`, and the user has not answered it.

Return only JSON, no prose around it:

```json
{
  "threadsRead": 8,
  "moments": [
    {
      "threadId": "thr_…",
      "threadTitle": "…",
      "kind": "missed | weaker view | broke",
      "open": false,
      "skill": "pr-sweep or null",
      "skillSaidChat": true,
      "work": "What the agent was doing, in one general sentence",
      "at": "When the user answered it, as an ISO time; null when open",
      "agentWrote": "What the reply held, such as \"a numbered list of 6 PRs, each to approve or skip\", and its last sentence verbatim when it is short",
      "userTyped": "What the user typed next, verbatim when it is under 15 words, such as \"1, 3, 5 approve\"; null when open",
      "betterView": "The view that would have fit: layout, one card per what, which buttons",
      "cause": "Why no view or a weaker one: the skill said to list in chat, the guide does not cover this, the schema has no field for X, …"
    }
  ],
  "skipped": ["thr_… could not be read: <error>"]
}
```

Keep `agentWrote` and `userTyped` short. Quote only what the transcript
says; never write words the agent or user did not. Report every moment you
find; one thread can have several. A thread with none adds nothing to
`moments`.
