# Impromptu UI

Generate interfaces for what you need to process or act on, instead of walls of text in chat.

An agent that finishes three fixes from one review comment, each in its own worktree, writes them up in chat and asks which to open. With Impromptu UI, each fix is a row above the composer, and opening one shows its diff and a button that commits, pushes, and opens the pull request:

![Before: three finished fixes written out in chat, one paragraph each, ending in "Which should I open?" After: the same three as rows above the composer, one already opened as a pull request, and the demo accounts fix open in the side panel with its diff and Commit, push, and open PR and Revise buttons](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--three-prs-at-once.png)

## Use

- A skill publishes the items it wants you to act on, such as issues to triage, findings from a code review, or a pull request to merge. Each one is a numbered row above the composer, under a section heading when the skill groups them.
- Click a row to open it in the side panel: its summary and details, any diff, a draft you can edit, and buttons that post the draft, start a thread, run a command once you confirm it, or open a link.
- A button that starts a thread for a pull request against another branch, such as a fix in a PR against the PR under review, starts it in a new worktree on that branch, so the thread's diff matches the pull request from the first turn.
- A fix the agent suggests sits in its own **Suggested fix** block under the code it changes, apart from the pull request's own diff under **In this PR**.
- A last step that depends on the rest, such as a review's verdict, waits under the list as a **Then** row. It opens once every item above it is handled and tallies what you did with them.

![A code review above the composer: findings under Fix before merge and Worth considering, two done and one dismissed, and a Then row to submit as Request changes, open in the side panel with the tally of what was done](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--closing-step-ready.png)

- To compare designs, the agent shows screenshots of the original and its alternatives. Pick one, leave notes, and press **Send feedback**. A single proposed change shows as **Before** and **After** in the same place, with **Build it**.

## For agents

The `impromptu-ui` skill describes the view file and when to publish one. The `refine-impromptu-ui` skill files an anonymized issue on this repository when a view falls short.

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
