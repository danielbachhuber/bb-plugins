// "Start thread" for one plugin: bb's own new-thread composer in a dialog,
// under a card that says which plugin the thread is for. The composer owns
// every selection; the server adds which plugin it is and the title.
import {
  experimental_NewThreadComposer as NewThreadComposer,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ShelfRow } from "../shelf/types";

export function StartThreadDialog({
  plugin,
  projectId,
  onClose,
  onSubmit,
}: {
  /** The plugin the dialog is open for, or null when it is closed. */
  plugin: ShelfRow | null;
  /** The bb project whose folder is the checkout, when there is one. */
  projectId: string | null;
  onClose: () => void;
  onSubmit: (request: NewThreadRequest) => Promise<void>;
}) {
  return (
    <Dialog open={plugin !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Start a thread on {plugin?.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Describe what the thread should do with this plugin.
          </DialogDescription>
        </DialogHeader>
        {plugin === null ? null : (
          <div className="max-h-[65vh] space-y-3 overflow-y-auto">
            {/* Which plugin, as facts rather than as editable prompt text. */}
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium text-foreground">
                {plugin.name} <span className="font-mono text-xs font-normal text-muted-foreground">{plugin.dir}/</span>
              </p>
              {plugin.description ? (
                <p className="mt-1 text-xs text-muted-foreground">{plugin.description}</p>
              ) : null}
            </div>
            <NewThreadComposer
              defaultProjectId={projectId ?? undefined}
              placeholder={`What should this thread do with ${plugin.name}?`}
              // One saved draft per plugin, so a half-written thread for one
              // plugin does not appear in another's dialog.
              draftKey={`plugin-shelf:${plugin.id}`}
              layout="document"
              onSubmit={onSubmit}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
