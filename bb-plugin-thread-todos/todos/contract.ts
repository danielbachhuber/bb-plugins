// The RPC wire contract. Thread Overview calls `todos_export` once, to import
// every item this plugin held before it became a forwarding stub.

import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const todoSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  text: z.string(),
  status: z.enum(["open", "done"]),
  source: z.enum(["agent", "user"]),
  position: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const rpcContract = defineRpcContract({
  todos_export: {
    input: z.object({}).strict(),
    output: z.object({ todos: z.array(todoSchema) }),
  },
});
