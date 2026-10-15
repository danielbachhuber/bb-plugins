## What you get

- An editable source pane in the tab where bb would show a read-only preview, for md, mdx, markdown, and txt files.
- A Preview that renders the text you have typed, before you save it, with the file's own images.
- Saving with Cmd+S or the Save button, never automatically, and Discard to go back to the text on disk.
- Add to chat on a selection in Preview, which quotes it into the composer under the file's path.
- A pencil on markdown files in a thread's changes panel that opens the file in the editor.

## How it works

Each save sends the hash of the file as it was read, and the save stops if the file on disk has changed since, such as when an agent edited it while you typed. You then choose to reload or overwrite. Files are read and written through bb's file API on the machine they are on, whether in a workspace, thread storage, or a connected host.

## Requirements

bb 0.43 or later. Nothing to configure, and no account or external service.
