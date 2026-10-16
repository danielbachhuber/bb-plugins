// bb's own new-thread composer, in a dialog or in a box under the row's
// Start thread button, seeded with whatever row the thread is for, and the
// toast that follows once it starts. Starting a thread
// never takes the user away from the page they started it on: the toast
// offers the way there instead.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, GitBranchIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import {
  experimental_NewThreadComposer as NewThreadComposer,
  UrlLink,
  type NewThreadComposerProps,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

import { cn } from "../lib/cn";
import { FIXED_ENVIRONMENT_ATTRIBUTE, draftKeyFor, skillPrompt, type SuggestedSkill } from "./keys";

export {
  BB_PICKER_SELECTORS,
  FIXED_ENVIRONMENT_ATTRIBUTE,
  FIXED_ENVIRONMENT_CSS,
  draftKeyFor,
  skillPrompt,
  type SuggestedSkill,
} from "./keys";

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
  /** Omitted for a composer that opens empty. Ignored when `skills` is set. */
  prompt?: string;
  /**
   * Skills offered as chips above the composer. The prompt opens with only
   * the picked ones' instructions in it, and each click on a chip adds or
   * removes its instruction.
   */
  skills?: SuggestedSkill[];
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
 * The suggested skills as chips that each toggle on and off. A picked chip is
 * filled and ticked.
 */
export function SkillChips({
  skills,
  picked,
  onToggle,
}: {
  skills: readonly SuggestedSkill[];
  picked: ReadonlySet<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div role="group" aria-label="Suggested skills" className="flex flex-wrap items-center gap-2">
      {skills.map((skill) => {
        const on = picked.has(skill.name);
        return (
          <button
            key={skill.name}
            type="button"
            aria-pressed={on}
            title={skill.reason}
            onClick={() => onToggle(skill.name)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 font-mono text-xs",
              on
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:bg-state-hover",
            )}
          >
            {on ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden="true" /> : null}
            {skill.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The card, the banner, the skill chips, and bb's composer, without a dialog
 * around them. {@link StartThreadDialog} draws the same thing in a dialog and
 * {@link StartThreadInline} in a box under the row.
 */
export function StartThreadForm({
  seed,
  draftKey,
  focusRequest,
  showPreview = true,
  className,
  onSubmit,
}: {
  seed: StartThreadSeed;
  /** Identifies the row. The key used adds a digest of the seeded prompt. */
  draftKey: string;
  /** Bump to move focus into the composer. */
  focusRequest?: number;
  /** False leaves out the card, for a form drawn inside the row it would describe. */
  showPreview?: boolean;
  className?: string;
  onSubmit: (request: NewThreadRequest) => Promise<void>;
}) {
  const fixed = Boolean(seed.workspace?.branch);
  const skills = seed.skills;
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set((skills ?? []).filter((skill) => skill.selected).map((skill) => skill.name)),
  );
  const toggle = (name: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  // bb's composer has no way to insert text once it is open, so a chip
  // remounts it seeded with the picked skills' instructions. The draft key
  // carries a digest of that seed, so each set of picks keeps its own draft.
  const prompt = skills ? skillPrompt(skills, picked) || undefined : seed.prompt;
  return (
    <div className={cn("space-y-3", className)}>
      {showPreview && seed.preview ? <PreviewCard preview={seed.preview} /> : null}
      {seed.workspace?.branch || seed.workspace?.note ? (
        <WorkspaceBanner branch={seed.workspace.branch} note={seed.workspace.note} />
      ) : null}
      {skills?.length ? <SkillChips skills={skills} picked={picked} onToggle={toggle} /> : null}
      <div className="contents" {...(fixed ? { [FIXED_ENVIRONMENT_ATTRIBUTE]: "" } : {})}>
        <NewThreadComposer
          key={skills ? [...picked].sort().join(" ") : undefined}
          defaultProjectId={seed.projectId ?? undefined}
          defaultProviderId={seed.providerId ?? undefined}
          defaultModel={seed.model ?? undefined}
          defaultPermissionMode={seed.permissionMode}
          defaultEnvironment={seed.environment}
          initialPrompt={prompt}
          placeholder={seed.placeholder ?? (skills?.length ? "Pick a skill above, or say what this thread should do" : "What should this thread do?")}
          draftKey={draftKeyFor(draftKey, prompt)}
          layout="document"
          focusRequest={focusRequest}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}

/** Why the thread did not start, at the top of the box it was started from. */
export function StartThreadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
    >
      <HugeiconsIcon icon={AlertCircleIcon} className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{message}</span>
    </p>
  );
}

/**
 * The form in a box under a row's Start thread button, where Add note opens
 * its editor, so the list stays in view and in reach. The row is the context,
 * so the card is left out. The button that opened it closes it again.
 *
 * After `onSubmit` resolves, call {@link announceStartedThread} rather than
 * navigating to the thread.
 */
export function StartThreadInline({
  seed,
  draftKey,
  starting = false,
  error = null,
  onSubmit,
}: {
  seed: StartThreadSeed;
  /** Identifies the row, so a draft typed for one row stays with it. */
  draftKey: string;
  /**
   * The thread is being started: the box is hidden rather than unmounted, so
   * that if starting fails, bb's composer can put the prompt back, with its
   * mentions and attachments, as the box shows again.
   */
  starting?: boolean;
  /** Why the last try did not start a thread, shown at the top of the box. */
  error?: string | null;
  /** Throw to keep the box open with the draft in it. */
  onSubmit: (request: NewThreadRequest) => Promise<void>;
}) {
  // Focus the composer once, when the box opens.
  const [focusRequest] = useState(1);
  return (
    <section
      aria-label="Start a thread"
      hidden={starting}
      className="mt-2 space-y-2 rounded-md border border-border bg-muted/40 p-2"
    >
      {error ? <StartThreadError message={error} /> : null}
      <StartThreadForm
        seed={seed}
        draftKey={draftKey}
        focusRequest={focusRequest}
        showPreview={false}
        className="space-y-2"
        onSubmit={onSubmit}
      />
    </section>
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

/** One row's Start thread box: which row it is for, and what it opens with. */
export interface StartThreadDraft {
  /** Identifies the row. One box per key. */
  key: string;
  seed: StartThreadSeed;
  /** The composer's draft key. Defaults to `key`. */
  draftKey?: string;
}

/** What the plugin's server said about one submit. */
export interface StartThreadOutcome {
  /** Null when no thread was started. */
  threadId: string | null;
  /** The row already had a thread, which by default skips the toast. */
  existing?: boolean;
  /** Why no thread was started, shown at the top of the box. */
  error?: string | null;
}

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

/**
 * The Start thread boxes on a page, and what each row shows while its thread
 * starts. Pressing Send hides the box at once, rather than leaving it open
 * with its prompt cleared; the row shows that its thread is starting until
 * the plugin's `submit` resolves. If no thread started, the box opens again
 * with the prompt put back and the reason at the top.
 *
 * Draw each row's box with `boxFor(key)`. Where `isStarting(key)` is true,
 * draw `<OpenThreadAction disabled />` and `<StartingThreadLine>` from
 * thread-status, or the surface's own starting state. `startedThread(key)`
 * covers the time between the thread starting and the plugin's own data
 * listing it.
 */
export function useStartThreadBox<D extends StartThreadDraft>({
  submit,
  navigate,
  announcement,
}: {
  /** Starts the thread. Resolve once the row's data lists it, such as after a reload. */
  submit: (draft: D, request: NewThreadRequest) => Promise<StartThreadOutcome>;
  navigate: { toThread(threadId: string): void };
  /**
   * The toast once the thread starts, with its Go to thread button. Null skips
   * it. Defaults to "Started a thread", and to nothing for an existing thread.
   */
  announcement?: (draft: D, outcome: StartThreadOutcome & { threadId: string }) => string | null;
}) {
  const [open, setOpen] = useState<D | null>(null);
  // Hidden but still mounted, so a failed start can show them again.
  const [submitting, setSubmitting] = useState<ReadonlyMap<string, D>>(() => new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [started, setStarted] = useState<ReadonlyMap<string, string>>(() => new Map());
  const latest = useRef({ submit, navigate, announcement });
  latest.current = { submit, navigate, announcement };

  const show = useCallback((draft: D | null) => {
    setOpen(draft);
    if (draft) setErrors((current) => without(current, draft.key));
  }, []);

  const toggle = useCallback(
    (draft: D) => setOpen((current) => (current?.key === draft.key ? null : draft)),
    [],
  );

  const send = useCallback(async (draft: D, request: NewThreadRequest) => {
    setSubmitting((current) => new Map(current).set(draft.key, draft));
    setOpen((current) => (current?.key === draft.key ? null : current));
    setErrors((current) => without(current, draft.key));
    let outcome: StartThreadOutcome;
    try {
      outcome = await latest.current.submit(draft, request);
    } catch (cause) {
      outcome = { threadId: null, error: cause instanceof Error ? cause.message : String(cause) };
    }
    const threadId = outcome.threadId;
    if (!threadId) {
      const reason = outcome.error || "Could not start a thread.";
      setErrors((current) => new Map(current).set(draft.key, reason));
      setOpen(draft);
      setSubmitting((current) => without(current, draft.key));
      // Thrown so bb's composer puts the prompt back.
      throw new Error(reason);
    }
    setStarted((current) => new Map(current).set(draft.key, threadId));
    setSubmitting((current) => without(current, draft.key));
    const { announcement: say, navigate: to } = latest.current;
    const message = say ? say(draft, { ...outcome, threadId }) : outcome.existing ? null : "Started a thread";
    if (message) announceStartedThread(to, threadId, message);
  }, []);

  const boxFor = useCallback(
    (key: string): ReactNode => {
      const draft = submitting.get(key) ?? (open?.key === key ? open : null);
      if (!draft) return null;
      return (
        <StartThreadInline
          draftKey={draft.draftKey ?? draft.key}
          seed={draft.seed}
          starting={submitting.has(key)}
          error={errors.get(key) ?? null}
          onSubmit={(request) => send(draft, request)}
        />
      );
    },
    [errors, open, send, submitting],
  );

  const isOpen = useCallback((key: string) => open?.key === key, [open]);
  const isStarting = useCallback((key: string) => submitting.has(key), [submitting]);
  const startedThread = useCallback((key: string) => started.get(key) ?? null, [started]);

  const close = useCallback(() => show(null), [show]);

  return useMemo(
    () => ({ draft: open, open: show, toggle, close, boxFor, isOpen, isStarting, startedThread }),
    [boxFor, close, isOpen, isStarting, open, show, startedThread, toggle],
  );
}
