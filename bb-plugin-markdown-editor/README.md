# Markdown Editor

Edit a markdown file in the tab you were reading it in, and save it with
`Cmd+S`.

![The Raw view: the file's source in an editable pane, with unsaved changes in
the header and Save enabled](screenshots/raw-unsaved.png)

The plugin registers a file opener for `md`, `mdx`, `markdown`, and `txt`. When
one of those files opens in a tab, this component is the tab: a header with the
file's path, a Preview/Raw toggle, a reload button, one word of save state, and
a Save button.

**Preview** renders the buffer with bb's own chat-message markdown renderer, so
a file looks the way the same text would look in a thread. Images the file
points at are rendered too: `![](screenshots/a.png)` resolves against the
file's own directory and is served from the host it lives on.

![The Preview view: the same file rendered, with the header reading
Saved](screenshots/preview.png)

**Raw** is a plain textarea holding the markdown source. No syntax
highlighting, on purpose: the alternative was a 510 KB editor bundle to
re-color text that Preview is one click away from rendering properly. The two
views share one buffer, so edits typed in Raw show up in Preview before they
are saved.

## Saving

Saving is explicit — `Cmd+S`, or the Save button, both inert when nothing has
changed. The header reads `Unsaved changes` / `Saving…` / `Saved`.

Every read returns the file's sha256 and every write sends that hash back, so
the host refuses a write when the bytes on disk are no longer the bytes that
were read. That happens whenever an agent edits the same file while it is open
in front of you. The result is a banner, never a silent loss:

![The conflict banner: this file changed on disk since you opened it, with
Reload and Overwrite buttons](screenshots/conflict.png)

- **Reload, discard mine** re-reads the file and throws the buffer away.
- **Overwrite** writes unconditionally, discarding what arrived on disk.

Until one of those is chosen, the buffer stays exactly as typed. Keystrokes
that land while a save is in flight are kept too, which leaves the file dirty
again the moment the save lands — correct, if briefly surprising.

## Choosing this opener

bb picks one opener per extension under **Settings → Files**, and the tab's
**Open with** menu overrides that for a single open. Pin this plugin for `md`
to get it by default; bb's read-only preview stays available in the same menu.

bb also ships a disabled builtin **File Editor** plugin that puts Monaco behind
every code extension. It has no markdown preview, and enabling both means
choosing between them per extension.

## Limits

- UTF-8 text only, up to 2 MB. A binary renamed to `.md` is refused rather
  than mangled.
- No new files: a write to a path whose parent directory is missing fails
  instead of creating it.
- Git-ref snapshots (a file as of a commit) always use bb's preview. The SDK
  excludes them from openers, and read-only is the right answer there anyway.
- Closing a tab with unsaved changes cannot be intercepted — bb's tabs are not
  browser navigations. Quitting or reloading the app does prompt.
- Preview images are resolved only for paths relative to the open file, in the
  formats a browser shows inline, up to 4 MB. A `https://` image loads as it
  always did. A root-relative `/logo.png` is left alone: on GitHub that means
  the repository root, which a host file does not have.

## Layout

| Path | What it holds |
| --- | --- |
| `editor/target.ts` | Turning a file's source and path into `bb.files` arguments, and the path rules that make that safe |
| `editor/save.ts` | The save state machine: dirty, saving, conflict, error |
| `editor/images.ts` | Finding image references, resolving them against the open file, and pointing them at the asset route |
| `server.ts` | The `file_read` / `file_write` contract and the `bb.sdk.files` boundary |
| `app.tsx` | The file opener registration and the tab's UI |

Two host behaviors this code exists to accommodate, both found by running it
rather than by reading the types:

`bb.files` wants an absolute `path`; `rootPath` is a containment guard the host
daemon enforces, not a base it joins against. `editor/target.ts` supplies both,
and a test holds that line — every rooted file failed to load until it did.

bb's markdown sanitizer keeps an `<img>` only when its `src` is an absolute
`http`/`https` URL. A relative path resolves against the app origin and returns
the SPA's `index.html`; a data URL is dropped along with the element. So
images are served from `/api/v1/plugins/markdown-editor/http/asset` rather
than inlined.

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload markdown-editor
```

The screenshots above come from the running plugin, captured against a local bb
server with a throwaway file.
