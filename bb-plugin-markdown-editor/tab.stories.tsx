// A markdown file's tab, with and without this plugin. Each story fills the
// window the way a tab does in bb. Invented data.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FilePreview } from "@bb-app/components/secondary-panel/FilePreview";
import type { EditorState } from "./editor/save";
import { anchorForSelection } from "./editor/selection";
import { EditorTabView, type EditorTabViewProps } from "./editor/tab-view";

export default {
  title: "markdown-editor/Tab",
};

const noop = () => {};

const PATH = "docs/release-checklist.md";

const ON_DISK = `# Release checklist

Run through this list before tagging a new version of Widgets.

## Before the tag

1. Merge every pull request in the milestone, or move it to the next one.
2. Run \`npm test\` and \`npm run lint\` on \`main\`.
3. Update \`CHANGELOG.md\` with one line per user-facing change.
4. Bump the version in \`package.json\`.

## Tagging

Tag from \`main\` only, never from a release branch. The tag name is the
version with a leading \`v\`, such as \`v2.4.0\`.

\`\`\`sh
git tag v2.4.0
git push origin v2.4.0
\`\`\`

## After the tag

- Check that the release workflow published the package.
- Post the changelog in the team channel.
- Close the milestone.
`;

// The same file with step 2 rewritten and a step added, not yet saved.
const EDITED = ON_DISK.replace(
  "2. Run `npm test` and `npm run lint` on `main`.",
  "2. Run `npm test`, `npm run lint`, and `npm run build` on `main`, and\n   wait for CI to pass on the merge commit.",
).replace(
  "- Close the milestone.",
  "- Close the milestone.\n- Open the next milestone and move anything left over into it.",
);

const saved: EditorState = {
  loaded: { content: ON_DISK, sha256: "a1" },
  buffer: ON_DISK,
  status: "idle",
  message: null,
};

const unsaved: EditorState = { ...saved, buffer: EDITED };

function Stage({ children }: { children: ReactNode }) {
  return <div className="flex h-screen w-full flex-col bg-background">{children}</div>;
}

function Tab(props: Partial<EditorTabViewProps>) {
  return (
    <Stage>
      <EditorTabView
        path={PATH}
        state={saved}
        view="preview"
        previewContent={props.state?.buffer ?? saved.buffer}
        markdownDocument={undefined}
        discardArmed={false}
        selection={null}
        onViewChange={noop}
        onEdit={noop}
        onSave={noop}
        onOverwrite={noop}
        onReload={noop}
        onDiscard={noop}
        onAddToChat={noop}
        {...props}
      />
    </Stage>
  );
}

/** Without the plugin: bb opens a markdown file read-only, with a Preview and Raw toggle and no way to change the text. */
export function WithoutThePlugin() {
  return (
    <Stage>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-1">
        <div className="min-h-0 flex-1 overflow-auto" data-file-preview-scroll-container>
          <FilePreview
            path={PATH}
            onOpenInEditor={noop}
            state={{
              kind: "ready",
              lineRange: null,
              textPreviewKind: "markdown",
              file: { name: "release-checklist.md", contents: ON_DISK },
            }}
          />
        </div>
      </div>
    </Stage>
  );
}

/** The same file in Raw, edited in place: two lines changed, Unsaved changes in the header, and Save ready. */
export function RawWithUnsavedChanges() {
  return <Tab view="raw" state={unsaved} />;
}

/** Preview renders the unsaved text before it reaches disk. */
export function PreviewWithUnsavedChanges() {
  return <Tab state={unsaved} previewContent={EDITED} />;
}

/** Saved, in Preview. */
export function Saved() {
  return <Tab />;
}

/** A paragraph selected in Preview, with Add to chat under it to quote it into the composer. */
export function AddToChat() {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<{ left: number; top: number } | null>(null);

  // Select the paragraph under Tagging for real, so the picture shows the
  // highlight as well as the button, and place the button the way app.tsx does.
  // bb's Markdown can finish rendering after this mounts, so look until the
  // paragraph is there.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (select()) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, []);

  function select(): boolean {
    const pane = previewRef.current;
    if (pane === null) return false;
    const paragraph = [...pane.querySelectorAll("p")].find((p) =>
      p.textContent?.startsWith("Tag from"),
    );
    if (paragraph === undefined) return false;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const current = window.getSelection();
    current?.removeAllRanges();
    current?.addRange(range);
    const rect = range.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    setSelection(
      anchorForSelection({
        selection: { left: rect.left, top: rect.top, bottom: rect.bottom },
        pane: { left: paneRect.left, top: paneRect.top, height: paneRect.height },
        scroll: { left: pane.scrollLeft, top: pane.scrollTop },
        clientWidth: pane.clientWidth,
      }),
    );
    return true;
  }

  return <Tab previewRef={previewRef} selection={selection} />;
}

/** Discard pressed once: it asks before throwing the edits away. */
export function DiscardArmed() {
  return <Tab view="raw" state={unsaved} discardArmed />;
}

/** An agent changed the file on disk while it had unsaved edits. Save stopped, and the banner asks which copy to keep. */
export function Conflict() {
  return (
    <Tab
      view="raw"
      state={{
        ...unsaved,
        status: "conflict",
        message: "This file changed on disk since you opened it.",
      }}
    />
  );
}
