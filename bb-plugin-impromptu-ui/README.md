# Impromptu UI

Turns your agent's walls of text into interfaces you can click.

![Before: three finished fixes written out in chat, one paragraph each, ending in "Which should I open?" After: the same three as rows above the composer, one already opened as a pull request, and the demo accounts fix open in the side panel with its diff and Commit, push, and open PR and Revise buttons](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--three-prs-at-once.png)

With Impromptu UI, you can:

- **Triage your milestone** without getting lost in paragraphs of feedback. Each recommendation becomes a row with a drafted comment and **Post and close**, **Post**, and **Start thread**.

  ![Thirteen issues above the composer, grouped under Close and Keep open with a question, with #429 open in the side panel: a Close: completed badge, the comment to post, and Post and close and Post buttons](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--milestone-triage-item-open.png)

- **Create three PRs at once** without juggling threads. Each fix waits on its own card, with its diff and PR description, until you click **Commit, push, and open PR**.
- **Find the design you want** by reacting to variations instead of describing it up front. Pick one from a film strip, or leave notes for the next round.

  ![A visual review of task rows open in the side panel: Original, A, and B in a film strip, B picked with a note to keep the overdue date red, and a Send feedback button](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--visual-review-filled-in.png)

## Use

- The agent publishes what it wants you to act on as numbered rows above the composer, grouped under headings.
- Click a row to open its card in the side panel: the summary, any diff, a draft you can edit, and the buttons that act on it. Every card also has **Start thread** and **Dismiss**.
- Done and dismissed rows sink to the bottom, and the agent reads back what you did.
- A last step that depends on the rest, such as a code review's verdict, waits under the rows as a **Then** row until everything above it is handled.

## For agents

Every thread's instructions get a short section saying what a view can hold and to build one whenever you would otherwise read the agent's output and type a reply to act on it. The agent shapes the view to its own task, and the `impromptu-ui` skill describes the view file. Turn it off with the `threadInstructions` setting.

The `refine-impromptu-ui` skill files an anonymized issue on this repository when a view falls short.

```sh
bb impromptu-ui publish --file <view.json> [--key <name>]   # show or replace a view
bb impromptu-ui state [--key <name>]                        # read what the user did
bb impromptu-ui hide [--key <name>]                         # hide a view
bb impromptu-ui list                                        # list this thread's views
```

Each command works only inside a bb thread.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `providerId` | `claude-code` | Provider for threads a button starts. |
| `threadInstructions` | `true` | Tell every thread when to publish a view. |

## Requirements

Nothing to configure. A command button runs with your permissions, so read it before you press **Run**.

## Related plugins

- **Ask User Question** (`ask-user-question`), bundled with bb: lets any provider ask one multiple-choice question, and the turn waits for the answer. Impromptu UI shows many items at once, and they stay open while you work through them.
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
