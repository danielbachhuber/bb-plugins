// bb's own new-thread composer in a dialog, seeded with whatever row the
// thread is for, and the toast that follows once it starts. Starting a thread
// never takes the user away from the page they started it on: the toast
// offers the way there instead.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import {
  experimental_NewThreadComposer as NewThreadComposer,
  UrlLink,
  type NewThreadComposerProps,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { cn } from "../lib/cn";
import { FIXED_ENVIRONMENT_ATTRIBUTE, draftKeyFor } from "./keys";

export { BB_PICKER_SELECTORS, FIXED_ENVIRONMENT_ATTRIBUTE, FIXED_ENVIRONMENT_CSS, draftKeyFor } from "./keys";

/**
 * What the plugin knows before bb's composer opens. Every field is a seed the
 * user may override; the plugin's settings decide them, the composer decides
 * what actually gets spawned.
 */
export type StartThreadSeed = {
  /** Null leaves the composer on its own default project. */
  projectId: string | null;
  providerId?: string | null;
  model?: string | null;
  permissionMode?: NewThreadComposerProps["defaultPermissionMode"];
  /** Omitted for a composer that opens empty. */
  prompt?: string;
  /** Shown while the prompt is empty. Defaults to "What should this thread do?" */
  placeholder?: string;
  /**
   * Seeds the environment and branch pickers. Omitted where the plugin has no
   * opinion, which leaves the composer on its own default.
   */
  environment?: NewThreadComposerProps["defaultEnvironment"];
  /**
   * Where the thread will run when the plugin decides that itself. With a
   * `branch`, the composer's project, environment and branch pickers are
   * hidden and a line names the branch instead, because whatever they were set
   * to would be ignored. With only a `note`, the pickers stay and the note says
   * why the plugin could not decide. The hiding needs
   * {@link FIXED_ENVIRONMENT_CSS} on the page.
   */
  workspace?: { branch: string | null; note: string | null };
  /** The row itself, drawn as a card. Facts, not instructions: not editable. */
  preview?: {
    title: string;
    /** Shown after the title as `(#12)`. */
    number?: number;
    /** Null or omitted for something with no page of its own. */
    url?: string | null;
    /** Shown after the title in monospace, such as a directory. */
    tag?: string;
    meta?: string | null;
  };
};

/**
 * The plugin's own vendored dialog parts. The library cannot import them,
 * since `@/` means the plugin's directory, so the plugin passes them in:
 * `import * as dialog from "@/components/ui/dialog"`.
 */
export interface DialogParts {
  Dialog: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children?: ReactNode }>;
  DialogContent: ComponentType<{ className?: string; children?: ReactNode }>;
  DialogHeader: ComponentType<{ children?: ReactNode }>;
  DialogTitle: ComponentType<{ className?: string; children?: ReactNode }>;
  DialogDescription: ComponentType<{ className?: string; children?: ReactNode }>;
}

/**
 * Says a thread started, with a button to go to it. Every plugin calls this
 * after a thread starts rather than navigating, so the user stays on the page
 * they started it from.
 */
export function announceStartedThread(
  navigate: { toThread(threadId: string): void },
  threadId: string,
  message = "Started a thread",
): void {
  toast.success(message, {
    action: { label: "Go to thread", onClick: () => navigate.toThread(threadId) },
  });
}

/**
 * Where the thread will run, drawn like the banners bb stacks above its own
 * composer, because it replaces pickers that would otherwise say the same.
 */
export function WorkspaceBanner({ branch, note }: { branch: string | null; note: string | null }) {
  return (
    <section
      aria-label="Where this thread runs"
      className="flex items-start gap-2 rounded-lg border border-border bg-surface-raised-solid px-3 py-2.5"
    >
      <HugeiconsIcon icon={GitBranchIcon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        {branch ? (
          <>
            <p className="text-xs font-medium text-foreground">Runs in its own worktree</p>
            <p className="mt-0.5 break-all text-xs leading-snug text-muted-foreground">
              On the pull request's branch, <code className="font-mono text-foreground">{branch}</code>
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-foreground">Starts on a new branch</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              Not the pull request's own branch: {note}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * What the thread is for, as a card rather than as the first paragraph of an
 * editable prompt. It identifies the row, so there is nothing to steer in it
 * and editing it could only break the link between the thread and the row.
 */
export function PreviewCard({ preview }: { preview: NonNullable<StartThreadSeed["preview"]> }) {
  const title = preview.number === undefined ? preview.title : `${preview.title} (#${preview.number})`;
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <p className="font-medium text-foreground">
        {preview.url ? (
          <UrlLink href={preview.url} target="_blank" rel="noreferrer" className="hover:underline">
            {title}
          </UrlLink>
        ) : (
          title
        )}
        {preview.tag ? (
          <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">{preview.tag}</span>
        ) : null}
      </p>
      {preview.meta ? <p className="mt-1 text-xs text-muted-foreground">{preview.meta}</p> : null}
    </div>
  );
}

/**
 * The card, the banner, and bb's composer, without a dialog around them. For
 * a page that puts the composer inline; {@link StartThreadDialog} draws the
 * same thing in a dialog.
 */
export function StartThreadForm({
  seed,
  draftKey,
  focusRequest,
  className,
  onSubmit,
}: {
  seed: StartThreadSeed;
  /** Identifies the row. The key used adds a digest of the seeded prompt. */
  draftKey: string;
  /** Bump to move focus into the composer. */
  focusRequest?: number;
  className?: string;
  onSubmit: (request: NewThreadRequest) => Promise<void>;
}) {
  const fixed = Boolean(seed.workspace?.branch);
  return (
    <div className={cn("space-y-3", className)}>
      {seed.preview ? <PreviewCard preview={seed.preview} /> : null}
      {seed.workspace?.branch || seed.workspace?.note ? (
        <WorkspaceBanner branch={seed.workspace.branch} note={seed.workspace.note} />
      ) : null}
      <div className="contents" {...(fixed ? { [FIXED_ENVIRONMENT_ATTRIBUTE]: "" } : {})}>
        <NewThreadComposer
          defaultProjectId={seed.projectId ?? undefined}
          defaultProviderId={seed.providerId ?? undefined}
          defaultModel={seed.model ?? undefined}
          defaultPermissionMode={seed.permissionMode}
          defaultEnvironment={seed.environment}
          initialPrompt={seed.prompt}
          placeholder={seed.placeholder ?? "What should this thread do?"}
          draftKey={draftKeyFor(draftKey, seed.prompt)}
          layout="document"
          focusRequest={focusRequest}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}

/**
 * bb's own new-thread composer in a dialog: the prompt editor with @-mentions
 * and attachments, the provider, model and reasoning picker, and the row
 * beneath with project, environment, branch and permission mode. The plugin
 * supplies the seed and receives the resolved request; it builds none of
 * those controls itself.
 *
 * After `onSubmit` resolves, call {@link announceStartedThread} rather than
 * navigating to the thread.
 */
export function StartThreadDialog({
  dialog: { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription },
  heading,
  description = "Edit what this thread should do, then start it.",
  draftKey,
  seed,
  onClose,
  onSubmit,
}: {
  dialog: DialogParts;
  heading: string;
  /**
   * For screen readers only. The card carries the visible context, so this
   * says what the dialog is for rather than repeating the row's title.
   */
  description?: string;
  /** Identifies the row, so a draft typed for one row stays with it. */
  draftKey: string;
  /** Null keeps the dialog closed. */
  seed: StartThreadSeed | null;
  onClose: () => void;
  /** Throw to keep the dialog open with the draft in it. */
  onSubmit: (request: NewThreadRequest) => Promise<void>;
}) {
  // Bumped on each open so the composer takes focus every time, not just on
  // the first mount.
  const open = seed !== null;
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (open) setFocusRequest((count) => count + 1);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{heading}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        {seed === null ? null : (
          <StartThreadForm
            seed={seed}
            draftKey={draftKey}
            focusRequest={focusRequest}
            className="max-h-[65vh] overflow-y-auto"
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
