// Everything a view file can hold, generated from the schema `publish`
// validates against, so it stays current as the schema changes. Agents read it
// with `bb impromptu-ui schema` instead of relying on a hand-kept list.

import { z } from "zod";
import { viewSchema } from "./schema.js";

export function viewJsonSchema(): string {
  return JSON.stringify(z.toJSONSchema(viewSchema, { io: "input", unrepresentable: "any" }), null, 2);
}
