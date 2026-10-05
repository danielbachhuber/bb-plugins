// The thread panel: loads the review and draws it with bb's own diff viewer.
import { experimental_Diff as Diff } from "@get-bb/plugin-sdk/app";
import { ReviewScreen } from "./review-screen";
import { useReview } from "./use-review";

const DiffView = ({ patch, path }: { patch: string; path: string }) => <Diff patch={patch} path={path} />;

export function ReviewPanel({ threadId }: { threadId: string }) {
  const { result, error, generating, generate } = useReview(threadId);
  return <ReviewScreen result={result} error={error} generating={generating} onGenerate={generate} DiffView={DiffView} />;
}
