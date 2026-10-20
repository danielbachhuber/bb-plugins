// The RPC the sidebar indicator calls. Server-only: the content script imports
// its types, never a value, because the SDK root this imports is not part of
// the browser bundle.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const projectIdSchema = z.string().trim().min(1).max(200);

const statusSchema = z
  .object({
    branch: z.string(),
    upstream: z.string(),
    ahead: z.number(),
    behind: z.number(),
    error: z.string().nullable(),
  })
  .nullable();

const projectCheckoutSchema = z.object({ name: z.string(), status: statusSchema });

export const rpcContract = defineRpcContract({
  /** Each project's main checkout against its upstream, keyed by project id. */
  checkout_status: {
    input: z.object({ projectIds: z.array(projectIdSchema).max(200) }).strict(),
    output: z.record(z.string(), projectCheckoutSchema),
  },
  /** Fetches the project's checkout, and fast-forwards it when it is only behind. */
  checkout_pull: {
    input: z.object({ projectId: projectIdSchema }).strict(),
    output: projectCheckoutSchema,
  },
});
