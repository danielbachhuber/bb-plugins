// The thread panel: loads the review and draws it with bb's own diff and source viewers.
import { useEffect, useState } from "react";
import { experimental_Diff as Diff, experimental_SourceCode as SourceCode, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "@/server";
import { sidesForHunk } from "@/review/context";
import { ReviewScreen, type DiffViewComponent } from "./review-screen";
import { useReview } from "./use-review";

/**
 * Each changed file as it is on disk, by thread, path, and diff hash, so a
 * file is read once per version however many of its hunks are on screen.
 * Kept outside the component, since bb remounts the panel on every switch back.
 */
const contentsCache = new Map<string, Promise<string | null>>();

const SourceView = ({ content, path }: { content: string; path: string }) => <SourceCode content={content} path={path} overflow="wrap" />;

/**
 * bb's diff, given the hunk's two whole sides once the file loads, so its
 * "unmodified lines" bars expand into the context around the hunk. Until then,
 * or when the file is binary, too large, or not what the hunk says, it draws
 * the patch alone.
 */
function diffViewFor(threadId: string): DiffViewComponent {
  return function DiffView({ patch, path, file }) {
    const rpc = useRpc<typeof rpcContract>();
    const [now, setNow] = useState<string | null>(null);
    useEffect(() => {
      if (!file) return;
      const key = `${threadId}\0${path}\0${file.hash}`;
      let request = contentsCache.get(key);
      if (!request) {
        request = rpc.call("review_file_contents", { threadId, path }).then(
          (reply) => reply.content,
          () => null,
        );
        // A long session drops what it read first rather than holding every version of every file.
        if (contentsCache.size >= 200) contentsCache.delete(contentsCache.keys().next().value!);
        contentsCache.set(key, request);
      }
      let live = true;
      void request.then((value) => live && setNow(value));
      return () => {
        live = false;
      };
    }, [rpc, path, file?.hash]);
    const sides = file && now !== null ? sidesForHunk(now, file.hunk) : null;
    if (!file || !sides) return <Diff patch={patch} path={path} />;
    return (
      <Diff
        patch={`${file.header}\n${sides.hunk}`}
        path={path}
        experimental_fullFileContents={{ old: { path: file.previousPath ?? path, content: sides.oldText }, new: { path, content: now! } }}
      />
    );
  };
}

const diffViews = new Map<string, DiffViewComponent>();

export function ReviewPanel({ threadId }: { threadId: string }) {
  const { result, error, notice, generating, generate, setRead, setFileViewed } = useReview(threadId);
  // One component per thread, so React keeps each diff mounted across renders.
  let DiffView = diffViews.get(threadId);
  if (!DiffView) {
    DiffView = diffViewFor(threadId);
    diffViews.set(threadId, DiffView);
  }
  return (
    <ReviewScreen
      result={result}
      error={error}
      generating={generating}
      onGenerate={generate}
      onSetRead={setRead}
      onSetFileViewed={setFileViewed}
      notice={notice}
      DiffView={DiffView}
      SourceView={SourceView}
    />
  );
}
