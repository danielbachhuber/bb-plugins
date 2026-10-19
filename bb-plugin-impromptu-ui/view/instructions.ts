// What every thread is told about Impromptu UI.
//
// Most views come from skills that name `impromptu-ui` in their own steps. An
// agent working without one of those skills ends its turn with a numbered list
// and "Which should I do?", because nothing in its context says a view exists.
// This block is that context. It names the moments to publish rather than
// describing the view format, which the skill covers, and stays short because
// it rides on every turn of every thread.

export const THREAD_INSTRUCTIONS = [
  "## Impromptu UI",
  "",
  "`bb impromptu-ui publish` shows a list of items above this thread's",
  "composer. Each item opens in the side panel with its details, any diff, a",
  "draft the user can edit, and buttons that act on it: post a comment, start",
  "a thread, run a command, or send you a message. The user acts on each item",
  "instead of typing a reply.",
  "",
  "Before you end a turn, look at what you are handing the user. Publish a",
  "view instead of writing it in chat when it is:",
  "",
  "- two or more findings, issues, pull requests, or fixes to decide on one by one",
  "- a draft to post or send, such as a PR description, an issue, or a reply",
  "- two or more options or designs to choose between, or a UI change to",
  "  compare before and after",
  "- a numbered list that ends in a question, such as \"Which should I do?\"",
  "",
  "Keep chat for a single answer, a yes-or-no question, or a report with",
  "nothing to act on.",
  "",
  "Load the `impromptu-ui` skill for the view file's format before you write",
  "one. After publishing, say in chat only how many items are above the",
  "composer.",
].join("\n");
