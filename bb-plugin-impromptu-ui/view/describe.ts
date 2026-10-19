// Everything a view file can hold, generated from the schema `publish`
// validates against, so it stays current as the schema changes. Agents read it
// with `bb impromptu-ui schema` instead of relying on a hand-kept list. Each
// field's `.describe()` text in schema.ts is what they read.

import { z } from "zod";
import { viewSchema } from "./schema.js";

export function viewJsonSchema(): string {
  // A button and a badge, which several fields use, carry an id in schema.ts,
  // so each is written once under $defs by name rather than at every use.
  return JSON.stringify(z.toJSONSchema(viewSchema, { io: "input", unrepresentable: "any" }), null, 1);
}
