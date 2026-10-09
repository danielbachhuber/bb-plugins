// bb's own composer in a dialog, seeded with the issue or pull request the
// row is about. The plugin has no opinion about environment or branch, so the
// composer keeps all of its pickers and the project's remembered defaults.
import {
  experimental_NewThreadComposer as NewThreadComposer,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ThreadSeed {
  kind: "issue" | "pull";
  number: number;
  title: string;
  url: string;
  /** What the list already says about it, repeated so the dialog stands alone. */
  meta: string;
}

/** What the thread starts with, which the user can rewrite before sending. */
export function promptFor(seed: ThreadSeed): string {
  const what = seed.kind === "issue" ? "issue" : "pull request";
  return `Work on ${what} #${seed.number}, "${seed.title}".\n\n${seed.url}\n`;
}

export function StartThreadDialog({
  seed,
  projectId,
  onClose,
  onSubmit,
}: {
  /** Null closes the dialog. */
  seed: ThreadSeed | null;
  projectId: string;
  onClose: () => void;
  onSubmit: (seed: ThreadSeed, request: NewThreadRequest) => void;
}) {
  return (
    <Dialog open={seed !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        {seed === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>
                Start a thread on #{seed.number}
              </DialogTitle>
              <DialogDescription>
                {seed.title} · {seed.meta}
              </DialogDescription>
            </DialogHeader>
            <NewThreadComposer
              defaultProjectId={projectId}
              initialPrompt={promptFor(seed)}
              draftKey={`contributor-dashboard:${seed.kind}:${seed.number}`}
              onSubmit={(request) => onSubmit(seed, request)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
