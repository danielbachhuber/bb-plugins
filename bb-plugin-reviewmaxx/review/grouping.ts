// What the agent submits. The headline and every concern's title and note are
// the judgment; which hunks exist is the plugin's to know.
import { z } from "zod";

export const fileRefSchema = z.union([
  z.string().min(1),
  z.object({ path: z.string().min(1), hunks: z.array(z.number().int().min(0)).min(1) }),
]);

export const concernSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(2000),
  files: z.array(fileRefSchema).min(1),
});

export const groupingSchema = z.object({
  headline: z.string().trim().min(1).max(300),
  concerns: z.array(concernSchema).min(1),
});

export type Grouping = z.infer<typeof groupingSchema>;
