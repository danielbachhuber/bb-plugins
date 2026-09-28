/**
 * The view file a skill publishes with `bb dynamic-ui publish`.
 *
 * A view is a title, an optional summary, and items grouped into sections.
 * Each item is a card: a title, badges, a markdown summary, markdown details
 * behind a toggle, and buttons. Parsed at the boundary, so the store and the
 * panel only see values that passed; the agent reads a failed parse and fixes
 * its file, so the messages from `describeIssues` stand on their own.
 */
import { z } from "zod";

const label = z.string().trim().min(1).max(60);
const markdown = z.string().max(20_000);

export const TONES = ["neutral", "info", "success", "warning", "danger"] as const;

export const badgeSchema = z.object({
  label: z.string().trim().min(1).max(80),
  tone: z.enum(TONES).default("neutral"),
});

const actionBase = {
  label,
  primary: z.boolean().default(false),
  /** True leaves the item open after this button goes through, so it can be pressed again, as for another round. */
  repeat: z.boolean().optional(),
  /** What a list view's row says once this button went through, such as "Added". */
  doneLabel: label.optional(),
};

/**
 * What a button does. `message` hands the decision back to the publishing
 * thread, which does the work with its own permissions; the others the plugin
 * does itself.
 */
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    ...actionBase,
    type: z.literal("message"),
    /** Sent to the thread that published the view, or to `threadId`, as if the user typed it. */
    text: z.string().trim().min(1).max(20_000),
    /** Another bb thread to send to instead, such as the thread drafting this item with the user. */
    threadId: z.string().trim().min(1).max(100).optional(),
  }),
  z.object({
    ...actionBase,
    type: z.literal("thread"),
    /** A bb project name as `bb project list` prints it, a project id, or `personal`. */
    project: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    prompt: z.string().trim().min(1).max(50_000),
  }),
  z.object({
    ...actionBase,
    type: z.literal("command"),
    /** Run with the user's login shell. The panel shows it and asks first, unless `confirm` is false. */
    command: z.string().trim().min(1).max(4_000),
    /** Absolute. Defaults to the directory `publish` ran in. */
    cwd: z.string().trim().startsWith("/").optional(),
    /** False runs the command as soon as the button is clicked, with no confirmation. */
    confirm: z.boolean().default(true),
  }),
  z.object({
    ...actionBase,
    type: z.literal("link"),
    url: z.string().trim().url(),
  }),
]);
export type Action = z.infer<typeof actionSchema>;

/** Every other thread a view names, for an item to show in or a button to send to, with where, so `publish` can check they exist. */
export function messageTargets(view: View): Array<{ threadId: string; where: string }> {
  const targets: Array<{ threadId: string; where: string }> = [];
  for (const item of view.sections.flatMap((section) => section.items)) {
    if (item.thread !== undefined) targets.push({ threadId: item.thread, where: `${item.id}, thread` });
    for (const action of item.actions) {
      if (action.type === "message" && action.threadId !== undefined) targets.push({ threadId: action.threadId, where: `${item.id}, "${action.label}"` });
    }
    for (const entry of item.related?.entries ?? []) {
      const action = entry.action;
      if (action?.type === "message" && action.threadId !== undefined) {
        targets.push({ threadId: action.threadId, where: `${item.id}, related ${entry.id}, "${action.label}"` });
      }
    }
  }
  return targets;
}

/**
 * The thread an item is worked in, when that is not the thread looking at it.
 * Opening such an item goes to its thread rather than the side panel.
 */
export function threadElsewhere(item: Item, threadId: string | undefined): string | null {
  return item.thread !== undefined && item.thread !== threadId ? item.thread : null;
}

/** The other threads a view's items show in. */
export function itemThreads(view: View): string[] {
  return [...new Set(view.sections.flatMap((section) => section.items.flatMap((item) => (item.thread === undefined ? [] : [item.thread]))))];
}

/** Where a button's text takes the item's draft, as the user left it. */
export const DRAFT = "{draft}";

/** Whether a button sends the item's draft, so the user should see it first. */
export function usesDraft(action: Action): boolean {
  if (action.type === "message") return action.text.includes(DRAFT);
  if (action.type === "thread") return action.prompt.includes(DRAFT);
  if (action.type === "command") return action.command.includes(DRAFT);
  return false;
}

/** Where a button's text takes the item's note, the user's push-back as typed. */
export const NOTE = "{note}";

/** Whether a button sends the item's note. Only a message or a new thread's prompt can. */
export function usesNote(action: Action): boolean {
  if (action.type === "message") return action.text.includes(NOTE);
  if (action.type === "thread") return action.prompt.includes(NOTE);
  return false;
}

/** The action with `{note}` replaced by what the user typed, or nothing when they typed nothing. */
export function fillNote(action: Action, note: string): Action {
  const fill = (template: string) => template.split(NOTE).join(note);
  if (action.type === "message") return { ...action, text: fill(action.text) };
  if (action.type === "thread") return { ...action, prompt: fill(action.prompt) };
  return action;
}

/** One shell word that is exactly `text`: single-quoted, so nothing in it expands or runs. */
export function shellQuote(text: string): string {
  return `'${text.split("'").join(`'\\''`)}'`;
}

/**
 * The action to run, with `{draft}` replaced by the draft as the user left it.
 * `edited` says whether they changed it from what the skill wrote.
 */
export function fillDraft(action: Action, original: string, draft: string | undefined): { action: Action; edited: boolean } {
  const text = draft ?? original;
  // A text field that started empty was filled in, not edited.
  const edited = draft !== undefined && original !== "" && draft !== original;
  // Split and join, so a "$" in the user's text is not read as a replace pattern.
  const fill = (template: string) => template.split(DRAFT).join(text);
  if (action.type === "message") return { action: { ...action, text: fill(action.text) }, edited };
  if (action.type === "thread") return { action: { ...action, prompt: fill(action.prompt) }, edited };
  // A command takes the draft as one quoted word, so the user's text never runs as shell.
  if (action.type === "command") return { action: { ...action, command: action.command.split(DRAFT).join(shellQuote(text)) }, edited };
  return { action, edited: false };
}

/**
 * One way a piece of UI could look, as an image: the first in a list is the
 * original, the rest the alternatives. `publish` reads the file and keeps a
 * copy, so the review shows what was proposed even after the code moves on.
 */
export const variationSchema = z.object({
  label: z.string().trim().min(1).max(80),
  description: markdown.default(""),
  /** A PNG, JPEG, WebP, or GIF, absolute or relative to where `publish` runs. */
  image: z.string().trim().min(1).max(1_000),
});
export type Variation = z.infer<typeof variationSchema>;

/** Renames Dismiss, such as to "Skip". Set on the view, a section, or an item; the nearest one wins. */
const dismissLabel = { dismissLabel: label.optional() };

/**
 * How the side panel shows a view. `cards` shows one item at a time, opened
 * from the list above the composer. `list` shows the whole view as one list:
 * the items to decide at the top with their buttons on each row, and the items
 * with no buttons below as a plain list.
 */
export const LAYOUTS = ["cards", "list"] as const;

/** At most this many buttons on a list row, besides Dismiss, so it stays one line. */
export const LIST_ACTIONS = 3;

/**
 * How the opened item shows its draft. `markdown` is an editor with a
 * rendered preview, for a comment or a task. `text` is a one-line field beside
 * the buttons that send it, for a short answer or a value of the user's own.
 */
export const DRAFT_FORMATS = ["markdown", "text"] as const;

/**
 * Where an item stands, as the agent sees it: "In progress", "5 words over".
 * An item with a status is finished only when the agent says so, by
 * publishing it with `complete: true`; its buttons do not finish it.
 */
export const statusSchema = z.object({
  label: z.string().trim().min(1).max(80),
  tone: z.enum(TONES).default("neutral"),
  complete: z.boolean().default(false),
});
export type Status = z.infer<typeof statusSchema>;

/** One step in an item's back and forth, such as a round proposed or the user's push-back. */
export const historyEntrySchema = z.object({
  who: z.enum(["agent", "user"]).default("agent"),
  text: z.string().trim().min(1).max(2_000),
  /** When it happened: an ISO time, shown as a time of day, or a short label shown as written. */
  at: z.string().trim().max(40).optional(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** How a change is drawn: prose as paired lines with the changed words marked, code as bb's diff view. */
export const CHANGE_FORMATS = ["prose", "code"] as const;

/**
 * One changed thing on an item: a file in a pull request, or a section of a
 * document. Given as `before` and `after` text, a unified `patch`, or a
 * `patchFile` that `publish` reads and splits into one change per file.
 * `before` with no `after` compares against the item's draft, and the draft
 * is then edited in the changes block.
 */
export const changeSchema = z.object({
  /** The file's path, or the section's name. A `patchFile` names each file by its path instead. */
  label: z.string().trim().min(1).max(300).optional(),
  format: z.enum(CHANGE_FORMATS).optional(),
  before: z.string().max(200_000).optional(),
  after: z.string().max(200_000).optional(),
  patch: z.string().max(1_000_000).optional(),
  /** A diff on disk, such as `gh pr diff 412 > /tmp/pr-412.diff`: absolute, or relative to where `publish` runs. */
  patchFile: z.string().trim().min(1).max(1_000).optional(),
  /** Starts folded to its header, for a file that matters less, such as a generated one. */
  collapsed: z.boolean().default(false),
});
export type Change = z.infer<typeof changeSchema>;

/** Whether a change is drawn as prose or code: code for a patch, prose for text, unless it says. */
export function changeFormat(change: Change): (typeof CHANGE_FORMATS)[number] {
  return change.format ?? (change.patch !== undefined || change.patchFile !== undefined ? "code" : "prose");
}

/** A change compared against the item's draft, which the changes block then edits. */
export function usesDraftAsAfter(change: Change): boolean {
  return change.before !== undefined && change.after === undefined;
}

/**
 * The text an item's claims are found in: the draft, as the user left it, when
 * a change compares against it; otherwise each change's new text, the added
 * lines of a patch; otherwise the draft.
 */
export function evidenceText(item: Pick<Item, "changes">, draft: string): string {
  if (item.changes.length === 0 || item.changes.some(usesDraftAsAfter)) return draft;
  return item.changes
    .map((change) =>
      change.after ??
      (change.patch ?? "")
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1))
        .join("\n"),
    )
    .join("\n");
}

/** How much of a budget an item uses: lines of a page, words of a limit. Red once over. */
export const meterSchema = z.object({
  value: z.number().min(0),
  max: z.number().positive(),
  /** "lines", "words"; shown after the numbers. */
  unit: z.string().trim().max(20).default(""),
});
export type Meter = z.infer<typeof meterSchema>;

const itemId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{1,80}$/, "must be 1 to 80 letters, digits, or . _ : -");

/**
 * Material that supports an item, which the user can act on one entry at a
 * time: notes to draw from, ranked by how well they fit, each with a badge
 * (such as "Used") and at most one button (such as "Add").
 */
export const relatedSchema = z.object({
  title: z.string().trim().min(1).max(80).default("Related"),
  /** One line beside the title: how the entries are ranked, where they came from. */
  detail: z.string().trim().max(120).optional(),
  entries: z
    .array(
      z.object({
        id: itemId,
        text: z.string().trim().min(1).max(1_000),
        /** A second, muted line: what the entry matches, where it is from. */
        detail: z.string().trim().max(300).optional(),
        badge: badgeSchema.optional(),
        action: actionSchema.optional(),
      }),
    )
    .max(30),
});
export type Related = z.infer<typeof relatedSchema>;

/** How well a claim's sources back it. */
export const SUPPORT_LEVELS = ["full", "partial", "none"] as const;

/**
 * What backs one claim in an item's proposed text: the claim as it appears in
 * the text, how well it is supported, the verbatim quotes that support it and
 * where each is from, and a doubt about it, if any.
 */
export const evidenceSchema = z.object({
  id: itemId,
  /** Text quoted from the proposed text, which the claim's marks attach to. */
  claim: z.string().trim().min(1).max(1_000),
  support: z.enum(SUPPORT_LEVELS),
  sources: z
    .array(
      z.object({
        quote: z.string().trim().min(1).max(2_000),
        /** Where the quote is from: a file and its heading, a page. */
        source: z.string().trim().min(1).max(200),
        url: z.string().trim().url().optional(),
      }),
    )
    .max(10)
    .default([]),
  /** A doubt about the claim, shown beside it. */
  note: z.string().trim().max(500).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const itemSchema = z.object({
  /** Stable across republishing, so a decision on the item survives it. */
  id: itemId,
  title: z.string().trim().min(1).max(300),
  /** What the item is about on the web (an issue, a PR, a review comment); the opened item's title links to it. */
  url: z.string().trim().url().optional(),
  badges: z.array(badgeSchema).max(8).default([]),
  status: statusSchema.optional(),
  meter: meterSchema.optional(),
  /** Shown in its own card under the item. */
  related: relatedSchema.optional(),
  /**
   * Another bb thread that shows this item too, above its composer, such as
   * the thread drafting it with the user. It is the same item, so what is
   * done in either thread shows in both.
   */
  thread: z.string().trim().min(1).max(100).optional(),
  /** What backs each claim in the proposed text, marked where the claim appears. */
  evidence: z.array(evidenceSchema).max(50).default([]),
  /** Oldest first. Shown under the summary. */
  history: z.array(historyEntrySchema).max(50).default([]),
  /** Always shown. */
  summary: markdown.default(""),
  /** What changed, shown after the summary: files in a pull request, a section's text against the document. */
  changes: z.array(changeSchema).max(50).default([]),
  /** The heading over the changes: "Files changed", "Changes against the Doc". */
  changesLabel: z.string().trim().max(80).default("Changes"),
  /** Shown behind a "Details" toggle. */
  details: markdown.default(""),
  /**
   * Text the user can edit before a button sends it: a comment to post, the
   * task for a new thread. A `message` or `thread` button puts `{draft}` in
   * its text where the draft goes, so several buttons share one draft.
   * Markdown unless `draftFormat` is `text`.
   */
  draft: z.string().max(50_000).default(""),
  /** The label over the draft's box: "Comment to post", "Task for the new thread". */
  draftLabel: z.string().trim().max(80).default("Draft"),
  draftFormat: z.enum(DRAFT_FORMATS).default("markdown"),
  /** Shown in an empty `text` field: "Fuji ×12, or another product". */
  draftPlaceholder: z.string().trim().max(120).optional(),
  actions: z.array(actionSchema).max(6).default([]),
  /**
   * A one-line field beside the buttons for the user's push-back, such as
   * what to change in the next round. A button puts `{note}` in its text
   * where the note goes; an empty note sends nothing there.
   */
  note: z
    .object({
      label: z.string().trim().min(1).max(80).default("Note"),
      placeholder: z.string().trim().max(120).optional(),
    })
    .optional(),
  /**
   * Makes the item a visual review: the original first, then the
   * alternatives. The user picks one, notes on any, and sends it all back to
   * the thread as one message.
   */
  variations: z.array(variationSchema).max(6).default([]),
  ...dismissLabel,
});
export type Item = z.infer<typeof itemSchema>;

export const sectionSchema = z.object({
  title: z.string().trim().max(200).default(""),
  items: z.array(itemSchema).max(200),
  ...dismissLabel,
});
export type Section = z.infer<typeof sectionSchema>;

export const viewSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: markdown.default(""),
    sections: z.array(sectionSchema).min(1).max(20),
    layout: z.enum(LAYOUTS).default("cards"),
    /**
     * The items laid out as the pages they fill, at the top of the side
     * panel: each block sized by its item's meter max and filled by its value.
     * Clicking a block opens its item.
     */
    map: z
      .object({
        pages: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(40),
              /** Item ids, top to bottom, in one to three columns side by side. */
              columns: z.array(z.array(itemId).min(1).max(30)).min(1).max(3),
            }),
          )
          .min(1)
          .max(6),
      })
      .optional(),
    ...dismissLabel,
  })
  .superRefine((view, ctx) => {
    const seen = new Set<string>();
    view.sections.forEach((section, s) =>
      section.items.forEach((item, i) => {
        if (view.layout === "list") {
          if (item.variations.length > 0) {
            ctx.addIssue({ code: "custom", path: ["sections", s, "items", i, "variations"], message: 'a visual review needs the "cards" layout' });
          }
          if (item.actions.length > LIST_ACTIONS) {
            ctx.addIssue({
              code: "custom",
              path: ["sections", s, "items", i, "actions"],
              message: `an item in a "list" layout has at most ${LIST_ACTIONS} buttons, so its row stays one line`,
            });
          }
        }
        item.actions.forEach((action, a) => {
          const path = ["sections", s, "items", i, "actions", a];
          if (action.type === "command" && action.command.includes(DRAFT) && view.layout !== "list") {
            ctx.addIssue({
              code: "custom",
              path: [...path, "command"],
              message: 'a command can use {draft} only in the "list" layout; use a message button',
            });
          }
          // A card's text field can start empty: the user types the whole answer.
          if (usesDraft(action) && item.draft.trim() === "" && (item.draftFormat !== "text" || view.layout === "list")) {
            ctx.addIssue({ code: "custom", path: [...path, "type"], message: "uses {draft} but the item has no draft" });
          }
        });
        const itemPath = ["sections", s, "items", i];
        if (item.draftFormat === "text") {
          if (item.draft.includes("\n")) {
            ctx.addIssue({ code: "custom", path: [...itemPath, "draft"], message: 'a "text" draft is one line; use "markdown" for more' });
          }
          if (!item.actions.some(usesDraft)) {
            ctx.addIssue({ code: "custom", path: [...itemPath, "draftFormat"], message: 'a "text" draft needs a message or thread button that uses {draft}' });
          }
        } else if (item.draftPlaceholder !== undefined) {
          ctx.addIssue({ code: "custom", path: [...itemPath, "draftPlaceholder"], message: 'a placeholder needs "draftFormat": "text"' });
        }
        item.changes.forEach((change, c) => {
          const path = [...itemPath, "changes", c];
          const sources = [change.patch, change.patchFile, change.before].filter((source) => source !== undefined).length;
          if (sources !== 1) {
            ctx.addIssue({ code: "custom", path, message: "a change needs exactly one of patch, patchFile, or before (with after, or the item's draft)" });
          }
          if (change.label === undefined && change.patchFile === undefined) {
            ctx.addIssue({ code: "custom", path: [...path, "label"], message: "a change needs a label: the file's path or the section's name" });
          }
          if (change.after !== undefined && change.before === undefined) {
            ctx.addIssue({ code: "custom", path: [...path, "after"], message: "after needs before" });
          }
          if (change.format === "prose" && (change.patch !== undefined || change.patchFile !== undefined)) {
            ctx.addIssue({ code: "custom", path: [...path, "format"], message: 'a patch is code; use before and after for "prose"' });
          }
          if (usesDraftAsAfter(change) && (item.draft.trim() === "" || item.draftFormat === "text")) {
            ctx.addIssue({ code: "custom", path: [...path, "before"], message: "before with no after compares against the item's draft, and the item has no markdown draft" });
          }
        });
        if (item.changes.filter(usesDraftAsAfter).length > 1) {
          ctx.addIssue({ code: "custom", path: [...itemPath, "changes"], message: "only one change can compare against the draft" });
        }
        item.actions.forEach((action, a) => {
          if (usesNote(action) && item.note === undefined) {
            ctx.addIssue({ code: "custom", path: [...itemPath, "actions", a], message: "uses {note} but the item has no note field; add note" });
          }
        });
        if (item.note !== undefined) {
          if (!item.actions.some(usesNote)) {
            ctx.addIssue({ code: "custom", path: [...itemPath, "note"], message: "a note field needs a message or thread button that uses {note}" });
          }
          if (item.draftFormat === "text" || view.layout === "list") {
            ctx.addIssue({ code: "custom", path: [...itemPath, "note"], message: 'a note field needs a card with a markdown draft or none, not a "text" draft or a "list" row' });
          }
        }
        const seenEvidence = new Set<string>();
        // A patch on disk is read after parsing, so its claims are checked only once it is in the view.
        const claimsText = item.changes.some((change) => change.patchFile !== undefined) ? undefined : evidenceText(item, item.draft);
        item.evidence.forEach((entry, e) => {
          const path = [...itemPath, "evidence", e];
          if (seenEvidence.has(entry.id)) {
            ctx.addIssue({ code: "custom", path: [...path, "id"], message: `duplicate evidence id "${entry.id}"` });
          }
          seenEvidence.add(entry.id);
          if (claimsText !== undefined && !claimsText.includes(entry.claim)) {
            ctx.addIssue({
              code: "custom",
              path: [...path, "claim"],
              message: "a claim must be quoted exactly from the item's proposed text: its draft, or the new text of its changes",
            });
          }
        });
        if (item.evidence.length > 0 && view.layout === "list") {
          ctx.addIssue({ code: "custom", path: [...itemPath, "evidence"], message: 'evidence needs the "cards" layout' });
        }
        if (item.thread !== undefined && view.layout === "list") {
          ctx.addIssue({ code: "custom", path: [...itemPath, "thread"], message: 'showing an item in another thread needs the "cards" layout' });
        }
        const seenEntries = new Set<string>();
        item.related?.entries.forEach((entry, e) => {
          const path = [...itemPath, "related", "entries", e];
          if (entry.action !== undefined && (entry.action.type === "command" || usesDraft(entry.action) || usesNote(entry.action))) {
            ctx.addIssue({
              code: "custom",
              path: [...path, "action"],
              message: "a related entry's button is a message, a thread, or a link, and cannot use {draft} or {note}",
            });
          }
          if (seenEntries.has(entry.id)) {
            ctx.addIssue({ code: "custom", path: [...path, "id"], message: `duplicate related entry id "${entry.id}"` });
          }
          seenEntries.add(entry.id);
        });
        if (item.variations.length === 1) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", s, "items", i, "variations"],
            message: "a visual review needs at least two variations: the original and an alternative",
          });
        }
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", s, "items", i, "id"],
            message: `duplicate item id "${item.id}"`,
          });
        }
        seen.add(item.id);
      }),
    );
    if (view.map !== undefined) {
      if (view.layout !== "cards") ctx.addIssue({ code: "custom", path: ["map"], message: 'a map needs the "cards" layout' });
      const placed = new Set<string>();
      view.map.pages.forEach((page, p) =>
        page.columns.forEach((column, c) =>
          column.forEach((id, i) => {
            const path = ["map", "pages", p, "columns", c, i];
            if (!seen.has(id)) ctx.addIssue({ code: "custom", path, message: `no item "${id}"` });
            else if (placed.has(id)) ctx.addIssue({ code: "custom", path, message: `"${id}" is on the map twice` });
            placed.add(id);
          }),
        ),
      );
    }
  });
export type View = z.infer<typeof viewSchema>;

function sectionOf(view: View, item: Item): Section | undefined {
  return view.sections.find((section) => section.items.some((candidate) => candidate.id === item.id));
}

/** An item in a list view with nothing to decide: a plain row, never counted as open. */
export function isQuiet(view: View, item: Item): boolean {
  return view.layout === "list" && item.actions.length === 0;
}

/** What Dismiss is called on this item. */
export function dismissLabelOf(view: View, item: Item): string {
  return item.dismissLabel ?? sectionOf(view, item)?.dismissLabel ?? view.dismissLabel ?? "Dismiss";
}

/** Whether a button asks before it runs. Only a command does, unless it says not to. */
export function needsConfirm(action: Action): boolean {
  return action.type === "command" && action.confirm;
}

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export function parseView(raw: string): View {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`That file is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = viewSchema.safeParse(json);
  if (!parsed.success) throw new Error(`That is not a valid view. ${describeIssues(parsed.error)}`);
  return parsed.data;
}
