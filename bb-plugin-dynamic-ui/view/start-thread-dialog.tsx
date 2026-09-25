// bb's own new-thread composer in a dialog, seeded with an item, for digging
// into it in a thread of its own.
import { useEffect, useState } from "react";
import { experimental_NewThreadComposer as NewThreadComposer, type NewThreadRequest } from "@get-bb/plugin-sdk/app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ThreadSeed {
  projectId: string;
  providerId: string | null;
  prompt: string;
}

export function StartThreadDialog({
  title,
  draftKey,
  seed,
  onClose,
  onSubmit,
}: {
  /** The item's title, as the heading. */
  title: string;
  /** Identifies the item, so a draft typed for one item stays with it. */
  draftKey: string;
  /** Null keeps the dialog closed. */
  seed: ThreadSeed | null;
  onClose: () => void;
  onSubmit: (request: NewThreadRequest) => Promise<void>;
}) {
  // Bumped on each open so the composer takes focus every time.
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (seed !== null) setFocusRequest((count) => count + 1);
  }, [seed]);

  return (
    <Dialog open={seed !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Start a thread: {title}</DialogTitle>
          <DialogDescription className="sr-only">Edit what this thread should do, then start it.</DialogDescription>
        </DialogHeader>
        {seed === null ? null : (
          <div className="max-h-[65vh] overflow-y-auto">
            <NewThreadComposer
              defaultProjectId={seed.projectId}
              defaultProviderId={seed.providerId ?? undefined}
              initialPrompt={seed.prompt}
              placeholder="What should this thread do?"
              draftKey={draftKey}
              layout="document"
              focusRequest={focusRequest}
              onSubmit={onSubmit}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
