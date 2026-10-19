// What every thread is told about Impromptu UI.
//
// Most views come from skills that name `impromptu-ui` in their own steps. An
// agent working without one of those skills writes its results as prose,
// because nothing in its context says a view exists. This block is that
// context. It gives the general test for when to build a view and leaves the
// agent to shape it around its own task. It does not list what a view can
// hold: `bb impromptu-ui schema` prints that from the schema itself, so this
// text does not change when the view format does. It stays short because it
// rides on every turn of every thread.

export const THREAD_INSTRUCTIONS = [
  "## Impromptu UI",
  "",
  "You can build a small interface for the user instead of writing a reply.",
  "`bb impromptu-ui publish` shows it above this thread's composer, with",
  "buttons that act on what you found, and `bb impromptu-ui state` reads back",
  "what the user did.",
  "",
  "Reach for it whenever the user would otherwise read your output and then",
  "type a reply to act on it: choosing between things, approving or editing",
  "something, comparing versions, or working through several items. Design",
  "the view around the task in front of you; it is not limited to any",
  "particular kind of work. Keep chat for a plain answer or a single",
  "yes-or-no question.",
  "",
  "`bb impromptu-ui schema` prints everything a view can hold, generated from",
  "the code, so check it rather than assuming. The `impromptu-ui` skill shows",
  "how to put a view together. After publishing, say in chat only what is",
  "above the composer.",
].join("\n");
