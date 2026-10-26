# Diff Comment

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

## Review points as comments

When the agent reviews the thread's changes and raises points about specific
lines, it also publishes them above the composer through Impromptu UI, one card
per point. Each card shows the code, the comment as it would read, which you
can edit, and **Add comment**. Pressing it has the agent put that text on the
line as an open comment:

```sh
bb diff-comment add src/widget.ts:42 --body-file /tmp/point-1.md
```

`add` reads the line and its neighbours from the file in the agent's working
directory, which anchors the comment the same way one you write is anchored.
From the diff, the comment is like any other: keep it, ask the agent about
it, or post it to the pull request. Points with no line, and points about a
deleted line, stay in the chat. `skills/suggest-diff-comments/SKILL.md` tells
the agent how to publish the cards. It needs the Impromptu UI plugin; without
it, the review stays in chat.

## Pull request review comments

When the thread has an open pull request, its unresolved review threads show
on the diff too, under the lines they were left on, beside your own comments.
Each card shows the conversation and links to it on GitHub, where you reply or
resolve. A draft on your own review that you have not submitted yet is marked
**Pending**, since only you can see it.

A thread is placed by the text of its line and the line above, read from the
diff hunk GitHub stores with the comment, the same way a local comment is. So
it follows its code through edits you have not pushed. Resolved threads stay
off the diff, as GitHub collapses them. Outdated threads and comments on a
whole file have no line to sit under. The **Diff comments** panel lists every
unresolved thread in an **On GitHub** section, including those.

Reading them costs one `gh api graphql` request per 100 review threads, each
carrying its first 50 comments. It runs when you open the thread and when the
window regains focus, and the server reuses the result for 30 seconds, so a
burst of focus changes is one request. The panel reads the same cached result.

### Adding to your review on GitHub

The composer has two buttons. **Ask agent** keeps the comment here and sends
it to the agent; `⌘↵` does the same. **Add to GitHub review** posts it to the
pull request as a draft on your pending review instead, starting one if you
have none. The agent is not asked about it. Nobody else sees a draft until
you submit the review on GitHub, and once posted it shows on the diff as a
review thread marked **Pending**.

Every local comment's card offers **Post to GitHub**, until it is resolved.
It posts the comment as a draft, then marks the local comment resolved and
links to it on GitHub. When the agent has answered the comment, the draft
holds your question and the answer together, with the answer credited to the
thread's provider ("**Answer** (from Claude Code):").

GitHub takes a review comment only on a line in the pull request's diff, and
the line number bb shows is not necessarily GitHub's, because bb's diff can
include changes you have not pushed. So the line is found in the pull
request's own patch for the file, by its text and the line above, and posted
at GitHub's line number for it. When the button cannot post, it stays visible
but disabled, and its tooltip says why: there is no pull request yet, the file
or line is not in the pull request's diff yet, or `gh` is unavailable. If
GitHub refuses a post, the reason shows under the buttons and your text stays
in the box.

The patches are read with one `gh api` call per 100 files, made the first time
a composer opens or a comment's card is drawn, and reused for 30 seconds. The
diff on its own never reads them. A post makes two GraphQL calls, or three
when it has to start your review, and reads the patches again first, so a push
since the composer opened is taken into account.

Two settings, under `bb plugin config diff-comment`:

| Setting | Default | |
| --- | --- | --- |
| `showGithub` | `on` | `off` stops reading the pull request and hides the GitHub buttons |
| `ghPath` | `gh` | The `gh` binary, if it is not on bb's PATH |

## Where it draws

Only the changes panel. Timeline diffs inside messages are deliberately
excluded: the same path appears once per message there, so a comment anchored
to one could not mean anything useful.

The plugin does not replace bb's diff renderer. It decorates the diff bb
already rendered, adding a row through the same annotation shape
`@pierre/diffs` uses itself, so the comments and the diff stay the same diff
across bb upgrades.

## Requirements

Needs bb 0.42 or later. Your own comments live in the plugin's own storage and
are sent nowhere unless you post one. Showing and posting review comments
needs the GitHub CLI, signed in (`gh auth status`); without it the diff shows
your own comments only.
