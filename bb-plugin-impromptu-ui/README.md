# Impromptu UI

Turns your agent's walls of text into interfaces you can click.

![Before: three finished fixes written out in chat, one paragraph each, ending in "Which should I open?" After: the same three as rows above the composer, one already opened as a pull request, and the demo accounts fix open in the side panel with its diff and Commit, push, and open PR and Revise buttons](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--three-prs-at-once.png)

With Impromptu UI, you can:

- **Triage your milestone** without getting lost in paragraphs of feedback. Each recommendation becomes a row with a drafted comment and **Post and close**, **Post**, and **Start thread**.

  ![Thirteen issues above the composer, grouped under Close and Keep open with a question, with #429 open in the side panel: a Close: completed badge, the comment to post, and Post and close and Post buttons](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--milestone-triage-item-open.png)

- **Create three PRs at once** without juggling threads. Each fix waits on its own card, with its diff and PR description, until you click **Commit, push, and open PR**.
- **Answer "Should I go ahead?" in one click.** The agent's question sits above the composer with its answers as buttons, and a field for something else. Your answer turns into a green banner.

  ![A question above the composer, "How should I fix the snapshot check?", with Update, commit, and push, Update but don't push, and Show me the diff first buttons, and a Something else field under them](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--inline-question.png)

- **Find the design you want** by reacting to variations instead of describing it up front. Pick one from a film strip, or leave notes for the next round.

  ![A visual review of task rows open in the side panel: Original, A, and B in a film strip, B picked with a note to keep the overdue date red, and a Send feedback button](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--visual-review-filled-in.png)

## Use

- The agent publishes what it wants you to act on as numbered rows above the composer, grouped under headings.
- Click a row to open its card in the side panel: the summary, any diff, a draft you can edit, and the buttons that act on it. Every card also has **Start thread** and **Dismiss**.
- A card that suggests a change, such as a fix with **Apply** and **Skip**, always has a **Revise** field too. Type what to change and press Enter, and the agent sends back a new suggestion. If the agent leaves it out, `publish` adds it.
- Done and dismissed rows sink to the bottom, and the agent reads back what you did.
- A view with the `inline` layout asks one to three questions instead. Click an answer, or type your own and press Enter, without opening the side panel.
  An inline view that holds something only cards can show, such as a status, a draft, or a single button, is published as cards, and `publish` prints a warning naming the field.
- A last step that depends on the rest, such as a code review's verdict, waits under the rows as a **Then** row until everything above it is handled.

## For agents

Every thread's instructions get a short section telling the agent to build a view whenever you would otherwise read its output and type a reply to act on it, shaped to its own task. The section doesn't list what a view can hold. It points to `bb impromptu-ui schema`, which prints the view file's JSON Schema from the code, so new fields reach agents without anyone editing the instructions. The `impromptu-ui` skill shows how to put a view together. Turn it off with the `threadInstructions` setting.

```sh
bb impromptu-ui publish --file <view.json> [--key <name>] [--replaces <key> ...]   # show or replace a view
bb impromptu-ui state [--key <name>]                        # read what the user did
bb impromptu-ui hide [--key <name>]                         # hide a view
bb impromptu-ui clear-resolved [--key <name>]               # take done and dismissed cards out
bb impromptu-ui list                                        # list this thread's views
bb impromptu-ui schema                                      # print everything a view can hold
```

Each command except `schema` works only inside a bb thread.

### Answered and archived cards

A card you answered or dismissed leaves the composer 10 minutes later, and a view goes once all of its cards have. Cards nobody has answered stay. The view's side panel still shows every card, and `state` still reports them. A card the agent marks complete counts from the publish that marked it. If the agent marks a card complete before you pressed any of its buttons, `publish` warns it to reopen the card unless you answered in chat. Set the wait with `autoClearMinutes`. Nothing is deleted and no API calls are made: the cards above the composer are filtered as they load, and they look again when the next card is due to go.

When you archive a view that still has an open question, it comes back when the agent's turn ends, so the agent's closing message never points at a question you can't see. To put away a question for good, dismiss its card. A view the agent hid with `bb impromptu-ui hide` stays hidden. While a view is archived, `state` says so, and every `publish` lists the thread's archived views that still have open cards.

An agent sometimes asks the same question again under a new key, or does the work an earlier question asked about, and the earlier question would stay above the composer unanswered. So every `publish` also lists the thread's other views still above the composer with open cards. The agent takes the ones it replaced down by publishing with `--replaces <key>`, which hides each named view once the new one is up, as `hide` does. A key the thread has no view under stops the publish.

### Clear resolved cards

Type `/clear-resolved-cards` in a thread, and the `clear-resolved-cards` skill runs `bb impromptu-ui clear-resolved`. Every card you already acted on or dismissed leaves that thread's views, and a view with nothing open left is hidden. A code review whose verdict is still open keeps its findings, since the verdict counts them. It reads and writes only the plugin's database, with no API calls.

### Refine Impromptu UI

The `refine-impromptu-ui` skill finds the moments a view should have appeared, or a better one would have helped, and turns each into a fix. Start it one of three ways:

- **Mid-thread**, when a view fell short or never appeared. It shows the missing view if you still need it, then starts a new thread for the fix, so the refinement stays out of your work.
- **On one thread.** It offers two to four ways to change Impromptu UI, each with what it costs, and edits nothing until you press **Do this one**. It then shows the edit as a diff, with **Commit and push**.
- **As a scan** of the threads active in the last 2 days, or a range you name. A subagent reads each batch of threads. Threads still waiting on an answer get **Show it there**, which asks that thread to publish its view. The rest become cards under **Ways to fix it**, each with what goes wrong, a real example, how many threads showed it, and the exact edit. ([See a scan](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--refine-scan-item-open.png).)

Each fix lands in one of three places: the skill that should have published, the `impromptu-ui` guide, or an anonymized issue on this repository, drafted for you to confirm before it is filed. A change to the instructions every thread gets is tested with the evals below first: the missed moment becomes a case, the real transcript is replayed when there is one, and the card shows the pass rates before and after.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `providerId` | `claude-code` | Provider for threads a button starts. |
| `threadInstructions` | `true` | Tell every thread when to publish a view. |
| `autoClearMinutes` | `10` | Minutes after you answer or dismiss a card before it leaves the cards above the composer. `0` keeps them on screen. |
| `keepArchivedDays` | `30` | Days to keep a view after its threads are archived. `0` keeps views forever. |

## Storage

Views, what you did with each item, and a visual review's images are kept in the plugin's own database on this machine. Once a day, and when the plugin starts, it deletes each view whose threads are all deleted or have been archived for longer than `keepArchivedDays`. That means the thread that published the view and every thread its items name. The run makes one `threads.get` request for each of those threads. A thread it cannot look up keeps its views until the next run. Once deleted views have freed at least 32 MB and a quarter of the file, the run compacts the database so the file gets smaller.

## Requirements

Nothing to configure. A command button runs with your permissions, so read it before you press **Run**.

## Related plugins

- **Ask User Question** (`ask-user-question`), bundled with bb: lets any provider ask one multiple-choice question, and the turn waits for the answer. Impromptu UI's inline questions come after the turn ends, so the thread is idle while you decide, and your answer starts the next turn. Its other views show many items at once, and they stay open while you work through them.
- **Generative UI** (`genui`): the agent picks from 86 components, such as charts and forms, and they render inside its replies. Impromptu UI's items sit above the composer instead of in the transcript, and each button runs an action you can see, such as posting a draft or starting a thread.
- **Thread Pages** (`thread-pages`): the agent writes a web page for its task and you answer from the page. Impromptu UI uses one fixed format of cards, buttons, and drafts, so every skill's results look and work the same way.
- **Inline visualizations** (`inline-vis`), bundled with bb: shows an HTML or Markdown file inside a reply, for reading. Impromptu UI is for acting on each item.
- **Doc Review** (`doc-review`): leave comments on documents and pages beside the chat, then send them to an agent in one message. Impromptu UI works the other way round: the agent lays out what it found, and you decide on each item.

## Develop

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload impromptu-ui
```

`npm run eval` checks the section every thread gets, in
`view/instructions.ts`, against the turn endings in `evals/cases.ts`. Each
case comes from a commit that changed that section after a thread ended a
turn in chat when it should have published a view. A task case gives Claude
Code a small repository to work in. A draft case hands it a finished reply.
Each case also lists the options its view must offer, such as "Commit and
push" and "Still wrong", as patterns matched against the view's titles and
buttons. The eval runs `claude -p` with a stand-in `bb` that records
`publish`, and reports how many runs published a view with every option. Each run is one model
session, so it is not part of `npm test`. Run it after changing the section,
and add `--without-instructions` to confirm a new case fails without it.

The cases start fresh, and agents get them right. A real thread reaches the
same ending after a long session, which is when agents miss it.
`node evals/replay.ts --session <transcript.jsonl> --cut-before "<reply
text>"` resumes a real Claude Code transcript just before the reply that
missed a view, with the system prompt the thread recorded and the current
section swapped in (or `--instructions-at <commit>`, or `--as-recorded`),
and lets the model write that reply again in Claude Code's sandbox. The
transcript stays on your machine and out of this repository.
