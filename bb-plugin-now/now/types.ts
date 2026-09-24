import { z } from "zod";

export const dueSchema = z.object({
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM:SS` (with a trailing `Z` when fixed to a timezone). */
  date: z.string(),
  recurring: z.boolean(),
});
export type Due = z.infer<typeof dueSchema>;

/** The Gmail threads a row stands for, which Archive takes out of the inbox. */
export const gmailPartSchema = z.object({
  threadIds: z.array(z.string()).min(1),
  /** Whether any message behind the row still carries Gmail's `UNREAD` label. */
  unread: z.boolean().default(false),
});

/** The pull request or issue a row of GitHub notifications is about. */
export const githubPartSchema = z.object({
  repo: z.string(),
  number: z.number().int(),
  kind: z.enum(["pull", "issue"]),
  /** Its state now, from gh, or from the latest email when gh could not be asked. Null if neither said. */
  state: z.enum(["open", "draft", "merged", "closed"]).nullable(),
  review: z.enum(["approved", "changes_requested", "review_required"]).nullable(),
  /** A closed issue's reason, which GitHub colors differently: done, or not planned. */
  closedAs: z.enum(["completed", "not_planned"]).nullable().default(null),
  /** Why GitHub notified you, from the latest email: `review_requested`, `mention`, `author`, … */
  reason: z.string().nullable(),
  /** The most recent thing someone wrote, from its email's snippet, so it may be cut short. */
  comment: z.object({ author: z.string().nullable(), text: z.string() }).nullable().default(null),
});
export type GitHubPart = z.infer<typeof githubPartSchema>;

/** One thing that needs doing, from whichever source it came from. */
export const itemSchema = z.object({
  /** Unique across sources: `<source>:<the source's own id>`. */
  id: z.string(),
  /** The id of the source it came from, such as `todoist`. */
  source: z.string(),
  title: z.string(),
  description: z.string(),
  /** 1 is the most urgent. Null when the source gives it no priority. */
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  due: dueSchema.nullable(),
  /** `YYYY-MM-DD`: the date it has to be done by, which can differ from when it is due. */
  deadline: z.string().nullable(),
  /** When it last changed in its source, such as an email's arrival. ISO 8601. */
  activityAt: z.string().nullable(),
  /** Where it lives in its source, such as a Todoist project. */
  context: z.string().nullable(),
  /** In its source's inbox, not yet sorted: a task in Todoist's Inbox project. */
  inbox: z.boolean().optional(),
  tags: z.array(z.string()),
  url: z.string(),
  gmail: gmailPartSchema.nullable(),
  github: githubPartSchema.nullable(),
});
export type Item = z.infer<typeof itemSchema>;
