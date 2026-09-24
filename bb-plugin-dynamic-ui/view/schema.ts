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

const actionBase = { label, primary: z.boolean().default(false) };

/**
 * What a button does. `message` hands the decision back to the publishing
 * thread, which does the work with its own permissions; the others the plugin
 * does itself.
 */
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    ...actionBase,
    type: z.literal("message"),
    /** Sent to the thread that published the view, as if the user typed it. */
    text: z.string().trim().min(1).max(20_000),
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
    /** Run with the user's login shell. The panel shows it and asks first. */
    command: z.string().trim().min(1).max(4_000),
    /** Absolute. Defaults to the directory `publish` ran in. */
    cwd: z.string().trim().startsWith("/").optional(),
  }),
  z.object({
    ...actionBase,
    type: z.literal("link"),
    url: z.string().trim().url(),
  }),
]);
export type Action = z.infer<typeof actionSchema>;

/** Where a button's text takes the item's draft, as the user left it. */
export const DRAFT = "{draft}";

/** Whether a button sends the item's draft, so the user should see it first. */
export function usesDraft(action: Action): boolean {
  if (action.type === "message") return action.text.includes(DRAFT);
  if (action.type === "thread") return action.prompt.includes(DRAFT);
  return false;
}

/**
 * The action to run, with `{draft}` replaced by the draft as the user left it.
 * `edited` says whether they changed it from what the skill wrote.
 */
export function fillDraft(action: Action, original: string, draft: string | undefined): { action: Action; edited: boolean } {
  const text = draft ?? original;
  const edited = draft !== undefined && draft !== original;
  // Split and join, so a "$" in the user's text is not read as a replace pattern.
  const fill = (template: string) => template.split(DRAFT).join(text);
  if (action.type === "message") return { action: { ...action, text: fill(action.text) }, edited };
  if (action.type === "thread") return { action: { ...action, prompt: fill(action.prompt) }, edited };
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

const itemId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{1,80}$/, "must be 1 to 80 letters, digits, or . _ : -");

export const itemSchema = z.object({
  /** Stable across republishing, so a decision on the item survives it. */
  id: itemId,
  title: z.string().trim().min(1).max(300),
  /** What the item is about on the web (an issue, a PR, a review comment); the opened item's title links to it. */
  url: z.string().trim().url().optional(),
  badges: z.array(badgeSchema).max(8).default([]),
  /** Always shown. */
  summary: markdown.default(""),
  /** Shown behind a "Details" toggle. */
  details: markdown.default(""),
  /**
   * Text the user can edit before a button sends it: a comment to post, the
   * task for a new thread. A `message` or `thread` button puts `{draft}` in
   * its text where the draft goes, so several buttons share one draft.
   */
  draft: z.string().max(50_000).default(""),
  /** The label over the draft's box: "Comment to post", "Task for the new thread". */
  draftLabel: z.string().trim().max(80).default("Draft"),
  actions: z.array(actionSchema).max(6).default([]),
  /**
   * Makes the item a visual review: the original first, then the
   * alternatives. The user picks one, notes on any, and sends it all back to
   * the thread as one message.
   */
  variations: z.array(variationSchema).max(6).default([]),
});
export type Item = z.infer<typeof itemSchema>;

export const sectionSchema = z.object({
  title: z.string().trim().max(200).default(""),
  items: z.array(itemSchema).max(200),
});

export const viewSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: markdown.default(""),
    sections: z.array(sectionSchema).min(1).max(20),
  })
  .superRefine((view, ctx) => {
    const seen = new Set<string>();
    view.sections.forEach((section, s) =>
      section.items.forEach((item, i) => {
        item.actions.forEach((action, a) => {
          const path = ["sections", s, "items", i, "actions", a];
          if (action.type === "command" && action.command.includes(DRAFT)) {
            ctx.addIssue({ code: "custom", path: [...path, "command"], message: "a command cannot use {draft}; use a message button" });
          }
          if (usesDraft(action) && item.draft.trim() === "") {
            ctx.addIssue({ code: "custom", path: [...path, "type"], message: "uses {draft} but the item has no draft" });
          }
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
  });
export type View = z.infer<typeof viewSchema>;

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
