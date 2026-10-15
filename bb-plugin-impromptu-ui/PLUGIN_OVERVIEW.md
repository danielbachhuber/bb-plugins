## What you get

- Numbered rows above the composer, one per item an agent wants you to act on, such as issues to triage or code review findings, grouped under section headings.
- A side panel for each item, with its details, any diff, a draft you can edit, and buttons that post the draft, start a thread, run a command once you confirm it, or open a link. A suggested fix gets its own block, apart from the code under review.
- A closing step, such as a review's verdict, that opens once everything above it is handled.
- Screenshots to pick a design from, or **Before** and **After** for a single proposed change.

## How it works

A skill writes its results as a view file and publishes it from the thread. Done and dismissed items sink to the bottom of their section, and the agent reads back what you did. Views are stored in the plugin's own database on this machine.

## For agents

Agents get the `impromptu-ui` skill and the `bb impromptu-ui` command: `publish`, `state`, `hide`, and `list`. The `refine-impromptu-ui` skill files an anonymized issue when a view falls short.

## Requirements

Nothing to configure. A command button runs with your permissions, so read the command before you confirm it.
