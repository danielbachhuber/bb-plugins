// Telling bb's `Markdown` which file the preview came from.
//
// Without that, bb treats the buffer like a chat message and resolves a
// clicked `setup/install.md` from the workspace root. A note two folders
// down links to its neighbours the way GitHub reads them, relative to the
// note's own folder, so every such link opened a 404 tab.
//
// The SDK's `experimental_document` prop carries the file's identity, and bb
// then resolves relative links (and images) from the file's directory and
// opens them in the same workspace or thread storage. It takes only rooted
// files with a thread to route through, so a host file, or a workspace file
// opened outside any thread, keeps bb's message routing.

import type { MarkdownProps } from "@get-bb/plugin-sdk/app";
import type { FileSourceKind } from "./target";

export type MarkdownDocument = NonNullable<MarkdownProps["experimental_document"]>;

/** The parts of a file's origin that say which workspace or storage it sits in. */
export interface DocumentSource {
  kind: FileSourceKind;
  threadId: string | null;
  environmentId: string | null;
}

/**
 * The document context for one open file, or undefined when bb cannot take
 * one and the preview should fall back to message routing.
 *
 * `rootPath` is the directory the rooted `path` is relative to, as the server
 * resolved it. It is null until that lookup lands, and stays null when the
 * environment has no checkout or the thread has no storage yet.
 */
export function buildMarkdownDocument(
  path: string,
  source: DocumentSource,
  rootPath: string | null,
): MarkdownDocument | undefined {
  if (source.threadId === null || rootPath === null || rootPath === "") {
    return undefined;
  }
  if (source.kind === "workspace") {
    if (source.environmentId === null) return undefined;
    return {
      threadId: source.threadId,
      rootPath,
      target: { kind: "workspace", environmentId: source.environmentId, path },
    };
  }
  if (source.kind === "thread-storage") {
    return {
      threadId: source.threadId,
      rootPath,
      target: { kind: "thread-storage", threadId: source.threadId, path },
    };
  }
  return undefined;
}
