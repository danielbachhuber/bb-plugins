# Markdown Editor

Edit markdown files in the tab bb opens them in, preview the result, and save with Cmd+S without overwriting an agent's edits.

Without the plugin, bb opens a markdown file read-only. You can switch between Preview and Raw, but to change a line you have to open the file in another editor:

![bb's own preview of docs/release-checklist.md, with a Preview and Raw toggle and no way to edit the text](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/markdown-editor/tab--without-the-plugin.png)

With it, the same tab edits the file. Raw is the source in an editable pane, and the header shows Unsaved changes, Discard, and Save:

![The same file in Markdown Editor's Raw view, with step 2 rewritten and a step added, Unsaved changes and Discard in the header, and Save enabled](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/markdown-editor/tab--raw-with-unsaved-changes.png)

## Use

- Open a `.md`, `.mdx`, `.markdown`, or `.txt` file from a thread's workspace, its storage, or a connected host.
- Switch between **Preview** and **Raw**. Preview renders the text you have typed, before you save it, with bb's chat markdown renderer, and shows the images the file links to.
- Press **Cmd+S** or click **Save** to write the file. **Discard** puts back the text last read from disk, after a second click to confirm.
- If an agent changes the file while you have unsaved edits, Save stops and asks you to **Reload, discard mine** or **Overwrite**.
- Select text in Preview and click **Add to chat** to quote it into the composer under the file's path.

  ![A paragraph selected in Preview, with an Add to chat button under it](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/markdown-editor/tab--add-to-chat.png)

- In a thread's changes panel, click the pencil on a markdown file's header to open it in the editor.

When another plugin also opens markdown, such as Docs or File Editor, choose which one opens each extension under **Settings → Files**. To open one file another way, right-click its link in the thread and pick from **Open with**, which includes bb's built-in preview.

## Requirements

bb 0.43 or later. No account or external service: the plugin reads and writes through bb's file API on the machine the file is on.

## Related plugins

- **Docs** (`docs`), bundled with bb: edits markdown as rich text inside threads, with changes an agent proposes for you to accept or reject. Markdown Editor edits the source and saves only when you ask.
- **File Editor** (`monaco-editor`), bundled with bb: edits files in the Monaco code editor, markdown included, with no rendered preview. Markdown Editor has a plain source pane and a Preview of the same text.
- **Live Markdown** (`live-markdown`): renders formatting as you type, in one pane, and edits tables cell by cell. Both check the file's hash before saving. Markdown Editor keeps the source and the rendered preview in separate views.
- **Markdown PRO** (`md-editor`): edits markdown as a formatted document, renders Mermaid, LaTeX, and callouts, and autosaves. Markdown Editor saves only when you ask, and adds a pencil to markdown files in the changes panel.
- **Obsidian at Home** (`wikilinks`): edits linked notes, with wikilinks and backlinks. Markdown Editor treats each file on its own.
- **Doc Review** (`doc-review`): leaves comments on markdown and other documents for an agent to act on, without editing them yourself.

## Develop

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload markdown-editor
```
