# Impromptu UI

Generate interfaces for what you need to process or act on, instead of walls of text in chat.

An agent that assesses a Dependabot pull request without Impromptu UI writes its assessment out in chat and ends with a question for you to answer by typing:

![A Dependabot assessment written out in chat as nine bolded paragraphs, ending in "Do you want me to post this on #412, approve it, and merge it? Or post it only?"](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--dependabot-in-chat.png)

With it, the same assessment is a row above the composer. Opening it shows the verdict, the diff, and the comment to post, with buttons to post it:

![The same pull request as one row above the composer, open in the side panel with a Safe to merge badge, a three-line summary, the package.json diff, the assessment to post, and Post, approve, and merge, Post only, and Open #412 buttons](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--dependabot-item-open.png)

## Use

- A skill publishes the items it wants you to act on, such as issues to triage or a pull request to merge. Each one shows as a numbered row above the composer, under its section's heading when the view groups them.
- Click a row to open its item in the side panel. It shows the details, any diff, a draft you can edit, and buttons that post the draft, start a thread, run a command once you confirm it, or open a link. A suggested fix shows in its own tinted block under the code it would change, so it never reads as the pull request's own diff. A last step that depends on the rest, such as a review's verdict, waits under the list until the other items are handled, then tallies what you did with them.
- To pick a design, the agent shows screenshots of the original and its alternatives in a film strip. Pick one, leave notes, and press **Send feedback**. A single proposed change shows as **Before** and **After** in the same place instead, with **Build it**.

![A visual review of four directions for a summary above the Now list, with D, one square per row, picked and a note to keep the counts under each run](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/impromptu-ui/thread--visual-review-now-round.png)

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

## Develop

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload impromptu-ui
```
