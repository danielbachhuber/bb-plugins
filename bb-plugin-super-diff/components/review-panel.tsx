// The thread panel: loads the review and draws it with bb's own diff and source viewers.
import { experimental_Diff as Diff, experimental_SourceCode as SourceCode } from "@get-bb/plugin-sdk/app";
import { ReviewScreen } from "./review-screen";
import { useReview } from "./use-review";

const DiffView = ({ patch, path }: { patch: string; path: string }) => <Diff patch={patch} path={path} />;
const SourceView = ({ content, path }: { content: string; path: string }) => <SourceCode content={content} path={path} overflow="wrap" />;

export function ReviewPanel({ threadId }: { threadId: string }) {
  const { result, error, generating, generate, setViewed } = useReview(threadId);
  return (
    <ReviewScreen
      result={result}
      error={error}
      generating={generating}
      onGenerate={generate}
      onSetViewed={setViewed}
      DiffView={DiffView}
      SourceView={SourceView}
    />
  );
}
