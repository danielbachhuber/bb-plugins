---
name: now-cli
description: Use when checking or driving the Now plugin's Todoist actions from a shell, such as confirming against real Todoist that Postpone keeps a recurring task's rule, listing the Todoist tasks on the Now page, or adding and deleting a throwaway task to test with.
---

# bb now

`bb now` runs Now's Todoist actions from a shell, through the same functions the
page uses, so what it reports is what the page would do. It uses the plugin's
own Todoist token, so nothing needs a token of its own.

| Command | What it does |
| --- | --- |
| `bb now tasks [--json]` | Lists the Todoist tasks on the page: id, due date, repeat rule, and name. |
| `bb now task show <id>` | Reads a task fresh from Todoist and prints its name and due object. |
| `bb now task add <name> [--due <words>]` | Adds a task to the Todoist Inbox, syncs, and prints its id. `--due` takes Todoist's words: `"every mon 9am"`. |
| `bb now postpone <id> <day>` | Moves a task to a later day, as the Postpone menu does: a recurring task's current occurrence, or a one-off due date or deadline that is today or past. The day is `tomorrow`, `fri`, `oct 8`, or `2026-10-08`. |
| `bb now task delete <id>` | Deletes a task for good. Todoist cannot restore it. |

An id is Todoist's own, with or without the `todoist:` prefix the page uses.

## Checking against a throwaway task

Name the task so it cannot be mistaken for a real one, and delete it when done,
even if a step fails:

```sh
id=$(bb now task add "Now CLI check (delete me)" --due "every mon 9am")
bb now task show "$id"             # due.is_recurring true, due.string "every mon 9am"
bb now postpone "$id" "<a later day>"
bb now task show "$id"             # the new date, the same time, still recurring
bb now task delete "$id"
```

The task lands in the Inbox, which the default filter includes. With a filter
that leaves out the Inbox, it will not be on the page, and `postpone` reports
that it cannot find it.
