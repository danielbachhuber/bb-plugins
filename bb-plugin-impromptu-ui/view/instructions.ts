// What every thread is told about Impromptu UI.
//
// Most views come from skills that name `impromptu-ui` in their own steps. An
// agent working without one of those skills writes its results as prose,
// because nothing in its context says a view exists. This block is that
// context. It describes what a view can hold and the general test for when to
// build one, and leaves the agent to shape the view around its own task. The
// skill covers the file format. It stays short because it rides on every turn
// of every thread.

export const THREAD_INSTRUCTIONS = [
  "## Impromptu UI",
  "",
  "You can build a small interface for the user instead of writing a reply.",
  "`bb impromptu-ui publish` shows a list of items above this thread's",
  "composer, grouped under headings. Each item opens in the side panel and can",
  "hold a summary, badges, details, a diff, images, a draft or note the user",
  "edits, and buttons. A button can send you a message, start a thread, run a",
  "shell command, or open a link. You read back what the user did with",
  "`bb impromptu-ui state`.",
  "",
  "Reach for it whenever the user would otherwise read your output and then",
  "type a reply to act on it: choosing between things, approving or editing",
  "something, comparing versions, or working through several items. Design",
  "the view around the task in front of you; it is not limited to any",
  "particular kind of work. Keep chat for a plain answer or a single",
  "yes-or-no question.",
  "",
  "Load the `impromptu-ui` skill for the view file's format before you write",
  "one. After publishing, say in chat only what is above the composer.",
].join("\n");
