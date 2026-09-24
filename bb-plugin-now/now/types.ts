import { z } from "zod";

export const dueSchema = z.object({
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM:SS` (with a trailing `Z` when fixed to a timezone). */
  date: z.string(),
  recurring: z.boolean(),
});
export type Due = z.infer<typeof dueSchema>;

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
  tags: z.array(z.string()),
  url: z.string(),
});
export type Item = z.infer<typeof itemSchema>;
