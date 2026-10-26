## What you get

Leave review comments directly on lines of a thread's diff, and ask the agent
about each one as you write it.

You read the changes panel the way you read a pull request: hover a line, press
`+`, and write a question or the change you want. Press **Ask agent** and the
comment sits inline under that line while a subthread answers it.
Its reply shows on the comment. You resolve the ones you accept.

## How a comment is anchored

A comment stores the text of the line it was left on, plus the lines either
side of it, alongside the line number. On every render it is matched back
against the diff by that text, so it follows its line as the agent edits the
file above it. When the code it was written about is gone entirely, the comment
does not silently disappear: it stays open, the panel marks it **detached**,
and its original snippet is still quoted for the agent to act on.

## The three states

| State | Means | Who sets it |
| --- | --- | --- |
| `open` | Written, not yet worked | you |
| `addressed` | The agent answered or changed something, and said what | the agent |
| `resolved` | You accepted the change | you |

The agent never resolves a comment. That split is the point: `addressed` is
where you get to read what it actually did before the comment goes away.

## Asking the agent

**Ask agent** in the comment box saves the comment and starts a subthread to
answer it, so the answer starts now even while the thread's agent is busy. The
subthread is a fork of the thread: it has the whole conversation, works in the
same checkout, and shows nested under the thread while it works. Its reply
shows on the comment, and the subthread archives itself once that turn ends. A comment that is open and not yet asked, such as one the agent
suggested or one you reopened, has its own **Ask agent** button, on the diff
and in the **Diff comments** panel tab. A thread whose provider cannot fork
gets the question as a message instead, sent after its current turn.

Under that, the agent uses `bb diff-comment` inside the thread. It needs no
arguments to find the right comments, because comments belong to the thread
whose diff they were left on.

```sh
bb diff-comment show "#3"            # one comment, with its code
bb diff-comment list                 # what is still outstanding
bb diff-comment next                 # the next open comment, with its code
bb diff-comment reply "#3" "…"       # the answer, or what you did; marks it addressed
```

`skills/diff-comments/SKILL.md` tells the agent that procedure, so "work
through my diff comments" also works as a prompt for every open comment at
once.

## Where it draws

Only the changes panel. Timeline diffs inside messages are deliberately
excluded: the same path appears once per message there, so a comment anchored
to one could not mean anything useful.

The plugin does not replace bb's diff renderer. It decorates the diff bb
already rendered, adding a row through the same annotation shape
`@pierre/diffs` uses itself, so the comments and the diff stay the same diff
across bb upgrades.

## Requirements

Needs bb 0.42 or later. No account, external service, or separate install.
Comments live in the plugin's own storage and are sent nowhere.

## Source

[github.com/danielbachhuber/bb-plugins](https://github.com/danielbachhuber/bb-plugins/tree/main/bb-plugin-diff-comment)
