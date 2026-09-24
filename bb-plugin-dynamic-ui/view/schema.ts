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
    /** The opened item shows `text` in a box the user can edit before sending. */
    editable: z.boolean().default(false),
  }),
  z.object({
    ...actionBase,
    type: z.literal("thread"),
    /** A bb project name as `bb project list` prints it, a project id, or `personal`. */
    project: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    prompt: z.string().trim().min(1).max(50_000),
    /** The opened item shows `prompt` in a box the user can edit before the thread starts. */
    editable: z.boolean().default(false),
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

/** The text an editable action sends, or null for an action that has none to edit. */
export function editableText(action: Action): string | null {
  if (action.type === "message" && action.editable) return action.text;
  if (action.type === "thread" && action.editable) return action.prompt;
  return null;
}

/**
 * The action to run once the user's edit is applied. Only an action the skill
 * marked editable takes one; text equal to the original is not an edit.
 */
export function applyEdit(action: Action, text: string | undefined): { action: Action; edited: boolean } {
  if (text === undefined) return { action, edited: false };
  const original = editableText(action);
  if (original === null) throw new Error(`"${action.label}" is not editable.`);
  if (text === original) return { action, edited: false };
  if (action.type === "message") return { action: { ...action, text }, edited: true };
  if (action.type === "thread") return { action: { ...action, prompt: text }, edited: true };
  return { action, edited: false };
}

const itemId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{1,80}$/, "must be 1 to 80 letters, digits, or . _ : -");

export const itemSchema = z.object({
  /** Stable across republishing, so a decision on the item survives it. */
  id: itemId,
  title: z.string().trim().min(1).max(300),
  badges: z.array(badgeSchema).max(8).default([]),
  /** Always shown. */
  summary: markdown.default(""),
  /** Shown behind a "Details" toggle. */
  details: markdown.default(""),
  actions: z.array(actionSchema).max(6).default([]),
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
