## With Impromptu UI, you can

- **Triage your milestone** without getting lost in paragraphs of feedback. Each recommendation becomes a row with a drafted comment and buttons to post it, post and close, or start a thread.
- **Create several PRs at once** without juggling threads. Each fix waits on its own card, with its diff and PR description, until you click **Commit, push, and open PR**.
- **Answer "Should I go ahead?" in one click.** The question sits above the composer with its answers as buttons and a field for something else.
- **Find the design you want** by reacting to variations instead of describing it up front. Pick one from a film strip, or leave notes for the next round.

## How it works

Impromptu UI gives your agent a toolkit for generating interfaces on the fly. A skill publishes its results as numbered rows above the composer. Click one to open its card in the side panel, with its details, any diff, a draft you can edit, and the buttons that act on it. The agent reads back what you did. Views are stored in the plugin's own database on this machine.

## For agents

Agents get the `impromptu-ui` skill and the `bb impromptu-ui` command: `publish`, `state`, `hide`, `list`, and `schema`, which prints everything a view can hold. Every thread is also told to build a view whenever the user would otherwise reply to act on its output, so an agent can make one for whatever task it is on without a skill asking it to. The `refine-impromptu-ui` skill files an anonymized issue when a view falls short.

## Requirements

Nothing to configure. A command button runs with your permissions, so read the command before you confirm it.
