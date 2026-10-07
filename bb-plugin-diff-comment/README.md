# Diff Comment

Leave review comments directly on lines of a thread's diff, then have the agent
work through them one at a time.

You read the changes panel the way you read a pull request: hover a line, press
`+`, write what you want changed. The comment sits inline under that line.
When you have left a few, the agent takes them in order, makes each change, and
replies to each comment saying what it did. You resolve the ones you accept.

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
| `addressed` | The agent changed something and said what | the agent |
| `resolved` | You accepted the change | you |

The agent never resolves a comment. That split is the point: `addressed` is
where you get to read what it actually did before the comment goes away.

## Working through them

Press **Send to agent** in the thread header. It appears there as soon as a
comment is open, showing how many, and writes the prompt into this thread's
composer; press Enter to send it. The same button sits in the **Diff comments**
panel tab.

It stops short of sending on its own deliberately — the SDK has no "submit
now", and sending a message on your behalf is your affordance, not a plugin's.

Under that, the agent uses `bb diff-comment` inside the thread. It needs no
arguments to find the right comments, because comments belong to the thread
whose diff they were left on.

```sh
bb diff-comment list                 # what is still outstanding
bb diff-comment next                 # the next open comment, with its code
bb diff-comment reply "#1" "…"       # what you did; marks it addressed
```

`skills/diff-comments/SKILL.md` tells the agent that procedure, so "work
through my diff comments" is enough of a prompt.

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

The composer has two buttons. **Comment** keeps the comment here, for the
agent, as before; `⌘↵` does the same. **Add to GitHub review** posts it to the
pull request as a draft on your pending review instead, starting one if you
have none. It does not go in the agent's queue. Nobody else sees a draft until
you submit the review on GitHub, and once posted it shows on the diff as a
review thread marked **Pending**.

When the agent has answered a local comment, its card offers **Post to
GitHub**. That posts your question and the answer as one draft, with the
answer credited to the thread's provider ("**Answer** (from Claude Code):"),
then marks the local comment resolved and links to it on GitHub.

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
a composer opens or an answered card is drawn, and reused for 30 seconds. The
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
